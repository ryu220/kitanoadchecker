/**
 * Row 1パース後の動作を詳細確認
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

console.log('=== After Row 1 Debug ===\n');

let currentRow = '';
const rowStartIndex = 2;
let rowParsed = false;
let linesSinceReset = 0;

for (let i = rowStartIndex; i < Math.min(lines.length, 100); i++) {
  const line = lines[i];

  if (!line || line.trim() === '' || line.trim() === ',,,,') {
    continue;
  }

  if (currentRow) {
    currentRow += '\n';
  }
  currentRow += line;

  const commaCount = (currentRow.match(/,/g) || []).length;

  if (commaCount >= 4) {
    const columns = parseCSVRow(currentRow);

    if (columns.length >= 5) {
      const productId = columns[0].trim();

      if (rowParsed) {
        // This is the 2nd row (HA)
        console.log(`\n✓ ROW 2 PARSED!`);
        console.log(`Product ID: "${productId}"`);
        console.log(`Lines accumulated: ${linesSinceReset + 1}`);
        console.log(`Total comma count: ${commaCount}`);
        console.log(`Columns parsed: ${columns.length}`);
        console.log(`Column 0: "${columns[0].substring(0, 50)}"`);
        console.log(`Column 1: "${columns[1].substring(0, 50)}"`);
        console.log(`Column 2 length: ${columns[2].length}`);
        break;
      }

      // First row parsed
      rowParsed = true;
      console.log(`Row 1 parsed: "${productId}"`);
      console.log(`Resetting currentRow...`);

      currentRow = '';
      linesSinceReset = 0;
      continue;
    }
  }

  if (rowParsed) {
    linesSinceReset++;
    console.log(`[After Row 1] Line ${i + 1}: commaCount=${commaCount}, currentRow length=${currentRow.length}, columns=${rowParsed ? parseCSVRow(currentRow).length : 'N/A'}`);
    console.log(`  Content: "${line.substring(0, 80)}${line.length > 80 ? '...' : ''}"`);
  }
}

console.log('\n=== End Debug ===');
