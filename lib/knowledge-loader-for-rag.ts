/**
 * Knowledge Loader for RAG
 * RAGシステム用のナレッジベースローダー
 */

import fs from 'fs/promises';
import path from 'path';
import { createPriorityMappingLoader } from './priority-mapping-loader';

export interface KnowledgeFile {
  id: string;
  fileName: string;
  category: 'common' | 'HA' | 'SH';
  content: string;
  metadata: {
    fileName: string;
    filePath: string;
    category: string;
    productId?: string;
    // Priority metadata (added for Issue #32)
    priority?: 1 | 2 | 3;
    legalDomain?: '薬機法' | '景表法' | '特商法';
    knowledgeType?: 'company_standard' | 'law' | 'government_guideline' | 'industry_guideline';
  };
}

export class KnowledgeLoaderForRAG {
  private knowledgeDir: string;
  private priorityMappingLoader: ReturnType<typeof createPriorityMappingLoader>;

  constructor(knowledgeDir?: string) {
    this.knowledgeDir = knowledgeDir || path.join(process.cwd(), 'knowledge');
    this.priorityMappingLoader = createPriorityMappingLoader();
  }

  /**
   * 全カテゴリのナレッジをロード
   */
  async loadAll(): Promise<KnowledgeFile[]> {
    const files: KnowledgeFile[] = [];

    try {
      // Load common knowledge
      const commonFiles = await this.loadCategory('common');
      files.push(...commonFiles);

      // Load HA knowledge
      const haFiles = await this.loadCategory('HA');
      files.push(...haFiles);

      // Load SH knowledge
      const shFiles = await this.loadCategory('SH');
      files.push(...shFiles);

      console.log(`[KnowledgeLoader] Loaded ${files.length} knowledge files`);
      console.log(`  - common: ${commonFiles.length}`);
      console.log(`  - HA: ${haFiles.length}`);
      console.log(`  - SH: ${shFiles.length}`);

      return files;
    } catch (error) {
      console.error('[KnowledgeLoader] Failed to load knowledge files:', error);
      throw error;
    }
  }

  /**
   * 特定カテゴリのナレッジをロード
   */
  private async loadCategory(category: string): Promise<KnowledgeFile[]> {
    const categoryPath = path.join(this.knowledgeDir, category);

    try {
      const entries = await fs.readdir(categoryPath, { withFileTypes: true });
      const files: KnowledgeFile[] = [];

      // Load priority mapping
      const priorityMapping = await this.priorityMappingLoader.load();

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.txt')) {
          continue;
        }

        const filePath = path.join(categoryPath, entry.name);

        try {
          const content = await fs.readFile(filePath, 'utf-8');

          // Get priority mapping for this file
          // Try mapping with category prefix first, then fall back to filename only
          let mapping = priorityMapping.get(`${category}/${entry.name}`);
          if (!mapping) {
            // Try all possible categories
            mapping = priorityMapping.get(`common/${entry.name}`) ||
                     priorityMapping.get(`HA/${entry.name}`) ||
                     priorityMapping.get(`SH/${entry.name}`);
          }

          // Use mapping.category as productId (not directory category)
          const productId = mapping?.category && mapping.category !== 'common'
            ? mapping.category
            : (category !== 'common' ? category : undefined);

          files.push({
            id: `${category}/${entry.name}`,
            fileName: entry.name,
            category: category as 'common' | 'HA' | 'SH',
            content,
            metadata: {
              fileName: entry.name,
              filePath,
              category,
              productId,
              // Add priority metadata
              priority: mapping?.priority,
              legalDomain: mapping?.legalDomain,
              knowledgeType: mapping?.knowledgeType,
            },
          });
        } catch (error) {
          console.warn(`[KnowledgeLoader] Failed to read ${filePath}:`, error);
          // Continue loading other files
        }
      }

      return files;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        console.warn(`[KnowledgeLoader] Category directory not found: ${categoryPath}`);
        return [];
      }
      throw error;
    }
  }

  /**
   * 特定の製品IDのナレッジのみをロード
   */
  async loadForProduct(productId: 'HA' | 'SH'): Promise<KnowledgeFile[]> {
    const files: KnowledgeFile[] = [];

    // Load common knowledge
    const commonFiles = await this.loadCategory('common');
    files.push(...commonFiles);

    // Load product-specific knowledge
    const productFiles = await this.loadCategory(productId);
    files.push(...productFiles);

    console.log(`[KnowledgeLoader] Loaded ${files.length} files for product ${productId}`);

    return files;
  }
}

/**
 * Factory function
 */
export function createKnowledgeLoaderForRAG(knowledgeDir?: string): KnowledgeLoaderForRAG {
  return new KnowledgeLoaderForRAG(knowledgeDir);
}
