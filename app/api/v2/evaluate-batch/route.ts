import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SegmentEvaluation } from '@/lib/types-v2';
import { ProductId } from '@/lib/types';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createEmbeddingService } from '@/lib/embedding-service';
import { createChromaVectorDB, ChromaVectorDB } from '@/lib/vector-db/chroma-db';
import { createRAGSearchService } from '@/lib/rag-search';
import { createNGKeywordValidator } from '@/lib/ng-keyword-validator';
import { validateGuinnessRecord } from '@/lib/guinness-record-validator';
import { analyzeAnnotations, formatAnnotationAnalysis } from '@/lib/annotation-analyzer';

// タイムアウト延長: 長文処理対応（Issue #17）
export const maxDuration = 60;

/**
 * グローバルVectorDB: 全ユーザー共通で既存embeddings使用
 *
 * 重要な設計思想:
 * - サーバー側APIキーは一切使用しない（サーバー管理者のクォータに依存させない）
 * - ナレッジベースembeddingsは事前生成してChromaDBに永続化（setup-vector-db.tsで）
 * - ランタイムでは既存embeddingsのみ使用（autoLoad: false）
 * - ユーザーAPIキーはクエリembedding生成のみ（1回/リクエスト）
 */
let globalVectorDB: ChromaVectorDB | null = null;
let isInitializing = false;

/**
 * グローバルVectorDBインスタンスを取得（事前生成済みembeddingsを使用）
 *
 * 注意: ChromaDBには事前にembeddingsが格納されている前提
 *       (scripts/setup-vector-db.tsを実行済み)
 *
 * @returns VectorDB instance
 */
async function getGlobalVectorDB(): Promise<ChromaVectorDB> {
  // 既に接続済みの場合はそのまま返す
  if (globalVectorDB && globalVectorDB.isConnected()) {
    console.log('[VectorDB] ✅ Using shared VectorDB (pre-loaded embeddings)');
    return globalVectorDB;
  }

  // 初期化中の場合は待機
  while (isInitializing) {
    console.log('[VectorDB] ⏳ Waiting for initialization to complete...');
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // 再度チェック
  if (globalVectorDB && globalVectorDB.isConnected()) {
    return globalVectorDB;
  }

  // 初期化開始
  isInitializing = true;
  console.log('[VectorDB] 🔄 Connecting to ChromaDB (using pre-generated embeddings)...');

  try {
    // ChromaDBに接続（autoLoad: false = embeddingsは既に存在する前提）
    // ランタイムでembedding生成は一切行わない！
    const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';
    console.log(`[VectorDB] Environment CHROMA_URL: ${process.env.CHROMA_URL || 'NOT SET'}`);
    console.log(`[VectorDB] Using ChromaDB URL: ${chromaUrl}`);

    globalVectorDB = createChromaVectorDB({
      url: chromaUrl,
      autoLoad: false, // ❌ 自動ロード無効（事前生成済みembeddings使用）
    });

    await globalVectorDB.connect();

    const docCount = await globalVectorDB.count();
    console.log(`[VectorDB] ✅ Connected to ChromaDB (${docCount} pre-loaded documents)`);

    if (docCount === 0) {
      console.warn('[VectorDB] ⚠️  WARNING: ChromaDB has 0 documents!');
      console.warn('[VectorDB] Please run: npm run setup:vector-db');
      console.warn('[VectorDB] Or manually run: npx tsx scripts/setup-vector-db.ts');
    }

    return globalVectorDB;
  } finally {
    isInitializing = false;
  }
}

/**
 * Check if a segment is an annotation explanation (reference material, not advertising text)
 *
 * Annotation explanation patterns:
 * - "※1背爪表面に" - Starts with ※\d
 * - "殺菌は消毒の作用機序として  ※2" - Ends with ※\d but no advertising keywords
 * - "する薬用ジェル    ※1" - Short connector phrase ending with ※\d
 *
 * NOT annotation explanations (advertising text):
 * - "爪の中まで浸透※1・殺菌※2する薬用ジェル" - Contains advertising claims
 *
 * Strategy: Only skip if segment starts with ※\d (clear annotation explanation)
 */
function isAnnotationExplanationSegment(segment: { text: string }): boolean {
  const trimmedText = segment.text.trim();

  // Only skip segments that START with annotation markers (※1, ※2, etc.)
  // These are clearly annotation explanation text, not advertising claims
  const startsWithAnnotation = /^※\d/.test(trimmedText);

  return startsWithAnnotation;
}

/**
 * Request schema for batch evaluation API
 * Issue #15: バッチ評価で300セグメントまで対応
 */
const evaluateBatchRequestSchema = z.object({
  segments: z.array(z.object({
    id: z.string(),
    text: z.string(),
    type: z.enum(['claim', 'explanation', 'evidence', 'cta', 'disclaimer']).optional(),
    position: z.object({
      start: z.number(),
      end: z.number(),
      line: z.number().optional(),
    }).optional(),
  })).min(1).max(20), // 最大20セグメント/バッチ
  productId: z.enum(['HA', 'SH']),
  fullText: z.string().optional(),
  skipKeywordValidation: z.boolean().optional(), // テスト用: TypeScript検証をスキップ
});

type EvaluateBatchRequest = z.infer<typeof evaluateBatchRequestSchema>;

/**
 * POST /api/v2/evaluate-batch
 * バッチ評価API - 複数セグメントを1回のGemini APIリクエストで評価
 *
 * Issue #15: 300セグメントまで処理可能にするため、20セグメントずつバッチ評価
 *
 * @param segments - 評価対象セグメント配列（最大20セグメント）
 * @param productId - 商品ID (HA | SH)
 * @param apiKey - Gemini APIキー
 * @param fullText - 広告文全体（注釈参照用）
 *
 * @returns 各セグメントの評価結果配列
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse and validate request body
    const body = await request.json();
    console.log('[Evaluate Batch API] Received request with', body.segments?.length || 0, 'segments');

    const validatedInput: EvaluateBatchRequest = evaluateBatchRequestSchema.parse(body);

    // Get API key from environment variable
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[Evaluate Batch API] GEMINI_API_KEY environment variable is not set');
      return NextResponse.json({
        success: false,
        error: 'サーバー設定エラー: APIキーが設定されていません。管理者にお問い合わせください。',
      }, { status: 500 });
    }

    console.log('[Evaluate Batch API] Using server-side API key from environment variable');

    // RAG Search: セマンティック検索で関連ナレッジを取得
    console.log('[Evaluate Batch API] RAG Search: Initializing services...');

    // グローバルVectorDBを取得（サーバー側APIキーで初回のみロード）
    const vectorDB = await getGlobalVectorDB();

    // サーバー側APIキーでEmbedding Serviceを作成
    // 注: クエリembedding生成のみに使用（1回のみ）
    console.log('[Evaluate Batch API] Creating embedding service with server API key...');
    const embeddingService = createEmbeddingService(apiKey);

    // RAG Search Serviceを作成
    const ragSearchService = createRAGSearchService(embeddingService, vectorDB);

    // セマンティック検索で関連ナレッジを取得
    console.log('[Evaluate Batch API] RAG Search: Searching for', validatedInput.segments.length, 'segments...');

    const ragResult = await ragSearchService.searchBatch(
      validatedInput.segments.map(s => s.text),
      {
        topK: 20,
        minSimilarity: 0.3, // Lowered from 0.5 to 0.3 for better recall with cosine distance
        productId: validatedInput.productId,
        debug: true,
      }
    );

    const knowledgeContext = ragResult.relevantKnowledge;

    console.log('[Evaluate Batch API] RAG Search: Found', ragResult.searchResults.length, 'relevant chunks');
    console.log('[Evaluate Batch API] RAG Search: Knowledge context size:', knowledgeContext.length, 'chars');

    // 注: VectorDBは全ユーザー共通なのでclose()しない

    // NG Keyword Validation for each segment
    // skipKeywordValidationフラグがtrueの場合、検証をスキップ（テスト用）
    const ngKeywordValidator = createNGKeywordValidator();
    const ngValidationResults = validatedInput.skipKeywordValidation
      ? undefined
      : validatedInput.segments.map((segment, index) => {
          // Skip annotation explanation segments (e.g., "殺菌は消毒の作用機序として  ※2")
          // These are reference materials, not advertising text to be checked
          if (isAnnotationExplanationSegment(segment)) {
            console.log(`[Evaluate Batch API] ⏭️  Skipping NG Keyword validation for segment ${index + 1} (annotation explanation): "${segment.text.trim().substring(0, 50)}..."`);
            return {
              hasViolations: false,
              explicitNGKeywordsList: [],
              summary: { absolute: 0, conditional: 0, contextDependent: 0, total: 0, critical: 0, high: 0, medium: 0 },
              matches: [],
              instructionsForGemini: ''
            };
          }

          const ngValidationResult = ngKeywordValidator.validate(
            segment.text,
            validatedInput.fullText,
            validatedInput.productId  // 商品固有のannotationRulesを適用
          );

          console.log(`[Evaluate Batch API] NG Keyword validation for segment ${index + 1} (${segment.id}):`);
          console.log(`  Has violations: ${ngValidationResult.hasViolations}`);
          console.log(`  Summary:`, ngValidationResult.summary);
          if (ngValidationResult.hasViolations) {
            console.log(`  Detected NG keywords:`, ngValidationResult.explicitNGKeywordsList);
            console.log(`  Details:`, ngKeywordValidator.getDetailedList(ngValidationResult));
          }

          return ngValidationResult;
        });

    if (validatedInput.skipKeywordValidation) {
      console.log('[Evaluate Batch API] ⚠️  NG Keyword validation SKIPPED (skipKeywordValidation=true)');
    }

    // Guinness Record Validation for each segment
    const guinnessValidationResults = validatedInput.segments.map((segment, index) => {
      // Skip annotation explanation segments (same logic as NG Keyword validation)
      if (isAnnotationExplanationSegment(segment)) {
        console.log(`[Evaluate Batch API] ⏭️  Skipping Guinness Record validation for segment ${index + 1} (annotation explanation)`);
        return {
          hasGuinnessReference: false,
          isValid: true,
          violations: []
        };
      }

      const guinnessValidationResult = validateGuinnessRecord(segment.text, validatedInput.fullText);

      console.log(`[Evaluate Batch API] Guinness Record validation for segment ${index + 1} (${segment.id}):`);
      console.log(`  Has Guinness reference: ${guinnessValidationResult.hasGuinnessReference}`);
      console.log(`  Is valid: ${guinnessValidationResult.isValid}`);
      console.log(`  Violations: ${guinnessValidationResult.violations.length}`);
      if (guinnessValidationResult.violations.length > 0) {
        console.log(`  Violation details:`, guinnessValidationResult.violations.map(v => ({
          type: v.type,
          severity: v.severity,
          description: v.description
        })));
      }

      return guinnessValidationResult;
    });

    // Initialize Gemini client with JSON mode
    // Changed to gemini-2.5-flash-lite (正式版、テキスト生成用)
    // Note: gemini-2.0-flash-exp は画像生成用のため絶対に使用禁止
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.0,
        maxOutputTokens: 16384, // Issue #15: 大きなバッチ評価結果を受け取るため
      },
    });

    // Filter out annotation explanation segments before sending to Gemini
    // These segments should not be evaluated as advertising text
    const segmentsForGemini = validatedInput.segments.filter((segment, index) => {
      const shouldSkip = isAnnotationExplanationSegment(segment);
      if (shouldSkip) {
        console.log(`[Evaluate Batch API] ⏭️  Excluding segment ${index + 1} from Gemini evaluation (annotation explanation): "${segment.text.trim().substring(0, 50)}..."`);
      }
      return !shouldSkip;
    });

    // Corresponding validation results for filtered segments
    const ngValidationResultsForGemini = ngValidationResults?.filter((_, index) =>
      !isAnnotationExplanationSegment(validatedInput.segments[index])
    );
    const guinnessValidationResultsForGemini = guinnessValidationResults.filter((_, index) =>
      !isAnnotationExplanationSegment(validatedInput.segments[index])
    );

    console.log(`[Evaluate Batch API] Filtered ${validatedInput.segments.length} segments -> ${segmentsForGemini.length} segments for Gemini evaluation`);

    // Create batch evaluation prompt
    const prompt = createBatchEvaluationPrompt(
      segmentsForGemini,
      validatedInput.productId,
      knowledgeContext,  // RAG検索で取得した関連ナレッジを使用
      validatedInput.fullText,
      ngValidationResultsForGemini,  // NG Keyword Validator の結果を渡す（フィルタリング済み）
      guinnessValidationResultsForGemini  // Guinness Record Validator の結果を渡す（フィルタリング済み）
    );

    console.log('[Evaluate Batch API] Sending batch evaluation request to Gemini...');
    console.log('[Evaluate Batch API] Prompt length:', prompt.length, 'chars');

    // Evaluate filtered segments in one Gemini API call with retry
    const geminiEvaluations = await evaluateBatchWithRetry(
      model,
      prompt,
      segmentsForGemini,  // Use filtered segments (annotation explanations excluded)
      3 // max retries
    );

    // Create a map from segment ID to Gemini evaluation for efficient lookup
    const geminiEvaluationMap = new Map<string, SegmentEvaluation>();
    segmentsForGemini.forEach((segment, index) => {
      geminiEvaluationMap.set(segment.id, geminiEvaluations[index]);
    });

    // Merge NG Keyword and Guinness Record validation results with Gemini evaluations
    // Priority: NG Keywords (HIGHEST) > Guinness > Gemini
    const evaluations = validatedInput.segments.map((segment, index) => {
      const ngResult = ngValidationResults ? ngValidationResults[index] : undefined;
      const guinnessResult = guinnessValidationResults[index];

      // Get Gemini evaluation for this segment (if it was evaluated)
      const geminiEvaluation = geminiEvaluationMap.get(segment.id);

      // If segment was skipped (annotation explanation), return a clean result
      if (!geminiEvaluation) {
        console.log(`[Evaluate Batch API] Segment ${index + 1} was skipped (annotation explanation)`);
        return {
          segmentId: segment.id,
          compliance: true,
          violations: [],
          reasoning: '注釈説明文のため評価対象外',
          rawViolations: [],
          improvements: [],
          evaluatedAt: new Date().toISOString()
        };
      }

      let mergedViolations = [...geminiEvaluation.violations];
      let hasViolations = !geminiEvaluation.compliance;

      // 0. Filter out Gemini violations that are duplicates of NG keyword validator detections
      if (ngResult && ngResult.hasViolations && ngResult.matches.length > 0) {
        const detectedKeywords = ngResult.matches.map(m => m.keyword);
        const beforeFilterCount = mergedViolations.length;

        mergedViolations = mergedViolations.filter(violation => {
          const isDuplicate = detectedKeywords.some(keyword => {
            const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const quotedExpressionPattern = new RegExp(`^[「『].*${escapedKeyword}.*[」』]という表現`);
            const explicitExpressionPattern = new RegExp(`^「.*${escapedKeyword}.*」`);

            const matches = quotedExpressionPattern.test(violation.description) ||
                           explicitExpressionPattern.test(violation.description);

            if (matches) {
              console.log(`[Duplicate Filter] 🎯 Matched keyword "${keyword}" in description: "${violation.description.substring(0, 60)}..."`);
            }

            return matches;
          });

          if (isDuplicate) {
            console.log(`[Duplicate Filter] 🗑️  Removed duplicate violation about NG keyword expression: "${violation.description.substring(0, 80)}..."`);
            return false;
          }

          return true;
        });

        const filteredCount = beforeFilterCount - mergedViolations.length;
        if (filteredCount > 0) {
          console.log(`[Duplicate Filter] ✅ Filtered out ${filteredCount} duplicate violations for segment ${index + 1}`);
        }
      }

      // 1. Merge NG Keyword violations (HIGHEST PRIORITY - cannot be overridden)
      // Issue #30: NG Keyword Validatorで既に注釈チェック済み
      if (ngResult && ngResult.hasViolations && ngResult.matches.length > 0) {
        console.log(`[Evaluate Batch API] Merging NG keyword violations for segment ${index + 1}`);

        const ngViolations = ngResult.matches.map(match => {
          // Determine violation type based on category
          let violationType: '薬機法違反' | '景表法違反' = '薬機法違反';
          if (match.category === 'limited-time' || match.violationType === '景表法違反') {
            violationType = '景表法違反';
          }

          // Normalize severity (map 'critical' to 'high' for backward compatibility)
          const normalizedSeverity = (match.severity === 'critical' ? 'high' : (match.severity || 'high')) as 'high' | 'medium' | 'low';

          // Generate correctionSuggestion from okExamples or provide a default
          let correctionSuggestion = '適切な注釈を追加してください';
          if (match.okExamples && match.okExamples.length > 0) {
            correctionSuggestion = match.okExamples[0];
          } else if (match.requiredAnnotation) {
            correctionSuggestion = `${match.keyword}※${match.requiredAnnotation}`;
          }

          // キーワードをdescriptionに含める（重複検知用）
          const description = match.description || match.reason;
          const descriptionWithKeyword = description.includes(match.keyword) ? description : `「${match.keyword}」${description}`;

          return {
            type: violationType,
            severity: normalizedSeverity,
            description: descriptionWithKeyword,
            referenceKnowledge: match.referenceKnowledge ? {
              file: match.referenceKnowledge,
              excerpt: match.description || ''
            } : {
              file: '',
              excerpt: ''
            },
            correctionSuggestion,
          };
        });

        mergedViolations = [...ngViolations, ...mergedViolations];
        hasViolations = ngViolations.length > 0 ? true : hasViolations;
        console.log(`[Evaluate Batch API] Added ${ngViolations.length} NG keyword violations`);
      }

      // 2. Merge Guinness Record violations
      if (guinnessResult && guinnessResult.hasGuinnessReference && !guinnessResult.isValid) {
        console.log(`[Evaluate Batch API] Merging Guinness violations for segment ${index + 1}`);

        const guinnessViolations = guinnessResult.violations.map(v => ({
          type: '景表法違反' as const,
          severity: v.severity as 'high' | 'medium',
          description: v.description,
          referenceKnowledge: v.referenceKnowledge || {
            file: 'knowledge/common/44_ギネス世界記録™について.txt',
            excerpt: 'ギネス世界記録™の期間検証ルール（プログラムによる自動検証）'
          },
          correctionSuggestion: v.correctionSuggestion
        }));

        mergedViolations = [...mergedViolations, ...guinnessViolations];
        hasViolations = true;
        console.log(`[Evaluate Batch API] Added ${guinnessViolations.length} Guinness violations`);
      }

      // Remove duplicates based on description similarity (Issue #30対応 - 強化版v2)
      // 同じキーワードに関する違反は、最も詳細な説明を持つものだけを残す
      const extractKeywords = (desc: string): string[] => {
        const keywords: string[] = [];

        // よく検出されるコアキーワードのリスト（NGキーワード由来）
        const coreKeywords = [
          '浸透', '殺菌', 'クマ', '若々しい', '若見え', 'シワ', 'たるみ',
          '美白', 'ホワイトニング', 'ニキビ', 'アトピー', 'しみ', 'そばかす',
          '医師', '専門機関', 'クリニック', '返金保証', '返品保証', '全額返金',
          '注射', '注入', 'ヒアルロン酸注射', 'マイクロニードル', '針',
          'たった', 'だけで', '今なら', '今だけ', '限定', 'キャンペーン',
          '最安値', '最高', '第一位', 'No.1', 'ナンバーワン',
          '効く', '効果', '改善', '治す', '治る', '解消', '消える'
        ];

        // コアキーワードが含まれているかチェック
        for (const coreKeyword of coreKeywords) {
          if (desc.includes(coreKeyword)) {
            keywords.push(coreKeyword);
          }
        }

        // カギカッコ内のキーワードも抽出（具体的な表現）
        const match1 = desc.match(/「([^」]+)」/g);
        if (match1) {
          keywords.push(...match1.map(m => m.replace(/[「」]/g, '')));
        }

        // 重複を除去（同じキーワードがコアキーワードとカギカッコ内の両方に含まれる場合）
        return Array.from(new Set(keywords));
      };

      // キーワードごとにグループ化（コアキーワード優先）
      const violationsByKeyword = new Map<string, Array<typeof mergedViolations[0]>>();

      for (const violation of mergedViolations) {
        const keywords = extractKeywords(violation.description);

        if (keywords.length === 0) {
          // キーワードが抽出できない場合は、そのまま保持
          const key = `_no_keyword_${violation.description}`;
          violationsByKeyword.set(key, [violation]);
        } else {
          // 複数キーワードがある場合、全てをソートして連結（重複を防ぐ）
          // 例: ['浸透', '殺菌'] → '薬機法違反_殺菌_浸透'
          const sortedKeywords = keywords.sort().join('_');
          const key = `${violation.type}_${sortedKeywords}`;
          if (!violationsByKeyword.has(key)) {
            violationsByKeyword.set(key, []);
          }
          violationsByKeyword.get(key)!.push(violation);
        }
      }

      // 各グループから違反を統合（NG Keyword validator + Gemini の良い部分を結合）
      const uniqueViolations: typeof mergedViolations = [];

      for (const [key, violations] of violationsByKeyword.entries()) {
        if (violations.length === 1) {
          // 重複なしの場合はそのまま追加
          uniqueViolations.push(violations[0]);
        } else {
          // 重複がある場合は、インテリジェントマージを実行
          // ソート: description が短い順（NG keyword validator が先に来る）
          const sorted = violations.sort((a, b) => a.description.length - b.description.length);

          const shorter = sorted[0]; // NG keyword validator（簡潔な指摘・修正案）
          const longer = sorted[sorted.length - 1]; // Gemini（詳細な根拠引用）

          // マージ判定: 両方が同じ type で、longer に詳細な referenceKnowledge.excerpt がある場合のみマージ
          const shouldMerge =
            shorter.type === longer.type &&
            longer.referenceKnowledge &&
            longer.referenceKnowledge.excerpt &&
            longer.referenceKnowledge.excerpt.length > 50 && // 十分に詳細な excerpt
            (
              !shorter.referenceKnowledge ||
              !shorter.referenceKnowledge.excerpt ||
              shorter.referenceKnowledge.excerpt.length < longer.referenceKnowledge.excerpt.length
            );

          if (shouldMerge) {
            // インテリジェントマージ: shorter の指摘・修正案 + longer の根拠引用
            const merged = {
              ...shorter, // ベースは shorter（簡潔な description と correctionSuggestion）
              referenceKnowledge: longer.referenceKnowledge // Gemini の詳細な根拠引用
            };

            uniqueViolations.push(merged);
            console.log(`[Duplicate Detection] 🔀 Merged ${violations.length} duplicates for keyword: ${key}`);
            console.log(`[Duplicate Detection]   ✅ Used concise description from shorter violation`);
            console.log(`[Duplicate Detection]   ✅ Used detailed reference from longer violation`);
          } else {
            // マージ不可の場合は shorter だけを保持（従来の動作）
            uniqueViolations.push(shorter);
            console.log(`[Duplicate Detection] Removed ${violations.length - 1} duplicates for keyword: ${key}`);
            console.log(`[Duplicate Detection] Kept: "${shorter.description.substring(0, 80)}..."`);
          }
        }
      }

      return {
        ...geminiEvaluation,
        compliance: !hasViolations,
        violations: uniqueViolations
      };
    });

    const processingTime = Date.now() - startTime;
    console.log(`[Evaluate Batch API] Completed ${evaluations.length} evaluations in ${processingTime}ms`);

    // Issue #32: Include RAG search metadata for frontend display
    const ragMetadata = {
      totalResults: ragResult.searchResults.length,
      priorityBreakdown: {
        p1: ragResult.searchResults.filter(r => r.metadata.priority === 1).length,
        p2: ragResult.searchResults.filter(r => r.metadata.priority === 2).length,
        p3: ragResult.searchResults.filter(r => r.metadata.priority === 3).length,
      },
      legalDomains: Array.from(new Set(ragResult.searchResults.map(r => r.metadata.legalDomain).filter(Boolean))),
      knowledgeTypes: Array.from(new Set(ragResult.searchResults.map(r => r.metadata.knowledgeType).filter(Boolean))),
    };

    return NextResponse.json({
      success: true,
      data: {
        evaluations,
        totalSegments: evaluations.length,
        processingTimeMs: processingTime,
        ragMetadata, // Issue #32: RAG search metadata
      },
    }, { status: 200 });

  } catch (error: unknown) {
    console.error('[Evaluate Batch API] Error:', error);

    if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
      const zodError = error as { errors?: Array<{ message: string; path: (string | number)[] }> };
      return NextResponse.json({
        success: false,
        error: 'バリデーションエラー',
        details: zodError.errors,
      }, { status: 400 });
    }

    if (error instanceof Error) {
      return NextResponse.json({
        success: false,
        error: 'バッチ評価中にエラーが発生しました',
        message: error.message,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: false,
      error: '予期しないエラーが発生しました',
    }, { status: 500 });
  }
}

/**
 * バッチ評価プロンプトを生成
 * 既存の評価ロジックを100%維持しながら、複数セグメントをまとめて評価
 */
function createBatchEvaluationPrompt(
  segments: Array<{ id: string; text: string }>,
  productId: ProductId,
  knowledgeContext: string,
  fullText?: string,
  ngValidationResults?: Array<{ instructionsForGemini: string; hasViolations: boolean }>,
  guinnessValidationResults?: Array<{ hasGuinnessReference: boolean; isValid: boolean; violations: Array<{ type: string; severity: string; description: string; expected: string; actual: string; correctionSuggestion: string }> }>
): string {
  // セグメント一覧を生成（注釈分析の結果のみ含む）
  // Issue #30修正: NGキーワード検証結果はGeminiに渡さず、後で構造的にマージ
  const segmentsList = segments.map((seg, index) => {
    // NGキーワード検証で既に検出されたキーワードをGeminiに通知（重複検出を防ぐ）
    let ngKeywordInstructions = '';
    if (ngValidationResults && ngValidationResults[index] && ngValidationResults[index].hasViolations) {
      const detectedKeywords = seg.text.match(/浸透|殺菌|クマ|ヒアルロン酸|コラーゲン/g) || [];
      if (detectedKeywords.length > 0) {
        const uniqueKeywords = Array.from(new Set(detectedKeywords));
        ngKeywordInstructions = `\n#### ✅ NG Keyword Validator検証済み（セグメント${index + 1}）\n\n`;
        ngKeywordInstructions += `**以下のキーワードは既にNGキーワードvalidatorで検証済みです：** ${uniqueKeywords.join(', ')}\n\n`;
        ngKeywordInstructions += `**【絶対厳守】** これらのキーワード、または、**これらのキーワードを含む任意の表現**については、NGキーワードvalidatorが既に注釈の有無を完全にチェック済みです。\n`;
        ngKeywordInstructions += `**あなたはこれらのキーワードを含む表現について、一切違反を生成しないでください。**\n\n`;
        ngKeywordInstructions += `**具体例（${uniqueKeywords[0] || '浸透'}の場合）:**\n`;
        ngKeywordInstructions += `- ❌ 「${uniqueKeywords[0] || '浸透'}」→ 違反を生成しないでください（既に検証済み）\n`;
        ngKeywordInstructions += `- ❌ 「${uniqueKeywords[0] || '浸透'}する」→ 違反を生成しないでください（既に検証済み）\n`;
        ngKeywordInstructions += `- ❌ 「爪に${uniqueKeywords[0] || '浸透'}」→ 違反を生成しないでください（既に検証済み）\n`;
        ngKeywordInstructions += `- ❌ 「${uniqueKeywords.join('・')}」→ 違反を生成しないでください（既に検証済み）\n`;
        ngKeywordInstructions += `- ✅ これらのキーワードを含まない表現のみ評価してください\n\n`;
        ngKeywordInstructions += `**理由:** 既に検出された違反は後で構造的にマージされます。重複報告は不要です。\n\n`;
      }
    }

    // Guinness検証結果の通知（期間以外の問題がある場合のみ）
    let guinnessInstructions = '';
    if (guinnessValidationResults && guinnessValidationResults[index]) {
      const guinnessResult = guinnessValidationResults[index];
      if (guinnessResult.hasGuinnessReference) {
        if (!guinnessResult.isValid && guinnessResult.violations.length > 0) {
          guinnessInstructions = `\n#### ℹ️ ギネス記録検証（セグメント${index + 1}）\n\n`;
          guinnessInstructions += `**注:** ギネス記録の期間検証は別ロジックで実施済みです。期間違反は自動検出されるため、このセグメントの期間に関する違反は報告不要です。\n`;
        }
      }
    }

    // 注釈分析を実行してGeminiに明示的に伝える（注釈が正しい場合、違反報告しない）
    const annotationAnalysis = analyzeAnnotations(seg.text, fullText);
    const annotationInstructions = annotationAnalysis.hasAnnotatedKeywords
      ? `\n#### ✅ 注釈分析結果（セグメント${index + 1}）\n\n${formatAnnotationAnalysis(annotationAnalysis)}\n\n**【絶対厳守】** このセグメントには上記の注釈マーカー付きキーワードがあり、対応する注釈テキストが確認されています。\n\n**評価ルール:**\n- 注釈テキストが正しく存在する場合、そのキーワードに関する違反は **violations 配列に含めないでください**\n- 「注釈が正しいので問題ありません」という判断の場合、違反として報告してはいけません\n- compliance は true と判定してください\n\n`
      : '';

    return `
### セグメント${index + 1} (ID: ${seg.id})
\`\`\`
${seg.text}
\`\`\`
${ngKeywordInstructions}${annotationInstructions}${guinnessInstructions}`;
  }).join('\n');

  const fullTextSection = fullText ? `
## 広告文全体（注釈や他のセグメントを含む）
----
${fullText}
----

**重要:** 各セグメントを評価する際、広告文全体に含まれる注釈（※1、※2など）も考慮してください。
注釈が存在する場合、その注釈を確認してから違反判定を行ってください。
` : '';

  // 商品カテゴリーに応じた評価基準を設定
  const productCategory = productId === 'SH' ? '医薬部外品（新指定医薬部外品）' : '化粧品';
  const applicableGuideline = productId === 'SH'
    ? 'OTC医薬品等の適正広告ガイドライン（医薬部外品用）'
    : '化粧品の適正広告ガイドライン';

  const productCategorySection = `
## 🔍 商品カテゴリーと適用基準

**商品ID**: ${productId}
**商品カテゴリー**: ${productCategory}
**適用ガイドライン**: ${applicableGuideline}

${productId === 'SH' ? `
### ⚠️ 医薬部外品特有の注意事項

**重要:** SH商品は「新指定医薬部外品（外皮消毒剤）」であり、化粧品ではありません。

**承認された効能効果:** 「手指・皮膚の洗浄・消毒」

**評価時の注意:**
1. **化粧品のガイドラインは適用しないでください**
2. **医薬部外品のガイドラインを優先してください**
3. 知識ベースから修正案を引用する際、必ず医薬部外品向けの修正案を使用してください

**具体例:**
- ❌ 誤り: 化粧品の適正広告ガイドラインを根拠に「爪への浸透は不可」と判定
- ✅ 正しい: OTC医薬品等の適正広告ガイドラインを根拠に評価

**修正案の例（知識ベースから引用）:**
- 「爪の中まで浸透」→「浸透※ ※背爪表面に」（エビデンスがないため）
- 「殺菌」→「殺菌※ ※消毒の作用機序」（作用機序であることを明示）
` : ''}
`;

  // Note: ngKeywordGlobalWarning removed to reduce prompt length and avoid JSON parse errors
  // Duplicate filtering is handled in post-processing (lines 267-310) which is more reliable

  return `
あなたは広告表現の法務チェックの専門家です。以下の${segments.length}個のセグメントを厳密に評価してください。

${productCategorySection}

${fullTextSection}

## 評価対象セグメント（${segments.length}個）

${segmentsList}

## 🚨【最優先・絶対厳守】爪水虫を想起させる表現の検出 🚨

**以下の表現は、爪水虫（白癬菌感染症）の治療を想起させ、医薬品的効能を暗示するため、薬機法違反です：**

**【絶対検出すべきNG表現】**
- **「ぶ厚い爪」「厚い爪」** - 爪水虫の典型的症状を暗示
- **「硬い爪」** - 爪水虫の典型的症状を暗示
- **「汚い爪」** - 爪水虫の典型的症状を暗示
- **「変形した爪」** - 爪水虫の典型的症状を暗示
- **「ボロボロの爪」「ボロボロ爪」** - 爪水虫の典型的症状を暗示
- **「変色した爪」「変色爪」** - 爪水虫の典型的症状を暗示

**【重要】検出条件:**
- 上記の**具体的な症状表現**が含まれている場合のみ違反として検出してください
- 一般的なマーケティング表現（「諦めている方」「放置している方」「悩んでいる方」など）は、上記の具体的症状表現を伴わない限り、違反として検出しないでください

**具体例：**
- ❌ 「ぶ厚い・硬い・汚い爪に悩む方へ」→ **薬機法違反**（爪水虫治療を想起）
- ❌ 「硬い爪をキレイにする」→ **薬機法違反**（爪水虫治療を想起）
- ❌ 「変形した爪のケア」→ **薬機法違反**（爪水虫治療を想起）
- ✅ 「諦めて放置している方」→ **違反ではない**（具体的症状表現なし）
- ✅ 「爪のケアを諦めている方」→ **違反ではない**（具体的症状表現なし）

**違反報告時の記載：**
- type: "薬機法違反"
- severity: "high"
- description: "「ぶ厚い・硬い・汚い爪」という表現は、爪水虫（白癬菌感染症）の典型的症状を想起させ、医薬品的効能効果を暗示するため薬機法違反です。"
- referenceKnowledge: "医薬品的効能効果を暗示する表現は、医薬品医療機器等法第66条により禁止されている。爪水虫の症状を想起させる表現（ぶ厚い爪、硬い爪、変形した爪など）は、治療効果を暗示するため違反となる。"
- correctionSuggestion: "爪水虫の症状を想起させる表現を削除してください。一般的な爪のケアに関する表現（「健やかな爪へ」など）に変更してください。"

## 🚨【最優先・絶対厳守】知識ベースルール適用の前提条件 🚨

**評価を開始する前に、必ずこの条件を確認してください：**

知識ベースのルールに複数のキーワードが含まれている場合（例：「殺菌※ジェル」は「殺菌」と「ジェル」の2つ）、
**そのルール内のすべてのキーワードがセグメント内に存在している場合のみ**、そのルールを適用できます。

**重要な例：**
- ❌ セグメント「薬用ジェル」に対して「殺菌※ジェル」ルールを適用 → **誤り**（「殺菌」がない）
- ✓ セグメント「殺菌ジェル」に対して「殺菌※ジェル」ルールを適用 → **正しい**（「殺菌」と「ジェル」両方ある）

**このルールに違反すると、誤った違反を検出してしまいます。必ず守ってください。**

## 注釈マーカーの評価ルール（Issue #11）

**重要**: 以下のキーワードには注釈マーカー（※1、※2など）が**必須**です：

- **「浸透」**: 必ず「※角質層まで」などの注釈が必要
- **「殺菌」**: 有効成分を明示する注釈が必要

**評価手順**:
1. セグメント内にこれらのキーワードがあるか確認
2. キーワードに注釈マーカー（※1、※2など）が付いているか確認
3. 広告文全体（fullText）に対応する注釈があるか確認
4. 注釈マーカーがない、または対応する注釈がない場合 → 違反

**注意**: 注釈マーカーは「※1」「※2」「*1」「*2」など複数の形式があります。

## 知識ベース（薬機法・景表法・特商法）

${knowledgeContext}

## ℹ️ ギネス記録™期間検証について

**重要:** ギネス世界記録™の期間検証は専用のバリデーターで自動実施されています。
期間が誤っている場合、別ロジックで違反として検出されるため、このプロンプトでは期間に関する違反の報告は不要です。

ギネス記録に関しては、以下の項目のみ確認してください：
- 調査機関名の記載があるか（TFCO株式会社）
- 認定名の記載があるか（美容用マイクロニードルスキンパッチにおける最大のブランド）
- 注釈マーカーが適切に付いているか

**期間の正確性は自動検証されるため、期間違反は報告しないでください。**

### 🚨【最優先・絶対厳守】知識ベース厳守ルール 🚨

**このルールは他のすべてのルールより優先されます。必ず守ってください。**

#### 評価の大原則

**違反を報告できるのは、以下のいずれかの場合のみです：**

1. **知識ベースに明確に記載されている違反**
   - 知識ベースで「NG」「使用不可」「違反」と明記されている表現
   - 知識ベースに記載されているルールに明確に違反している表現

2. **例外なく厳禁の表現（常識的に明白な違反）**
   - 医療行為の直接的表現（例：「病気を治す」「症状を治療する」）
   - 医薬品であることを明示する表現（例：「処方薬」「治療薬」）

**それ以外の場合、必ず適合（compliance: true）と判定してください。**

#### 禁止事項（絶対にしてはいけないこと）

❌ **知識ベースにない内容を推測・創作して違反として報告すること**
❌ **「一般的な法律知識」「通常の解釈」などを理由に違反を報告すること**
❌ **知識ベースの記載を独自に解釈・拡大して適用すること**

**例：**
- ナレッジに「若々しい印象」について書かれている
- 「老け見え」という言葉はナレッジにない
- →「老け見え」に対して独自のルールを創作してはいけません

#### 知識ベースの引用ルール

**違反を報告する場合、referenceKnowledge.excerpt には知識ベースの該当箇所を一字一句そのまま引用してください。**

✅ **正しい例：** 知識ベースに「○○という表現は薬機法違反です」と書かれている → そのまま引用
❌ **誤った例：** 知識ベースに「○○という表現は薬機法違反です」と書かれている → 「○○は薬機法に抵触する可能性があります」と言い換える

#### 知識ベースに「OK」と明記されている表現

**知識ベースで明示的に「OK」「使用可」「事実なのでOK」などと記載されている表現は、違反として報告してはいけません。**

**例：**
- 知識ベースに「医師も教えない | 事実なのでOK」と記載 → **違反ではない（適合と判定）**

#### 知識ベースに記載がない表現の扱い

**知識ベースに該当する記述が見つからない場合：**
→ **必ず適合（compliance: true）と判定してください**
→ 違反として報告してはいけません

**この原則に違反すると、根拠のない不当な違反（ハルシネーション）を生成してしまいます。絶対に守ってください。**

### 【絶対厳守】「返金保証」と「効果保証」の区別

**重要: 「全額返金保証」と「効果を保証」は全く異なるものです。絶対に混同しないでください。**

**まず、テキストに「返金」「全額返金」という単語が含まれているか確認してください。**
**これらの単語がある場合、それは金銭的保証であり、効果保証ではありません。**

#### 1. 金銭的保証（返金保証）- 効果保証ではない

以下は**金銭的な保証制度**であり、**製品の効能効果を保証するものではありません**：
- 「全額返金保証」「返金保証」「満足保証」
- 例:
  - ✅ 「全額返金保証も付いて安心です」→ 金銭的保証（違反ではない）
  - ✅ 「満足できなければ全額返金」→ 金銭的保証（違反ではない）
  - ✅ 「返金保証があるので安心」→ 金銭的保証（違反ではない）

**判定ルール:**
1. テキストに「返金」という単語が含まれている → これは金銭的保証です
2. 金銭的保証を「効果保証」「効能保証」として違反判定してはいけません
3. 注釈に関する指摘のみ行ってください（知識ベースに記載がある場合）

#### 2. 効果保証・効能保証 - 薬機法違反

以下は**製品の効能効果を保証する表現**であり、**薬機法違反**です：
- 「必ず効果があります」「効果を保証します」「100%効きます」
- 「絶対に治ります」「確実に改善します」

**判定:**
- 必ず違反として報告してください

#### 3. 区別の方法

**返金保証かどうかの判断基準:**
- 「返金」「全額返金」「満足できなければ」などの金銭的な文言が含まれているか
- 購入者の満足度や金銭的リスクに関する内容か

**効果保証かどうかの判断基準:**
- 「必ず」「絶対」「100%」「確実に」などの断定的な表現があるか
- 製品の効能効果について「保証する」「約束する」と述べているか

**「保証」という単語だけで判断してはいけません。文脈全体を理解して正確に判定してください。**

### 【最優先ルール】「医師も教えない」表現について

**❗❗❗ 重要：「医師も教えない」という表現は常にOKです ❗❗❗**

**知識ベースの明確な記載:**
「医師も教えない | 事実なのでOK。治療機会の損失に繋がるなどの懸念がないため。| 薬機法」

**判定ルール:**
1. 「医師も教えない」という文字列を見つけた場合、**絶対に違反として報告しないでください**
2. たとえ他の違反表現（「殺菌」「浸透」など）と同じセグメント内にあっても、「医師も教えない」自体は違反ではありません
3. 「医師も教えない」に関する違反報告は不要です

**具体例:**
- ✅ 「"医師も教えない"汚い爪をキレイにする殺菌ジェル」
  - 「医師も教えない」→ **OK（違反なし）**
  - 「殺菌」→ 注釈が必要（これは別の違反として報告）
- ✅ 「【医師も教えない】」→ **OK（違反なし）**

**❌ 誤った判定例:**
- 「医師も教えないという表現は...薬機法に抵触する」← このような報告は絶対にしないでください

### 【絶対厳守】No.1・ランキング表示について

**❗ 重要：「1位」「No.1」「世界初」「日本初」などの表示には必ずエビデンスが必要です ❗**

**知識ベースの明確な記載:**
「No.1、世界初、日本初などの表記」にはエビデンスの記載が必要（37_エビデンス表記について.txt）

**【重要】検出対象の明確化:**
このルールは、以下の**明示的な表現が実際にテキスト内に含まれている場合のみ**適用してください:
- 「1位」「No.1」「ナンバーワン」「トップ」「ランキング」
- 「日本初」「世界初」「業界初」
- これらの文字列が**実際にテキスト内に存在する場合のみ**違反を報告してください

**【重要】検出対象外（誤検知防止）:**
以下は単なる販売実績であり、ランキング・No.1表示ではありません。これらは違反として報告しないでください:
- ❌ 誤検知例: 「累計250万本突破」→ これは販売実績であり、「No.1」ではない
- ❌ 誤検知例: 「累計○○本販売」→ これは販売実績であり、「ランキング」ではない
- ✅ 正しい検出: テキストに「1位」「No.1」などの文字が実際に含まれている場合のみ

**判定ルール:**
1. **まず、テキスト内に「1位」「No.1」「ランキング」「日本初」「世界初」などの文字列が実際に存在するか確認**
2. これらの表現が実際に含まれている場合:
   - 具体的なエビデンス（いつ、どこで、何の調査で）が記載されているか確認
   - エビデンスの記載がない場合は**優良誤認として違反報告**してください
3. これらの表現が含まれていない場合:
   - 違反として報告しないでください（誤検知防止）

**エビデンスが必要な表現例:**
- 「Amazon・楽天で1位を獲得」→ いつ、どのカテゴリで1位だったか明記が必要
- 「No.1売上」→ いつ、どの市場で、どの調査で1位だったか明記が必要
- 「日本初」「世界初」→ 何が初なのか、根拠資料の明記が必要

**【絶対厳守】ハルシネーション（幻覚）防止:**
- 違反を報告する際は、**必ず実際のテキストから正確に引用**してください
- テキストに存在しない表現を報告してはいけません
- description には**実際のテキストに含まれる表現のみ**を記載してください

**具体例:**
- ❌ 「Amazon・楽天で1位を獲得した人気商品です」（テキストに含まれている場合）→ エビデンス不明（優良誤認）
- ✅ 「Amazon・楽天で1位を獲得※ ※2024年6月 スキンケアカテゴリ（Amazon調べ）」→ OK
- ✅ 「累計250万本突破」→ **違反ではない**（単なる販売実績、「No.1」ではない）

**違反報告時の記載:**
- type: 「景表法違反」
- severity: 「high」
- description: 必ず**実際のテキストから正確に引用**した上で、「1位」「No.1」等の表示にはエビデンス（いつ、どこで、何の調査で）の記載が必須と記載
- referenceKnowledge: knowledge/common/37_エビデンス表記について.txt

## 出力形式

以下のJSON形式で、**各セグメントの評価結果**を返してください：

{
  "evaluations": [
    {
      "segmentId": "seg_001",
      "compliance": true,
      "violations": [
        {
          "type": "薬機法違反",
          "severity": "high",
          "description": "具体的な違反内容",
          "referenceKnowledge": {
            "file": "知識ベースファイル名",
            "excerpt": "該当する知識ベースの原文（一字一句そのまま引用）"
          },
          "correctionSuggestion": "具体的な修正案"
        }
      ],
      "evaluatedAt": "2025-10-17T02:00:00Z"
    },
    // 各セグメントについて同様の評価
  ]
}

**違反タイプ (type) は必ず以下のいずれかを使用してください：**
- **「薬機法違反」** - 薬機法に関する違反（「医薬品医療機器等法違反」や「薬事法違反」ではなく、必ず「薬機法違反」）
- **「景表法違反」** - 景品表示法に関する違反（「景品表示法違反」ではなく、必ず「景表法違反」という略称）
- **「社内基準違反」** - 社内ルールに関する違反
- **「特商法違反」** - 特定商取引法に関する違反
- **「その他」** - 上記に該当しない違反

**重要事項**:
- **各セグメントを個別に評価**してください
- compliance: 違反がなければ true、違反があれば false
- violations: 違反がない場合は空配列 []
- **違反を報告する場合、以下の3つのフィールドは必須です（必ず全て含めてください）**:
  1. **referenceKnowledge.file**: 知識ベースのファイル名を正確に記載
  2. **referenceKnowledge.excerpt**: 知識ベースの該当箇所を一字一句そのまま引用
  3. **correctionSuggestion**: 具体的な修正案を必ず生成（空文字列やエラーメッセージは禁止）
- **correctionSuggestion の生成方法**:
  - NGキーワード検証結果に「修正案（適切な表現例）」がある場合: その例を参考にして現在のテキストに合わせた修正案を生成
  - 知識ベースに推奨表現や対策が記載されている場合: それを引用または応用
  - 上記がない場合: 違反内容に基づいて論理的な修正案を提示（例: 注釈を追加、表現を変更など）
- referenceKnowledge.excerpt: 知識ベースから引用する場合は**一字一句そのまま引用**
- 注釈マーカーの有無を必ず確認
- 全${segments.length}個のセグメントの評価結果を返してください

JSONのみ返してください。
`;
}

/**
 * バッチ評価をリトライ付きで実行
 */
async function evaluateBatchWithRetry(
  model: { generateContent: (prompt: string) => Promise<{ response: { text: () => string } }> },
  prompt: string,
  segments: Array<{ id: string; text: string }>,
  maxRetries: number = 3
): Promise<SegmentEvaluation[]> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[Evaluate Batch] Attempt ${attempt + 1}/${maxRetries}...`);

      const result = await model.generateContent(prompt);
      const response = result.response.text();

      console.log('[Evaluate Batch] Response length:', response.length, 'chars');

      // Log first 500 chars of response for debugging
      console.log('[Evaluate Batch] Response preview:', response.substring(0, 500));

      // Try to parse JSON response with better error handling
      let parsed: { evaluations: SegmentEvaluation[] };
      try {
        parsed = JSON.parse(response);
      } catch (parseError) {
        // If JSON parse fails, try to sanitize and parse again
        console.error('[Evaluate Batch] Initial JSON parse failed, attempting sanitization...');
        console.error('[Evaluate Batch] Parse error:', parseError instanceof Error ? parseError.message : String(parseError));

        // Log the problematic section around the error position
        if (parseError instanceof SyntaxError && parseError.message.includes('position')) {
          const match = parseError.message.match(/position (\d+)/);
          if (match) {
            const pos = parseInt(match[1]);
            const start = Math.max(0, pos - 100);
            const end = Math.min(response.length, pos + 100);
            console.error('[Evaluate Batch] Problematic section BEFORE sanitization:', response.substring(start, end));
          }
        }

        // Try sanitizing common issues - ULTRA-AGGRESSIVE VERSION
        let sanitized = response;

        // Remove any BOM or non-printable characters at the start
        sanitized = sanitized.replace(/^\uFEFF/, '').trim();

        // CRITICAL FIX: Remove ALL invalid escape sequences
        // The problem: Gemini includes \* from knowledge base, which is invalid JSON
        //
        // Strategy: Replace invalid escapes with their literal characters
        // \* → * (not \\*, which would be 2 characters in final string)

        const beforeSanitization = sanitized;

        // Log the problematic section for debugging
        console.log('[Evaluate Batch] Response contains', (response.match(/\\\*/g) || []).length, 'instances of \\*');

        // ULTRA-AGGRESSIVE: Remove backslash before ANY character that's not a valid JSON escape
        // Valid JSON escapes: \" \\ \/ \b \f \n \r \t \uXXXX
        // Everything else: remove the backslash
        sanitized = sanitized.replace(/\\(?!["\\/bfnrtu])/g, '');

        console.log('[Evaluate Batch] After sanitization:', (sanitized.match(/\\\*/g) || []).length, 'instances of \\* remaining');

        // Log if any replacements were made
        if (beforeSanitization !== sanitized) {
          console.log('[Evaluate Batch] ✓ Sanitization removed', beforeSanitization.length - sanitized.length, 'invalid escape characters');
          // Show problematic section
          const pos = 672; // Known error position from logs
          const start = Math.max(0, pos - 100);
          const end = Math.min(sanitized.length, pos + 100);
          console.log('[Evaluate Batch] Section around position 672 (AFTER sanitization):', sanitized.substring(start, end));
        } else {
          console.log('[Evaluate Batch] ⚠️  No replacements made - this is unexpected!');
        }

        console.log('[Evaluate Batch] Attempting to parse sanitized JSON...');
        parsed = JSON.parse(sanitized);
      }

      if (!parsed.evaluations || !Array.isArray(parsed.evaluations)) {
        throw new Error('Invalid response format: missing evaluations array');
      }

      if (parsed.evaluations.length !== segments.length) {
        console.warn(
          `[Evaluate Batch] Warning: Expected ${segments.length} evaluations, got ${parsed.evaluations.length}`
        );
      }

      console.log(`[Evaluate Batch] ✅ Successfully evaluated ${parsed.evaluations.length} segments`);
      return parsed.evaluations;

    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[Evaluate Batch] ❌ Attempt ${attempt + 1} failed:`, lastError.message);

      if (attempt < maxRetries - 1) {
        const delay = 1000 * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s
        console.log(`[Evaluate Batch] 🔄 Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Batch evaluation failed after retries');
}

/**
 * GET /api/v2/evaluate-batch
 * APIドキュメント
 */
export async function GET() {
  return NextResponse.json({
    name: 'Batch Evaluation API',
    version: 'v2',
    description: '複数セグメントを1回のGemini APIリクエストで評価（Issue #15）',
    endpoints: {
      POST: {
        path: '/api/v2/evaluate-batch',
        description: '最大20セグメントをバッチ評価',
        maxSegments: 20,
        requestBody: {
          segments: 'Segment[] (1-20 segments)',
          productId: "'HA' | 'SH'",
          apiKey: 'string (Gemini API key)',
          fullText: 'string (optional, for annotation reference)'
        },
        response: {
          success: 'boolean',
          data: {
            evaluations: 'SegmentEvaluation[]',
            totalSegments: 'number',
            processingTimeMs: 'number'
          }
        }
      }
    },
    benefits: {
      apiCalls: '91セグメント: 91回 → 5回（95%削減）',
      rateLimit: 'レート制限エラー回避',
      processingTime: '約5分 → 約1分（80%短縮）',
      scalability: '300セグメントまで対応可能'
    }
  });
}
