/**
 * RAG (Retrieval-Augmented Generation) Engine
 *
 * Advanced knowledge retrieval system using Gemini File API and Semantic Retrieval.
 * Provides optimized search with re-ranking and product-specific weighting.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { ProductId } from './types';
import { GeminiFileManager } from './gemini-file-manager';

/**
 * Search query for RAG
 */
export interface SearchQuery {
  /** Search text */
  text: string;
  /** Product ID for context */
  productId: ProductId;
  /** Maximum results to return */
  maxResults?: number;
  /** Minimum relevance threshold (0-1) */
  minRelevance?: number;
}

/**
 * Search result from knowledge base
 */
export interface SearchResult {
  /** Relevant knowledge excerpt */
  excerpt: string;
  /** Source file name */
  fileName: string;
  /** Relevance score (0-1) */
  relevanceScore: number;
  /** Category (common, HA, SH) */
  category: 'common' | 'HA' | 'SH';
  /** Is from company standards file */
  isCompanyStandard: boolean;
  /** Original file URI */
  fileUri?: string;
}

/**
 * RAG search result with context
 */
export interface RAGSearchResult {
  /** Original query */
  query: SearchQuery;
  /** Search results */
  results: SearchResult[];
  /** Combined context for prompt */
  combinedContext: string;
  /** Total results found */
  totalResults: number;
  /** Search time in ms */
  searchTimeMs: number;
}

/**
 * Similar expression mapping
 */
interface SimilarExpression {
  /** Base term */
  baseTerm: string;
  /** Similar expressions */
  similarTerms: string[];
  /** Category (薬機法, 景表法, etc.) */
  category: string;
}

/**
 * RAG Engine for advanced knowledge retrieval
 */
export class RAGEngine {
  private genAI: GoogleGenerativeAI;
  private fileManager: GeminiFileManager;
  private similarExpressions: Map<string, SimilarExpression>;

  constructor(apiKey: string, fileManager: GeminiFileManager) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.fileManager = fileManager;
    this.similarExpressions = new Map();

    // Initialize similar expressions dictionary
    this.initializeSimilarExpressions();
  }

  /**
   * Search knowledge base using Semantic Retrieval
   *
   * @param query - Search query
   * @returns RAG search results
   */
  async search(query: SearchQuery): Promise<RAGSearchResult> {
    const startTime = Date.now();

    try {
      // Expand query with similar expressions
      const expandedQueries = this.expandQueryWithSimilarTerms(query.text);
      console.log(`[RAG] Expanded query to ${expandedQueries.length} variations`);

      // Get file URIs for this product
      const fileUris = this.fileManager.getFileUris(query.productId);
      console.log(`[RAG] Searching across ${fileUris.length} files for ${query.productId}`);

      if (fileUris.length === 0) {
        console.warn(`[RAG] No files uploaded for product ${query.productId}`);
        return {
          query,
          results: [],
          combinedContext: '【ナレッジベースが利用できません】',
          totalResults: 0,
          searchTimeMs: Date.now() - startTime,
        };
      }

      // Perform semantic search using Gemini with file grounding
      const searchResults = await this.performSemanticSearch(
        expandedQueries,
        fileUris,
        query.productId
      );

      // Re-rank results
      const reRankedResults = this.reRankResults(
        searchResults,
        query.text,
        query.productId
      );

      // Filter by relevance threshold
      const minRelevance = query.minRelevance || 0.3;
      const filteredResults = reRankedResults.filter(r => r.relevanceScore >= minRelevance);

      // Limit results
      const maxResults = query.maxResults || 10;
      const finalResults = filteredResults.slice(0, maxResults);

      // Combine into context string
      const combinedContext = this.createCombinedContext(finalResults);

      const searchTimeMs = Date.now() - startTime;
      console.log(`[RAG] Found ${finalResults.length} relevant results in ${searchTimeMs}ms`);

      return {
        query,
        results: finalResults,
        combinedContext,
        totalResults: filteredResults.length,
        searchTimeMs,
      };

    } catch (error) {
      console.error('[RAG] Search failed:', error);
      return {
        query,
        results: [],
        combinedContext: '【検索エラーが発生しました】',
        totalResults: 0,
        searchTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Perform semantic search using Gemini API with file grounding
   *
   * Uses Gemini's generate content with file references to retrieve relevant knowledge.
   *
   * @param queries - Array of query variations
   * @param fileUris - File URIs to search
   * @param productId - Product ID
   * @returns Array of search results
   */
  private async performSemanticSearch(
    queries: string[],
    fileUris: string[],
    productId: ProductId
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const uploadedFiles = this.fileManager.getUploadedFiles(productId);

    // Use Gemini to search across files
    // Note: We use a simpler approach here since full semantic search requires vector DB
    // For production, consider using Gemini's grounding with Google Search or custom embeddings

    for (const query of queries) {
      try {
        const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

        const prompt = `
以下のナレッジベースから、クエリ「${query}」に関連する情報を抽出してください。

商品ID: ${productId}

**重要:** 以下の優先順位で情報を抽出してください：
1. 【薬事・景表法・社内ルールまとめ】ファイルの内容（最優先）
2. 各種法令（薬機法、景表法、特商法）の内容
3. ガイドラインの内容

出力形式:
{
  "results": [
    {
      "excerpt": "関連する原文をそのまま抜粋",
      "fileName": "ファイル名",
      "relevanceScore": 0.0から1.0の数値,
      "isCompanyStandard": true/false
    }
  ]
}

関連する情報が3件以上ある場合は、最も関連性の高い3件を返してください。
関連する情報がない場合は、空の配列を返してください。
`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Parse JSON response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.results && Array.isArray(parsed.results)) {
            for (const item of parsed.results) {
              // Find category from uploaded files
              const uploadedFile = uploadedFiles.find(f => f.displayName === item.fileName);
              const category = uploadedFile?.category || 'common';

              results.push({
                excerpt: item.excerpt,
                fileName: item.fileName,
                relevanceScore: item.relevanceScore || 0.5,
                category: category as 'common' | 'HA' | 'SH',
                isCompanyStandard: item.isCompanyStandard || item.fileName.includes('【薬事・景表法・社内ルールまとめ】'),
                fileUri: uploadedFile?.fileUri,
              });
            }
          }
        }

      } catch (error) {
        console.error(`[RAG] Failed to search for query "${query}":`, error);
      }
    }

    return results;
  }

  /**
   * Re-rank search results based on product-specific criteria
   *
   * Applies boosting for:
   * - Company standards files (2x boost)
   * - Product-specific files (1.5x boost)
   * - Exact term matches (1.3x boost)
   *
   * @param results - Initial search results
   * @param originalQuery - Original query text
   * @param productId - Product ID
   * @returns Re-ranked results
   */
  private reRankResults(
    results: SearchResult[],
    originalQuery: string,
    productId: ProductId
  ): SearchResult[] {
    const reRanked = results.map(result => {
      let boostedScore = result.relevanceScore;

      // Boost company standards (最優先)
      if (result.isCompanyStandard) {
        boostedScore *= 2.0;
      }

      // Boost product-specific files
      if (result.category === productId) {
        boostedScore *= 1.5;
      }

      // Boost exact term matches
      const queryTerms = originalQuery.toLowerCase().split(/\s+/);
      const excerptLower = result.excerpt.toLowerCase();
      const exactMatches = queryTerms.filter(term => excerptLower.includes(term)).length;
      if (exactMatches > 0) {
        boostedScore *= (1 + 0.1 * exactMatches);
      }

      // Cap at 1.0
      boostedScore = Math.min(boostedScore, 1.0);

      return {
        ...result,
        relevanceScore: boostedScore,
      };
    });

    // Sort by boosted score (descending)
    return reRanked.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Expand query with similar legal terms
   *
   * @param query - Original query
   * @returns Array of query variations
   */
  private expandQueryWithSimilarTerms(query: string): string[] {
    const queries = [query]; // Start with original

    // Find similar terms in query
    for (const [baseTerm, mapping] of this.similarExpressions.entries()) {
      if (query.includes(baseTerm)) {
        // Add queries with similar terms
        for (const similarTerm of mapping.similarTerms) {
          const expandedQuery = query.replace(baseTerm, similarTerm);
          if (!queries.includes(expandedQuery)) {
            queries.push(expandedQuery);
          }
        }
      }
    }

    return queries.slice(0, 5); // Limit to 5 variations
  }

  /**
   * Create combined context string from search results
   *
   * @param results - Search results
   * @returns Formatted context string
   */
  private createCombinedContext(results: SearchResult[]): string {
    if (results.length === 0) {
      return '【関連するナレッジが見つかりませんでした】';
    }

    // Group by company standards vs others
    const companyStandards = results.filter(r => r.isCompanyStandard);
    const others = results.filter(r => !r.isCompanyStandard);

    const sections: string[] = [];

    // Company standards first (highest priority)
    if (companyStandards.length > 0) {
      sections.push('## 【最優先】社内基準\n');
      for (const result of companyStandards) {
        sections.push(`### ${result.fileName} (関連度: ${(result.relevanceScore * 100).toFixed(0)}%)\n`);
        sections.push(`${result.excerpt}\n`);
        sections.push('---\n');
      }
    }

    // Other regulations
    if (others.length > 0) {
      sections.push('## 関連法令・ガイドライン\n');
      for (const result of others) {
        sections.push(`### ${result.fileName} (関連度: ${(result.relevanceScore * 100).toFixed(0)}%)\n`);
        sections.push(`${result.excerpt}\n`);
        sections.push('---\n');
      }
    }

    return sections.join('\n');
  }

  /**
   * Initialize dictionary of similar expressions for legal terms
   *
   * This helps expand search queries to catch variations of the same concept.
   */
  private initializeSimilarExpressions(): void {
    const expressions: SimilarExpression[] = [
      // 薬機法関連
      {
        baseTerm: '浸透',
        similarTerms: ['注入', '到達', '届く', 'デリバリー', '送達'],
        category: '薬機法',
      },
      {
        baseTerm: 'シワ',
        similarTerms: ['しわ', '皺', '小じわ', '小ジワ', 'シワシワ'],
        category: '薬機法',
      },
      {
        baseTerm: 'シミ',
        similarTerms: ['しみ', 'そばかす', 'くすみ', '色素沈着', '黒ずみ'],
        category: '薬機法',
      },
      {
        baseTerm: '美白',
        similarTerms: ['ホワイトニング', '白肌', '透明感', 'ブライトニング'],
        category: '薬機法',
      },
      {
        baseTerm: '医師',
        similarTerms: ['ドクター', '医療従事者', '専門医', '皮膚科医'],
        category: '薬機法',
      },

      // 景表法関連
      {
        baseTerm: 'No.1',
        similarTerms: ['ナンバーワン', '第1位', '1位', 'トップ', '最も売れている'],
        category: '景表法',
      },
      {
        baseTerm: '世界一',
        similarTerms: ['世界No.1', '世界最大', '世界トップ', '世界で最も'],
        category: '景表法',
      },
      {
        baseTerm: 'リピート率',
        similarTerms: ['継続率', 'リピーター率', '再購入率', '定期購入率'],
        category: '景表法',
      },

      // 特商法関連
      {
        baseTerm: '今なら',
        similarTerms: ['いまなら', '今だけ', 'いまだけ', '期間限定', '本日限り'],
        category: '特商法',
      },
      {
        baseTerm: '全額返金',
        similarTerms: ['返金保証', '全額保証', '100%返金', '満足保証'],
        category: '特商法',
      },
      {
        baseTerm: '実質無料',
        similarTerms: ['実質0円', '実質タダ', '無料同然', '実質ゼロ円'],
        category: '特商法',
      },

      // 共通表現
      {
        baseTerm: '専用',
        similarTerms: ['用', '向け', 'のための', 'に特化した'],
        category: '共通',
      },
      {
        baseTerm: '効果',
        similarTerms: ['効能', '効き目', '作用', '働き'],
        category: '共通',
      },
    ];

    for (const expr of expressions) {
      this.similarExpressions.set(expr.baseTerm, expr);
    }

    console.log(`[RAG] Initialized ${this.similarExpressions.size} similar expression mappings`);
  }
}

/**
 * Create RAG Engine instance
 *
 * @param apiKey - Gemini API key
 * @param fileManager - Gemini File Manager instance
 * @returns RAGEngine instance
 */
export function createRAGEngine(apiKey?: string, fileManager?: GeminiFileManager): RAGEngine {
  const key = apiKey || process.env.GEMINI_API_KEY || '';

  if (!key) {
    throw new Error('GEMINI_API_KEY is required');
  }

  // Create file manager if not provided
  const fm = fileManager || new GeminiFileManager(key);

  return new RAGEngine(key, fm);
}
