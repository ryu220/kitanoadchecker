/**
 * 詳細パーストレース: 各ステップを出力
 */

const fs = require('fs');
const path = require('path');

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

const csvPath = path.join(__dirname, '../knowledge/knowledge-mapping.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');

// Apply same fixes as knowledge-mapping.ts
const cleanContent = csvContent.replace(/^\uFEFF/, '');
const lines = cleanContent.split(/\r?\n/);

console.log('=== Detailed Parse Trace ===\n');
console.log(`Total lines: ${lines.length}\n`);

let currentRow = '';
const rowStartIndex = 2;
let productsFound = 0;
let lineNumber = rowStartIndex;

for (let i = rowStartIndex; i < Math.min(lines.length, 150); i++) {
  const line = lines[i];

  // Skip empty lines
  if (!line || line.trim() === '' || line.trim() === ',,,,') {
    console.log(`[Line ${i + 1}] Skipped (empty or all commas)`);
    continue;
  }

  // Preserve newlines
  if (currentRow) {
    currentRow += '\n';
  }
  currentRow += line;

  const commaCount = (currentRow.match(/,/g) || []).length;

  console.log(`[Line ${i + 1}] Accumulated. CommaCount=${commaCount}, RowLength=${currentRow.length}`);
  console.log(`  Content: "${line.substring(0, 60)}${line.length > 60 ? '...' : ''}"`);

  if (commaCount >= 4) {
    console.log(`\n✓ CommaCount >= 4. Attempting to parse row...`);

    const columns = parseCSVRow(currentRow);
    console.log(`  Columns parsed: ${columns.length}`);

    for (let j = 0; j < Math.min(columns.length, 5); j++) {
      const preview = columns[j].substring(0, 50);
      console.log(`  Column ${j}: "${preview}${columns[j].length > 50 ? '...' : ''}" (length: ${columns[j].length})`);
    }

    if (columns.length >= 5) {
      const productId = columns[0].trim();
      const category = columns[1].trim();

      console.log(`\n✓✓ Row parsed successfully!`);
      console.log(`  Product ID: "${productId}"`);
      console.log(`  Category: "${category}"`);

      productsFound++;

      if (productId === 'HA') {
        console.log(`\n  🎯 HA PRODUCT FOUND!`);
        console.log(`  Breaking after HA for inspection...\n`);
        break;
      }

      console.log(`\nResetting currentRow...\n`);
      currentRow = '';
    } else {
      console.log(`  ✗ Insufficient columns (${columns.length} < 5). Continuing to accumulate...\n`);
    }
  }
}

console.log(`\n=== Total Products Found: ${productsFound} ===`);
