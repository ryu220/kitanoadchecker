/**
 * Vector DB Setup Script
 *
 * ナレッジベース全体をembedding化してVector DBに保存
 *
 * Usage:
 *   npx ts-node scripts/setup-vector-db.ts
 *
 * Environment variables:
 *   GEMINI_API_KEY: Gemini APIキー（必須）
 *   CHROMA_URL: ChromaDB URL（default: http://localhost:8000）
 *   CLEAR_EXISTING: 既存データをクリア（default: false）
 */

import * as path from 'path';
import { TaskType } from '@google/generative-ai';
import { createKnowledgeLoaderForRAG } from '../lib/knowledge-loader-for-rag';
import { createKnowledgeChunker } from '../lib/knowledge-chunker';
import { createEmbeddingService } from '../lib/embedding-service';
import { createChromaVectorDB } from '../lib/vector-db/chroma-db';
import { VectorDBDocument } from '../lib/vector-db/interface';

async function setupVectorDB() {
  console.log('='.repeat(80));
  console.log('🚀 Vector DB Setup Started');
  console.log('='.repeat(80));
  console.log('');

  // Step 1: 環境変数チェック
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: GEMINI_API_KEY environment variable is required');
    process.exit(1);
  }

  const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';
  const clearExisting = process.env.CLEAR_EXISTING === 'true';

  console.log(`📌 Configuration:`);
  console.log(`   Gemini API Key: ${apiKey.substring(0, 10)}...`);
  console.log(`   ChromaDB URL: ${chromaUrl}`);
  console.log(`   Clear existing data: ${clearExisting}`);
  console.log('');

  // Step 2: サービス初期化
  console.log('📦 Initializing services...');

  const knowledgeLoader = createKnowledgeLoaderForRAG();
  const chunker = createKnowledgeChunker();
  const embeddingService = createEmbeddingService(apiKey);
  const vectorDB = createChromaVectorDB({
    url: chromaUrl,
    collectionName: 'ad_checker_knowledge',
  });

  console.log('✅ Services initialized (with Issue #32 priority metadata)');
  console.log('');

  try {
    // Step 3: Vector DBに接続
    console.log('🔌 Connecting to Vector DB...');
    await vectorDB.connect();

    // 既存データをクリア（オプション）
    if (clearExisting) {
      console.log('🗑️  Clearing existing data...');
      await vectorDB.clear();
      console.log('✅ Existing data cleared');
      console.log('');
    }

    // Step 4: ナレッジファイルを読み込み（Issue #32: priority metadata included）
    console.log('📚 Loading knowledge files with priority metadata...');

    const allFiles = await knowledgeLoader.loadAll();
    console.log(`✅ Loaded ${allFiles.length} files total`);
    console.log('');

    // チャンク分割（metadata including priority, legalDomain, knowledgeType）
    console.log('✂️  Chunking files...');
    const allChunks: Array<{
      chunk: ReturnType<typeof chunker.chunk>[0];
    }> = [];

    for (const file of allFiles) {
      // Pass full metadata to chunker (including priority, legalDomain, knowledgeType)
      const chunks = chunker.chunk(file.content, file.metadata);

      for (const chunk of chunks) {
        allChunks.push({ chunk });
      }
    }

    console.log('');
    console.log(`✅ Total chunks created: ${allChunks.length}`);
    console.log('');

    // Step 5: Embedding生成
    console.log('🧮 Generating embeddings...');
    console.log(`   This may take a few minutes for ${allChunks.length} chunks...`);
    console.log('');

    const documents: VectorDBDocument[] = [];
    let processedCount = 0;

    for (const { chunk } of allChunks) {
      try {
        // Embedding生成
        const embeddingResult = await embeddingService.embed(
          chunk.text,
          TaskType.RETRIEVAL_DOCUMENT
        );

        // VectorDBDocument形式に変換（Issue #32: includes priority metadata）
        documents.push({
          id: chunk.id,
          embedding: embeddingResult.embedding,
          text: chunk.text,
          metadata: chunk.metadata, // Includes: fileName, category, productId, priority, legalDomain, knowledgeType
        });

        processedCount++;

        // 進捗表示
        if (processedCount % 10 === 0) {
          const percent = Math.round((processedCount / allChunks.length) * 100);
          console.log(
            `   Progress: ${processedCount}/${allChunks.length} (${percent}%)`
          );
        }

        // Rate limit対策: 100ms待機
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`   ❌ Error processing chunk ${chunk.id}:`, error);
        // エラーがあってもスキップして続行
      }
    }

    console.log('');
    console.log(`✅ Embeddings generated: ${documents.length}/${allChunks.length}`);
    console.log('');

    // Step 6: Vector DBにupsert
    console.log('💾 Upserting to Vector DB...');

    // バッチサイズ（ChromaDBの制限に応じて調整）
    const batchSize = 100;
    const totalBatches = Math.ceil(documents.length / batchSize);

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;

      console.log(`   Upserting batch ${batchNumber}/${totalBatches}...`);

      await vectorDB.upsert(batch);
    }

    console.log('');
    console.log('✅ All documents upserted to Vector DB');
    console.log('');

    // Step 7: 検証
    console.log('🔍 Verifying indexing...');

    const totalCount = await vectorDB.count();
    console.log(`   Total documents in Vector DB: ${totalCount}`);

    // 商品別カウント
    const products = ['HA', 'SH'];
    for (const productId of products) {
      const count = await vectorDB.count({ productId });
      console.log(`   Documents for ${productId}: ${count}`);
    }

    // Issue #32: Priority breakdown
    console.log('');
    console.log('   Priority breakdown:');
    const p1Count = documents.filter(d => d.metadata.priority === 1).length;
    const p2Count = documents.filter(d => d.metadata.priority === 2).length;
    const p3Count = documents.filter(d => d.metadata.priority === 3).length;
    console.log(`   - P1 (Company Standards): ${p1Count}`);
    console.log(`   - P2 (Laws): ${p2Count}`);
    console.log(`   - P3 (Guidelines): ${p3Count}`);

    console.log('');
    console.log('='.repeat(80));
    console.log('✅ Vector DB Setup Complete! (with Issue #32 priority metadata)');
    console.log('='.repeat(80));
    console.log('');
    console.log('📊 Summary:');
    console.log(`   ✓ Knowledge files loaded: ${allFiles.length} files`);
    console.log(`   ✓ Chunks created: ${allChunks.length}`);
    console.log(`   ✓ Embeddings generated: ${documents.length}`);
    console.log(`   ✓ Documents indexed: ${totalCount}`);
    console.log(`   ✓ Priority metadata: P1=${p1Count}, P2=${p2Count}, P3=${p3Count}`);
    console.log('');
    console.log('🎉 RAG system is ready with priority-based search!');
    console.log('');

    // 接続を閉じる
    await vectorDB.close();
  } catch (error) {
    console.error('');
    console.error('❌ Setup failed:', error);
    console.error('');

    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack trace:', error.stack);
    }

    process.exit(1);
  }
}

// メイン実行
setupVectorDB().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
