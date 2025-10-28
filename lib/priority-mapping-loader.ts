/**
 * Priority Mapping Loader
 * Loads knowledge priority mapping from CSV
 */

import fs from 'fs/promises';
import path from 'path';

export interface PriorityMapping {
  fileName: string;
  priority: 1 | 2 | 3;
  legalDomain: '薬機法' | '景表法' | '特商法';
  knowledgeType: 'company_standard' | 'law' | 'government_guideline' | 'industry_guideline';
  category: 'common' | 'HA' | 'SH';
}

export class PriorityMappingLoader {
  private mappingFile: string;
  private mappingCache: Map<string, PriorityMapping> | null = null;

  constructor(mappingFile?: string) {
    this.mappingFile = mappingFile || path.join(process.cwd(), 'config', 'knowledge-priority-mapping.csv');
  }

  /**
   * Load priority mapping from CSV
   */
  async load(): Promise<Map<string, PriorityMapping>> {
    if (this.mappingCache) {
      return this.mappingCache;
    }

    try {
      const content = await fs.readFile(this.mappingFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      // Skip header
      const dataLines = lines.slice(1);

      const mapping = new Map<string, PriorityMapping>();

      for (const line of dataLines) {
        const parts = this.parseCSVLine(line);
        if (parts.length !== 5) {
          console.warn(`[PriorityMapping] Invalid line: ${line}`);
          continue;
        }

        const [fileName, priorityStr, legalDomain, knowledgeType, category] = parts;

        const priority = parseInt(priorityStr, 10) as 1 | 2 | 3;
        if (![1, 2, 3].includes(priority)) {
          console.warn(`[PriorityMapping] Invalid priority for ${fileName}: ${priorityStr}`);
          continue;
        }

        // Create a key combining category and fileName for lookup
        const key = `${category}/${fileName}`;

        mapping.set(key, {
          fileName,
          priority,
          legalDomain: legalDomain as PriorityMapping['legalDomain'],
          knowledgeType: knowledgeType as PriorityMapping['knowledgeType'],
          category: category as PriorityMapping['category'],
        });
      }

      this.mappingCache = mapping;
      console.log(`[PriorityMapping] Loaded ${mapping.size} priority mappings`);

      return mapping;
    } catch (error) {
      console.error('[PriorityMapping] Failed to load priority mapping:', error);
      throw error;
    }
  }

  /**
   * Parse CSV line (handles commas in quoted strings)
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  /**
   * Get priority mapping for a specific file
   */
  async getMapping(category: string, fileName: string): Promise<PriorityMapping | null> {
    const mapping = await this.load();
    const key = `${category}/${fileName}`;
    return mapping.get(key) || null;
  }
}

/**
 * Factory function
 */
export function createPriorityMappingLoader(mappingFile?: string): PriorityMappingLoader {
  return new PriorityMappingLoader(mappingFile);
}
