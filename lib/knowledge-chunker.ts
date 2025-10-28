/**
 * Knowledge Chunker
 * ナレッジベースを適切なチャンクに分割
 */

export interface Chunk {
  id: string;
  text: string;
  metadata: {
    fileName: string;
    category: string;
    productId?: string;
    chunkIndex: number;
    totalChunks: number;
    // Priority metadata (added for Issue #32)
    priority?: 1 | 2 | 3;
    legalDomain?: '薬機法' | '景表法' | '特商法';
    knowledgeType?: 'company_standard' | 'law' | 'government_guideline' | 'industry_guideline';
  };
}

export class KnowledgeChunker {
  private readonly maxChunkSize = 800; // tokens (approx 1600 chars)
  private readonly minChunkSize = 300; // tokens (approx 600 chars)
  private readonly overlap = 100; // tokens (approx 200 chars)

  /**
   * ナレッジファイルをチャンク分割
   */
  chunk(content: string, metadata: any): Chunk[] {
    // ルール単位で分割（見出し「##」「###」で判定）
    const rules = this.splitByHeaders(content);

    const chunks: Chunk[] = [];

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];

      // 推定トークン数（文字数 / 2）
      const estimatedTokens = rule.length / 2;

      if (estimatedTokens > this.maxChunkSize) {
        // 大きすぎる場合は分割
        const subChunks = this.splitLargeRule(rule);
        for (let j = 0; j < subChunks.length; j++) {
          chunks.push({
            id: `${metadata.productId || 'common'}-${metadata.fileName}-${i}-${j}`,
            text: subChunks[j],
            metadata: {
              fileName: metadata.fileName,
              category: metadata.category,
              productId: metadata.productId,
              chunkIndex: chunks.length,
              totalChunks: 0, // 後で更新
              priority: metadata.priority,
              legalDomain: metadata.legalDomain,
              knowledgeType: metadata.knowledgeType,
            },
          });
        }
      } else if (estimatedTokens >= this.minChunkSize) {
        // 適切なサイズ
        chunks.push({
          id: `${metadata.productId || 'common'}-${metadata.fileName}-${i}`,
          text: rule,
          metadata: {
            fileName: metadata.fileName,
            category: metadata.category,
            productId: metadata.productId,
            chunkIndex: chunks.length,
            totalChunks: 0,
            priority: metadata.priority,
            legalDomain: metadata.legalDomain,
            knowledgeType: metadata.knowledgeType,
          },
        });
      } else {
        // 小さすぎる場合は前のチャンクと結合
        if (chunks.length > 0) {
          const lastChunk = chunks[chunks.length - 1];
          lastChunk.text += '\n\n' + rule;
        } else {
          // 最初のチャンクの場合はそのまま追加
          chunks.push({
            id: `${metadata.productId || 'common'}-${metadata.fileName}-${i}`,
            text: rule,
            metadata: {
              fileName: metadata.fileName,
              category: metadata.category,
              productId: metadata.productId,
              chunkIndex: 0,
              totalChunks: 0,
              priority: metadata.priority,
              legalDomain: metadata.legalDomain,
              knowledgeType: metadata.knowledgeType,
            },
          });
        }
      }
    }

    // totalChunksを更新
    chunks.forEach((chunk) => {
      chunk.metadata.totalChunks = chunks.length;
    });

    return chunks;
  }

  /**
   * 見出しで分割
   */
  private splitByHeaders(content: string): string[] {
    const lines = content.split('\n');
    const rules: string[] = [];
    let currentRule: string[] = [];

    for (const line of lines) {
      // 見出し（## または ###）で分割
      if ((line.startsWith('##') || line.startsWith('###')) && currentRule.length > 0) {
        rules.push(currentRule.join('\n').trim());
        currentRule = [line];
      } else {
        currentRule.push(line);
      }
    }

    // 最後のルールを追加
    if (currentRule.length > 0) {
      rules.push(currentRule.join('\n').trim());
    }

    // 空のルールを除外
    return rules.filter(rule => rule.length > 0);
  }

  /**
   * 大きすぎるルールを分割
   */
  private splitLargeRule(rule: string): string[] {
    // 文で分割（。、！、？で終わる）
    const sentences = rule.match(/[^。！？]+[。！？]/g) || [rule];
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      const estimatedTokens = (currentChunk.length + sentence.length) / 2;

      if (estimatedTokens > this.maxChunkSize) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          // オーバーラップを追加（前のチャンクの最後の部分）
          const overlapText = this.getOverlapText(currentChunk);
          currentChunk = overlapText + sentence;
        } else {
          // 1文が maxChunkSize を超える場合はそのまま追加
          chunks.push(sentence.trim());
        }
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [rule];
  }

  /**
   * オーバーラップ用のテキストを取得
   */
  private getOverlapText(text: string): string {
    const overlapChars = this.overlap * 2; // tokens → chars
    if (text.length <= overlapChars) {
      return text;
    }

    // 最後のoverlapChars文字を取得（ただし、文の途中にならないように）
    const overlapCandidate = text.slice(-overlapChars);
    const lastSentenceEnd = Math.max(
      overlapCandidate.lastIndexOf('。'),
      overlapCandidate.lastIndexOf('！'),
      overlapCandidate.lastIndexOf('？')
    );

    if (lastSentenceEnd >= 0) {
      return overlapCandidate.slice(lastSentenceEnd + 1);
    }

    return overlapCandidate;
  }
}

/**
 * Factory function
 */
export function createKnowledgeChunker(): KnowledgeChunker {
  return new KnowledgeChunker();
}
