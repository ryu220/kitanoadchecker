import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Segment, SegmentEvaluation } from '@/lib/types-v2';
import { ProductId } from '@/lib/types';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { validateKnowledgeExcerpt, detectFabricatedContent, logValidationResult } from '@/lib/knowledge-excerpt-validator';
import { createEmbeddingService } from '@/lib/embedding-service';
import { createChromaVectorDB } from '@/lib/vector-db/chroma-db';
import { createRAGSearchService } from '@/lib/rag-search';
import { createNGKeywordValidator } from '@/lib/ng-keyword-validator';
import { analyzePeriodExpressions, validatePeriodConsistency } from '@/lib/period-expression-analyzer';
import { validateGuinnessRecord } from '@/lib/guinness-record-validator';
import { getRAGCache } from '@/lib/cache';
import { mergeViolations } from '@/lib/utils/deduplication';
import { generateCommandStackPrompt } from '@/lib/prompts/evaluation-prompt-command-stack';

// タイムアウト延長: 長文処理対応（Issue #17）
export const maxDuration = 60;

// Initialize RAG cache for performance optimization (Issue #27対応でキャッシュ統合)
const ragCache = getRAGCache();

/**
 * Request schema for evaluation API
 */
const evaluateRequestSchema = z.object({
  segments: z.array(z.object({
    id: z.string(),
    text: z.string(),
    type: z.enum(['claim', 'explanation', 'evidence', 'cta', 'disclaimer']),
    position: z.object({
      start: z.number(),
      end: z.number(),
      line: z.number().optional(),
    }),
    importance: z.number().min(0).max(1).optional(),
    relatedSegments: z.array(z.string()).optional(),
  })),
  productId: z.enum(['HA', 'SH']),
  apiKey: z.string().min(10),
  fullText: z.string().optional(), // Full advertisement text for context
  knowledgeContext: z.string().optional(),
});

type EvaluateRequest = z.infer<typeof evaluateRequestSchema>;

/**
 * POST /api/v2/evaluate
 * RAG-based legal compliance evaluation API
 *
 * Evaluates advertisement segments against legal knowledge base
 * including 薬機法 (Pharmaceutical Affairs Law), 景表法 (Act against Unjustifiable Premiums
 * and Misleading Representations), and internal company standards.
 *
 * @param segments - Array of segments to evaluate
 * @param productId - Product ID (HA or SH)
 * @param apiKey - Gemini API key
 * @param knowledgeContext - Optional pre-loaded knowledge context
 *
 * @returns Array of segment evaluations with violations and corrections
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse and validate request body
    const body = await request.json();
    console.log('[Evaluate API] Received request with', body.segments?.length || 0, 'segments');

    const validatedInput: EvaluateRequest = evaluateRequestSchema.parse(body);

    // Validate API key format
    if (!validatedInput.apiKey || validatedInput.apiKey.length < 10) {
      return NextResponse.json({
        success: false,
        error: '無効なGemini APIキーです。有効なAPIキーを指定してください。',
      }, { status: 400 });
    }

    // Load knowledge context if not provided
    let knowledgeContext = validatedInput.knowledgeContext;
    if (!knowledgeContext) {
      // セマンティック検索で関連ナレッジを取得
      const combinedSegmentText = validatedInput.segments.map(s => s.text).join('\n');

      // Check RAG cache first (Phase 2 optimization)
      const cachedKnowledge = ragCache.get(combinedSegmentText, validatedInput.productId);

      if (cachedKnowledge) {
        console.log('[Evaluate API] RAG CACHE HIT! Using cached knowledge context');
        knowledgeContext = cachedKnowledge;
      } else {
        console.log('[Evaluate API] RAG CACHE MISS - Performing RAG search...');
        console.log('[Evaluate API] RAG Search: Initializing services...');

        const embeddingService = createEmbeddingService(validatedInput.apiKey);
        const vectorDB = createChromaVectorDB({
          url: process.env.CHROMA_URL || 'http://localhost:8000',
          apiKey: validatedInput.apiKey, // Auto-load knowledge with API key
        });

        await vectorDB.connect();
        const ragSearchService = createRAGSearchService(embeddingService, vectorDB);

        console.log('[Evaluate API] RAG Search: Searching for', validatedInput.segments.length, 'segments...');

        const ragResult = await ragSearchService.search(combinedSegmentText, {
          topK: 20,
          minSimilarity: 0.3, // Lowered from 0.5 to 0.3 for better recall with cosine distance
          productId: validatedInput.productId,
          debug: true,
        });

        knowledgeContext = ragResult.relevantKnowledge;

        console.log('[Evaluate API] RAG Search: Found', ragResult.searchResults.length, 'relevant chunks');
        console.log('[Evaluate API] RAG Search: Knowledge context size:', knowledgeContext.length, 'chars');

        // Cache the result (30 minute TTL)
        ragCache.set(combinedSegmentText, validatedInput.productId, knowledgeContext, ragResult.searchResults.length, 1800);
        console.log('[Evaluate API] RAG result cached for future requests');

        // Vector DB接続を閉じる
        await vectorDB.close();
      }
    } else {
      console.log('[Evaluate API] Using provided knowledge context:', knowledgeContext.length, 'chars');
    }

    // Initialize Gemini client with JSON mode
    // Changed to gemini-2.0-flash-lite per user request
    // Note: Previous gemini-2.5-flash-lite had false negatives (注入, クマ not detected)
    const genAI = new GoogleGenerativeAI(validatedInput.apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-lite',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.0, // Zero temperature for maximum consistency and verbatim quoting
      },
    });

    // Evaluate segments with controlled concurrency (max 3 parallel)
    const evaluations: SegmentEvaluation[] = [];
    const batchSize = 1; // Sequential processing to avoid rate limits

    for (let i = 0; i < validatedInput.segments.length; i += batchSize) {
      const batch = validatedInput.segments.slice(i, i + batchSize);
      console.log(`[Evaluate API] Processing batch ${i / batchSize + 1} (${batch.length} segments)`);

      const batchPromises = batch.map(segment =>
        evaluateSegmentWithRetry(
          segment as Segment,
          validatedInput.productId,
          knowledgeContext!,
          model,
          validatedInput.fullText
        )
      );

      const batchResults = await Promise.allSettled(batchPromises);

      // Process results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          evaluations.push(result.value);
        } else {
          console.error('[Evaluate API] Segment evaluation failed:', result.reason);
          // Add error result
          evaluations.push({
            segmentId: batch[batchResults.indexOf(result)].id,
            compliance: false,
            violations: [{
              type: 'その他',
              severity: 'high',
              description: `評価エラー: ${result.reason.message}`,
              referenceKnowledge: {
                file: 'system',
                excerpt: 'エラーが発生しました',
              },
              correctionSuggestion: '再評価が必要です',
            }],
            evaluatedAt: new Date().toISOString(),
          });
        }
      }

      // Add adaptive delay between batches to avoid rate limits
      if (i + batchSize < validatedInput.segments.length) {
        const adaptiveDelay = calculateAdaptiveDelay(
          i,
          validatedInput.segments.length,
          15000 // Estimated 15k tokens per request (with knowledge base)
        );
        console.log(`[Evaluate API] Waiting ${Math.round(adaptiveDelay / 1000)}s before next segment...`);
        await delay(adaptiveDelay);
      }
    }

    const processingTime = Date.now() - startTime;
    console.log(`[Evaluate API] Completed ${evaluations.length} evaluations in ${processingTime}ms`);

    // Apply deduplication with priority-based merging (Issue #27 fix + duplicate type fix)
    evaluations.forEach((evaluation, _index) => {
      const beforeCount = evaluation.violations.length;
      evaluation.violations = mergeViolations(evaluation.violations);
      const afterCount = evaluation.violations.length;

      if (beforeCount > afterCount) {
        console.log(`[Evaluate API] Merged violations for segment ${evaluation.segmentId}: ${beforeCount} -> ${afterCount} (removed ${beforeCount - afterCount} duplicates)`);

        // Update compliance status if all violations were duplicates
        if (afterCount === 0 && !evaluation.compliance) {
          evaluation.compliance = true;
          console.log(`[Evaluate API] Updated compliance to true for ${evaluation.segmentId} (no violations after deduplication)`);
        }
      }
    });

    // Get cache performance statistics
    const ragCacheStats = ragCache.getStats();
    console.log('[Evaluate API] Cache Performance:');
    console.log(`  - RAG Cache: ${ragCacheStats.hits} hits, ${ragCacheStats.misses} misses, ${(ragCacheStats.hitRate * 100).toFixed(1)}% hit rate`);

    // Return evaluation results
    return NextResponse.json({
      success: true,
      data: {
        evaluations,
        summary: {
          totalSegments: validatedInput.segments.length,
          evaluatedSegments: evaluations.length,
          compliantSegments: evaluations.filter(e => e.compliance).length,
          violationCount: evaluations.reduce((sum, e) => sum + e.violations.length, 0),
        },
        productId: validatedInput.productId,
        processingTimeMs: processingTime,
        cachePerformance: {
          ragCache: {
            hitRate: ragCacheStats.hitRate,
            hits: ragCacheStats.hits,
            misses: ragCacheStats.misses,
          },
        },
      },
    }, { status: 200 });

  } catch (error: unknown) {
    console.error('[Evaluate API] Error:', error);

    // Zod validation error
    if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
      const zodError = error as { errors?: Array<{ message: string; path: (string | number)[] }> };
      return NextResponse.json({
        success: false,
        error: 'バリデーションエラー',
        details: zodError.errors,
      }, { status: 400 });
    }

    // Gemini API errors
    if (error instanceof Error) {
      if (error.message.includes('API key') || error.message.includes('API_KEY')) {
        return NextResponse.json({
          success: false,
          error: 'Gemini APIキーが無効です。正しいAPIキーを指定してください。',
          details: error.message,
        }, { status: 401 });
      }

      if (error.message.includes('quota') || error.message.includes('rate limit') || error.message.includes('429')) {
        return NextResponse.json({
          success: false,
          error: 'APIレート制限に達しました。約30秒待ってから再試行してください。長文の場合は、テキストを分割して処理することをお勧めします。',
          details: error.message,
          retryAfter: 30
        }, { status: 429 });
      }

      // Generic error
      return NextResponse.json({
        success: false,
        error: '評価処理中にエラーが発生しました。',
        details: error.message,
      }, { status: 500 });
    }

    // Unknown error
    return NextResponse.json({
      success: false,
      error: '予期しないエラーが発生しました。',
    }, { status: 500 });
  }
}

/**
 * Pre-process segment text to detect annotation markers
 * This function explicitly identifies which keywords have annotation markers (※1, ※2, etc.)
 * to prevent AI from misreading the text
 */
interface AnnotationAnalysis {
  keywordsWithMarkers: Array<{ keyword: string; marker: string; fullMatch: string }>;
  keywordsWithoutMarkers: string[];
  allAnnotations: Array<{ marker: string; text: string }>;
}

function analyzeAnnotations(segmentText: string, productId: ProductId): AnnotationAnalysis {
  const analysis: AnnotationAnalysis = {
    keywordsWithMarkers: [],
    keywordsWithoutMarkers: [],
    allAnnotations: [],
  };

  // Extract annotation definitions (※1 or *1 角質層まで, ※2 or *2 殺菌は消毒の作用機序として, etc.)
  // Updated to support both ※ (kome-jirushi) and * (asterisk) markers
  const annotationDefRegex = /([※*])(\d+)\s*[：:]\s*([^\n※*]+)/g;
  const annotationDefRegex2 = /([※*])(\d+)\s+([^\n※*]+)/g;

  let match;
  while ((match = annotationDefRegex.exec(segmentText)) !== null) {
    analysis.allAnnotations.push({
      marker: `${match[1]}${match[2]}`,  // match[1] = ※ or *, match[2] = number
      text: match[3].trim(),              // match[3] = annotation text
    });
  }

  // Reset regex
  annotationDefRegex2.lastIndex = 0;
  while ((match = annotationDefRegex2.exec(segmentText)) !== null) {
    // Avoid duplicates
    const marker = `${match[1]}${match[2]}`;  // match[1] = ※ or *, match[2] = number
    if (!analysis.allAnnotations.some(a => a.marker === marker)) {
      analysis.allAnnotations.push({
        marker: marker,
        text: match[3].trim(),                // match[3] = annotation text
      });
    }
  }

  // Extract keywords with annotation markers directly attached (e.g., 浸透※1, 殺菌*2)
  // Pattern: [キーワード][※ or *][数字]
  // Updated to support both ※ (kome-jirushi) and * (asterisk) markers
  const keywordWithMarkerRegex = /([ぁ-んァ-ヶー一-龠々a-zA-Z]+)([※*]\d+)/g;

  const foundKeywordsWithMarkers = new Set<string>();
  while ((match = keywordWithMarkerRegex.exec(segmentText)) !== null) {
    const keyword = match[1];
    const marker = match[2];
    const fullMatch = match[0]; // e.g., "浸透※1"

    analysis.keywordsWithMarkers.push({
      keyword,
      marker,
      fullMatch,
    });
    foundKeywordsWithMarkers.add(keyword);
  }

  // Load product-specific required keywords dynamically FIRST
  let productRequiredKeywords: string[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadProductConfig } = require('../../../../lib/product-config-loader');
    const config = loadProductConfig(productId);
    productRequiredKeywords = config.segmentationKeywords.required;
    console.log(`[analyzeAnnotations] Loaded ${productRequiredKeywords.length} product-specific keywords for ${productId}:`, productRequiredKeywords);
  } catch (error) {
    console.warn(`[analyzeAnnotations] Failed to load product config for ${productId}:`, error);
  }

  // Extract all potential keywords from the text (katakana and kanji sequences of 2+ chars)
  // This helps identify keywords that might need annotations but don't have markers
  const potentialKeywordRegex = /([ァ-ヶー]{2,}|[一-龠々]{2,})/g;
  const allPotentialKeywords = new Set<string>();

  while ((match = potentialKeywordRegex.exec(segmentText)) !== null) {
    const keyword = match[1];
    // Skip if this keyword already has a marker attached
    if (!foundKeywordsWithMarkers.has(keyword)) {
      allPotentialKeywords.add(keyword);
    }
  }

  // 🔥 CRITICAL FIX: Add product-specific required keywords directly
  // This ensures keywords like "ヒアルロン酸" (katakana+kanji mix) are detected
  // 🐛 FIX: Only include keywords that actually exist in the segment
  const existingProductKeywords: string[] = [];
  for (const keyword of productRequiredKeywords) {
    // Check if the keyword exists in the segment text
    if (segmentText.includes(keyword)) {
      existingProductKeywords.push(keyword);

      // Add to potential keywords if it doesn't have a marker
      if (!foundKeywordsWithMarkers.has(keyword)) {
        allPotentialKeywords.add(keyword);
        console.log(`[analyzeAnnotations] 🎯 Added product-specific keyword without marker: "${keyword}"`);
      }
    }
  }

  // Log which keywords were found vs not found (for debugging)
  const missingProductKeywords = productRequiredKeywords.filter(kw => !existingProductKeywords.includes(kw));
  if (missingProductKeywords.length > 0) {
    console.log(`[analyzeAnnotations] ⚠️  Product keywords NOT in segment (will be excluded): ${missingProductKeywords.join(', ')}`);
  }
  console.log(`[analyzeAnnotations] ✓ Product keywords in segment: ${existingProductKeywords.join(', ') || '(none)'}`);

  // Filter potential keywords to focus on those likely to need annotations
  // Common patterns that often require annotations in cosmetic/pharmaceutical ads
  const likelyNeedsAnnotation = (keyword: string): boolean => {
    // Ingredient-related keywords (katakana is often used for ingredients)
    if (/^[ァ-ヶー]+$/.test(keyword)) {
      return true;
    }

    // Action/effect keywords (common kanji patterns)
    const actionKeywords = ['浸透', '殺菌', '消毒', '除菌', '抗菌', '配合', '注入', '到達', '届く',
                           '改善', '予防', '対策', 'ケア', '効果', '効能', '作用', '治療'];

    // 🐛 FIX: Only merge product keywords that actually exist in the segment
    const allActionKeywords = [...actionKeywords, ...existingProductKeywords];

    if (allActionKeywords.some(ak => keyword.includes(ak))) {
      return true;
    }

    return false;
  };

  // Add keywords that likely need annotations to the analysis
  for (const keyword of allPotentialKeywords) {
    if (likelyNeedsAnnotation(keyword)) {
      analysis.keywordsWithoutMarkers.push(keyword);
    }
  }

  return analysis;
}

/**
 * Evaluate a single segment against legal knowledge base
 *
 * @param segment - Segment to evaluate
 * @param productId - Product ID
 * @param knowledgeContext - Knowledge base context
 * @param model - Gemini model instance
 * @param fullText - Full advertisement text for context (optional)
 * @returns Segment evaluation with violations
 */
async function evaluateSegmentWithRetry(
  segment: Segment,
  productId: ProductId,
  knowledgeContext: string,
  model: { generateContent: (prompt: string) => Promise<{ response: { text: () => string } }> },
  fullText?: string,
  maxRetries: number = 3
): Promise<SegmentEvaluation> {
  const startTime = Date.now();

  // Pre-process: Analyze annotations in the segment
  const annotationAnalysis = analyzeAnnotations(segment.text, productId);

  // Log the analysis for debugging
  console.log(`[Evaluate] Annotation analysis for ${segment.id}:`);
  console.log(`  Keywords WITH markers:`, annotationAnalysis.keywordsWithMarkers);
  console.log(`  Keywords WITHOUT markers:`, annotationAnalysis.keywordsWithoutMarkers);
  console.log(`  All annotations:`, annotationAnalysis.allAnnotations);

  // NG Keyword Validation
  const ngKeywordValidator = createNGKeywordValidator();
  const ngValidationResult = ngKeywordValidator.validate(segment.text, fullText);

  console.log(`[Evaluate] NG Keyword validation for ${segment.id}:`);
  console.log(`  Has violations: ${ngValidationResult.hasViolations}`);
  console.log(`  Summary:`, ngValidationResult.summary);
  if (ngValidationResult.hasViolations) {
    console.log(`  Detected NG keywords:`, ngValidationResult.explicitNGKeywordsList);
    console.log(`  Details:`, ngKeywordValidator.getDetailedList(ngValidationResult));
  }

  // Period Expression Validation (FR-TIME-001, FR-TIME-002)
  const periodAnalysis = analyzePeriodExpressions(segment.text, fullText);
  const periodValidation = validatePeriodConsistency(segment.text, fullText);

  console.log(`[Evaluate] Period expression validation for ${segment.id}:`);
  console.log(`  Has period expressions: ${periodAnalysis.expressions.length > 0}`);
  console.log(`  Period consistency: ${periodValidation.isValid ? 'Valid' : 'Invalid'}`);
  if (!periodValidation.isValid) {
    console.log(`  Period violations:`, periodValidation.violations);
  }

  // Guinness Record Validation (FR-GUIN-001, FR-GUIN-002)
  const guinnessValidation = validateGuinnessRecord(segment.text, fullText);

  console.log(`[Evaluate] Guinness record validation for ${segment.id}:`);
  console.log(`  Has Guinness reference: ${guinnessValidation.hasGuinnessReference}`);
  console.log(`  Guinness validation: ${guinnessValidation.isValid ? 'Valid' : 'Invalid'}`);
  if (!guinnessValidation.isValid) {
    console.log(`  Guinness violations:`, guinnessValidation.violations);
  }

  // Note: Knowledge filtering has been disabled to restore correct behavior
  // Previous filtering logic caused false negatives in keyword detection

  const _fullTextSection = fullText ? `

## 広告文全体（注釈や他のセグメントを含む）
---
${fullText}
---

**重要:** このセグメントを評価する際、広告文全体に含まれる注釈（※1、※2など）も考慮してください。
注釈が存在する場合、その注釈を確認してから違反判定を行ってください。
` : '';

  // Pre-detect product-specific keywords in the segment
  const detectedProductKeywords: string[] = [];
  let _productAnnotationRulesSection = '';

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadProductConfig } = require('../../../../lib/product-config-loader');
    const config = loadProductConfig(productId);

    // Detect which product-specific keywords are actually in this segment
    for (const keyword of config.segmentationKeywords.required) {
      if (segment.text.includes(keyword)) {
        detectedProductKeywords.push(keyword);
      }
    }

    if (detectedProductKeywords.length > 0) {
      console.log(`[Evaluate] 🎯 Detected product-specific keywords in ${segment.id}: ${detectedProductKeywords.join(', ')}`);

      const detectedRulesList = detectedProductKeywords
        .filter(keyword => config.annotationRules[keyword])
        .map(keyword => {
          const rule = config.annotationRules[keyword];
          console.log(`[Evaluate] 📌 Required annotation for "${keyword}": ${rule.template}`);
          return `- 「${keyword}」→ 必須注釈：「${rule.template}」（重大度：${rule.severity === 'high' ? '高' : '中'}）`;
        })
        .join('\n');

      _productAnnotationRulesSection = `

# 🚨【最優先】このセグメントで検出された商品固有キーワード 🚨

**このセグメントには以下の${config.name}（${productId}）固有キーワードが含まれています：**

${detectedProductKeywords.map(k => `「${k}」`).join('、')}

**これらのキーワードには以下の注釈が必須です：**

${detectedRulesList}

**【絶対厳守】これらのキーワードが※マーカーなしで使用されている場合、必ず違反として検出してください！**

---
`;
    }
  } catch (error) {
    // 設定ファイルがない場合は無視
    console.error('[Evaluate] Error loading product config:', error);
  }

  // 注釈マーカールールセクション（※ と * の両方を有効なマーカーとして認識）
  const annotationMarkerRulesSection = `

## 📝【重要】注釈マーカーの認識ルール

### 有効な注釈マーカー形式

このシステムは以下の注釈マーカーを全て認識し、有効なマーカーとして扱います：

1. **標準形式（推奨）:** ※1, ※2, ※3, ...
   - 例: クマ※1対策
   - 注釈: ※1 乾燥や古い角質によるくすみ、ハリが不足した暗い目の下

2. **互換形式:** *1, *2, *3, ... (アスタリスク)
   - 例: クマ*対策
   - 注釈: *乾燥や古い角質によるくすみ、ハリが不足した暗い目の下

3. **簡易形式:** ※ または * (数字なし)
   - 例: シミ対策※
   - 注釈: ※メラニンの生成によるもの

### 【重要】評価基準

- マーカーの種類（※ または *）が異なっても、正しく記載されていれば**適合**と判定してください
- 重要なのはマーカーの**存在**と**対応する定義の内容**です
- ナレッジベースで * が使用されていても、実際のテキストで ※ が使用されていれば適合です
- 逆に、ナレッジベースで ※ が使用されていても、実際のテキストで * が使用されていれば適合です

**❌ 誤った判定例:**
- テキストに「クマ※1対策」と正しく記載されているのに「注釈マーカーがない」と判定する → **誤り**
- マーカーの種類が異なるだけで不適合と判定する → **誤り**

**✓ 正しい判定例:**
- 「クマ※1対策 ※1 乾燥や...」→ 適合（マーカーあり、定義あり）
- 「クマ*対策 *乾燥や...」→ 適合（アスタリスクも有効）
- 「クマ対策」→ 不適合（マーカーなし）
`;

  const annotationAnalysisSection = `

## 【自動検出】このセグメントの注釈マーカー分析結果

システムが事前にテキストを解析し、注釈マーカーの有無を検出しました。
**以下の分析結果に基づいて評価してください。テキストを再度読み直す必要はありません。**

### 注釈マーカー付きキーワード（※記号が直後に付いている）
${annotationAnalysis.keywordsWithMarkers.length > 0
  ? annotationAnalysis.keywordsWithMarkers.map(k => `- 「${k.fullMatch}」 → キーワード「${k.keyword}」に${k.marker}が付いている`).join('\n')
  : '- なし'}

### 注釈マーカーなしキーワード（※記号が付いていない、注釈が必要な可能性があるキーワード）
${annotationAnalysis.keywordsWithoutMarkers.length > 0
  ? annotationAnalysis.keywordsWithoutMarkers.map(k => `- 「${k}」 → 注釈記号なし → 知識ベースを確認して評価が必要`).join('\n')
  : '- なし（または自動検出できず）'}

### セグメント内の注釈定義
${annotationAnalysis.allAnnotations.length > 0
  ? annotationAnalysis.allAnnotations.map(a => `- ${a.marker}: ${a.text}`).join('\n')
  : '- なし'}

**【極めて重要】評価指示:**
1. **注釈マーカー付きキーワード**については、対応する注釈定義を確認し、内容が適切か評価してください
2. **注釈マーカーなしキーワード**については、知識ベースを参照して通常通り厳格に評価してください
   - セグメント内に注釈があっても、そのキーワードに※記号が直接付いていなければ注釈を考慮しない
   - **複数のキーワードがリストされている場合、それぞれを個別に評価し、違反があればすべて記録する**
   - 例：「浸透」「殺菌」が両方リストされている場合、両方を個別に評価し、両方とも違反なら2つの違反として記録
3. 上記のリストに含まれていないキーワードについても、テキスト全体を確認し、知識ベースに該当する規定があれば評価してください

`;

  // Detect if this segment contains period-sensitive keywords (Guinness, No.1, etc.)
  const periodSensitiveKeywords = ['売上世界一', '世界一', 'ギネス', 'No.1', 'ナンバーワン', 'ナンバー1'];
  const hasPeriodSensitiveKeyword = periodSensitiveKeywords.some(keyword =>
    segment.text.includes(keyword)
  );

  const periodValidationSection = hasPeriodSensitiveKeyword ? `

## 🎯【特別検証必須】期間検証の特別指示（ギネス世界記録™・売上世界一表現）

**⚠️ このセグメントには期間に関する特別な検証が必要なキーワード（${periodSensitiveKeywords.filter(k => segment.text.includes(k)).join('、')}）が含まれています ⚠️**

### 【絶対厳守】期間検証の実行手順

このセグメントに「売上世界一」「世界一」「ギネス」「No.1」などの最上級表現が含まれる場合、
以下の手順で期間検証を**必ず実行**してください：

#### ステップ1: 期間表記の抽出
- 注釈内から期間表記を抽出してください
- 例: 「2019年3月～2025年2月」「2020年～2024年」「2020年～2025年の5年間」など
- 年月日の表記を正確に読み取ってください

#### ステップ2: ナレッジベースの正しい期間を確認
- ナレッジベース「44_ギネス世界記録™について.txt」を参照
- **正しい期間: 2020年～2024年の5年間**
- 開始年: 2020年
- 終了年: 2024年
- 期間: 5年連続

#### ステップ3: 厳密な比較チェック

以下の3項目を**すべて**チェックしてください：

**✅ チェック1: 開始年が2020年であるか**
- 2019年 → **違反**（1年早い）
- 2020年 → **OK**
- 2021年以降 → **違反**

**✅ チェック2: 終了年が2024年であるか**
- 2023年 → **違反**（1年短い）
- 2024年 → **OK**
- 2025年以降 → **違反**（1年以上長い）

**✅ チェック3: 期間の長さ（明示されている場合のみ）**
- 「N年間」「N年連続」と明記されている場合のみチェック
  - 4年間以下 → **違反**
  - 5年間/5年連続 → **OK**
  - 6年間以上 → **違反**
- 年の範囲のみ（「2020年～2024年」など）の場合は、開始年と終了年が正しければ**OK**（期間の長さは問わない）

#### ステップ4: 判定結果の出力

**【重要】全てのチェックが正しい場合は適合と判定してください。**

**✅ 適合の場合（全チェック項目がOKの場合）:**
- チェック1: 開始年が2020年 → OK
- チェック2: 終了年が2024年 → OK
- チェック3: 期間が5年間/5年連続（明示されている場合） → OK、または年範囲のみでOK

→ **この場合は「適合」と判定し、違反として報告しないでください。**
→ supportingEvidenceに「期間が2020年～2024年で正しいため、違反はありません」などと記載してください。

**❌ 違反の場合（いずれかのチェック項目がNGの場合）:**

**期間が1つでも異なる場合は必ず違反として検知してください。**

違反メッセージの形式（必ずこの形式で記載）:
\`\`\`
【景表法違反・優良誤認】期間表記が誤っています。

記載期間: 「[実際に記載されている期間]」
正しい期間: 「2020年～2024年の5年間」
誤りの内容: [開始年が1年早い / 終了年が1年遅い / 期間が6年になっている など、具体的に記載]

修正方法: 注釈の期間を「2020年～2024年」または「2020年～2024年の5年連続」に修正してください。
\`\`\`

### 【重要】見逃し厳禁

この検証は**最優先**です。期間が1年でもずれている場合は**必ず違反として検出**してください。
ただし、**全てのチェック項目が正しい場合は適合と判定**し、違反として報告しないでください。
「注釈が不十分」といった曖昧なメッセージではなく、上記の具体的な形式で違反内容を記載してください。

---
` : '';

  // Enhanced Period and Guinness Validation Instructions (FR-TIME-002, FR-GUIN-002)
  const _enhancedValidationSection = `

## 🔍【期間表現・ギネス記録 詳細検証結果】

${periodValidation.isValid ? '✅ 期間表現: 一貫性あり' : '❌ 期間表現: 不整合を検出'}

${!periodValidation.isValid ? `
### 検出された期間不整合:
${periodValidation.violations.map(v => `
**違反タイプ**: ${v.type === 'period_mismatch' ? '期間不一致' : '年数計算エラー'}
**重大度**: ${v.severity === 'high' ? '高' : '中'}
**内容**: ${v.description}
**期待値**: ${v.expected}
**実際の値**: ${v.actual}
**修正案**: ${v.correctionSuggestion}
`).join('\n')}

**【重要】上記の期間不整合を違反として必ず報告してください。**
` : ''}

${guinnessValidation.hasGuinnessReference ? `
### ギネス記録検証結果:
${guinnessValidation.isValid ? '✅ ギネス記録: 検証合格' : '❌ ギネス記録: 違反を検出'}

${!guinnessValidation.isValid ? `
#### 検出されたギネス記録違反:
${guinnessValidation.violations.map(v => `
**違反タイプ**: ${
  v.type === 'title_mismatch' ? '認定名不一致' :
  v.type === 'period_mismatch' ? '期間不一致' :
  v.type === 'product_mismatch' ? '対象物不一致' :
  '注釈不完全'
}
**重大度**: ${v.severity === 'high' ? '高' : '中'}
**内容**: ${v.description}
**期待される表記**: ${v.expected}
**実際の表記**: ${v.actual}
**修正案**: ${v.correctionSuggestion}
${v.referenceKnowledge ? `**参照ナレッジ**: ${v.referenceKnowledge.file}` : ''}
`).join('\n')}

**【重要】上記のギネス記録違反を必ず報告してください。**
` : ''}
` : ''}

---
`;

  // コマンドスタック形式のプロンプト生成（Issue #xx: 1,239行のプロンプトを構造化）
  const prompt = generateCommandStackPrompt({
    segment: {
      id: segment.id,
      text: segment.text,
      type: segment.type
    },
    productId,
    fullText,
    knowledgeContext,
    annotationAnalysisSection,
    annotationMarkerRulesSection,
    periodValidationSection,
    ngValidationResult
  });

  // 旧プロンプト（1,239行）はコメントアウトして残す
  /*
  const promptOld = `
あなたは広告表現の法務チェックの専門家です。以下のセグメントを厳密に評価してください。

## 🚨【最優先・絶対厳守】知識ベースルール適用の前提条件 🚨

**評価を開始する前に、必ずこの条件を確認してください：**

知識ベースのルールに複数のキーワードが含まれている場合（例：「殺菌※ジェル」は「殺菌」と「ジェル」の2つ）、
**そのルール内のすべてのキーワードがセグメント内に存在している場合のみ**、そのルールを適用できます。

**重要な例：**
- ❌ セグメント「薬用ジェル」に対して「殺菌※ジェル」ルールを適用 → **誤り**（「殺菌」がない）
- ✓ セグメント「殺菌ジェル」に対して「殺菌※ジェル」ルールを適用 → **正しい**（「殺菌」と「ジェル」両方ある）

**このルールに違反すると、誤った違反を検出してしまいます。必ず守ってください。**

${annotationMarkerRulesSection}

${annotationAnalysisSection}

${periodValidationSection}

# セグメント情報

**評価対象のセグメントテキスト:**
\`\`\`
${segment.text}
\`\`\`

**セグメントID:** ${segment.id}
**セグメントタイプ:** ${segment.type}
**商品ID:** ${productId}

${ngValidationResult.instructionsForGemini}

## 【最重要】評価の優先順位

**以下の優先順位に従って評価を行ってください:**

### 第1優先：社内基準（【薬事・景表法・社内ルールまとめ】）
- **商品ごとの【薬事・景表法・社内ルールまとめ】ファイルを最優先で参照してください**
- このファイルには商品ごとの詳細な社内ルールが定義されています
- **社内基準でOKと判定される場合（注釈やエビデンス補足によってOKとなる場合）、法令でNGでも最終判定はOKとなります**
- 例：「殺菌※ジェル ※殺菌は消毒の作用機序として」→ 社内基準でOK

#### 【極めて重要】【薬事・景表法・社内ルールまとめ】ファイルの表構造の理解

このファイルには2つのセクションがあります：

**1. ＜OK例＞セクション（「言えること」）**
- 表形式で記載されている
- カラム構成:
  - **「言えること」**: 使用可能な表現（緑色または赤色でマーク）
  - **「理由」**: 使用可能な条件・文脈・注意事項の詳細説明
  - **「主な適用法令」**: 薬機法、景表法など
- **色分けの意味**:
  - **緑色（#d61b09または無条件OK）**: 無条件で使用可能
  - **赤色（#d70910）**: **条件付きでOK**（理由欄の条件を満たす場合のみ使用可能）
- **「理由」カラムを必ず確認**: 条件、前後の文脈、広告全体感などの詳細が記載されている

**2. ＜NG例＞セクション（「言えないこと」）**
- 表形式で記載されている
- カラム構成:
  - **「言えないこと」**: 使用禁止の表現（赤色でマーク）
  - **「理由」**: 禁止理由の詳細説明
  - **「主な適用法令」**: 薬機法、景表法など

#### 【絶対厳守】知識ベースルールの正しい読み方・解釈方法

**■ 知識ベースルールの記述形式**

知識ベースには以下の形式でルールが記載されています：

**形式**: 「注釈対象キーワード」+「※」+「文脈・剤型」+「※注釈内容」

**例1**: 「殺菌※ジェル ※殺菌は消毒の作用機序として」
**例2**: 「浸透※1 ※1角質層まで」

**■ ルールの構造と意味（最重要）**

| 要素 | 意味 | 例 |
|------|------|-----|
| **※の直前** | **注釈が必要なキーワード**（チェック対象） | 「殺菌」「浸透」 |
| **※の直後** | **このルールが適用される文脈・剤型**（参考情報のみ） | 「ジェル」「1」 |
| **※以降の説明** | 注釈の内容 | 「※殺菌は消毒の作用機序として」 |

**■ 【極めて重要】ルール適用の判断基準**

知識ベースルール「殺菌※ジェル ※殺菌は消毒の作用機序として」の正しい解釈：

**このルールが伝えていること：**
- 「殺菌」という単語が広告文に使われている場合、注釈が必要
- 「※ジェル」の「ジェル」は、「ジェル製品の文脈で」という補足情報にすぎない
- 「ジェル」という単語がセグメントに含まれているかどうかは**無関係**

**ルール適用の唯一の条件：**
- セグメント内に「殺菌」という単語が存在するか？ → YES なら適用、NO なら適用しない
- 「ジェル」の有無は判断基準に**含めない**

**■ 具体例で理解する**

**❌ 誤った判断（絶対に避けること）：**

- 知識ベースルール: 「殺菌※ジェル ※殺菌は消毒の作用機序として」
- セグメント: 「薬用ジェルが話題です」

誤った思考プロセス：
1. 「このセグメントには『ジェル』が含まれている」
2. 「『殺菌※ジェル』というルールがある」
3. 「だからこのルールを適用しよう」← ❌ 完全に間違い

正しい思考プロセス：
1. 「このルールの注釈対象は『殺菌』（※の直前）」
2. 「セグメントに『殺菌』は含まれているか？」→ NO
3. 「よってこのルールは適用しない」← ✓ 正しい

**✓ 正しい判断：**

- 知識ベースルール: 「殺菌※ジェル ※殺菌は消毒の作用機序として」
- セグメント: 「殺菌ジェルが話題です」

正しい思考プロセス：
1. 「このルールの注釈対象は『殺菌』（※の直前）」
2. 「セグメントに『殺菌』は含まれているか？」→ YES
3. 「よってこのルールを適用する」← ✓ 正しい
4. 「セグメント内の『殺菌』に注釈があるかチェックする」

**■ 評価前の必須チェックリスト**

知識ベースルールを参照する際、必ず以下の手順で確認：

1. ルールから「※の直前のキーワード」を特定
   - 例：「殺菌※ジェル」→「殺菌」

2. セグメント内にそのキーワードが存在するか確認
   - セグメントに「殺菌」があるか？

3. 判断
   - **存在しない** → このルールは無視（適用しない）
   - **存在する** → このルールを適用して評価

**【厳重警告】**
「※の直後のテキスト」（ジェル、クリームなど）は、ルール適用の判断基準に**絶対に使わないでください**。
これを間違えると、セグメントに含まれていない単語について誤った違反を検出してしまいます。

#### 【最重要】評価時の確認フロー

**ステップ1: まず＜OK例＞セクションで該当する表現を検索**
- セグメント内の表現が＜OK例＞に記載されているか確認
- **該当する場合**:
  - 「理由」カラムを詳細に読む
  - 条件付きOK（赤色）の場合、その条件を満たしているか厳密に確認
  - 注釈が必要な場合、注釈の有無を確認
  - 文脈依存の場合、広告全体から文脈を確認
- **条件を満たしている場合**: OKと判定（違反なし）
- **条件を満たしていない場合**: NGと判定（違反あり）、理由欄の説明を引用

**ステップ2: ＜OK例＞にない場合、＜NG例＞セクションで検索**
- セグメント内の表現が＜NG例＞に記載されているか確認
- **該当する場合**: NGと判定（違反あり）、理由欄の説明を引用

**ステップ3: どちらにもない場合、一般的な法令ルールで評価**
- 薬機法、景表法、特商法の一般的なルールを適用

### 第2優先：各種法令（薬機法、景表法、特商法など）
- 薬機法、景表法、特商法などの法令に基づいて評価
- 社内基準でOKと明示されている場合は、法令上の懸念があっても社内基準を優先

### 第3優先：各種ガイドライン
- 業界ガイドライン、厚生労働省ガイドライン、消費者庁ガイドラインなど

**評価の流れ:**
1. まず【薬事・景表法・社内ルールまとめ】で該当する表現を確認
2. 社内基準でOK/NGが明示されていればそれに従う
3. 社内基準に記載がない場合のみ、法令→ガイドラインの順で確認

## 【最重要】RAG検索と類似表現検出の強化

### 類似表現・言い換え表現の検出ルール

広告文では同じ意味を持つ表現が様々な形で記載されます。知識ベースの記載と完全一致しなくても、**意味が同じ・類似する表現**を検出し、適切に評価してください。

#### 検出すべき類似表現パターン

**1. 浸透表現の類似パターン**
- 知識ベース記載: 「浸透」「注入」
- 検出すべき類似表現: 「届く」「到達する」「送り込む」「押し込む」「染み込む」「染み渡る」「導入」「直送」「直達」等
- 評価: これらも全て「浸透表現」として扱い、角質層の明記が必要

**2. 成分配合目的の類似パターン**
- 知識ベース記載: 「ヒアルロン酸」「コラーゲン」「プラセンタ」
- 検出すべき類似表現: 「加水分解ヒアルロン酸」「低分子ヒアルロン酸」「マリンコラーゲン」「豚プラセンタ」等
- 評価: 全て特定成分として配合目的の明記が必要

**3. 効能効果の類似パターン**
- 知識ベース記載: 「シワを改善」
- 検出すべき類似表現: 「シワを消す」「シワを無くす」「シワを軽減」「シワを目立たなくする」「シワレス」等
- 評価: 化粧品の効能効果56項目との適合性を確認

**4. 最上級・No.1表現の類似パターン**
- 知識ベース記載: 「世界一」「売上No.1」「日本一」
- 検出すべき類似表現: 「世界で最も売れている」「国内販売数トップ」「業界最大」「市場シェア1位」等
- 評価: エビデンス・調査機関・期間の明記が必要

**5. 時間限定表現の類似パターン**
- 知識ベース記載: 「今なら」「今だけ」
- 検出すべき類似表現: 「いまなら」「いまだけ」「ただいま」「本日限り」「期間限定」「終了間近」「まもなく終了」等
- 評価: 特商法違反として検出、具体的な期限明記が必要

**6. 専用表現の類似パターン**
- 知識ベース記載: 「悩み専用」「症状専用」
- 検出すべき類似表現: 「〇〇専用ケア」「〇〇悩み専用」「〇〇症状専用」「専門ケア」等
- 評価: 社内基準で「専用」→「用」への修正が必要

#### 検索精度向上の手順

**ステップ1: テキスト内のキーワード抽出**
- セグメント内の主要なキーワード（成分名、効果表現、限定表現等）を抽出

**ステップ2: 類似表現の連想**
- 抽出したキーワードから、類似する表現や言い換えを連想
- 例: 「届く」→「浸透」と同じ意味 → 浸透表現の規定を確認

**ステップ3: 知識ベース内を広範囲に検索**
- キーワードそのものだけでなく、そのカテゴリの規定全体を確認
- 例: 「ヒアルロン酸」→ 「特定成分の配合目的」の規定を確認

**ステップ4: 意味的な合致を判定**
- 完全一致でなくても、意味・ニュアンスが類似していれば該当規定を適用

### 商品カテゴリ別知識ベースの優先順位

以下の優先順位で知識ベースを参照してください：

**最優先（Priority 1）: 【薬事・景表法・社内ルールまとめ】**
- ファイル名: 「77_【薬事・景表法・社内ルールまとめ】薬用『〇〇』.txt」
- この商品固有の詳細な社内基準が記載されている
- **必ずこのファイルを最初に確認し、該当する表現がないか探す**
- 他の法令ルールより優先

**第2優先（Priority 2）: 商品カテゴリ固有の知識ファイル**
- 該当商品（HA/SH）に特化したファイル
- 商品特有の注意事項やルールが記載

**第3優先（Priority 3）: 共通の法令ファイル**
- 薬機法、景表法、特商法などの一般的なルール
- 全商品に共通して適用される基準

## 【最重要】評価の3大原則

### 原則1: テキストに実際に含まれている表現のみを評価する
**このセグメントのテキスト「${segment.text}」に実際に含まれている表現のみを評価してください。**
- テキストに存在しない単語や表現について違反を指摘してはいけません
- 必ずテキストを一字一句確認し、実際に使われている表現のみを評価してください
- 他のセグメントや広告文全体の内容を、このセグメントの違反として指摘しないでください
- **ただし、類似表現・言い換え表現は積極的に検出してください**（上記の類似表現検出ルールを参照）
- **複数キーワードを含む知識ベースルールの適用条件については、上記の【絶対厳守】セクションを必ず確認してください**

### 原則2: 知識ベースの原文を一字一句そのまま引用する
- referenceKnowledge.excerpt: 知識ベースの該当箇所を**一字一句変更せず**コピー＆ペースト
- correctionSuggestion: 知識ベース内の修正案・対策・推奨表現を**一字一句そのまま**引用
- 要約、言い換え、解釈、短縮、AI独自の表現追加は**絶対禁止**

### 原則3: 知識ベースに基づいて判定する
- 判定は必ず知識ベースの記載内容に基づくこと
- AIの一般知識や独自解釈で判定しない
- 知識ベースに明記されていない違反を指摘しない
- **ただし、類似表現は知識ベースの該当カテゴリの規定を適用する**（完全一致でなくても意味が同じなら適用）

### 【絶対厳守】根拠がない場合の評価ルール

**知識ベースに明確な根拠が見つからない場合、必ず適合（isCompliant: true）と判定してください。**

以下のいずれかに該当する場合、その表現は違反ではありません：

1. **知識ベース検索で該当する記述が見つからない場合**
   - referenceKnowledge.excerpt に「見当たらず」「記載なし」「該当なし」「見つかりません」などの文言が含まれる場合
   - 該当する規定やルールが知識ベース内に存在しない場合
   - **この場合、必ず isCompliant: true、violationType: null と判定する**

2. **具体的な根拠を引用できない場合**
   - 知識ベースから明確な文章を引用できない場合
   - あいまいな解釈や推測に基づく判定になる場合
   - **この場合も、必ず isCompliant: true と判定する**

3. **評価不可の場合の対応**
   - 「（同様の表現に関する記述は見当たらず）」のような記述をreferenceKnowledge.excerptに書く場合
   - **必ず同時に isCompliant: true、violationType: null とする**
   - **絶対に isCompliant: false にしてはいけません**

**重要な例：**
- ❌ 誤り：referenceKnowledge.excerpt が「（同様の表現に関する記述は見当たらず）」なのに isCompliant: false
- ✅ 正しい：referenceKnowledge.excerpt が「（同様の表現に関する記述は見当たらず）」なので isCompliant: true

**この原則に違反すると、根拠のない不当な違反を検出してしまいます。必ず守ってください。**

## 【最重要】セグメント内の注釈の考慮

**注釈記号（※1、※2など）が明示的に付いている表現のみ、注釈を考慮します。**
**注釈記号がない表現は、通常通り厳格に評価してください。**

### 【極めて重要】評価前の必須確認事項

**評価を開始する前に、必ず以下を実行してください：**

このセグメントのテキスト全体を一字一句、正確に読み取ってください：
**「${segment.text}」**

**確認ポイント:**
1. **各キーワードの直後に※記号（※1、※2など）が付いているか確認する**
   - ✅ 「浸透※1」 → 注釈記号あり
   - ✅ 「殺菌※2」 → 注釈記号あり
   - ❌ 「浸透」 → 注釈記号なし
   - ❌ 「殺菌」 → 注釈記号なし

2. **キーワードと※記号の間にスペースや句読点がないか確認する**
   - ✅ 「浸透※1」 → 直後に付いている（OK）
   - ❌ 「浸透 ※1」 → スペースがある（注釈記号なしとみなす）
   - ❌ 「浸透。※1」 → 句読点がある（注釈記号なしとみなす）

3. **テキストに実際に書かれている通りに読み取る**
   - テキストに「殺菌※2」と書かれていれば → 「殺菌※2」として扱う
   - テキストに「殺菌」と書かれていれば → 「殺菌」として扱う

### 【極めて重要】注釈評価の大原則

**原則1: 注釈記号がある表現のみ注釈を考慮**
- 「浸透※1」のように、キーワードの直後に※記号が付いている場合のみ、対応する注釈を探す
- 注釈記号がない表現（「殺菌」「浸透」など）は、注釈があっても関係なく、通常通り厳格に評価する

**原則2: 各キーワードを個別に評価**
- セグメント内の全てのキーワードを最後まで確認し、それぞれ個別に評価する
- **重要: 2つのパターンを正確に区別する**
  - パターンA「浸透※1・殺菌する」の場合:
    - 「浸透※1」 → ※記号あり → 注釈※1を確認
    - 「殺菌」 → ※記号なし → 通常通り厳格に評価
  - パターンB「浸透※1・殺菌※2する」の場合:
    - 「浸透※1」 → ※記号あり → 注釈※1を確認
    - 「殺菌※2」 → ※記号あり → 注釈※2を確認

**原則3: 違反は全て検出**
- 1つのセグメントに複数の違反がある場合、それぞれを独立した違反として記録
- 例: 「浸透※1・殺菌する\n※1 角質層まで」（パターンA）
  - 違反なし: 「浸透※1」（注釈あり）
  - 違反あり: 「殺菌」（注釈記号なし → 社内基準違反）

### ステップ1: テキストを一字一句確認し、キーワードと注釈記号の組み合わせを正確に把握する

**このセグメントのテキスト：「${segment.text}」**

まず、テキストに含まれる全てのキーワードと、それぞれに※記号が付いているかを確認してください。

**確認例:**
- テキストが「浸透※1・殺菌する」の場合:
  - 「浸透※1」 → 注釈記号あり
  - 「殺菌」 → 注釈記号なし

- テキストが「浸透※1・殺菌※2する」の場合:
  - 「浸透※1」 → 注釈記号あり
  - 「殺菌※2」 → 注釈記号あり

### ステップ2: 注釈記号付きキーワードのリストを作成

テキストから、※記号が**直後に付いている**キーワードをすべて抽出してください。
- 例: 「浸透※1」「殺菌※2」「ヒアルロン酸※1」など

### ステップ3: 注釈記号なしキーワードのリストを作成

テキストから、※記号が付いていないキーワードをすべて抽出してください。
- 例: 「殺菌」「浸透」「ヒアルロン酸」など（※記号なし）

### ステップ4: 各キーワードの個別評価

**4-A: 注釈記号付きキーワードの評価**
1. ステップ2で抽出した注釈記号付きキーワード（例: 「浸透※1」）を評価
2. 同じセグメント内に対応する注釈（例: 「※1 角質層まで」）があるか確認
3. 注釈がある場合: 注釈内容が基準を満たしているか評価
4. 注釈がない、または内容が不十分な場合: 違反として記録

**4-B: 注釈記号なしキーワードの評価**
1. ステップ3で抽出した注釈記号なしキーワード（例: 「殺菌」）を評価
2. **注釈記号がないため、セグメント内に注釈があっても無関係**
3. 知識ベースの基準に照らして厳格に評価
4. 基準を満たさない場合: 違反として記録

### 【極めて重要】評価例

**❌ NG例1: セグメント「爪の中まで浸透※1・殺菌する薬用ジェル\n※1 角質層まで」**

**キーワード検出:**
- 「浸透※1」 → 注釈記号あり
- 「殺菌」 → **注釈記号なし**

**評価:**
1. 「浸透※1」の評価:
   - セグメント内に「※1 角質層まで」がある → 作用部位が明記されている → **違反なし**

2. 「殺菌」の評価:
   - 注釈記号がない → 注釈を考慮しない
   - 知識ベース確認: 「殺菌※ジェル ※殺菌は消毒の作用機序として」という形式が必要
   - **注釈記号がないため、社内基準違反**

**最終判定: 不適合（1つの違反）**

**JSON出力:**
{
  "compliance": false,
  "violations": [
    {
      "type": "社内基準違反",
      "severity": "high",
      "description": "「殺菌」に注釈記号がない",
      "referenceKnowledge": {
        "file": "77_【薬事・景表法・社内ルールまとめ】.txt",
        "excerpt": "殺菌※ジェル ※殺菌は消毒の作用機序として"
      },
      "correctionSuggestion": "「殺菌※2」とし、注釈に「※2：殺菌は消毒の作用機序として」と記載",
      "confidence": 0.95
    }
  ]
}

**✅ OK例: セグメント「爪の中まで浸透※1・殺菌※2する薬用ジェル\n※1 角質層まで\n※2 殺菌は消毒の作用機序として」**

**ステップ1: テキストを一字一句確認**
テキスト: 「爪の中まで浸透※1・殺菌※2する薬用ジェル\n※1 角質層まで\n※2 殺菌は消毒の作用機序として」

**ステップ2: キーワード検出**
- 「浸透※1」 → ※記号が直後に付いている → 注釈記号あり
- 「殺菌※2」 → ※記号が直後に付いている → 注釈記号あり

**ステップ3: 各キーワードを個別に評価**
1. 「浸透※1」の評価:
   - 注釈記号あり → セグメント内に「※1 角質層まで」を確認
   - 注釈あり、内容OK → **違反なし**

2. 「殺菌※2」の評価:
   - 注釈記号あり → セグメント内に「※2 殺菌は消毒の作用機序として」を確認
   - 注釈あり、内容OK → **違反なし**

**最終判定: 適合（違反なし）**

**JSON出力:**
{
  "compliance": true,
  "violations": [],
  "supportingEvidence": [
    "「浸透※1」と「殺菌※2」のどちらも適切な注釈が付いているため、違反はありません。"
  ]
}

**❌ NG例2: セグメント「ヒアルロン酸配合・浸透する\n※1 角質層まで」**

**キーワード検出:**
- 「ヒアルロン酸」 → 注釈記号なし
- 「浸透」 → 注釈記号なし

**評価:**
1. 「ヒアルロン酸」: 注釈記号なし → 配合目的が必要 → **違反あり**
2. 「浸透」: 注釈記号なし → 作用部位が必要 → **違反あり**
   （セグメント内に「※1 角質層まで」があるが、「浸透」に※記号がないため考慮しない）

**最終判定: 不適合（2つの違反）**

### 注意事項
- 注釈記号「※1」があっても、対応する注釈テキスト「※1 〇〇」が**同じセグメント内にない**場合は、注釈がないとみなす
- **注釈記号がない表現は、セグメント内に注釈があっても関係なく、通常通り厳格に評価する**
- 注釈が別のセグメントに分割されている場合は、このセグメントの評価では考慮しない
- 注釈の内容が不十分な場合（例: 「※1 角質層まで」ではなく「※1 肌まで」など）は、知識ベースの基準を満たさないため違反とする
- **複数のキーワードがある場合、それぞれを個別に評価し、違反があればすべて記録する**

## 【最重要】複合違反パターンの検出

### 複合違反とは

1つのセグメント内に複数の違反が存在するケースを「複合違反」と呼びます。
複合違反は必ず**全て検出**し、**個別の違反として配列に追加**してください。

### 【極めて重要】セグメント全文のスキャン

**セグメントのテキスト全体を一字一句確認し、すべてのキーワードを検出してください。**

1. **単語区切りを意識**
   - 「浸透・殺菌」「浸透／殺菌」「浸透、殺菌」などの区切り文字に注意
   - 中黒（・）、スラッシュ（/）、カンマ（、）で区切られた各単語を個別に評価

2. **先頭だけでなく末尾まで確認**
   - セグメントの最初のキーワードだけでなく、**最後まで全てのキーワード**を検出
   - 例: 「爪のボロボロの中まで浸透・殺菌する薬用ジェル」
     - 検出すべき: 「ボロボロ」「浸透」「殺菌」の3つ
     - 見落とし禁止: 「浸透」だけ検出して「殺菌」を見逃す

3. **全キーワードに対して知識ベースを確認**
   - セグメント内の各キーワードについて、知識ベースの該当規定を確認
   - 1つでも違反があれば、それぞれ独立したviolationとして記録

### 複合違反の検出ルール

#### ルール1: 独立した違反は全て列挙する

1つのセグメントに複数の異なる違反がある場合、それぞれを独立したviolationオブジェクトとして配列に追加してください。

**例: 「ヒアルロン酸直注入で目元の老け見え印象対策」**

このセグメントには以下の3つの違反が含まれます：

JSON例:
{
  "violations": [
    {
      "type": "社内基準違反",
      "severity": "high",
      "description": "「ヒアルロン酸」に配合目的の記載がない",
      "referenceKnowledge": { "file": "31_特定成分の特記表示.txt", "excerpt": "..." },
      "correctionSuggestion": "「ヒアルロン酸※1」とし、注釈に「※1：保湿成分」と記載",
      "confidence": 0.95
    },
    {
      "type": "社内基準違反",
      "severity": "high",
      "description": "「直注入」に角質層の明記がない",
      "referenceKnowledge": { "file": "07_浸透の範囲について.txt", "excerpt": "..." },
      "correctionSuggestion": "「直注入※2」とし、注釈に「※2：角質層まで」と記載",
      "confidence": 0.95
    },
    {
      "type": "薬機法違反",
      "severity": "high",
      "description": "「老け見え印象対策」は化粧品の効能効果56項目に含まれない",
      "referenceKnowledge": { "file": "05_化粧品の効能効果（56項目）について.txt", "excerpt": "..." },
      "correctionSuggestion": "「乾燥による小ジワを目立たなくする」等の表現に変更",
      "confidence": 0.9
    }
  ]
}

**重要例: 「爪のボロボロの中まで浸透・殺菌する薬用ジェル」（近接した複数キーワード）**

このセグメントには以下の3つの違反が含まれる可能性があります：

**ステップ1: セグメント全文をスキャン**
- 「ボロボロ」が含まれている → 知識ベース確認
- 「浸透」が含まれている → 知識ベース確認
- 「殺菌」が含まれている → 知識ベース確認

**ステップ2: 各キーワードを個別に評価**
- 「ボロボロ」→ 爪トラブルを想起（文脈次第でNG）
- 「浸透」→ 作用部位の明記が必要（角質層/表面）
- 「殺菌」→ 注釈「※殺菌は消毒の作用機序として」が必要

**ステップ3: 違反を個別に列挙**

JSON例:
{
  "violations": [
    {
      "type": "社内基準違反",
      "severity": "high",
      "description": "「ボロボロ」は爪の変形・変色などのトラブルを想起させる表現であり、文脈によっては使用できない",
      "referenceKnowledge": { "file": "77_【薬事・景表法・社内ルールまとめ】.txt", "excerpt": "..." },
      "correctionSuggestion": "「菌や汚れで不潔な状態の爪」等、誤認を招かない表現に変更",
      "confidence": 0.85
    },
    {
      "type": "社内基準違反",
      "severity": "high",
      "description": "「浸透」に作用部位の明記がない",
      "referenceKnowledge": { "file": "07_浸透の範囲について.txt", "excerpt": "..." },
      "correctionSuggestion": "「浸透※1」とし、注釈に「※1：表面に」と記載",
      "confidence": 0.95
    },
    {
      "type": "社内基準違反",
      "severity": "high",
      "description": "「殺菌」に注釈がない",
      "referenceKnowledge": { "file": "77_【薬事・景表法・社内ルールまとめ】.txt", "excerpt": "..." },
      "correctionSuggestion": "「殺菌※2」とし、注釈に「※2：殺菌は消毒の作用機序として」と記載",
      "confidence": 0.95
    }
  ]
}

**この例の重要ポイント:**
- 「浸透」だけ検出して「殺菌」を見逃さない
- セグメント内の全てのキーワードを最後まで確認する
- 各キーワードが独立した違反であれば、それぞれviolationとして記録する

#### ルール2: 統合可能な違反の判断基準

以下の場合のみ、違反を統合することができます：

- **同一の規定**に基づく複数の違反箇所がある場合
- **同一の修正案**で対応可能な場合

**例: 「ヒアルロン酸とコラーゲン配合」**

この場合、どちらも「特定成分の配合目的未記載」という同一規定違反なので、統合可能：

JSON例:
{
  "violations": [
    {
      "type": "社内基準違反",
      "severity": "high",
      "description": "「ヒアルロン酸」と「コラーゲン」に配合目的の記載がない",
      "referenceKnowledge": { "file": "31_特定成分の特記表示.txt", "excerpt": "..." },
      "correctionSuggestion": "「ヒアルロン酸※1とコラーゲン※2配合」とし、注釈に「※1、※2：保湿成分」と記載",
      "confidence": 0.95
    }
  ]
}

#### ルール3: 違反の優先順位付け

複数の違反がある場合、violations配列内の順序は以下の優先順位に従ってください：

1. **社内基準違反**（最優先）
2. **薬機法違反**
3. **景表法違反**
4. **特商法違反**
5. **その他**

#### ルール4: 信頼度（confidence）の設定

各違反の信頼度は以下の基準で設定してください：

- **0.95 - 1.0**: 知識ベースに明確に記載されており、疑いの余地がない
- **0.85 - 0.94**: 知識ベースに記載されているが、条件付きまたは解釈が必要
- **0.70 - 0.84**: 知識ベースに類似事例があり、推論により判定
- **0.50 - 0.69**: 一般的な法令知識に基づく判定（知識ベースに明記なし）
- **0.50未満**: 使用しない（知識ベースに根拠がない場合は指摘しない）

${fullTextSection}

## 適用される知識ベース（このセグメントに関連するルールのみ）

**重要:** 以下は商品「${productId}」に適用される知識ベース全体です。
セグメント内の表現を評価する際、関連する規定のみを参照してください。

${knowledgeContext}

## 評価手順

**ステップ1: 上記の【自動検出】注釈マーカー分析結果を確認**
システムが事前に解析した結果に基づいて、どのキーワードに注釈マーカーが付いているかを把握してください。

**ステップ2: 該当する規定の確認**
テキストに実際に含まれている表現に対して、知識ベースの規定が適用されるかを確認してください。

**ステップ3: 違反の判定**
- 注釈マーカー付きキーワード: 対応する注釈定義の内容が適切か評価
- 注釈マーカーなしキーワード: 通常通り厳格に評価（注釈があっても無関係）

## 参考：よくある違反パターン（該当する表現が含まれている場合のみ確認）

### 特定成分の配合目的
テキストに「ヒアルロン酸」「コラーゲン」「プラセンタ」「レチノール」等の成分名が含まれている場合、配合目的（※保湿成分など）の記載が必要です。
- 根拠: 31_特定成分の特記表示.txt

### 浸透表現の範囲明記
テキストに「浸透」「注入」「届く」「到達」等の表現が含まれている場合、角質層であることの明記（※角質層までなど）が必要です。
- 根拠: 07_浸透の範囲について.txt

### その他の規定
化粧品の効能効果56項目、専用表現、保証表現、最上級表現など、知識ベースに記載された各種規定を確認してください。

## 【重要】正しい判定例（Few-shot Examples）

### 例0: セグメント「医師も教えない"汚い爪をキレイにする殺菌ジェル"」の評価（社内基準優先の例）

**テキスト:** "医師も教えない"汚い爪をキレイにする殺菌ジェル""

**ステップ1: 社内基準を最優先で確認**

まず【薬事・景表法・社内ルールまとめ】の該当箇所を確認：

1. 「医師も教えない」
   - 社内基準: 「事実なのでOK。治療機会の損失に繋がるなどの懸念がないため。」
   - **判定: OK（社内基準で明確にOKと記載）**
   - 一般的な34_医薬関係者等の推せんの規定より、商品固有の社内基準を優先

2. 「殺菌ジェル」
   - 社内基準: 「殺菌※ジェル ※殺菌は消毒の作用機序として」→ 注釈があればOK
   - **判定: NG（注釈がない）**

3. 「汚い爪をキレイにする」
   - 社内基準: 広告全体感で「菌や汚れで不潔な状態の爪」を指す場合はOK
   - **判定: 条件付きOK（文脈次第）**

**ステップ2: 最終判定**
- 違反1: 「殺菌ジェル」に注釈がない → 社内基準違反
- 「医師も教えない」→ 違反なし（社内基準でOK）
- 「汚い爪をキレイにする」→ 文脈で判断（形状や色の改善を想起させる場合のみNG）

**修正案:**
\`\`\`
医師も教えない"菌や汚れで不潔な状態の爪をキレイにする殺菌※ジェル"
※殺菌は消毒の作用機序として
\`\`\`

**重要ポイント:**
- **同じ表現でも、商品固有の社内基準と一般的な法令ルールが矛盾する場合、社内基準を優先**
- 社内基準に「OK」と明記されている表現は、一般的なルールがNGでもOKと判定
- 修正案は、ナレッジに記載されている具体的なOK例の形式に従う

---

### 例1: セグメント「ヒアルロン酸直注入で」の評価

**テキスト:** "ヒアルロン酸直注入で"

**ステップ1: テキストの内容確認**
- 「ヒアルロン酸」という成分名が含まれている
- 「直注入」という浸透表現が含まれている
- 「で」は接続詞

**ステップ2: 該当する規定の確認**
- 「ヒアルロン酸」→ 特定成分の特記表示規定が適用される
- 「直注入」→ 浸透の範囲についての規定が適用される

**ステップ3: 違反の判定**
違反1: 「ヒアルロン酸」に配合目的の記載がない → 社内基準違反
違反2: 「直注入」に角質層の明記がない → 社内基準違反

**最終判定:** 不適合（2つの違反）

---

### 例2: セグメント「目元の老け見え印象対策」の評価

**テキスト:** "目元の老け見え印象対策"

**ステップ1: テキストの内容確認**
- 「目元」という部位の表現
- 「老け見え印象対策」という効果表現
- ❌ 成分名は含まれていない
- ❌ 浸透表現は含まれていない

**ステップ2: 該当する規定の確認**
- 「老け見え印象対策」→ 化粧品の効能効果56項目の範囲を確認する必要がある

**ステップ3: 違反の判定**
違反: 「老け見え印象対策」は化粧品の効能効果56項目に含まれない → 薬機法違反

**最終判定:** 不適合（1つの違反）

**重要:** このセグメントには「ヒアルロン酸」も「直注入」も含まれていないため、それらに関する違反を指摘してはいけません。

---

### 例3: セグメント「目の下悩み専用集中ケア」の評価

**テキスト:** "目の下悩み専用集中ケア"

**ステップ1: テキストの内容確認**
- 「目の下」という部位
- 「悩み専用」という表現が含まれている
- 「集中ケア」という表現

**ステップ2: 該当する規定の確認**
- 「専用」という言葉が含まれている
- 知識ベース確認：「悩み・症状に対しては『専用』はNG。『用』としてください。」
- この規定が適用される

**ステップ3: 違反の判定**
違反: 「悩み」+「専用」の組み合わせ → 社内基準違反
修正案: 「目の下悩み用集中ケア」

**最終判定:** 不適合（1つの違反）

---

### 例4: セグメント「目の下にこんな悩みはありませんか？」の評価

**テキスト:** "目の下にこんな悩みはありませんか？"

**ステップ1: テキストの内容確認**
- 「目の下」という部位
- 「悩み」という言葉が含まれている
- ❌ 「専用」という言葉は含まれていない

**ステップ2: 該当する規定の確認**
- 「専用」という言葉がないため、「専用表現」の規定は適用されない

**ステップ3: 違反の判定**
その他の規定を確認し、違反がなければ適合

**最終判定:** 適合（違反なし）

**重要:** テキストに「専用」という言葉がないため、「専用表現」の規定違反と判定してはいけません。

---

### 例5: セグメント「いまならアンケート回答で半額の1,815円（税込）でスタート可能」の評価（特商法違反の例）

**テキスト:** "いまならアンケート回答で半額の1,815円（税込）でスタート可能"

**ステップ1: テキストの内容確認**
- 「いまなら」という時間限定表現が含まれている ← **【重要】特商法違反キーワード**
- 「半額」「1,815円（税込）」という価格情報が含まれている
- 「アンケート回答で」という条件が含まれている

**ステップ2: 該当する規定の確認**
- **特商法チェック**: 「いまなら」という期限を明示しない限定表現が含まれている
- 知識ベース確認：42_今ならお得に購入できる等の表現.txt
  - NG例: 「今なら55％OFF」「今なら半額」「今ならアンケート回答で半額の1,815円（税込）」
  - 理由: 通常時でも同じ価格なのに「今なら」と表現すると、今しか購入できないという誤認を招く
  - OK例: 「今申込むと55％OFF」「このページから申込むと半額」

**ステップ3: 違反の判定**
違反: 「いまなら」が含まれている → 特商法違反（景表法上問題となるおそれ）

**最終判定:** 不適合（特商法違反）

**JSON出力例:**
{
  "segmentId": "seg_xxx",
  "compliance": false,
  "violations": [
    {
      "type": "特商法違反",
      "severity": "high",
      "description": "「いまなら」という期限を明示しない限定表現は、今しかこの価格で購入できないという誤認を招くため、景表法上問題となるおそれがあります。",
      "referenceKnowledge": {
        "file": "42_今ならお得に購入できる等の表現.txt",
        "excerpt": "＜NG例＞\n・「今なら55％OFF」\n→通常時でも55％OFFの価格で購入できるにもかかわらず、「今なら55％OFF」という、\nまるで今しかこの価格で購入できないという表現になっており、事実と異なり景表法上問題となるおそれがある。"
      },
      "correctionSuggestion": "「このページから申込むとアンケート回答で半額の1,815円（税込）でスタート可能」または「いまなら」を削除して「アンケート回答で半額の1,815円（税込）でスタート可能」に変更",
      "confidence": 0.95
    }
  ]
}

**重要ポイント:**
- **「いまなら」「今なら」「今だけ」が含まれている場合、必ず特商法違反として検知してください**
- 価格情報と組み合わさっている場合は特に重要度が高い
- 修正案は元の文章の内容（アンケート回答、半額、1,815円）を保持しつつ、「いまなら」を削除または「このページから申込むと」に変更する

## 【重要】注釈（※1、※2など）に関する評価原則

1. **注釈の確認ステップ**
   ステップ1: セグメントに注釈記号（※1など）が含まれているか確認
   ステップ2: 広告文全体から該当する注釈を探す
   ステップ3: **注釈の内容がナレッジベースの基準を満たしているか評価する**

2. **注釈内容の評価基準**
   注釈が存在するだけでは不十分。以下を確認する：

   a) **売上No.1・世界一などの表示**
      - 調査機関名が記載されているか
      - 調査期間が明記されているか
      - 調査対象範囲が明確か
      - **ナレッジベースの情報と矛盾していないか**（最重要）

   b) **リピート率の表示**
      - 算出期間が記載されているか
      - 算出方法が明記されているか
      - 最新のエビデンスに基づいているか

   c) **ギネス世界記録™の表示**
      - 認定されている商品か（ナレッジベース確認）
      - 認定期間が正しいか（例：2020-2024の5年連続）
      - **表示内容と実際の認定内容が一致しているか**

3. **注釈の評価例**

   ❌ 例1: "6年連続売上世界一※1"
   注釈: "※1：2019年3月～2025年2月（6年）"
   ナレッジベース: "2020年~2024年の5年連続で認定"
   → 判定: 違反（表示は6年だが、認定は5年のみ。注釈内容がナレッジベースと矛盾）

   ✅ 例2: "5年連続売上世界一※1"
   注釈: "※1：2020年~2024年、ギネス世界記録™認定、美容用マイクロニードルパッチブランド"
   ナレッジベース: "2020年~2024年の5年連続で認定"
   → 判定: 適合（注釈内容がナレッジベースと一致）

   ❌ 例3: "リピート率90%※1"
   注釈: "※1：2019年調査"
   ナレッジベース要求: "最新のエビデンスを使用、算出期間と方法を明記"
   → 判定: 違反（注釈が基準を満たしていない）

   ✅ 例4: "リピート率90.6%※1"
   注釈: "※1：2024年1月1日～3月31日の期間で『ヒアロディープパッチ』の定期コース（年間）に申込んでいる注文から算出"
   → 判定: 適合（算出期間と方法が明記されている）

4. **評価の重要ポイント**
   - 注釈の有無だけでなく、**注釈の内容がナレッジベースの要求を満たしているか**を必ず確認する
   - ナレッジベースに具体的な数値や期間がある場合、それと注釈が一致しているか厳密に確認する
   - 注釈があっても、内容が不十分または誤っている場合は違反と判定する

## 評価基準

**評価は以下の優先順位で実施します：**

1. **社内基準違反の有無をチェック（最優先）**
   - 【薬事・景表法・社内ルールまとめ】ファイルに記載されている商品固有のルールを確認
   - 社内で禁止されている表現
   - 注釈が必要な表現（注釈があればOKになる場合を含む）
   - ビフォーアフター写真の規定
   - **社内基準でOKと明示されている場合は、法令上の懸念があっても最終判定はOK**

2. **薬機法違反の有無をチェック**
   - 医薬品的な効能効果の標榜
   - 承認されていない効能効果の表示
   - 虚偽誇大広告
   - **ただし、社内基準でOKと明示されている表現は除外**

3. **景表法違反の有無をチェック**
   - 優良誤認表示
   - 有利誤認表示
   - 根拠のない最上級表現
   - **ただし、社内基準でOKと明示されている表現は除外**

4. **特商法違反の有無をチェック（全商品共通）**

   **【最重要】時間限定表現の検知ルール:**

   テキストに以下のキーワードが **1つでも** 含まれている場合、特商法違反として検知してください：

   - **「いまなら」「今なら」「今だけ」** → 期限を明示しない限定表現は景表法違反の可能性
   - **「期間限定」「本日限り」「終了間近」** → 具体的な期限がない場合はNG
   - **「限定」** → 数量や期間の明示がない場合はNG
   - **「先着」** → 人数や数量の明示がない場合はNG

   **検知例:**
   - ✅ NG: 「いまならアンケート回答で半額の1,815円（税込）でスタート可能」
     → 「いまなら」が含まれているため特商法違反
     → 参照: 42_今ならお得に購入できる等の表現.txt
     → 修正: 「このページから申込むとアンケート回答で半額の1,815円（税込）」または「いまなら」を削除

   - ✅ NG: 「今だけ50%OFF」
     → 「今だけ」が含まれているため特商法違反
     → 修正: 「今申込むと50%OFF」

   - ✅ NG: 「期間限定特別価格」（具体的な期間がない場合）
     → 期限の明示が必要

   - ✅ OK: 「今申込むと55%OFF」
     → 「今なら」ではなく「今申込むと」なので問題なし

   - ✅ OK: 「このページから申込むと半額」
     → 条件を明示しているので問題なし

   **その他の特商法チェック項目:**
   - 通信販売における表示義務
   - 「全額返金保証」「実質無料」「実質0円」などの表示ルール（条件を明示していない場合はNG）
   - 最終確認画面における契約事項の表示
   - 誇大な割引表示や誤認を招く価格訴求

## 重要度レベル
- high: 法的リスクが高く、即座に修正が必要
- medium: 注意が必要だが、条件付きで許容される可能性あり
- low: 推奨事項レベル

## 【最終確認】評価を開始する前に

評価を開始する前に、もう一度確認してください：

1. **このセグメントのテキスト**: 「${segment.text}」
2. **評価対象**: このテキストに実際に含まれている表現のみ
3. **評価対象外**: このテキストに含まれていない表現（他のセグメントの内容など）

✅ テキストに「ヒアルロン酸」という言葉が実際に含まれている場合のみ、配合目的の記載をチェックする
✅ テキストに「浸透」「注入」などの言葉が実際に含まれている場合のみ、角質層の明記をチェックする
❌ テキストに含まれていない言葉について違反を指摘しない

## 出力形式
以下のJSON形式で厳密に返してください：
{
  "segmentId": "${segment.id}",
  "compliance": true | false,
  "violations": [
    {
      "type": "社内基準違反" | "薬機法違反" | "景表法違反" | "特商法違反" | "その他",
      "severity": "high" | "medium" | "low",
      "description": "具体的な違反内容の詳細説明（どの表現がどの条文・基準に抵触するか）",
      "referenceKnowledge": {
        "file": "参照した知識ファイル名",
        "excerpt": "知識ベースから該当箇所を一字一句そのまま引用"
      },
      "correctionSuggestion": "知識ベースに基づいた具体的な修正案",
      "confidence": 0.0から1.0の数値（この違反判定の確信度）
    }
  ],
  "supportingEvidence": ["適合している理由や根拠（complianceがtrueの場合）"]
}

**重要：typeの優先順位**
- 同じ表現について複数の基準に抵触する場合、最も優先度の高い基準をtypeとして使用してください
- 例：社内基準と薬機法の両方に抵触する場合 → "社内基準違反"を使用

## 【極めて重要】ナレッジ引用の絶対ルール

### 🚨🚨🚨 最優先指示: コピー＆ペーストの徹底 🚨🚨🚨

**referenceKnowledge.excerptは、知識ベースファイルから該当箇所を「コピー」して「ペースト」するだけです。**
**一切の要約、言い換え、解釈、独自表現の追加は絶対禁止です。**

**手順:**
1. 知識ベースファイルから該当箇所を見つける
2. その箇所の見出し（###や####）も含めて、そのままコピー
3. referenceKnowledge.excerptに一切変更せずペースト
4. 終わり

**これは「まとめる」「説明する」作業ではありません。「コピー＆ペースト」するだけです。**

### 【重要】実際に発生している誤りと正しい引用方法

以下の例は、実際に発生した誤りです。**これらと同じミスを絶対に繰り返さないでください。**

#### ❌ 誤りパターン1: AI独自の内容を捏造（クマ表現の例）

**絶対にやってはいけない誤った引用:**
JSON例: { "referenceKnowledge": { "file": "25_クマ表現について.txt", "excerpt": "クマという表現を使う場合、メーキャップ効果によるという注釈が必要です。" } }

**❌ なぜNG:** 「メーキャップ効果による」という注釈は知識ベースに存在しません。これはAIが勝手に作った内容です。**絶対禁止**。

**✅ 正しい引用方法:**
JSON例: { "referenceKnowledge": { "file": "25_クマ表現について.txt", "excerpt": "##### **「クマ」という表現を使いたい時**\\n以下の注記とセットで使用して下さい。\\n※乾燥や古い角質によるくすみ、ハリが不足した暗い目の下" } }

**✅ なぜOK:** 知識ベースファイルの該当箇所（見出し含む）をそのままコピー＆ペーストしています。

#### ❌ 誤りパターン2: キーワードの繰り返し（ギネス世界記録の例）

**絶対にやってはいけない誤った引用:**
JSON例: { "referenceKnowledge": { "file": "44_ギネス世界記録™について.txt", "excerpt": "売上世界一※1 売上世界一※1 売上世界一※1 ギネス世界記録™認定 売上世界一※1" } }

**❌ なぜNG:** これは知識ベース内のOK例のテキストを繰り返しているだけで、違反の説明になっていません。NG例のセクションを引用すべきです。

**✅ 正しい引用方法:**
JSON例: { "referenceKnowledge": { "file": "44_ギネス世界記録™について.txt", "excerpt": "#### ❌ NG例1: 開始年が早すぎる\\n\\n**誤:** 2019年3月～2025年2月\\n**理由:** 開始年が2019年となっており、正しい2020年より1年早い\\n**違反内容:** 実際より長い期間を訴求（優良誤認）" } }

**✅ なぜOK:** 期間違反を説明する際は、NG例のセクションを見出しも含めてコピー＆ペーストしています。違反理由が明確に記載されています。

#### ❌ 誤りパターン3: 要約・解釈（絶対禁止）

**絶対にやってはいけない誤った引用:**
JSON例: { "referenceKnowledge": { "file": "07_浸透の範囲について.txt", "excerpt": "浸透は角質層までと明記する必要があります。" } }

**❌ なぜNG:** これは要約・解釈です。原文をそのまま引用していません。

**✅ 正しい引用方法:**
JSON例: { "referenceKnowledge": { "file": "07_浸透の範囲について.txt", "excerpt": "### 浸透の範囲について\\n\\n浸透は角質層までと明記すること（例：※角質層まで）\\n\\n❌ NG: 「浸透する」「染み込む」\\n✅ OK: 「浸透※1する」「※1：角質層まで」" } }

**✅ なぜOK:** 見出し、本文、NG/OK例を含めて原文をそのままコピー＆ペーストしています。

### ルール1: referenceKnowledge.excerpt の作成方法

**🚨 絶対厳守事項 🚨**

1. **上記の「適用される知識ベース」セクションから該当する規定を正確に探す**
2. **見つけた規定の原文を一字一句変更せずコピーする**
3. **要約・言い換え・解釈・短縮・AI独自の表現追加は絶対禁止**
4. **システムメッセージや警告メッセージを引用してはいけない**
5. **見出し（###、####など）も必ず含める**
6. **最低でも3〜5行程度の文脈を含める**

**❌ 絶対にやってはいけないこと:**
- システムメッセージの引用（例：「ナレッジベースが長すぎるため...」）
- AI自身の解釈や要約の追加
- 知識ベースにない内容の捏造
- キーワードを繰り返すだけで説明がない引用
- 見出しを省略した短すぎる引用

**✅ 良い例:**
"referenceKnowledge": {
  "file": "25_クマ表現について.txt",
  "excerpt": "##### **「クマ」という表現を使いたい時**\n以下の注記とセットで使用して下さい。\n※乾燥や古い角質によるくすみ、ハリが不足した暗い目の下"
}

**❌ 悪い例（絶対禁止）:**
"referenceKnowledge": {
  "file": "参照した知識ファイル名",
  "excerpt": "ナレッジベースが長すぎるため、50000文字に切り詰められました"  // ❌ システムメッセージを引用
}

"referenceKnowledge": {
  "file": "25_クマ表現について.txt",
  "excerpt": "クマは注釈が必要です"  // ❌ 要約している
}

"referenceKnowledge": {
  "file": "25_クマ表現について.txt",
  "excerpt": "メーキャップ効果によるという注釈が必要"  // ❌ 知識ベースにない内容を捏造
}

### ルール2: correctionSuggestion の作成方法

### 🚨🚨🚨 correctionSuggestionも原文引用が絶対原則 🚨🚨🚨

**重要:** correctionSuggestionも referenceKnowledge.excerpt と同じく、知識ベースの原文をそのまま使います。

**絶対厳守:**
1. **知識ベースに注釈内容・修正方法が明記されている場合は、それを一字一句そのまま使う**
2. **「参考にする」のではなく「コピー＆ペーストする」**
3. **独自の解釈・言い換え・要約・捏造は絶対禁止**

#### ❌ 致命的な誤り: クマ表現で捏造（絶対NG）

**絶対にやってはいけない誤ったcorrectionSuggestion:**
JSON例: { "correctionSuggestion": "「クマ※1をスッキリさせたい」とし、注釈に「※1：メーキャップ効果による」と記載" }

**❌ なぜNG:** 「メーキャップ効果による」という注釈は知識ベースに一切存在しません。これは完全な捏造です。**絶対禁止**。

**✅ 正しいcorrectionSuggestion:**
JSON例: { "correctionSuggestion": "「クマ※をスッキリさせたい」とし、注釈に「※乾燥や古い角質によるくすみ、ハリが不足した暗い目の下」と記載" }

**✅ なぜOK:** 知識ベースファイル（25_クマ表現について.txt 10行目）の注釈内容をそのまま使用しています。

#### ✅ 正しい例: ギネス世界記録の修正方法

**知識ベース（44_ギネス世界記録™について.txt 151行目）の原文:**
"修正方法: 注釈の期間を「2020年～2024年」または「2020年～2024年の5年連続」に修正してください。"

**✅ 正しいcorrectionSuggestion（原文をそのまま使用）:**
JSON例: { "correctionSuggestion": "修正方法: 注釈の期間を「2020年～2024年」または「2020年～2024年の5年連続」に修正してください。" }

**注意:** 「修正方法:」というラベルも含めて原文のまま使用してください。

### 最優先手順: 知識ベースに修正案・注釈内容がある場合

1. 知識ベース内で「修正方法:」「OK例」「修正案」「対策」「推奨表現」「※〇〇」「例：」などを探す
2. 見つけた修正案・注釈内容を**一字一句そのまま**correctionSuggestionに使用
3. **注釈内容（※〇〇）は絶対に独自に作らない、知識ベースからそのままコピー＆ペースト**

**重要: 「今なら」「今だけ」の修正例**

❌ 悪い例（知識ベースのOK例をそのまま提示）:
元の文章: 「いまならアンケート回答で半額の1,815円（税込）」
修正案: 「今申込むと55％OFF」  // ❌ 元の文章の内容（アンケート、半額、1,815円）が失われている

✅ 良い例（元の文章の意味を保ちつつOK例の形式に従う）:
元の文章: 「いまならアンケート回答で半額の1,815円（税込）」
修正案: 「このページから申込むとアンケート回答で半額の1,815円（税込）」または「アンケート回答で半額の1,815円（税込）でスタート可能」
// ✅ 「いまなら」を削除または「このページから申込むと」に変更し、元の内容を保持

**修正案作成の原則:**
1. 知識ベースのOK例の**形式・パターン**を理解する
2. そのパターンを元の文章に適用する
3. 元の文章の重要な情報（価格、特典など）は保持する

**良い例（知識ベースに修正案がある場合）:**
【JSON例】
元: 「今なら半額」
NG例の形式: 「今なら」「今だけ」
OK例の形式: 「今申込むと」「今は」「このページから申込むと」
"correctionSuggestion": "「今申込むと半額」または「このページから申込むと半額」に変更"

**代替手順: 知識ベースに明示的な修正案がない場合**
1. 知識ベースの規定内容から、何をすべきかを抽出
2. その内容に厳密に基づいて具体的な修正案を提案
3. 「知識ベースの規定に基づいて修正してください」のような汎用的な表現は**絶対禁止**

**良い例（知識ベースに明示的な修正案がない場合）:**
【JSON例】
"correctionSuggestion": "「ヒアルロン酸※1配合」とし、注釈に「※1：保湿成分」と記載する"  // 規定「配合目的を明記すること」に基づいた具体的提案

**悪い例（絶対禁止）:**
【JSON例】
"correctionSuggestion": "知識ベースの規定に基づいて修正してください"  // ❌ 汎用的すぎて役に立たない
"correctionSuggestion": "今申込むと55％OFF"  // ❌ 元の文章の内容と全く異なる
"correctionSuggestion": ""  // ❌ 空文字列やnullは禁止

### ルール3: 知識ベースから具体例を探す方法

知識ベース内で以下のパターンを探してください:
- 「例：〇〇」「例）〇〇」
- 「修正案：〇〇」「対策：〇〇」
- 「〇〇としてください」「〇〇に変更」
- 「NG表現 → OK表現」のような対比
- 「※〇〇と明記」のような具体的指示

**実例:**
知識ベース: "悩み・症状に対しては「専用」はNG。「用」としてください。"
→ correctionSuggestion: "「目の下悩み用集中ケア」に修正"  // 「用」を使った具体的修正案

知識ベース: "浸透は角質層までと明記すること（例：※角質層まで）"
→ correctionSuggestion: "「浸透※1」とし、注釈に「※1：角質層まで」と記載"  // 例を活用した具体案

### ルール4: 実践的な correctionSuggestion 作成例

**パターンA: 知識ベースに具体的な修正例がある場合**
【例】
セグメント: "ヒアルロン酸直注入で"
知識ベース: "ヒアルロン酸、コラーゲンなど配合目的が誤認されやすい成分については、配合目的を明記すること（例：※保湿成分）"

❌ 悪い correctionSuggestion:
"配合目的を明記してください"  // 汎用的すぎる

✅ 良い correctionSuggestion:
"「ヒアルロン酸※1直注入で」とし、注釈に「※1：保湿成分」と記載する"  // 知識ベースの例を活用した具体案

**パターンB: 知識ベースにNG→OK対比がある場合**
【例】
セグメント: "目の下悩み専用集中ケア"
知識ベース: "悩み・症状に対しては「専用」はNG。「用」としてください。"

❌ 悪い correctionSuggestion:
"知識ベースに従って修正してください"  // 具体性がない

✅ 良い correctionSuggestion:
"「目の下悩み用集中ケア」に修正"  // 知識ベースの指示「用」を適用した具体案

**パターンC: 知識ベースに複数の違反と対策がある場合**
【例】
セグメント: "ヒアルロン酸直注入"
違反1: 特定成分の配合目的未記載
違反2: 浸透範囲の未明記

知識ベース1: "配合目的を明記すること（例：※保湿成分）"
知識ベース2: "浸透は角質層までと明記すること（例：※角質層まで）"

✅ 良い correctionSuggestion:
"「ヒアルロン酸※1直注入※2」とし、注釈に「※1：保湿成分」「※2：角質層まで」と記載する"  // 両方の規定を統合した具体案

**パターンD: 知識ベースに削除指示がある場合**
【例】
セグメント: "医師も推奨"
知識ベース: "医薬関係者等の推せんについての禁止"

❌ 悪い correctionSuggestion:
"規定に基づいて修正してください"

✅ 良い correctionSuggestion:
"「医師も推奨」の表現を削除する"  // 明確な対策指示

**パターンE: 知識ベースに承認範囲の記載がある場合**
【例】
セグメント: "シワを改善"
知識ベース: "シワ改善効果を謳えるのは承認を得た医薬部外品のみ。化粧品は「乾燥による小ジワを目立たなくする」の表現のみ可能"

✅ 良い correctionSuggestion:
"「乾燥による小ジワを目立たなくする」に変更"  // 知識ベースの許可表現をそのまま引用

注意事項：
- 違反がない場合は、violations配列を空にし、complianceをtrueにしてください
- 違反がある場合は、必ず具体的な参照元をreferenceKnowledgeに記載してください
- 複数の違反がある場合は、それぞれ別のオブジェクトとして配列に追加してください
\`;
  */
  // 旧プロンプト終了

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Debug: Log the prompt being sent to Gemini (first attempt only to avoid spam)
      if (attempt === 0) {
        console.log(`\n========== GEMINI PROMPT for ${segment.id} ==========`);
        console.log(prompt);
        console.log(`========== END PROMPT ==========\n`);
      }

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      // Debug: Log the raw response
      console.log(`\n========== GEMINI RESPONSE for ${segment.id} (attempt ${attempt + 1}) ==========`);
      console.log(responseText);
      console.log(`========== END RESPONSE ==========\n`);

      // Parse JSON response
      const evaluation = parseJsonResponse<SegmentEvaluation>(responseText);

      // Normalize violation types to valid enum values and validate required fields
      if (evaluation.violations && Array.isArray(evaluation.violations)) {
        evaluation.violations = evaluation.violations.map((violation, vIndex) => {
          const validTypes = ['社内基準違反', '薬機法違反', '景表法違反', '特商法違反', 'その他'];
          if (!validTypes.includes(violation.type)) {
            console.warn('[Evaluate] Invalid violation type "' + violation.type + '", mapping to other');
            violation.type = 'その他' as const;
          }

          // Validate referenceKnowledge
          if (!violation.referenceKnowledge?.file) {
            console.error('[Evaluate] CRITICAL: Missing referenceKnowledge.file for ' + segment.id + ' violation ' + (vIndex + 1));
            console.error('[Evaluate] Violation description: ' + violation.description);
            violation.referenceKnowledge = {
              ...violation.referenceKnowledge,
              file: '【エラー：参照元が指定されていません】',
              excerpt: violation.referenceKnowledge?.excerpt || '【エラー：知識ベースからの引用が欠落しています】'
            };
          }

          // Validate excerpt
          if (!violation.referenceKnowledge?.excerpt || violation.referenceKnowledge.excerpt.length < 10) {
            console.error('[Evaluate] CRITICAL: Missing or too short referenceKnowledge.excerpt for ' + segment.id + ' violation ' + (vIndex + 1));
            console.error('[Evaluate] File: ' + violation.referenceKnowledge?.file);
            if (!violation.referenceKnowledge.excerpt) {
              violation.referenceKnowledge.excerpt = '【エラー：知識ベースからの引用が欠落しています。評価を再実行してください】';
            }
          }

          // Issue #13: Advanced knowledge excerpt validation
          if (violation.referenceKnowledge?.excerpt && violation.referenceKnowledge.file) {
            const validationResult = validateKnowledgeExcerpt(
              violation.referenceKnowledge.excerpt,
              violation.referenceKnowledge.file
            );

            // Log validation results
            logValidationResult(segment.id, violation.referenceKnowledge.file, validationResult);

            // Check for fabricated content
            if (detectFabricatedContent(violation.referenceKnowledge.excerpt)) {
              console.error('[Evaluate] FABRICATED CONTENT DETECTED in ' + segment.id + '!');
              console.error('[Evaluate] File: ' + violation.referenceKnowledge.file);
              console.error('[Evaluate] Excerpt: ' + violation.referenceKnowledge.excerpt.substring(0, 200));
              console.error('[Evaluate] This excerpt contains known fabricated patterns. AI may be generating content not in knowledge base.');
            }

            // If validation failed with critical errors, log them
            if (!validationResult.isValid) {
              console.error('[Evaluate] Knowledge excerpt validation failed for ' + segment.id);
              console.error('[Evaluate] Errors: ' + validationResult.errors.join(', '));
            }
          }

          // 【重要】根拠がない場合のバリデーション
          // 知識ベースにルール自体が存在しない場合のみフィルタリング
          // 「内容が一致しない」「期間が異なる」等の違反は正当なのでフィルタリングしない
          const excerpt = violation.referenceKnowledge?.excerpt || '';

          // ルール自体が存在しないことを示すパターン（これらはフィルタリング対象）
          const noRulePatterns = [
            '同様の表現に関する記述は見当たらず',
            '該当する規定は見当たらず',
            'このキーワードに関する記述は見当たらず',
            '関連する記載なし',
            '該当する記載なし',
            '知識ベースに記載なし',
            '規定が見つかりません',
            '明確な規定が確認できませんでした'
          ];

          const hasNoRule = noRulePatterns.some(pattern => excerpt.includes(pattern));

          // 内容の不一致を示すパターン（これらはフィルタリングしない - 正当な違反）
          const contentMismatchPatterns = [
            '期間が',
            '内容が',
            '年数が',
            '一致',
            '異なる',
            '矛盾',
            '相違',
            '不整合'
          ];

          const hasContentMismatch = contentMismatchPatterns.some(pattern => excerpt.includes(pattern));

          if (hasNoRule && !hasContentMismatch) {
            console.warn('[Evaluate] INVALID VIOLATION DETECTED: ' + segment.id + ' violation ' + (vIndex + 1));
            console.warn('[Evaluate] Excerpt indicates no rule exists: ' + excerpt.substring(0, 200));
            console.warn('[Evaluate] This violation will be REMOVED as it has no basis in knowledge base.');
            // この違反をnullにマークして後で削除
            return null;
          }

          // Validate correctionSuggestion
          if (!violation.correctionSuggestion || violation.correctionSuggestion.length < 5) {
            console.error('[Evaluate] CRITICAL: Missing or too short correctionSuggestion for ' + segment.id + ' violation ' + (vIndex + 1));
            console.error('[Evaluate] Description: ' + violation.description);
            console.error('[Evaluate] File: ' + violation.referenceKnowledge?.file);
            violation.correctionSuggestion = '【エラー：具体的な修正案が生成されませんでした。知識ベース「' +
              (violation.referenceKnowledge?.file || '不明') +
              '」を参照し、該当する修正案・対策・推奨表現を確認してください】';
          }

          return violation;
        }).filter((v): v is NonNullable<typeof v> => v !== null); // 根拠のない違反を除外
      }

      // 【重要】違反が0件になった場合、complianceをtrueに更新
      if (evaluation.violations.length === 0 && evaluation.compliance === false) {
        console.log('[Evaluate] Correcting compliance: ' + segment.id + ' has no valid violations, setting compliance = true');
        evaluation.compliance = true;
      }

      // Add period and Guinness validation violations (直接追加してGemini AIの重複を防ぐ)
      if (!periodValidation.isValid) {
        console.log('[Evaluate] Adding period validation violations:', periodValidation.violations.length);
        periodValidation.violations.forEach(v => {
          evaluation.violations.push({
            type: '景表法違反',
            severity: v.severity,
            description: v.description,
            referenceKnowledge: v.referenceKnowledge || { file: 'knowledge/common/44_ギネス世界記録™について.txt', excerpt: '' },
            correctionSuggestion: v.correctionSuggestion || '',
            confidence: 1.0,
          });
        });
        evaluation.compliance = false;
      }

      if (!guinnessValidation.isValid) {
        console.log('[Evaluate] Adding Guinness validation violations:', guinnessValidation.violations.length);
        guinnessValidation.violations.forEach(v => {
          evaluation.violations.push({
            type: '景表法違反',
            severity: v.severity,
            description: v.description,
            referenceKnowledge: v.referenceKnowledge || { file: 'knowledge/common/44_ギネス世界記録™について.txt', excerpt: '' },
            correctionSuggestion: v.correctionSuggestion || '',
            confidence: 1.0,
          });
        });
        evaluation.compliance = false;
      }

      // Add NG keyword validation violations (直接追加してGemini AIの重複を防ぐ)
      if (ngValidationResult.hasViolations) {
        console.log('[Evaluate] Adding NG keyword validation violations:', ngValidationResult.matches.length);
        ngValidationResult.matches.forEach(match => {
          const violationType = match.violationType || '社内基準違反';
          const description = `「${match.keyword}」${match.description ? ': ' + match.description : ''}`;

          evaluation.violations.push({
            type: violationType as '社内基準違反' | '薬機法違反' | '景表法違反' | '特商法違反' | 'その他',
            severity: match.severity || 'high',
            description: description,
            referenceKnowledge: match.referenceKnowledge ?
              { file: match.referenceKnowledge, excerpt: '' } :
              { file: 'knowledge/common/ng-keywords.txt', excerpt: '' },
            correctionSuggestion: `「${match.keyword}」は使用できません。表現を修正してください。`,
            confidence: 1.0,
          });
        });
        evaluation.compliance = false;
      }

      // Add metadata
      evaluation.evaluatedAt = new Date().toISOString();
      evaluation.processingTimeMs = Date.now() - startTime;

      // Validate result
      if (!evaluation.segmentId || evaluation.compliance === undefined) {
        throw new Error('Invalid evaluation response format');
      }

      return evaluation;

    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if it's a rate limit error
      const isRateLimitError = errorMessage.includes('429') ||
                               errorMessage.includes('rate limit') ||
                               errorMessage.includes('quota');

      if (isLastAttempt) {
        console.error(`[Evaluate] ❌ Failed segment ${segment.id} after ${maxRetries + 1} attempts`);
        console.error(`[Evaluate] Final error: ${errorMessage}`);
        throw error;
      }

      // Calculate backoff delay
      // For rate limit errors: 10s, 20s, 40s (exponential with base 10)
      // For other errors: 1s, 2s, 3s (linear)
      const baseDelay = isRateLimitError ? 10000 : 1000;
      const backoffMultiplier = isRateLimitError ? Math.pow(2, attempt) : (attempt + 1);
      const backoffDelay = baseDelay * backoffMultiplier;

      console.warn(`[Evaluate] ⚠️ Attempt ${attempt + 1}/${maxRetries + 1} failed for segment ${segment.id}`);
      console.warn(`[Evaluate] Error type: ${isRateLimitError ? 'Rate Limit' : 'Other'}`);
      console.warn(`[Evaluate] Error message: ${errorMessage.substring(0, 200)}...`);
      console.warn(`[Evaluate] Retrying in ${backoffDelay}ms (${Math.round(backoffDelay / 1000)}s)...`);

      await delay(backoffDelay);
    }
  }

  // Should never reach here
  throw new Error(`Failed to evaluate segment ${segment.id} after ${maxRetries + 1} attempts`);
}

/**
 * Parse JSON response from Gemini, handling various formats
 */
function parseJsonResponse<T>(responseText: string): T {
  // Clean up response text
  const cleanText = responseText.trim();

  // Try direct parse first
  try {
    const result = JSON.parse(cleanText);
    console.log('[Parse] Direct parse succeeded');
    return result;
  } catch (directError) {
    console.log('[Parse] Direct parse failed, attempting extraction...');

    // Extract JSON from markdown code blocks
    const jsonMatch = cleanText.match(/```json\s*([\s\S]*?)\s*```/) ||
                      cleanText.match(/```\s*([\s\S]*?)\s*```/) ||
                      cleanText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);

    if (!jsonMatch) {
      console.error('[Parse] No JSON found in response');
      throw new Error('Failed to extract JSON from response');
    }

    const extractedJson = jsonMatch[1].trim();
    console.log('[Parse] Extracted JSON length:', extractedJson.length);
    console.log('[Parse] First 200 chars:', extractedJson.substring(0, 200));

    // Try parsing the extracted JSON
    try {
      const result = JSON.parse(extractedJson);
      console.log('[Parse] Extracted JSON parse succeeded');
      return result;
    } catch (firstError) {
      console.log('[Parse] Extracted JSON parse failed, applying fixControlCharacters...');

      // If parsing fails, fix control characters
      try {
        const fixedJson = fixControlCharacters(extractedJson);
        console.log('[Parse] After fixControlCharacters, first 200 chars:', fixedJson.substring(0, 200));
        const result = JSON.parse(fixedJson);
        console.log('[Parse] Fixed JSON parse succeeded');
        return result;
      } catch (secondError) {
        console.error('[Parse] All parsing attempts failed');
        console.error('[Parse] Original error:', firstError);
        console.error('[Parse] After fix error:', secondError);
        throw new Error(`Failed to parse JSON after all attempts: ${secondError}`);
      }
    }
  }
}

/**
 * Fix unescaped control characters in JSON string
 * This function scans through JSON and properly escapes control characters within string literals
 */
function fixControlCharacters(jsonStr: string): string {
  let result = '';
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    const charCode = char.charCodeAt(0);

    // Handle escape sequences
    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escapeNext = true;
      continue;
    }

    // Toggle string mode
    if (char === '"') {
      result += char;
      inString = !inString;
      continue;
    }

    // If we're inside a string, check for control characters
    if (inString && charCode < 32) {
      // Escape control characters
      switch (char) {
        case '\n':
          result += '\\n';
          break;
        case '\r':
          result += '\\r';
          break;
        case '\t':
          result += '\\t';
          break;
        case '\f':
          result += '\\f';
          break;
        case '\b':
          result += '\\b';
          break;
        default:
          // For other control characters, use unicode escape
          result += '\\u' + ('0000' + charCode.toString(16)).slice(-4);
          break;
      }
    } else {
      result += char;
    }
  }

  return result;
}

/**
 * Delay execution for specified milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate adaptive delay based on segment count and token consumption
 *
 * Gemini API Limits:
 * - Free tier: 15 RPM (Requests Per Minute), 250,000 TPM (Tokens Per Minute)
 * - Token consumption: ~15,000 tokens per request (with knowledge base)
 *
 * @param segmentIndex - Current segment index
 * @param totalSegments - Total number of segments
 * @param estimatedTokensPerRequest - Estimated tokens per request (default: 15000)
 * @returns Delay time in milliseconds
 */
function calculateAdaptiveDelay(
  segmentIndex: number,
  totalSegments: number,
  estimatedTokensPerRequest: number = 15000
): number {
  const TOKEN_LIMIT_PER_MINUTE = 250000;
  const REQUEST_LIMIT_PER_MINUTE = 10; // Conservative estimate (free tier: 15 RPM)

  // Delay based on token limit: (60s * tokens_per_request) / token_limit
  const delayForTokenLimit = (60 * 1000 * estimatedTokensPerRequest) / TOKEN_LIMIT_PER_MINUTE;

  // Delay based on request limit: 60s / request_limit
  const delayForRequestLimit = (60 * 1000) / REQUEST_LIMIT_PER_MINUTE;

  // Use the more conservative (larger) delay
  let baseDelay = Math.max(delayForTokenLimit, delayForRequestLimit);

  // For large batches (15+ segments), add 50% buffer to be extra safe
  if (totalSegments > 15) {
    baseDelay = baseDelay * 1.5;
    console.log(`[Adaptive Delay] Large batch detected (${totalSegments} segments), applying 50% buffer`);
  }

  console.log(`[Adaptive Delay] Segment ${segmentIndex + 1}/${totalSegments}: ${Math.round(baseDelay)}ms`);
  console.log(`  - Token limit delay: ${Math.round(delayForTokenLimit)}ms`);
  console.log(`  - Request limit delay: ${Math.round(delayForRequestLimit)}ms`);
  console.log(`  - Final delay: ${Math.round(baseDelay)}ms`);

  return baseDelay;
}

/**
 * GET /api/v2/evaluate
 * API documentation and health check
 */
export async function GET() {
  return NextResponse.json({
    name: 'RAG-based Legal Compliance Evaluation API',
    version: 'v2',
    description: 'セグメント単位で薬機法・景表法・社内基準に基づいた法令遵守チェックを実行',
    endpoints: {
      POST: {
        path: '/api/v2/evaluate',
        description: 'セグメントの法令遵守評価',
        requestBody: {
          segments: 'Segment[] (required)',
          productId: "'HA' | 'SH' (required)",
          apiKey: 'string (required, Gemini API key)',
          knowledgeContext: 'string (optional, pre-loaded knowledge)',
        },
        response: {
          success: 'boolean',
          data: {
            evaluations: 'SegmentEvaluation[]',
            summary: {
              totalSegments: 'number',
              evaluatedSegments: 'number',
              compliantSegments: 'number',
              violationCount: 'number',
            },
            productId: 'string',
            processingTimeMs: 'number',
          },
        },
      },
    },
    features: [
      'RAG-based evaluation using knowledge base',
      'Parallel processing with max 3 concurrent requests',
      'Automatic retry on failure',
      'Detailed violation identification with knowledge citation',
      'Correction suggestions based on regulations',
    ],
    evaluationCriteria: [
      '薬機法違反 (Pharmaceutical Affairs Law violations)',
      '景表法違反 (Misleading Representations violations)',
      '社内基準違反 (Internal standards violations)',
    ],
    example: {
      request: {
        segments: [
          {
            id: 'seg_001',
            text: 'シワを改善する美容液',
            type: 'claim',
            position: { start: 0, end: 12 },
            importance: 0.9,
          },
        ],
        productId: 'HA',
        apiKey: 'your-gemini-api-key',
      },
      response: {
        success: true,
        data: {
          evaluations: [
            {
              segmentId: 'seg_001',
              compliance: false,
              violations: [
                {
                  type: '薬機法違反',
                  severity: 'high',
                  description: '「シワを改善」は医薬部外品の承認効能を超える表現です',
                  referenceKnowledge: {
                    file: '22_シワ表現についての規定と社内規定.txt',
                    excerpt: 'シワ改善効果を謳えるのは承認を得た医薬部外品のみ',
                  },
                  correctionSuggestion: '「乾燥による小ジワを目立たなくする」等の表現に変更',
                  confidence: 0.95,
                },
              ],
              evaluatedAt: '2025-10-15T10:00:00.000Z',
              processingTimeMs: 1500,
            },
          ],
          summary: {
            totalSegments: 1,
            evaluatedSegments: 1,
            compliantSegments: 0,
            violationCount: 1,
          },
          productId: 'HA',
          processingTimeMs: 2000,
        },
      },
    },
  });
}
