/**
 * CSV Mapping詳細診断スクリプト
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

console.log('=== Detailed CSV Parsing Debug ===\n');
console.log(`Total lines: ${lines.length}\n`);

let currentRow = '';
const rowStartIndex = 2;
let rowNumber = 0;
let debugCount = 0;

for (let i = rowStartIndex; i < lines.length; i++) {
  const line = lines[i];

  // Show first 100 iterations in detail
  if (debugCount < 100) {
    console.log(`\n[Line ${i + 1}] "${line.substring(0, 80)}${line.length > 80 ? '...' : ''}"`);
    debugCount++;
  }

  if (!line || line.trim() === '' || line.trim() === ',,,,') {
    if (debugCount < 100) console.log(`  → SKIP (empty)`);
    continue;
  }

  currentRow += line;
  const commaCount = (currentRow.match(/,/g) || []).length;

  if (debugCount < 100) {
    console.log(`  → ADD to currentRow (commaCount: ${commaCount}, currentRow length: ${currentRow.length})`);
  }

  if (commaCount >= 4) {
    const columns = parseCSVRow(currentRow);

    if (debugCount < 100) {
      console.log(`  → TRY PARSE: ${columns.length} columns found`);
      console.log(`     Column 0: "${columns[0].trim()}"`);
    }

    if (columns.length >= 5) {
      const productId = columns[0].trim();
      rowNumber++;

      console.log(`\n✓ ROW ${rowNumber} PARSED: "${productId}"`);
      console.log(`  Category: "${columns[1].trim()}"`);
      console.log(`  Columns: ${columns.length}`);
      console.log(`  Column 2 length: ${columns[2].length}`);
      console.log(`  Column 3 length: ${columns[3].length}`);
      console.log(`  Column 4 length: ${columns[4].length}`);

      currentRow = '';

      if (debugCount < 100) {
        console.log(`  → RESET currentRow`);
      }
    }
  }
}

console.log(`\n=== End Debug (Total rows parsed: ${rowNumber}) ===`);
