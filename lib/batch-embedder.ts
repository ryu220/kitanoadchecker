/**
 * Batch Embedder
 * Gemini Embedding APIのバッチ処理
 */

import { TaskType } from '@google/generative-ai';
import { EmbeddingService } from './embedding-service';

export class BatchEmbedder {
  constructor(private embeddingService: EmbeddingService) {}

  /**
   * テキストのバッチをembedding化
   * レート制限を考慮して順次処理
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    const batchSize = 10; // Gemini API制限を考慮
    const delayMs = 200; // レート制限対策

    console.log(`[BatchEmbedder] Processing ${texts.length} texts...`);

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(texts.length / batchSize);

      console.log(`[BatchEmbedder] Batch ${batchNum}/${totalBatches} (${batch.length} texts)`);

      // バッチ内のテキストを順次処理
      for (const text of batch) {
        try {
          const result = await this.embeddingService.embed(text, TaskType.RETRIEVAL_DOCUMENT);
          embeddings.push(result.embedding);

          // レート制限対策
          await this.delay(delayMs);
        } catch (error) {
          console.error(`[BatchEmbedder] Failed to embed text (length: ${text.length}):`, error);
          // エラー時は空のembeddingを返す（768次元の0ベクトル）
          embeddings.push(new Array(768).fill(0));
        }
      }
    }

    console.log(`[BatchEmbedder] Completed ${embeddings.length}/${texts.length} embeddings`);

    return embeddings;
  }

  /**
   * 遅延処理
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function
 */
export function createBatchEmbedder(embeddingService: EmbeddingService): BatchEmbedder {
  return new BatchEmbedder(embeddingService);
}
