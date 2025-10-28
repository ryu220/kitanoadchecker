/**
 * RAG Search Test API
 * RAG検索のデバッグ・診断用エンドポイント
 */

import { NextRequest, NextResponse } from 'next/server';
import { createEmbeddingService } from '@/lib/embedding-service';
import { createChromaVectorDB } from '@/lib/vector-db/chroma-db';
import { createRAGSearchService } from '@/lib/rag-search';
import { ProductId } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TestRAGRequest {
  segmentText: string;
  apiKey: string;
  topK?: number;
  minSimilarity?: number;
  productId?: string;
}

/**
 * POST /api/v2/test-rag-search
 * RAG検索のテスト用エンドポイント
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TestRAGRequest;
    const { segmentText, apiKey, topK = 20, minSimilarity = 0.3, productId } = body;

    if (!segmentText) {
      return NextResponse.json(
        { error: 'segmentText is required' },
        { status: 400 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'apiKey is required' },
        { status: 400 }
      );
    }

    console.log('[Test RAG Search] ='.repeat(40));
    console.log(`[Test RAG Search] Query: "${segmentText}"`);
    console.log(`[Test RAG Search] topK: ${topK}, minSimilarity: ${minSimilarity}`);
    console.log('[Test RAG Search] ='.repeat(40));

    // RAG検索実行
    const embeddingService = createEmbeddingService(apiKey);
    const vectorDB = createChromaVectorDB({
      url: process.env.CHROMA_URL || 'http://localhost:8000',
    });
    await vectorDB.connect();

    const ragSearch = createRAGSearchService(embeddingService, vectorDB);

    const searchResult = await ragSearch.search(segmentText, {
      topK,
      minSimilarity,
      productId: productId as ProductId | undefined,
      debug: true,
    });

    console.log(`[Test RAG Search] Found ${searchResult.searchResults.length} results`);
    console.log('[Test RAG Search] Top 5 results:');
    searchResult.searchResults.slice(0, 5).forEach((item, idx) => {
      console.log(`  ${idx + 1}. Score: ${item.score.toFixed(4)} | ${item.metadata?.filename || 'Unknown'}`);
      console.log(`     Text: ${item.text.substring(0, 80)}...`);
    });

    return NextResponse.json({
      success: true,
      query: segmentText,
      options: { topK, minSimilarity, productId },
      totalResults: searchResult.searchResults.length,
      results: searchResult.searchResults.map(item => ({
        text: item.text,
        score: item.score,
        metadata: item.metadata,
      })),
      relevantKnowledge: searchResult.relevantKnowledge,
      debugInfo: searchResult.debugInfo,
    });
  } catch (error) {
    console.error('[Test RAG Search] Error:', error);
    return NextResponse.json(
      {
        error: 'RAG search failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
