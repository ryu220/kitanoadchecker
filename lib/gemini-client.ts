/**
 * Advanced Gemini API Client for Ad Legal Checker V2
 *
 * Features:
 * - Text structure analysis using Gemini 2.0 Flash Thinking
 * - Intelligent text segmentation
 * - Segment-by-segment legal evaluation
 * - Comprehensive report generation
 * - Robust error handling with retry logic
 * - Timeout management
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import {
  GeminiClientConfig,
  GeminiAPIError,
  TextStructure,
  Segment,
  SegmentEvaluation,
  AnalysisReport,
  BatchProcessingOptions,
  UserInput,
  ProductId,
} from './types-v2';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  model: 'gemini-2.5-flash-lite',
  timeoutMs: 60000, // 60 seconds
  retryConfig: {
    maxRetries: 3,
    initialDelayMs: 1000,
    backoffMultiplier: 2,
    maxDelayMs: 10000,
  },
  enableStreaming: false,
} as const;

/**
 * Advanced Gemini API Client
 */
export class GeminiClient {
  private config: Required<GeminiClientConfig>;
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(config: GeminiClientConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      retryConfig: {
        ...DEFAULT_CONFIG.retryConfig,
        ...config.retryConfig,
      },
    };

    if (!this.config.apiKey) {
      throw new Error('Gemini API key is required');
    }

    this.genAI = new GoogleGenerativeAI(this.config.apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: this.config.model,
    });
  }

  /**
   * Analyze the overall structure of the advertisement text
   *
   * Uses Gemini 2.0 Flash Thinking mode for deep structural analysis
   *
   * @param text - Full advertisement text
   * @returns Text structure analysis
   */
  async analyzeStructure(text: string): Promise<TextStructure> {
    const prompt = `
あなたは広告文の構造分析の専門家です。以下の広告文を分析し、その構造を理解してください。

## 分析タスク
1. 広告文の全体的な概要を把握
2. 主要な主張や訴求点を特定
3. 補足説明や詳細情報を識別
4. CTAやアクションフレーズを検出
5. 全体のトーンを評価

## 広告文
${text}

## 出力形式
以下のJSON形式で返してください：
{
  "overview": "広告の全体的な概要（1-2文）",
  "mainClaims": ["主要な主張1", "主要な主張2"],
  "supportingStatements": ["補足説明1", "補足説明2"],
  "callToActions": ["CTA1", "CTA2"],
  "tone": "persuasive" | "informational" | "promotional" | "mixed"
}
`;

    const result = await this.executeWithRetry(
      async () => await this.model.generateContent(prompt),
      'analyzeStructure'
    );

    return this.parseJsonResponse<TextStructure>(result.response.text());
  }

  /**
   * Segment text into meaningful, independent units
   *
   * @param text - Full advertisement text
   * @param structure - Pre-analyzed structure (optional, improves accuracy)
   * @returns Array of segments with metadata
   */
  async segmentText(text: string, structure?: TextStructure): Promise<Segment[]> {
    const structureContext = structure
      ? `
## 事前分析結果
- 概要: ${structure.overview}
- 主要主張数: ${structure.mainClaims.length}
- トーン: ${structure.tone || 'unknown'}
`
      : '';

    const prompt = `
あなたは広告文を分割する専門家です。以下の広告文を、意味的・構造的に独立した最小単位のセグメントに分割してください。

${structureContext}

## 分割ルール
1. 構造的デリミタ（【】、改行など）で優先的に分割
2. 独立した主張や訴求点は個別のセグメントに
3. 説明文や補足情報は別セグメントに
4. CTAやアクションフレーズは独立セグメントに
5. 原文を一切変更しない

## セグメントタイプ
- claim: 主張や訴求点
- explanation: 説明や詳細情報
- evidence: 根拠やデータ
- cta: アクションフレーズ
- disclaimer: 免責事項や注意書き

## 広告文
${text}

## 出力形式
以下のJSON配列で返してください：
[
  {
    "id": "seg_1",
    "text": "元の文字列そのまま",
    "type": "claim",
    "position": {"start": 0, "end": 50},
    "importance": 0.9
  }
]
`;

    const result = await this.executeWithRetry(
      async () => await this.model.generateContent(prompt),
      'segmentText'
    );

    const segments = this.parseJsonResponse<Segment[]>(result.response.text());

    // Validate segments
    if (!Array.isArray(segments) || segments.length === 0) {
      throw new Error('Invalid segmentation result: expected non-empty array');
    }

    return segments;
  }

  /**
   * Evaluate a single segment against legal knowledge base
   *
   * @param segment - Segment to evaluate
   * @param productId - Product identifier
   * @param knowledgeContext - Relevant knowledge base excerpts
   * @returns Evaluation result with violations (if any)
   */
  async evaluateSegment(
    segment: Segment,
    productId: ProductId,
    knowledgeContext: string
  ): Promise<SegmentEvaluation> {
    const startTime = Date.now();

    const prompt = `
あなたは広告表現の法務チェックの専門家です。以下のセグメントを評価してください。

## セグメント情報
- ID: ${segment.id}
- テキスト: "${segment.text}"
- タイプ: ${segment.type}
- 商品ID: ${productId}

## 適用される知識ベース
${knowledgeContext}

## 評価タスク
1. 薬機法違反をチェック
2. 景表法違反をチェック
3. 社内基準違反をチェック
4. 各違反について重要度を評価（high/medium/low）
5. 具体的な修正案を提案

## 出力形式
以下のJSON形式で返してください：
{
  "segmentId": "${segment.id}",
  "compliance": true | false,
  "violations": [
    {
      "type": "薬機法違反" | "景表法違反" | "社内基準違反",
      "severity": "high" | "medium" | "low",
      "description": "違反内容の詳細説明",
      "referenceKnowledge": {
        "file": "参照した知識ファイル名",
        "excerpt": "該当する条文や基準の抜粋",
        "section": "条項番号（あれば）"
      },
      "correctionSuggestion": "具体的な修正案",
      "confidence": 0.95
    }
  ],
  "supportingEvidence": ["エビデンス1", "エビデンス2"]
}
`;

    const result = await this.executeWithRetry(
      async () => await this.model.generateContent(prompt),
      'evaluateSegment'
    );

    const evaluation = this.parseJsonResponse<SegmentEvaluation>(result.response.text());

    // Add metadata
    evaluation.evaluatedAt = new Date().toISOString();
    evaluation.processingTimeMs = Date.now() - startTime;

    return evaluation;
  }

  /**
   * Evaluate multiple segments in batch with controlled concurrency
   *
   * @param segments - Array of segments to evaluate
   * @param productId - Product identifier
   * @param knowledgeContext - Relevant knowledge base excerpts
   * @param options - Batch processing options
   * @returns Array of evaluation results
   */
  async evaluateSegmentsBatch(
    segments: Segment[],
    productId: ProductId,
    knowledgeContext: string,
    options?: BatchProcessingOptions
  ): Promise<SegmentEvaluation[]> {
    const opts = {
      concurrency: 3,
      delayMs: 500,
      stopOnError: false,
      ...options,
    };

    const results: SegmentEvaluation[] = [];
    const errors: Error[] = [];

    // Process in chunks based on concurrency
    for (let i = 0; i < segments.length; i += opts.concurrency) {
      const chunk = segments.slice(i, i + opts.concurrency);

      const chunkResults = await Promise.allSettled(
        chunk.map(segment => this.evaluateSegment(segment, productId, knowledgeContext))
      );

      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          errors.push(result.reason);
          if (opts.stopOnError) {
            throw new Error(`Batch evaluation failed: ${result.reason.message}`);
          }
        }
      }

      // Add delay between chunks
      if (i + opts.concurrency < segments.length) {
        await this.delay(opts.delayMs);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      throw new Error(`All batch evaluations failed: ${errors.map(e => e.message).join('; ')}`);
    }

    return results;
  }

  /**
   * Generate comprehensive report from analysis results
   *
   * @param input - Original user input
   * @param structure - Text structure analysis
   * @param segments - Identified segments
   * @param evaluations - Evaluation results
   * @returns Complete analysis report
   */
  async generateReport(
    input: UserInput,
    structure: TextStructure,
    segments: Segment[],
    evaluations: SegmentEvaluation[]
  ): Promise<AnalysisReport> {
    const startTime = Date.now();

    // Calculate summary statistics
    const compliantSegments = evaluations.filter(e => e.compliance).length;
    const allViolations = evaluations.flatMap(e => e.violations);

    const violationsByType = allViolations.reduce((acc, v) => {
      acc[v.type] = (acc[v.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const violationsBySeverity = allViolations.reduce((acc, v) => {
      acc[v.severity] = (acc[v.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Generate markdown report
    const prompt = `
あなたは広告法務レポートの作成専門家です。以下の分析結果から、包括的なレポートをMarkdown形式で生成してください。

## 入力情報
- 商品ID: ${input.product_id}
- 広告文長: ${input.full_text.length}文字

## 構造分析
${JSON.stringify(structure, null, 2)}

## 統計
- 総セグメント数: ${segments.length}
- 適合セグメント数: ${compliantSegments}
- 違反総数: ${allViolations.length}

## 詳細評価結果
${JSON.stringify(evaluations, null, 2)}

## レポート要件
1. エグゼクティブサマリー
2. 全体の適合性評価
3. 違反の詳細（タイプ別・重要度別）
4. セグメント別の評価
5. 推奨される修正アクション
6. まとめと次のステップ

## 出力形式
Markdown形式で、読みやすく構造化されたレポートを作成してください。
`;

    const result = await this.executeWithRetry(
      async () => await this.model.generateContent(prompt),
      'generateReport'
    );

    const markdown = result.response.text();

    const report: AnalysisReport = {
      id: this.generateId(),
      input,
      structure,
      segments,
      evaluations,
      summary: {
        totalSegments: segments.length,
        compliantSegments,
        totalViolations: allViolations.length,
        violationsByType: violationsByType as Record<import('./types-v2').ViolationType, number>,
        violationsBySeverity: violationsBySeverity as Record<import('./types-v2').ViolationSeverity, number>,
      },
      markdown,
      generatedAt: new Date().toISOString(),
      totalProcessingTimeMs: Date.now() - startTime,
    };

    return report;
  }

  /**
   * Execute a function with retry logic and timeout handling
   *
   * @param fn - Function to execute
   * @param operation - Operation name (for logging)
   * @returns Result of the function
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    operation: string
  ): Promise<T> {
    const { maxRetries, initialDelayMs, backoffMultiplier, maxDelayMs } = this.config.retryConfig;
    let lastError: Error | undefined;
    let delay = initialDelayMs;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Execute with timeout
        const result = await this.withTimeout(fn(), this.config.timeoutMs);
        return result;
      } catch (error) {
        lastError = error as Error;

        const isRetryable = this.isRetryableError(error as Error);
        const isLastAttempt = attempt === maxRetries;

        if (!isRetryable || isLastAttempt) {
          const geminiError = this.createGeminiError(error as Error, attempt);
          throw geminiError;
        }

        // Wait before retry with exponential backoff
        console.warn(`${operation} attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await this.delay(delay);
        delay = Math.min(delay * backoffMultiplier, maxDelayMs);
      }
    }

    // Should never reach here, but TypeScript requires it
    throw this.createGeminiError(lastError!, maxRetries);
  }

  /**
   * Execute a function with timeout
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    const retryablePatterns = [
      'timeout',
      'econnreset',
      'enotfound',
      'etimedout',
      'rate limit',
      '429',
      '500',
      '502',
      '503',
      '504',
    ];

    return retryablePatterns.some(pattern => message.includes(pattern));
  }

  /**
   * Create a GeminiAPIError from a generic error
   */
  private createGeminiError(error: Error, retryCount: number): GeminiAPIError {
    const geminiError = error as GeminiAPIError;
    geminiError.retryCount = retryCount;
    geminiError.retryable = this.isRetryableError(error);
    return geminiError;
  }

  /**
   * Parse JSON response from Gemini, handling various formats
   */
  private parseJsonResponse<T>(responseText: string): T {
    try {
      // Try direct parse
      return JSON.parse(responseText);
    } catch {
      // Extract JSON from markdown code blocks
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                        responseText.match(/```\s*([\s\S]*?)\s*```/) ||
                        responseText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);

      if (!jsonMatch) {
        throw new Error('Failed to extract JSON from response');
      }

      try {
        return JSON.parse(jsonMatch[1]);
      } catch (parseError) {
        throw new Error(`Failed to parse JSON: ${parseError}`);
      }
    }
  }

  /**
   * Delay execution for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate a unique identifier
   */
  private generateId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Factory function to create a GeminiClient instance
 *
 * @param apiKey - Gemini API key (if not provided, reads from environment)
 * @param config - Additional configuration options
 * @returns Configured GeminiClient instance
 */
export function createGeminiClient(apiKey?: string, config?: Partial<GeminiClientConfig>): GeminiClient {
  const key = apiKey || process.env.GEMINI_API_KEY || '';

  if (!key) {
    throw new Error('GEMINI_API_KEY is required. Provide it as parameter or set environment variable.');
  }

  return new GeminiClient({
    apiKey: key,
    ...config,
  });
}

/**
 * Convenience function for complete analysis pipeline
 *
 * @param input - User input with text and product ID
 * @param knowledgeContext - Knowledge base context
 * @param apiKey - Optional API key
 * @returns Complete analysis report
 */
export async function analyzeAdvertisement(
  input: UserInput,
  knowledgeContext: string,
  apiKey?: string
): Promise<AnalysisReport> {
  const client = createGeminiClient(apiKey);

  // Step 1: Analyze structure
  const structure = await client.analyzeStructure(input.full_text);

  // Step 2: Segment text
  const segments = await client.segmentText(input.full_text, structure);

  // Step 3: Evaluate segments
  const evaluations = await client.evaluateSegmentsBatch(
    segments,
    input.product_id,
    knowledgeContext
  );

  // Step 4: Generate report
  const report = await client.generateReport(input, structure, segments, evaluations);

  return report;
}
