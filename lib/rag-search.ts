/**
 * RAG Search Service
 *
 * セマンティック検索とコンテキスト生成
 * Vector DBから関連ナレッジを検索して、評価用のコンテキストを生成
 */

import { TaskType } from '@google/generative-ai';
import { EmbeddingService } from './embedding-service';
import { IVectorDB, SearchResult, SearchOptions } from './vector-db/interface';
import { ProductId } from './types';

/**
 * RAG検索オプション
 */
export interface RAGSearchOptions {
  /** 取得する結果数（default: 20） */
  topK?: number;

  /** 最小類似度スコア（default: 0.5） */
  minSimilarity?: number;

  /** 商品IDフィルター */
  productId?: ProductId;

  /** デバッグ情報を含める（default: false） */
  debug?: boolean;
}

/**
 * RAG検索結果
 */
export interface RAGSearchResult {
  /** 評価用の関連ナレッジテキスト（フォーマット済み） */
  relevantKnowledge: string;

  /** 検索結果の詳細 */
  searchResults: SearchResult[];

  /** デバッグ情報 */
  debugInfo?: {
    /** クエリembedding（最初の10次元のみ） */
    queryEmbeddingPreview: number[];

    /** 検索にかかった時間（ms） */
    searchTimeMs: number;

    /** トップ結果のスコアとテキスト */
    topResults: Array<{
      score: number;
      text: string;
      metadata: SearchResult['metadata'];
    }>;
  };
}

/**
 * RAG Search Service
 *
 * セマンティック検索により、セグメントに関連するナレッジを取得
 *
 * @example
 * const ragService = new RAGSearchService(embeddingService, vectorDB);
 *
 * const result = await ragService.search(
 *   "まるで針が刺さるような感覚",
 *   { topK: 20, productId: 'HA' }
 * );
 *
 * // result.relevantKnowledge を Gemini に送信
 */
export class RAGSearchService {
  constructor(
    private embeddingService: EmbeddingService,
    private vectorDB: IVectorDB
  ) {}

  /**
   * セグメントに関連するナレッジを検索
   *
   * Issue #32: Priority-based cascading search
   * 1. P1（会社基準）を優先検索
   * 2. 結果不足ならP2（法律）まで拡大
   * 3. それでも不足ならP3（ガイドライン）まで拡大
   *
   * @param segmentText - 評価対象のセグメントテキスト
   * @param options - 検索オプション
   * @returns RAG検索結果
   *
   * @example
   * const result = await ragService.search(
   *   "肌の奥深くまで染み込む",
   *   { topK: 20, minSimilarity: 0.5, productId: 'HA' }
   * );
   */
  async search(
    segmentText: string,
    options: RAGSearchOptions = {}
  ): Promise<RAGSearchResult> {
    const startTime = Date.now();

    const topK = options.topK || 20;
    const minSimilarity = options.minSimilarity || 0.3; // Lowered from 0.5 to 0.3 for better recall
    const debug = options.debug || false;

    console.log(`[RAG Search] Searching for segment: "${segmentText.substring(0, 50)}..."`);
    console.log(`[RAG Search] Options: topK=${topK}, minSimilarity=${minSimilarity}, productId=${options.productId || 'all'}`);

    try {
      // Step 1: セグメントのembedding生成
      console.log('[RAG Search] Generating query embedding...');
      const embeddingResult = await this.embeddingService.embed(
        segmentText,
        TaskType.RETRIEVAL_QUERY // クエリ用embedding
      );

      console.log(`[RAG Search] Query embedding generated (${embeddingResult.embedding.length} dims)`);

      // Step 2: Product-specific prioritized search (Issue #35)
      console.log('[RAG Search] Starting product-specific prioritized search...');

      // Search strategy:
      // 1. First search product-specific knowledge (category=productId)
      // 2. Then search common knowledge (category=common)
      // 3. Merge results with product-specific taking priority

      const productSpecificResults = options.productId
        ? await this.priorityBasedSearch(
            embeddingResult.embedding,
            {
              topK,
              minScore: minSimilarity,
              filter: { category: options.productId }, // Product-specific only
            }
          )
        : [];

      console.log(`[RAG Search] Product-specific search: ${productSpecificResults.length} results`);

      // Common knowledge search (always included)
      const commonResults = await this.priorityBasedSearch(
        embeddingResult.embedding,
        {
          topK,
          minScore: minSimilarity,
          filter: { category: 'common' }, // Common knowledge only
        }
      );

      console.log(`[RAG Search] Common knowledge search: ${commonResults.length} results`);

      // Merge results: product-specific first, then common
      const searchResults = [...productSpecificResults, ...commonResults];

      console.log(`[RAG Search] Found ${searchResults.length} relevant knowledge chunks`);

      // Step 3: 検索結果をフォーマット
      const relevantKnowledge = this.formatSearchResults(searchResults);

      const searchTimeMs = Date.now() - startTime;
      console.log(`[RAG Search] ✅ Search completed in ${searchTimeMs}ms`);

      // デバッグ情報
      const debugInfo = debug ? {
        queryEmbeddingPreview: embeddingResult.embedding.slice(0, 10),
        searchTimeMs,
        topResults: searchResults.slice(0, 5).map(r => ({
          score: r.score,
          text: r.text.substring(0, 100) + '...',
          metadata: r.metadata,
        })),
      } : undefined;

      return {
        relevantKnowledge,
        searchResults,
        debugInfo,
      };
    } catch (error) {
      console.error('[RAG Search] Search failed:', error);
      throw new Error(
        `RAG search failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Priority-based cascading search (Issue #32)
   *
   * 優先度ベースのカスケード検索:
   * 1. P1 (company_standard) を優先検索
   * 2. 十分な結果がなければ P2 (law) まで拡大
   * 3. それでも不足なら P3 (guideline) まで拡大
   *
   * @param embedding - Query embedding vector
   * @param options - Search options
   * @returns Search results sorted by priority then score
   */
  private async priorityBasedSearch(
    embedding: number[],
    options: {
      topK: number;
      minScore: number;
      filter?: SearchOptions['filter'];
    }
  ): Promise<SearchResult[]> {
    const { topK, minScore, filter } = options;
    const allResults: SearchResult[] = [];

    // Priority 1: Company Standards (会社基準)
    console.log('[RAG Search] [P1] Searching company standards (priority=1)...');
    const p1Filter = filter
      ? { $and: [filter, { priority: { $eq: 1 } }] }
      : { priority: { $eq: 1 } };
    console.log('[RAG Search] [P1] Filter object:', JSON.stringify(p1Filter));
    const p1Results = await this.vectorDB.search(embedding, {
      topK: topK * 2, // Get more to ensure enough after filtering
      minScore,
      filter: p1Filter as any,
    });
    console.log(`[RAG Search] [P1] Found ${p1Results.length} results`);
    allResults.push(...p1Results);

    // Check if we have enough results
    if (allResults.length >= topK) {
      console.log(`[RAG Search] ✅ P1 search sufficient (${allResults.length} >= ${topK})`);
      return this.sortAndLimitResults(allResults, topK);
    }

    // Priority 2: Laws (法律) - Expand search
    console.log(`[RAG Search] [P2] P1 insufficient (${allResults.length} < ${topK}), expanding to laws (priority=2)...`);
    const p2Filter = filter
      ? { $and: [filter, { priority: { $eq: 2 } }] }
      : { priority: { $eq: 2 } };
    const p2Results = await this.vectorDB.search(embedding, {
      topK: topK * 2,
      minScore,
      filter: p2Filter as any,
    });
    console.log(`[RAG Search] [P2] Found ${p2Results.length} results`);
    allResults.push(...p2Results);

    // Check again
    if (allResults.length >= topK) {
      console.log(`[RAG Search] ✅ P1+P2 search sufficient (${allResults.length} >= ${topK})`);
      return this.sortAndLimitResults(allResults, topK);
    }

    // Priority 3: Guidelines (ガイドライン) - Expand further
    console.log(`[RAG Search] [P3] P1+P2 insufficient (${allResults.length} < ${topK}), expanding to guidelines (priority=3)...`);
    const p3Filter = filter
      ? { $and: [filter, { priority: { $eq: 3 } }] }
      : { priority: { $eq: 3 } };
    const p3Results = await this.vectorDB.search(embedding, {
      topK: topK * 2,
      minScore,
      filter: p3Filter as any,
    });
    console.log(`[RAG Search] [P3] Found ${p3Results.length} results`);
    allResults.push(...p3Results);

    console.log(`[RAG Search] ✅ Total results across all priorities: ${allResults.length}`);
    return this.sortAndLimitResults(allResults, topK);
  }

  /**
   * Sort results by priority (ascending) then score (descending), and limit to topK
   */
  private sortAndLimitResults(results: SearchResult[], topK: number): SearchResult[] {
    // Remove duplicates (same ID)
    const uniqueResults = Array.from(
      new Map(results.map(r => [r.id, r])).values()
    );

    // Sort: priority ascending (1 > 2 > 3), then score descending
    uniqueResults.sort((a, b) => {
      const priorityA = (a.metadata.priority as number) || 999;
      const priorityB = (b.metadata.priority as number) || 999;

      if (priorityA !== priorityB) {
        return priorityA - priorityB; // Lower priority number = higher importance
      }

      return b.score - a.score; // Higher score = more relevant
    });

    return uniqueResults.slice(0, topK);
  }

  /**
   * 複数セグメントをバッチ検索
   *
   * バッチ評価API用に、複数セグメントのナレッジを一度に検索
   *
   * @param segmentTexts - セグメントテキスト配列
   * @param options - 検索オプション
   * @returns RAG検索結果
   *
   * @example
   * const result = await ragService.searchBatch(
   *   ["セグメント1", "セグメント2"],
   *   { topK: 30, productId: 'HA' }
   * );
   */
  async searchBatch(
    segmentTexts: string[],
    options: RAGSearchOptions = {}
  ): Promise<RAGSearchResult> {
    console.log(`[RAG Search] Batch searching for ${segmentTexts.length} segments...`);

    // 全セグメントを結合して検索
    // より高度なアプローチ: 各セグメントを個別に検索してマージ
    const combinedText = segmentTexts.join('\n');

    return this.search(combinedText, {
      ...options,
      topK: (options.topK || 20) * segmentTexts.length, // セグメント数に応じてtopKを増やす
    });
  }

  /**
   * 検索結果をGemini評価用にフォーマット
   *
   * Issue #32: Display priority, legal domain, and knowledge type
   *
   * @param searchResults - Vector DB検索結果（既に優先度順にソート済み）
   * @returns フォーマット済みナレッジテキスト
   */
  private formatSearchResults(searchResults: SearchResult[]): string {
    if (searchResults.length === 0) {
      return `
# 広告法務ナレッジベース（検索結果なし）

このセグメントに直接関連する特定のルールは検索されませんでしたが、
一般的な薬機法・景表法・特商法の規定に基づいて評価してください。

**重要**: 以下の基本原則に従ってください：
- 医療行為を想起させる表現は禁止
- 化粧品の効能効果の範囲（56項目）を超える表現は禁止
- 根拠のない効果表現は禁止
- 注釈が必要なキーワード（浸透、注入等）には必ず注釈を付けること
`.trim();
    }

    // Results are already sorted by priority (1 > 2 > 3) then score

    // Group by priority for display
    const p1Results = searchResults.filter(r => r.metadata.priority === 1);
    const p2Results = searchResults.filter(r => r.metadata.priority === 2);
    const p3Results = searchResults.filter(r => r.metadata.priority === 3);

    console.log(`[RAG Format] P1=${p1Results.length}, P2=${p2Results.length}, P3=${p3Results.length}`);

    // ナレッジセクションを生成
    const sections = searchResults.map((result, index) => {
      const metadata = result.metadata;
      const priority = metadata.priority || 99;
      const priorityLabel = priority === 1 ? '【P1: 会社基準】' : priority === 2 ? '【P2: 法律】' : '【P3: ガイドライン】';
      const score = `類似度: ${(result.score * 100).toFixed(1)}%`;

      // Knowledge type display
      const knowledgeTypeMap = {
        company_standard: '社内基準',
        law: '法律',
        government_guideline: '政府ガイドライン',
        industry_guideline: '業界ガイドライン',
      };
      const knowledgeType = knowledgeTypeMap[metadata.knowledgeType as keyof typeof knowledgeTypeMap] || '一般';

      return `
## ${priorityLabel} ナレッジ ${index + 1}

**ソース**: ${metadata.fileName}
**カテゴリ**: ${metadata.category}
**法域**: ${metadata.legalDomain || '共通'}
**種別**: ${knowledgeType}
**${score}**

${result.text}

---
`;
    });

    return `
# 広告法務ナレッジベース（RAG検索結果）

以下は、評価対象セグメントに**意味的に関連する**ナレッジです。
**優先度（P1 > P2 > P3）と類似度スコア**に基づいてソートされています。

**検索結果数**: ${searchResults.length}件（P1: ${p1Results.length}件、P2: ${p2Results.length}件、P3: ${p3Results.length}件）
**評価方法**: 以下のナレッジを参照して、セグメントが規定に適合しているか判定してください。

---

${sections.join('\n')}

## 評価時の注意事項

1. **優先順位**: P1（会社基準）> P2（法律）> P3（ガイドライン）の順で参照
2. **会社基準優先**: P1の会社基準は最も厳格。P2/P3よりも優先して適用
3. **類似度**: スコアが高いほど、セグメントに関連性が高い
4. **複数ルール**: 複数のルールに該当する場合は、最も厳しいルールを適用
5. **注釈**: 注釈が必要なキーワードには必ず注釈マーカーを確認

## 法域の説明

- **薬機法**: 医薬品、医療機器等の品質、有効性及び安全性の確保等に関する法律
- **景表法**: 不当景品類及び不当表示防止法
- **特商法**: 特定商取引に関する法律
`.trim();
  }
}

/**
 * RAGSearchServiceのファクトリ関数
 *
 * @param embeddingService - Embedding service
 * @param vectorDB - Vector DB
 * @returns RAGSearchService instance
 */
export function createRAGSearchService(
  embeddingService: EmbeddingService,
  vectorDB: IVectorDB
): RAGSearchService {
  return new RAGSearchService(embeddingService, vectorDB);
}
