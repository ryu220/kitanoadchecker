/**
 * Knowledge Mapping Parser
 *
 * Parses the CSV file that defines which knowledge files should be loaded for each product.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProductId } from './types';

/**
 * Product knowledge mapping
 */
export interface ProductKnowledgeMapping {
  /** Product ID */
  productId: ProductId | '全商品';
  /** Product category (e.g., 化粧品, 新指定医薬部外品) */
  category: string;
  /** Pharmaceutical law files */
  yakujihoFiles: string[];
  /** Consumer affairs law files */
  keihinhoFiles: string[];
  /** Other files */
  otherFiles: string[];
  /** All files combined */
  allFiles: string[];
}

/**
 * Knowledge mapping cache
 */
let mappingCache: Map<ProductId | '全商品', ProductKnowledgeMapping> | null = null;

/**
 * Parse a CSV cell that may contain multiple files separated by newlines
 */
function parseFileList(cellValue: string): string[] {
  if (!cellValue || cellValue.trim() === '') {
    return [];
  }

  return cellValue
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

/**
 * Parse the CSV mapping file
 */
function parseCSVMapping(csvPath: string): Map<ProductId | '全商品', ProductKnowledgeMapping> {
  const mapping = new Map<ProductId | '全商品', ProductKnowledgeMapping>();

  try {
    // Read CSV file
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n');

    // Skip header rows (lines 0-1)
    // Process data rows starting from line 2
    let currentRow = '';
    const rowStartIndex = 2;

    for (let i = rowStartIndex; i < lines.length; i++) {
      const line = lines[i];

      // Skip empty lines at the end
      if (!line || line.trim() === '' || line.trim() === ',,,,') {
        continue;
      }

      currentRow += line;

      // Check if this row is complete (has 5 columns)
      // Count commas to determine if we have a complete row
      // Note: CSV cells can contain newlines, so we need to handle multi-line cells
      const commaCount = (currentRow.match(/,/g) || []).length;

      // If we have at least 4 commas (5 columns), try to parse
      if (commaCount >= 4) {
        // Simple CSV parsing (handles quoted fields with newlines)
        const columns = parseCSVRow(currentRow);

        if (columns.length >= 5) {
          const productId = columns[0].trim();
          const category = columns[1].trim();
          const yakujihoFiles = parseFileList(columns[2]);
          const keihinhoFiles = parseFileList(columns[3]);
          const otherFiles = parseFileList(columns[4]);

          if (productId) {
            const allFiles = [
              ...yakujihoFiles,
              ...keihinhoFiles,
              ...otherFiles
            ];

            mapping.set(productId as ProductId | '全商品', {
              productId: productId as ProductId | '全商品',
              category,
              yakujihoFiles,
              keihinhoFiles,
              otherFiles,
              allFiles
            });
          }

          currentRow = '';
        }
      }
    }

    return mapping;
  } catch (error) {
    console.error('[KnowledgeMapping] Error parsing CSV:', error);
    return mapping;
  }
}

/**
 * Parse a CSV row, handling quoted fields
 */
function parseCSVRow(row: string): string[] {
  const columns: string[] = [];
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

  // Add the last column
  columns.push(currentColumn);

  return columns;
}

/**
 * Get knowledge mapping for a product
 */
export function getProductKnowledgeMapping(
  productId: ProductId,
  csvPath?: string
): ProductKnowledgeMapping {
  // Initialize cache if needed
  if (!mappingCache) {
    const defaultCsvPath = csvPath || path.join(process.cwd(), 'knowledge', 'knowledge-mapping.csv');
    mappingCache = parseCSVMapping(defaultCsvPath);
    console.log(`[KnowledgeMapping] Loaded mappings for ${mappingCache.size} products`);
  }

  // Check if product has specific mapping
  const productMapping = mappingCache.get(productId);
  if (productMapping) {
    console.log(`[KnowledgeMapping] Found specific mapping for ${productId}: ${productMapping.allFiles.length} files`);
    return productMapping;
  }

  // Fall back to "全商品" mapping
  const commonMapping = mappingCache.get('全商品');
  if (commonMapping) {
    console.log(`[KnowledgeMapping] Using common mapping (全商品) for ${productId}: ${commonMapping.allFiles.length} files`);
    return {
      ...commonMapping,
      productId
    };
  }

  // No mapping found
  console.warn(`[KnowledgeMapping] No mapping found for ${productId}, returning empty`);
  return {
    productId,
    category: '',
    yakujihoFiles: [],
    keihinhoFiles: [],
    otherFiles: [],
    allFiles: []
  };
}

/**
 * Get all knowledge file names for a product (based on CSV mapping)
 */
export function getKnowledgeFileNamesForProduct(productId: ProductId): string[] {
  const mapping = getProductKnowledgeMapping(productId);
  return mapping.allFiles;
}

/**
 * Clear the mapping cache (useful for testing or reloading)
 */
export function clearMappingCache(): void {
  mappingCache = null;
}

/**
 * Check if a file should be loaded for a product based on CSV mapping
 */
export function shouldLoadFile(productId: ProductId, fileName: string): boolean {
  const allowedFiles = getKnowledgeFileNamesForProduct(productId);

  // Check if fileName matches any of the allowed files
  // Handle both exact matches and partial matches (file names may have prefixes like "05_")
  return allowedFiles.some(allowedFile => {
    // Remove .txt extension from both for comparison
    const allowedBase = allowedFile.replace(/\.txt$/, '');
    const fileBase = fileName.replace(/\.txt$/, '');

    // Check if file name contains the allowed file pattern
    // e.g., "05_化粧品の効能効果（56項目）について.txt" matches "05_化粧品の効能効果（56項目）について"
    return fileBase.includes(allowedBase) || allowedBase.includes(fileBase);
  });
}
