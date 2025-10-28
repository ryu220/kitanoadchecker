/**
 * Gemini APIクライアント
 *
 * 機能:
 * - 主張分割（広告文を意味的・構造的に独立した単位に分割）
 * - エビデンス検索（広告表現の根拠を検索）
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { Segment } from './types';
import { loadProductConfig } from './product-config-loader';
import { ProductId } from './types';

/**
 * 広告文を意味的・構造的に独立した主張の最小単位に分割
 *
 * @param fullText 広告文全体
 * @returns セグメントの配列
 */
export async function segmentClaims(fullText: string): Promise<Segment[]> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Please configure your environment variables.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Fixed: 存在しないモデル名を修正

  const prompt = `
あなたは広告文を分析する専門家です。以下の広告文を、意味的・構造的に独立した「主張」の最小単位に分割してください。

## 分割ルール
1. 【】などの構造的デリミタで最優先分割
2. 改行で区切られた独立した主張を分離
3. 異なる効能・特徴を述べている箇所を個別に分離
4. 各セグメントの文字列は一切変更しない（原文のまま）

## 出力形式
JSON配列で返してください：
[
  {"id": "seg_1", "text": "元の文字列そのまま"},
  {"id": "seg_2", "text": "元の文字列そのまま"}
]

## 広告文
${fullText}
`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // JSONをパース
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Gemini response');
    }

    const segments = JSON.parse(jsonMatch[0]) as Segment[];

    // セグメントの検証
    if (!Array.isArray(segments) || segments.length === 0) {
      throw new Error('Gemini returned invalid segment format');
    }

    // 各セグメントにUUIDを付与（Geminiが返したIDを保持するか、UUIDに置き換える）
    const validatedSegments = segments.map((seg, index) => ({
      id: seg.id || `seg_${index + 1}`,
      text: (seg as any).original_text || (seg as any).text
    }));

    return validatedSegments;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Gemini API segmentation failed: ${error.message}`);
    }
    throw new Error('Gemini API segmentation failed: Unknown error');
  }
}

/**
 * Gemini API設定
 */
interface GeminiConfig {
  apiKey: string;
}

/**
 * エビデンス検索結果
 */
export interface EvidenceResult {
  /** 検索クエリ */
  query: string;
  /** 見つかったエビデンス */
  evidence: string;
  /** 信頼度スコア（0-1） */
  confidence: number;
  /** 参照URL（存在する場合） */
  sourceUrl?: string;
}

/**
 * リトライ設定
 */
interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // ミリ秒
  maxDelay: number; // ミリ秒
  timeout: number; // ミリ秒
}

/**
 * デフォルトリトライ設定
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1秒
  maxDelay: 4000, // 4秒
  timeout: 60000, // 60秒
};

/**
 * エラーがリトライ可能かどうかを判定
 */
function isRetryableError(error: any): boolean {
  // ネットワークエラー
  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    return true;
  }

  // Gemini APIエラー
  if (error.message) {
    const message = error.message.toLowerCase();

    // レート制限エラー
    if (message.includes('429') || message.includes('rate limit') || message.includes('quota')) {
      return true;
    }

    // サーバー一時エラー
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
      return true;
    }

    // タイムアウト
    if (message.includes('timeout') || message.includes('timed out')) {
      return true;
    }

    // APIキーエラー、バリデーションエラーはリトライ不可
    if (message.includes('401') || message.includes('403') || message.includes('400') || message.includes('invalid api key')) {
      return false;
    }
  }

  // その他のエラーはリトライ可能とする（ネットワーク問題の可能性）
  return true;
}

/**
 * 指数バックオフ付きリトライ実行
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // タイムアウト付きで実行
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Request timeout after ${config.timeout}ms`)), config.timeout);
      });

      const result = await Promise.race([fn(), timeoutPromise]);

      // 成功した場合
      if (attempt > 0) {
        console.log(`[Gemini] ✅ Retry succeeded on attempt ${attempt + 1}`);
      }

      return result;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 最後の試行の場合はエラーをスロー
      if (attempt >= config.maxRetries) {
        console.error(`[Gemini] ❌ All ${config.maxRetries + 1} attempts failed`);
        throw lastError;
      }

      // リトライ不可能なエラーの場合は即座にスロー
      if (!isRetryableError(error)) {
        console.error(`[Gemini] ❌ Non-retryable error: ${lastError.message}`);
        throw lastError;
      }

      // リトライ待機時間を計算（指数バックオフ）
      const delay = Math.min(config.baseDelay * Math.pow(2, attempt), config.maxDelay);

      console.warn(`[Gemini] ⚠️  Attempt ${attempt + 1} failed: ${lastError.message}`);
      console.warn(`[Gemini] 🔄 Retrying in ${delay}ms... (${attempt + 1}/${config.maxRetries})`);

      // 待機
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // 到達しないはずだが、TypeScriptの型チェックのため
  throw lastError || new Error('Retry failed');
}

/**
 * Gemini APIクライアントクラス
 */
export class GeminiClient {
  private config: GeminiConfig;
  private genAI: GoogleGenerativeAI;

  constructor(config: GeminiConfig) {
    this.config = config;
    this.genAI = new GoogleGenerativeAI(config.apiKey);
  }

  /**
   * Get keyword instructions for segmentation based on product ID
   */
  private getKeywordInstructions(productId: string): string {
    const commonKeywords = this.getCommonKeywordInstructions();
    const productKeywords = this.getProductKeywordInstructions(productId);

    return `${commonKeywords}\n\n${productKeywords}`;
  }

  /**
   * Get common keyword instructions (特商法 etc.)
   */
  private getCommonKeywordInstructions(): string {
    return `
### 【最優先】特商法違反になりやすいキーワード

以下のキーワードが含まれている場合は、価格情報とセットで **必ず独立したセグメント** として分割：

1. **「いまなら」「今なら」「今だけ」**
   - 例：「いまならアンケート回答で半額の1,815円（税込）でスタート可能」
   - → 価格情報全体を1セグメントとして抽出

2. **「限定」「先着」**
   - 期間や数量と一緒に抽出

3. **「実質無料」「実質0円」「全額返金保証」**
   - 条件部分も含めて1セグメント

4. **価格表示（「円」「税込」「OFF」「割引」「半額」）**
   - 価格情報は必ず1つのセグメントとして抽出
`;
  }

  /**
   * Get product-specific keyword instructions from JSON config
   */
  private getProductKeywordInstructions(productId: string): string {
    try {
      // JSON設定ファイルから商品固有キーワードを読み込む（データ駆動設計）
      const config = loadProductConfig(productId as ProductId);

      return `
### ${config.name}（${config.id}）商品固有の重要キーワード

以下のキーワードが含まれている場合は **独立したセグメント** として分割：

1. **注釈が必要なキーワード**
${config.segmentationKeywords?.required?.map(kw => {
  const rule = config.annotationRules?.[kw];
  return `   - 「${kw}」→ 注釈「${rule?.template || '※注釈必要'}」が必要`;
}).join('\n') || '   - なし'}

2. **文脈で判定が変わるキーワード**
${config.segmentationKeywords?.contextDependent?.map(kw => `   - 「${kw}」`).join('\n') || '   - なし'}

3. **絶対NGのキーワード**
${config.segmentationKeywords?.prohibited?.map(kw => `   - 「${kw}」`).join('\n') || '   - なし'}

これらのキーワードが含まれる文は、前後の文脈も含めて独立したセグメントとして抽出してください。
`;
    } catch (error) {
      console.warn(`[Gemini] Product config not found for ${productId}, using common keywords only`);
      return ''; // 設定ファイルがない場合は共通ルールのみ
    }
  }

  /**
   * 広告文をセグメントに分割
   *
   * @param text 広告文全体
   * @param productId 商品ID
   * @returns セグメントの配列
   */
  async segmentText(text: string, productId: string): Promise<Segment[]> {
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-flash', // Fixed: 存在しないモデル名を修正
      generationConfig: {
        maxOutputTokens: 16384, // Issue #15: 5,000文字まで確実に処理できるよう上限を引き上げ
        temperature: 0.0
        // responseMimeType removed - JSONパースはコード側で処理
      }
    });

    // Load keyword lists
    const keywordInstructions = this.getKeywordInstructions(productId);

    // Issue #15: 評価精度を一切犠牲にせず、5,000文字まで確実に処理
    const prompt = `
広告文をセグメント分割し、JSON形式で返してください。

商品ID: ${productId}
広告文:
${text}

## 【最重要】分割ルール

${keywordInstructions}

### 注釈マーカーの統一（Issue #11）
- ※1, ※2, *1, *2 などの注釈マーカーを検出
- 注釈マーカーがある場合、本文と注釈を**必ず同じセグメント**に含める
  例: 「浸透※1する\n※1：角質層まで」→ 1セグメント（本文+注釈）

### 価格・CTA情報
- 「いまなら」「今だけ」「限定」を含む価格情報は独立したセグメント

### 複数キーワード
- 「浸透・殺菌」など複数キーワードは1セグメントとして扱う
  （評価APIで個別に検証）

## 出力形式
{
  "segments": [
    {
      "id": "seg_001",
      "text": "元の文章そのまま（一字一句変更しない）",
      "type": "claim",
      "position": {
        "start": 0,
        "end": 10,
        "line": 1
      },
      "importance": 0.9,
      "relatedSegments": ["seg_002"]
    }
  ]
}

**フィールド説明**:
- **id**: セグメントID（必須）
- **text**: 元の文章そのまま（必須、一字一句変更しない）
- **type**: claim | explanation | evidence | cta | disclaimer（必須）
- **position**: テキスト内の位置情報（オプション）
  - start: 開始位置（文字数）
  - end: 終了位置（文字数）
  - line: 行番号
- **importance**: 重要度スコア 0-1（オプション）
- **relatedSegments**: 関連セグメントID配列（オプション）

**必須事項**:
- 元のテキストを一字一句変更しない
- 全文字を何らかのセグメントに含める
- セグメント重複禁止
- 注釈マーカーがあれば本文と注釈をセット化

JSONのみ返してください。
`;

    try {
      // Issue #14: リトライロジック付きでGemini APIを呼び出し
      const segments = await retryWithBackoff(async () => {
        console.log(`[Gemini] Segmenting text (${text.length} chars)...`);

        const result = await model.generateContent(prompt);
        const response = result.response.text();

        // JSONを抽出（マークダウンコードブロックも対応）
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                          response.match(/```\s*([\s\S]*?)\s*```/) ||
                          response.match(/(\{[\s\S]*\})/);

        if (!jsonMatch) {
          console.error('[Gemini] Failed to extract JSON.');
          console.error('[Gemini] Full response:', response);
          throw new Error('Failed to extract JSON from Gemini response');
        }

        const jsonText = jsonMatch[1] || jsonMatch[0];

        let parsedResponse;
        try {
          parsedResponse = JSON.parse(jsonText) as {
            segments: Array<{
              id: string;
              text: string;
              type: 'claim' | 'explanation' | 'evidence' | 'cta' | 'disclaimer';
              position?: { start: number; end: number; line?: number }; // Issue #14: オプション化
              importance?: number;
              relatedSegments?: string[];
            }>;
          };
        } catch (parseError) {
          // Issue #14: JSONパースエラーの詳細ログ
          const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
          console.error(`[Gemini] JSON parse error: ${errorMsg}`);
          console.error(`[Gemini] Response length: ${response.length} chars`);
          console.error(`[Gemini] JSON match length: ${jsonMatch[0].length} chars`);
          throw new Error(`JSON parse failed: ${errorMsg}. Response may be truncated. Try reducing text length.`);
        }

        if (!parsedResponse.segments || !Array.isArray(parsedResponse.segments)) {
          throw new Error('Invalid segment format from Gemini');
        }

        // Segment型に変換（lib/types.tsの型定義に合わせる）
        const mappedSegments: Segment[] = parsedResponse.segments.map((seg) => {
          // 非対応の型を対応する型にマッピング
          let mappedType: 'claim' | 'explanation' | 'evidence' | undefined;
          if (seg.type === 'claim') {
            mappedType = 'claim';
          } else if (seg.type === 'explanation') {
            mappedType = 'explanation';
          } else if (seg.type === 'evidence') {
            mappedType = 'evidence';
          } else {
            // 'cta', 'disclaimer'などは'explanation'として扱う
            mappedType = 'explanation';
          }

          return {
            id: seg.id,
            text: seg.text,
            type: mappedType,
            position: seg.position
          };
        });

        console.log(`[Gemini] ✅ Segmentation successful: ${mappedSegments.length} segments`);
        return mappedSegments;
      });

      return segments;
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(`[Gemini] ❌ Segmentation failed after retries: ${error.message}`);
        throw new Error(`Gemini segmentation failed: ${error.message}`);
      }
      throw new Error('Gemini segmentation failed: Unknown error');
    }
  }

  /**
   * 広告表現の根拠を検索
   *
   * @param claim チェック対象の主張・表現
   * @param productId 商品ID
   * @returns エビデンス検索結果
   */
  async searchEvidence(claim: string, productId: string): Promise<EvidenceResult> {
    // TODO: M3で実装（Gemini + Grounding）
    console.log('GeminiClient.searchEvidence called (stub)', { claim, productId });

    // 仮実装: ダミーの結果を返す
    return {
      query: claim,
      evidence: '（エビデンス検索機能は次のマイルストーンで実装されます）',
      confidence: 0.0,
    };
  }

  /**
   * 複数の主張を一括検索
   *
   * @param claims チェック対象の主張配列
   * @param productId 商品ID
   * @returns エビデンス検索結果の配列
   */
  async searchEvidenceBatch(
    claims: string[],
    productId: string
  ): Promise<EvidenceResult[]> {
    // TODO: M3で実装
    console.log('GeminiClient.searchEvidenceBatch called (stub)', {
      claimsCount: claims.length,
      productId
    });

    // 仮実装: 各主張に対してダミー結果を返す
    return Promise.all(
      claims.map(claim => this.searchEvidence(claim, productId))
    );
  }
}

/**
 * Geminiクライアントインスタンスを作成
 */
export function createGeminiClient(): GeminiClient {
  const apiKey = process.env.GEMINI_API_KEY || '';

  if (!apiKey) {
    console.warn('GEMINI_API_KEY is not set');
  }

  return new GeminiClient({ apiKey });
}
