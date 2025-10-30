/**
 * Knowledge Base Upload Script
 *
 * Uploads knowledge files to Gemini File API for RAG-based search.
 *
 * Usage:
 *   npx tsx scripts/upload-knowledge.ts [productId]
 *
 * Examples:
 *   npx tsx scripts/upload-knowledge.ts HA
 *   npx tsx scripts/upload-knowledge.ts SH
 *   npx tsx scripts/upload-knowledge.ts all
 */

import 'dotenv/config';
import { createGeminiFileManager } from '../lib/gemini-file-manager';
import { getKnowledgeFileNamesForProduct } from '../lib/knowledge-mapping';
import * as path from 'path';

async function main() {
  const args = process.argv.slice(2);
  const targetProduct = args[0] || 'all';

  console.log('🚀 Knowledge Base Upload Script\n');

  // Get API key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY environment variable is not set');
    console.error('Please set it in your .env file or export it');
    process.exit(1);
  }

  // Create file manager
  const fileManager = createGeminiFileManager(apiKey);

  // Knowledge base path (default to project root/knowledge)
  // Adjust this path if your knowledge base is in a different location
  const knowledgeBasePath = process.env.KNOWLEDGE_BASE_PATH || path.join(process.cwd(), 'knowledge');

  console.log(`📂 Knowledge base path: ${knowledgeBasePath}\n`);

  // Determine which products to upload
  const products = targetProduct === 'all' ? ['HA', 'SH'] : [targetProduct];

  for (const productId of products) {
    if (productId !== 'HA' && productId !== 'SH') {
      console.warn(`⚠️  Skipping unsupported product: ${productId}`);
      continue;
    }

    console.log(`\n📦 Uploading knowledge for product: ${productId}`);
    console.log('─'.repeat(60));

    // Get allowed files for this product
    const allowedFiles = getKnowledgeFileNamesForProduct(productId as 'HA' | 'SH');
    console.log(`📋 ${allowedFiles.length} files to upload based on CSV mapping\n`);

    // Upload files
    const results = await fileManager.uploadProductKnowledge(
      knowledgeBasePath,
      productId as 'HA' | 'SH',
      allowedFiles
    );

    // Print results
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`\n✅ Successfully uploaded: ${successful} files`);
    if (failed > 0) {
      console.log(`❌ Failed uploads: ${failed} files\n`);

      // Print failed files
      results.filter(r => !r.success).forEach(result => {
        console.log(`   ❌ ${result.error}`);
      });
    }
  }

  // Print cache statistics
  console.log('\n📊 Cache Statistics');
  console.log('─'.repeat(60));

  const stats = fileManager.getCacheStats();
  console.log(`Total files cached: ${stats.totalFiles}`);
  console.log(`Total size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`\nFiles by category:`);
  console.log(`  Common: ${stats.filesByCategory.common}`);
  console.log(`  HA: ${stats.filesByCategory.HA}`);
  console.log(`  SH: ${stats.filesByCategory.SH}`);
  console.log(`\nFiles available for:`);
  console.log(`  HA product: ${stats.filesByProduct.HA}`);
  console.log(`  SH product: ${stats.filesByProduct.SH}`);

  console.log('\n✨ Upload complete!\n');
}

// Run main
main().catch(error => {
  console.error('\n❌ Upload failed:', error);
  process.exit(1);
});
