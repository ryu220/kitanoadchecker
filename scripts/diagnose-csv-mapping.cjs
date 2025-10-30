/**
 * CSV Mapping診断スクリプト
 *
 * knowledge-mapping.csvが正しくパースされているか確認します
 */

const fs = require('fs');
const path = require('path');

// Simple CSV parser (same logic as knowledge-mapping.ts)
function parseCSVRow(row) {
  const columns = [];
  let currentColumn = '';
  let insideQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];

    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      columns.push(currentColumn);
      currentColumn = '';
    } else {
      currentColumn += char;
    }
  }

  columns.push(currentColumn);
  return columns;
}

function parseCSVMapping(csvPath) {
  const mapping = new Map();

  try {
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n');

    console.log(`[Debug] CSV file has ${lines.length} lines`);
    console.log(`[Debug] First line (with BOM check): "${lines[0]}" (length: ${lines[0].length})`);
    console.log(`[Debug] First line char codes:`, lines[0].split('').slice(0, 10).map(c => c.charCodeAt(0)));

    let currentRow = '';
    const rowStartIndex = 2;
    let rowNumber = 0;

    for (let i = rowStartIndex; i < lines.length; i++) {
      const line = lines[i];

      if (!line || line.trim() === '' || line.trim() === ',,,,') {
        continue;
      }

      // CRITICAL FIX: Preserve newlines
      if (currentRow) {
        currentRow += '\n';
      }
      currentRow += line;

      const commaCount = (currentRow.match(/,/g) || []).length;

      if (commaCount >= 4) {
        const columns = parseCSVRow(currentRow);

        if (columns.length >= 5) {
          const productId = columns[0].trim();
          const category = columns[1].trim();

          rowNumber++;
          console.log(`\n[Debug] Row ${rowNumber}:`);
          console.log(`  Product ID: "${productId}" (length: ${productId.length})`);
          console.log(`  Product ID char codes:`, productId.split('').map(c => c.charCodeAt(0)));
          console.log(`  Category: "${category}"`);
          console.log(`  Column 2 (薬機法) length: ${columns[2].length}`);
          console.log(`  Column 3 (景表法) length: ${columns[3].length}`);
          console.log(`  Column 4 (その他) length: ${columns[4].length}`);

          if (productId) {
            mapping.set(productId, {
              productId,
              category,
              column2: columns[2].split('\n').filter(l => l.trim()).length,
              column3: columns[3].split('\n').filter(l => l.trim()).length,
              column4: columns[4].split('\n').filter(l => l.trim()).length
            });
          }

          currentRow = '';
        }
      }
    }

    console.log(`\n[Debug] Parsed ${mapping.size} products`);
    console.log('[Debug] Map keys:', Array.from(mapping.keys()));

    return mapping;
  } catch (error) {
    console.error('[Debug] Error parsing CSV:', error);
    return mapping;
  }
}

// Run diagnosis
const csvPath = path.join(__dirname, '../knowledge/knowledge-mapping.csv');
console.log('=== CSV Mapping Diagnosis ===\n');
console.log(`CSV Path: ${csvPath}\n`);

const mapping = parseCSVMapping(csvPath);

// Test lookup
console.log('\n=== Lookup Test ===\n');
const testProducts = ['HA', 'SH', 'AI', '全商品'];

for (const productId of testProducts) {
  const result = mapping.get(productId);
  console.log(`\nLookup "${productId}":`);
  if (result) {
    console.log(`  ✓ FOUND`);
    console.log(`  Category: ${result.category}`);
    console.log(`  薬機法 files: ${result.column2}`);
    console.log(`  景表法 files: ${result.column3}`);
    console.log(`  その他 files: ${result.column4}`);
  } else {
    console.log(`  ✗ NOT FOUND`);
  }
}

console.log('\n=== End Diagnosis ===');
