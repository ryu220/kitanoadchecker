/**
 * CSV Mapping診断スクリプト
 *
 * knowledge-mapping.csvが正しくパースされているか確認します
 */

import { getProductKnowledgeMapping } from '../lib/knowledge-mapping';

console.log('=== CSV Mapping Diagnosis ===\n');

// Test products
const products = ['HA', 'SH', 'AI', 'LK', '全商品'];

for (const productId of products) {
  console.log(`\n--- Product: ${productId} ---`);

  try {
    const mapping = getProductKnowledgeMapping(productId as any);

    console.log(`  Category: ${mapping.category}`);
    console.log(`  Total files: ${mapping.allFiles.length}`);
    console.log(`  薬機法 files: ${mapping.yakujihoFiles.length}`);
    console.log(`  景表法 files: ${mapping.keihinhoFiles.length}`);
    console.log(`  その他 files: ${mapping.otherFiles.length}`);

    if (mapping.allFiles.length > 0) {
      console.log(`\n  First 3 files:`);
      mapping.allFiles.slice(0, 3).forEach((file, i) => {
        console.log(`    ${i + 1}. ${file}`);
      });
    }

    // Check for specific file for HA
    if (productId === 'HA') {
      const target = '55_【薬事・景表法・社内ルールまとめ】『ヒアロディープパッチ』';
      const found = mapping.allFiles.some(f => f.includes(target));
      console.log(`\n  ✓ Contains "${target}": ${found ? 'YES' : 'NO'}`);
    }

  } catch (error) {
    console.error(`  ERROR:`, error);
  }
}

console.log('\n=== End Diagnosis ===');
