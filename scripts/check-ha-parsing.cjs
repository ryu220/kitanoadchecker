/**
 * HA製品パース確認スクリプト（修正版）
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
const lines = csvContent.split('\n');

console.log('=== HA製品パース確認 (修正版) ===\n');

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
      rowNumber++;

      console.log(`Row ${rowNumber}: "${productId}"`);

      // Show details for HA product
      if (productId === 'HA') {
        console.log(`  ✓ HA PRODUCT FOUND!`);
        console.log(`  Category: "${columns[1].trim()}"`);
        console.log(`  薬機法 column length: ${columns[2].length}`);

        const files = columns[2].split('\n').map(l => l.trim()).filter(l => l);
        console.log(`  薬機法 files (${files.length}):`);
        files.slice(0, 5).forEach((f, i) => {
          console.log(`    ${i + 1}. ${f.substring(0, 70)}${f.length > 70 ? '...' : ''}`);
        });

        // Check for the critical file
        const hasTargetFile = files.some(f => f.includes('55_【薬事・景表法・社内ルールまとめ】'));
        console.log(`  ✓ Has target file (55_【薬事...）: ${hasTargetFile ? 'YES' : 'NO'}`);
      }

      currentRow = '';
    }
  }
}

console.log(`\n=== Total rows parsed: ${rowNumber} ===`);
