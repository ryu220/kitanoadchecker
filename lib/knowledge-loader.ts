/**
 * Knowledge Base Loader for RAG-based Legal Compliance Checking
 *
 * This module provides functionality to load and manage knowledge base files
 * for different products (HA/SH) and common regulations.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProductId } from './types';
import { getKnowledgeFileNamesForProduct, shouldLoadFile } from './knowledge-mapping';

/**
 * Knowledge file entry
 */
export interface KnowledgeFile {
  /** File name */
  fileName: string;
  /** File path */
  filePath: string;
  /** Text content */
  content: string;
  /** Category (common, HA, SH) */
  category: 'common' | 'HA' | 'SH';
  /** File size in bytes */
  size: number;
}

/**
 * Knowledge context for a product
 */
export interface KnowledgeContext {
  /** Product ID */
  productId: ProductId;
  /** All loaded knowledge files */
  files: KnowledgeFile[];
  /** Combined text content */
  combinedContent: string;
  /** Total size in bytes */
  totalSize: number;
  /** Number of files loaded */
  fileCount: number;
}

/**
 * Knowledge loader with caching
 */
export class KnowledgeLoader {
  private knowledgeBasePath: string;
  private cache: Map<string, KnowledgeContext> = new Map();

  constructor(knowledgeBasePath?: string) {
    // Default to project root/knowledge directory
    this.knowledgeBasePath = knowledgeBasePath || path.join(process.cwd(), 'knowledge');
  }

  /**
   * Load all common knowledge files
   *
   * @returns Array of knowledge files
   */
  async loadCommonKnowledge(): Promise<KnowledgeFile[]> {
    const commonPath = path.join(this.knowledgeBasePath, 'common');
    return this.loadKnowledgeFromDirectory(commonPath, 'common');
  }

  /**
   * Load product-specific knowledge files
   *
   * @param productId - Product ID (HA or SH)
   * @returns Array of knowledge files
   */
  async loadProductKnowledge(productId: ProductId): Promise<KnowledgeFile[]> {
    // Only HA and SH are supported
    if (productId !== 'HA' && productId !== 'SH') {
      console.warn(`[KnowledgeLoader] Product ${productId} not supported yet, using empty knowledge`);
      return [];
    }
    const productPath = path.join(this.knowledgeBasePath, productId);
    return this.loadKnowledgeFromDirectory(productPath, productId as 'HA' | 'SH');
  }

  /**
   * Get all knowledge for a specific product (CSV-filtered)
   *
   * This method loads only the knowledge files specified in the CSV mapping
   * for the given product, and caches the result for faster subsequent access.
   *
   * @param productId - Product ID (HA or SH)
   * @returns Complete knowledge context
   */
  async getAllKnowledgeForProduct(productId: ProductId): Promise<KnowledgeContext> {
    // Check cache first
    const cacheKey = `product_${productId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Get allowed file names from CSV mapping
    const allowedFiles = getKnowledgeFileNamesForProduct(productId);
    console.log(`[KnowledgeLoader] Loading ${allowedFiles.length} files for ${productId} based on CSV mapping`);

    // Load files from both common and product-specific directories
    // But filter based on CSV mapping
    const [commonFiles, productFiles] = await Promise.all([
      this.loadFilteredKnowledge('common', productId, allowedFiles),
      this.loadFilteredKnowledge(productId, productId, allowedFiles),
    ]);

    // Combine all files
    const allFiles = [...commonFiles, ...productFiles];

    // Create combined content string
    const combinedContent = this.createCombinedContent(allFiles);

    // Calculate total size
    const totalSize = allFiles.reduce((sum, file) => sum + file.size, 0);

    // Create knowledge context
    const context: KnowledgeContext = {
      productId,
      files: allFiles,
      combinedContent,
      totalSize,
      fileCount: allFiles.length,
    };

    // Cache the result
    this.cache.set(cacheKey, context);

    console.log(`[KnowledgeLoader] Loaded ${allFiles.length} files (${totalSize} bytes) for ${productId}`);

    return context;
  }

  /**
   * Get formatted knowledge context string for AI prompt
   *
   * @param productId - Product ID (HA or SH)
   * @param maxLength - Maximum length of context (default: 50000 chars)
   * @returns Formatted knowledge string
   */
  async getKnowledgeContextString(productId: ProductId, maxLength: number = 50000): Promise<string> {
    const context = await this.getAllKnowledgeForProduct(productId);

    // If content is within limit, return as is
    if (context.combinedContent.length <= maxLength) {
      return context.combinedContent;
    }

    // Knowledge base is too large - this should not happen with proper filtering
    // Log warning but do not add it to the knowledge content
    console.warn(`[KnowledgeLoader] ⚠️ Knowledge base for ${productId} is ${context.combinedContent.length} chars, exceeding ${maxLength} limit. This indicates a filtering problem.`);

    // Truncate at last complete section to avoid breaking mid-sentence
    const truncated = context.combinedContent.substring(0, maxLength);
    const lastSeparator = truncated.lastIndexOf('\n---\n');

    if (lastSeparator > 0) {
      return truncated.substring(0, lastSeparator);
    }

    return truncated;
  }

  /**
   * Clear the knowledge cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Load knowledge files from a directory with CSV filtering
   *
   * @param dirName - Directory name (e.g., 'common', 'HA', 'SH')
   * @param productId - Product ID for filtering
   * @param allowedFiles - List of allowed file names from CSV
   * @returns Array of knowledge files
   */
  private async loadFilteredKnowledge(
    dirName: string,
    productId: ProductId,
    _allowedFiles: string[]
  ): Promise<KnowledgeFile[]> {
    const dirPath = path.join(this.knowledgeBasePath, dirName);

    // Check if directory exists
    if (!fs.existsSync(dirPath)) {
      return [];
    }

    const files: KnowledgeFile[] = [];
    const fileNames = fs.readdirSync(dirPath).filter(f => f.endsWith('.txt'));

    for (const fileName of fileNames) {
      // Check if this file should be loaded based on CSV mapping
      if (!shouldLoadFile(productId, fileName)) {
        continue;
      }

      const filePath = path.join(dirPath, fileName);

      try {
        const content = fs.readFileSync(filePath, 'utf-8');

        if (content.trim().length === 0) {
          console.warn(`[KnowledgeLoader] Skipping empty file: ${fileName}`);
          continue;
        }

        const stats = fs.statSync(filePath);
        const category = dirName === 'common' ? 'common' : (dirName as 'HA' | 'SH');

        files.push({
          fileName,
          filePath,
          content,
          category,
          size: stats.size,
        });

        console.log(`[KnowledgeLoader] Loaded ${fileName} for ${productId}`);
      } catch (error) {
        console.error(`[KnowledgeLoader] Error reading file ${fileName}:`, error);
      }
    }

    return files;
  }

  /**
   * Load knowledge files from a directory
   *
   * @param dirPath - Directory path
   * @param category - Knowledge category
   * @returns Array of knowledge files
   */
  private async loadKnowledgeFromDirectory(
    dirPath: string,
    category: 'common' | 'HA' | 'SH'
  ): Promise<KnowledgeFile[]> {
    // Check if directory exists
    if (!fs.existsSync(dirPath)) {
      console.warn(`[KnowledgeLoader] Directory not found: ${dirPath}`);
      return [];
    }

    const files: KnowledgeFile[] = [];

    // Read all .txt files in directory
    const fileNames = fs.readdirSync(dirPath).filter(f => f.endsWith('.txt'));

    for (const fileName of fileNames) {
      const filePath = path.join(dirPath, fileName);

      try {
        // Read file content
        const content = fs.readFileSync(filePath, 'utf-8');

        // Skip empty files
        if (content.trim().length === 0) {
          console.warn(`[KnowledgeLoader] Skipping empty file: ${fileName}`);
          continue;
        }

        // Get file stats
        const stats = fs.statSync(filePath);

        files.push({
          fileName,
          filePath,
          content,
          category,
          size: stats.size,
        });
      } catch (error) {
        console.error(`[KnowledgeLoader] Error reading file ${fileName}:`, error);
        // Continue with other files
      }
    }

    console.log(`[KnowledgeLoader] Loaded ${files.length} files from ${category}`);
    return files;
  }

  /**
   * Create combined content string from knowledge files
   *
   * Prioritizes company standards files (【薬事・景表法・社内ルールまとめ】)
   * to ensure they are evaluated first.
   *
   * @param files - Array of knowledge files
   * @returns Combined content string
   */
  private createCombinedContent(files: KnowledgeFile[]): string {
    if (files.length === 0) {
      return '【ナレッジベースが空です】';
    }

    // Sort files to prioritize company standards
    // 1. Company standards files (【薬事・景表法・社内ルールまとめ】) first
    // 2. Other files in original order
    const companyStandardsFiles = files.filter(file =>
      file.fileName.includes('【薬事・景表法・社内ルールまとめ】')
    );
    const otherFiles = files.filter(file =>
      !file.fileName.includes('【薬事・景表法・社内ルールまとめ】')
    );

    const sortedFiles = [...companyStandardsFiles, ...otherFiles];

    const sections = sortedFiles.map((file) => {
      // Determine priority level for better RAG search weighting
      let priorityLabel = '';
      let priorityDescription = '';

      if (file.fileName.includes('【薬事・景表法・社内ルールまとめ】')) {
        // Highest priority: comprehensive internal standards for specific product
        priorityLabel = '【Priority: HIGH】';
        priorityDescription = '第1優先（商品固有の社内基準・包括的ルール）';
      } else if (file.category === 'HA' || file.category === 'SH') {
        // Medium priority: product-specific regulations
        priorityLabel = '【Priority: MEDIUM】';
        priorityDescription = '第2優先（商品固有の規定）';
      } else {
        // Low priority: common regulations (applies to all products)
        priorityLabel = '【Priority: LOW】';
        priorityDescription = '第3優先（全商品共通の法令）';
      }

      return `
## ${priorityLabel} ${file.fileName}
【カテゴリ】${file.category}
【優先度】${priorityDescription}

${file.content}

---
`;
    });

    return `
# 広告法務ナレッジベース

## 評価の優先順位

**以下の優先順位に従って評価を行ってください:**

### 第1優先：社内基準（【薬事・景表法・社内ルールまとめ】）
- 商品ごとの【薬事・景表法・社内ルールまとめ】ファイルを最優先で参照してください
- このファイルには商品ごとの詳細な社内ルールが定義されています
- **社内基準でOKと判定される場合（注釈やエビデンス補足によってOKとなる場合）、法令でNGでも最終判定はOKとなります**

### 第2優先：各種法令（薬機法、景表法、特商法など）
- 薬機法、景表法、特商法などの法令に基づいて評価
- 社内基準でOKと明示されている場合は、法令上の懸念があっても社内基準を優先

### 第3優先：各種ガイドライン
- 業界ガイドライン、厚生労働省ガイドライン、消費者庁ガイドラインなど

---

## ナレッジファイル一覧

以下は、薬機法・景表法・特商法・社内基準に関するナレッジベースです。
広告文の評価に際しては、これらの規定を厳密に適用してください。

${sections.join('\n')}
`.trim();
  }
}

/**
 * Create a knowledge loader instance
 *
 * @param knowledgeBasePath - Optional custom path to knowledge base
 * @returns KnowledgeLoader instance
 */
export function createKnowledgeLoader(knowledgeBasePath?: string): KnowledgeLoader {
  return new KnowledgeLoader(knowledgeBasePath);
}

/**
 * Convenience function to get knowledge context for a product
 *
 * @param productId - Product ID (HA or SH)
 * @param knowledgeBasePath - Optional custom path to knowledge base
 * @returns Knowledge context string
 */
export async function getProductKnowledge(
  productId: ProductId,
  knowledgeBasePath?: string
): Promise<string> {
  const loader = createKnowledgeLoader(knowledgeBasePath);
  return loader.getKnowledgeContextString(productId);
}
