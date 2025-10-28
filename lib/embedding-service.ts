/**
 * Gemini Embedding Service
 *
 * gemini-embedding-001を使用してテキストをベクトル化するサービス
 * RAGシステムの基盤コンポーネント
 */

import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';

/**
 * Embedding生成結果
 */
export interface EmbeddingResult {
  embedding: number[];
  textLength: number;
  model: string;
}

/**
 * Batch Embedding生成結果
 */
export interface BatchEmbeddingResult {
  embeddings: number[][];
  totalTexts: number;
  model: string;
}

/**
 * EmbeddingServiceの設定
 */
export interface EmbeddingServiceConfig {
  apiKey: string;
  model?: string; // Default: 'embedding-001'
  taskType?: TaskType;
}

/**
 * Gemini Embedding Service
 *
 * テキストをベクトル化してセマンティック検索を可能にする
 *
 * @example
 * const service = new EmbeddingService({ apiKey: 'xxx' });
 * const result = await service.embed('注入表現について');
 * // result.embedding: [0.123, -0.456, ...] (768次元)
 */
export class EmbeddingService {
  private genAI: GoogleGenerativeAI;
  private model: string;
  private taskType: TaskType;

  constructor(config: EmbeddingServiceConfig) {
    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.model = config.model || 'embedding-001';
    this.taskType = config.taskType || TaskType.RETRIEVAL_DOCUMENT;
  }

  /**
   * 単一テキストのembedding生成
   *
   * @param text - ベクトル化するテキスト
   * @param taskType - タスクタイプ（省略時はコンストラクタで指定した値）
   * @returns Embedding結果（768次元ベクトル）
   *
   * @example
   * // ドキュメントのembedding（Vector DBに保存用）
   * const docEmbedding = await service.embed(
   *   '浸透は角質層までに限定すること',
   *   'RETRIEVAL_DOCUMENT'
   * );
   *
   * @example
   * // クエリのembedding（検索用）
   * const queryEmbedding = await service.embed(
   *   '肌の奥まで染み込む',
   *   'RETRIEVAL_QUERY'
   * );
   */
  async embed(
    text: string,
    taskType?: TaskType
  ): Promise<EmbeddingResult> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: this.model });

      const result = await model.embedContent({
        content: { role: 'user', parts: [{ text }] },
        taskType: taskType || this.taskType,
      });

      const embedding = result.embedding.values;

      if (!embedding || embedding.length === 0) {
        throw new Error('Embedding generation failed: empty result');
      }

      return {
        embedding,
        textLength: text.length,
        model: this.model,
      };
    } catch (error) {
      console.error('[EmbeddingService] Error generating embedding:', error);
      throw new Error(
        `Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 複数テキストのembedding生成（バッチ処理）
   *
   * API効率化のため、可能な限りバッチ処理を使用すること
   *
   * @param texts - ベクトル化するテキスト配列
   * @param taskType - タスクタイプ（省略時はコンストラクタで指定した値）
   * @returns Batch embedding結果
   *
   * @example
   * const texts = [
   *   '浸透は角質層までに限定すること',
   *   '注入表現は医療行為を想起させる',
   *   'クマ表現は効能効果範囲外'
   * ];
   * const result = await service.embedBatch(texts);
   * // result.embeddings: [[0.1, ...], [0.2, ...], [0.3, ...]]
   */
  async embedBatch(
    texts: string[],
    taskType?: TaskType
  ): Promise<BatchEmbeddingResult> {
    if (!texts || texts.length === 0) {
      throw new Error('Texts array cannot be empty');
    }

    // 空文字列をフィルタリング
    const validTexts = texts.filter(t => t && t.trim().length > 0);
    if (validTexts.length === 0) {
      throw new Error('No valid texts to embed');
    }

    console.log(`[EmbeddingService] Batch embedding ${validTexts.length} texts...`);

    try {
      // Sequential embedding (Gemini APIはbatch embedをネイティブサポートしていない可能性があるため)
      // 将来的にはbatch APIが利用可能になったら置き換える
      const embeddings: number[][] = [];

      for (let i = 0; i < validTexts.length; i++) {
        const text = validTexts[i];
        console.log(`[EmbeddingService] Embedding ${i + 1}/${validTexts.length}...`);

        const result = await this.embed(text, taskType);
        embeddings.push(result.embedding);

        // Rate limit対策: 100ms待機
        if (i < validTexts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`[EmbeddingService] ✅ Batch embedding complete: ${embeddings.length} embeddings`);

      return {
        embeddings,
        totalTexts: validTexts.length,
        model: this.model,
      };
    } catch (error) {
      console.error('[EmbeddingService] Error in batch embedding:', error);
      throw new Error(
        `Failed to generate batch embeddings: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Embedding次元数を取得
   * gemini-embedding-001は768次元
   */
  getEmbeddingDimension(): number {
    return 768;
  }

  /**
   * 使用中のモデル名を取得
   */
  getModelName(): string {
    return this.model;
  }
}

/**
 * EmbeddingServiceのファクトリ関数
 *
 * @param apiKey - Gemini APIキー
 * @returns EmbeddingService instance
 *
 * @example
 * const service = createEmbeddingService(process.env.GEMINI_API_KEY!);
 */
export function createEmbeddingService(apiKey: string): EmbeddingService {
  return new EmbeddingService({ apiKey });
}
