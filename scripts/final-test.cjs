/**
 * 最終テスト: Windows改行対応版
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

  // CRITICAL FIX: If still inside quotes, row is incomplete
  if (insideQuotes) {
    return null;
  }

  columns.push(currentColumn);
  return columns;
}

const csvPath = path.join(__dirname, '../knowledge/knowledge-mapping.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');

// CRITICAL FIX: Remove BOM and handle Windows line endings
const cleanContent = csvContent.replace(/^\uFEFF/, '');
const lines = cleanContent.split(/\r?\n/);

console.log('=== Final Test (Windows Line Ending Fix) ===\n');
console.log(`Total lines: ${lines.length}\n`);

let currentRow = '';
const rowStartIndex = 2;
const products = [];

for (let i = rowStartIndex; i < lines.length; i++) {
  const line = lines[i];

  if (!line || line.trim() === '' || line.trim() === ',,,,') {
    continue;
  }

  // Preserve newlines
  if (currentRow) {
    currentRow += '\n';
  }
  currentRow += line;

  const commaCount = (currentRow.match(/,/g) || []).length;

  if (commaCount >= 4) {
    const columns = parseCSVRow(currentRow);

    if (columns !== null && columns.length >= 5) {
      const productId = columns[0].trim();
      products.push({
        id: productId,
        category: columns[1].trim(),
        filesCount: columns[2].split('\n').filter(l => l.trim()).length +
                    columns[3].split('\n').filter(l => l.trim()).length +
                    columns[4].split('\n').filter(l => l.trim()).length
      });

      currentRow = '';
    }
  }
}

console.log(`Products parsed: ${products.length}\n`);

products.forEach((p, i) => {
  console.log(`${i + 1}. ${p.id} (${p.category}) - ${p.filesCount} files`);

  if (p.id === 'HA') {
    console.log(`   ✓ HA PRODUCT FOUND!`);
  }
});

console.log('\n=== Test Complete ===');
