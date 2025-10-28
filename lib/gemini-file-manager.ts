/**
 * Gemini File API Manager
 *
 * Manages knowledge base files using Gemini File API for RAG-based search.
 * Provides file upload, caching, and retrieval functionality.
 */

import { GoogleAIFileManager } from '@google/generative-ai/server';
import * as fs from 'fs';
import * as path from 'path';
import { ProductId } from './types';

/**
 * Uploaded file metadata
 */
export interface UploadedFile {
  /** File URI in Gemini */
  fileUri: string;
  /** Display name */
  displayName: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Upload timestamp */
  uploadedAt: string;
  /** Original file path */
  originalPath: string;
  /** Product ID (if product-specific) */
  productId?: ProductId;
  /** Category (common, HA, SH) */
  category: 'common' | 'HA' | 'SH';
}

/**
 * File upload result
 */
export interface UploadResult {
  success: boolean;
  file?: UploadedFile;
  error?: string;
}

/**
 * Gemini File Manager for knowledge base management
 */
export class GeminiFileManager {
  private fileManager: GoogleAIFileManager;
  private uploadCache: Map<string, UploadedFile> = new Map();
  private cacheFile: string;

  constructor(apiKey: string, cacheDir?: string) {
    this.fileManager = new GoogleAIFileManager(apiKey);

    // Cache file path
    const cachePath = cacheDir || path.join(process.cwd(), '.cache');
    if (!fs.existsSync(cachePath)) {
      fs.mkdirSync(cachePath, { recursive: true });
    }
    this.cacheFile = path.join(cachePath, 'gemini-files-cache.json');

    // Load cache
    this.loadCache();
  }

  /**
   * Upload a single file to Gemini File API
   *
   * @param filePath - Local file path
   * @param displayName - Display name for the file
   * @param category - File category (common, HA, SH)
   * @param productId - Product ID (if product-specific)
   * @returns Upload result
   */
  async uploadFile(
    filePath: string,
    displayName: string,
    category: 'common' | 'HA' | 'SH',
    productId?: ProductId
  ): Promise<UploadResult> {
    try {
      // Check if already uploaded (cache hit)
      const cacheKey = this.getCacheKey(filePath);
      if (this.uploadCache.has(cacheKey)) {
        console.log(`[FileManager] Cache hit for ${displayName}`);
        return {
          success: true,
          file: this.uploadCache.get(cacheKey)!,
        };
      }

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: `File not found: ${filePath}`,
        };
      }

      // Get file stats
      const stats = fs.statSync(filePath);

      console.log(`[FileManager] Uploading ${displayName} (${stats.size} bytes)...`);

      // Upload to Gemini
      const uploadResponse = await this.fileManager.uploadFile(filePath, {
        mimeType: 'text/plain',
        displayName: displayName,
      });

      const uploadedFile: UploadedFile = {
        fileUri: uploadResponse.file.uri,
        displayName: displayName,
        mimeType: uploadResponse.file.mimeType,
        sizeBytes: stats.size,
        uploadedAt: new Date().toISOString(),
        originalPath: filePath,
        productId: productId,
        category: category,
      };

      // Cache the result
      this.uploadCache.set(cacheKey, uploadedFile);
      this.saveCache();

      console.log(`[FileManager] ✅ Uploaded ${displayName} -> ${uploadedFile.fileUri}`);

      return {
        success: true,
        file: uploadedFile,
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[FileManager] ❌ Failed to upload ${displayName}:`, errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Upload all knowledge files for a product
   *
   * @param knowledgeBasePath - Path to knowledge base directory
   * @param productId - Product ID (HA or SH)
   * @param allowedFiles - List of allowed file names (from CSV mapping)
   * @returns Array of upload results
   */
  async uploadProductKnowledge(
    knowledgeBasePath: string,
    productId: ProductId,
    allowedFiles: string[]
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    // Upload common files
    const commonPath = path.join(knowledgeBasePath, 'common');
    if (fs.existsSync(commonPath)) {
      const commonFiles = fs.readdirSync(commonPath).filter(f =>
        f.endsWith('.txt') && allowedFiles.includes(f)
      );

      for (const fileName of commonFiles) {
        const filePath = path.join(commonPath, fileName);
        const result = await this.uploadFile(filePath, fileName, 'common', productId);
        results.push(result);

        // Add delay to avoid rate limits
        await this.delay(500);
      }
    }

    // Upload product-specific files
    if (productId === 'HA' || productId === 'SH') {
      const productPath = path.join(knowledgeBasePath, productId);
      if (fs.existsSync(productPath)) {
        const productFiles = fs.readdirSync(productPath).filter(f =>
          f.endsWith('.txt') && allowedFiles.includes(f)
        );

        for (const fileName of productFiles) {
          const filePath = path.join(productPath, fileName);
          const result = await this.uploadFile(filePath, fileName, productId as 'HA' | 'SH', productId);
          results.push(result);

          // Add delay to avoid rate limits
          await this.delay(500);
        }
      }
    }

    return results;
  }

  /**
   * Get all uploaded files for a product
   *
   * @param productId - Product ID
   * @returns Array of uploaded files
   */
  getUploadedFiles(productId?: ProductId): UploadedFile[] {
    const allFiles = Array.from(this.uploadCache.values());

    if (!productId) {
      return allFiles;
    }

    return allFiles.filter(file =>
      file.category === 'common' || file.productId === productId
    );
  }

  /**
   * Get file URIs for grounding/search
   *
   * @param productId - Product ID
   * @returns Array of file URIs
   */
  getFileUris(productId?: ProductId): string[] {
    return this.getUploadedFiles(productId).map(file => file.fileUri);
  }

  /**
   * Delete a file from Gemini
   *
   * @param fileUri - File URI to delete
   * @returns Success status
   */
  async deleteFile(fileUri: string): Promise<boolean> {
    try {
      await this.fileManager.deleteFile(fileUri);

      // Remove from cache
      for (const [key, file] of this.uploadCache.entries()) {
        if (file.fileUri === fileUri) {
          this.uploadCache.delete(key);
          break;
        }
      }

      this.saveCache();
      console.log(`[FileManager] Deleted ${fileUri}`);
      return true;

    } catch (error) {
      console.error(`[FileManager] Failed to delete ${fileUri}:`, error);
      return false;
    }
  }

  /**
   * Clear all cached files
   */
  async clearAllFiles(): Promise<void> {
    const files = Array.from(this.uploadCache.values());

    for (const file of files) {
      await this.deleteFile(file.fileUri);
    }

    this.uploadCache.clear();
    this.saveCache();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    totalFiles: number;
    totalSize: number;
    filesByCategory: Record<string, number>;
    filesByProduct: Record<string, number>;
  } {
    const files = Array.from(this.uploadCache.values());

    return {
      totalFiles: files.length,
      totalSize: files.reduce((sum, f) => sum + f.sizeBytes, 0),
      filesByCategory: {
        common: files.filter(f => f.category === 'common').length,
        HA: files.filter(f => f.category === 'HA').length,
        SH: files.filter(f => f.category === 'SH').length,
      },
      filesByProduct: {
        HA: files.filter(f => f.productId === 'HA' || f.category === 'common').length,
        SH: files.filter(f => f.productId === 'SH' || f.category === 'common').length,
      },
    };
  }

  /**
   * Generate cache key for a file
   */
  private getCacheKey(filePath: string): string {
    return filePath;
  }

  /**
   * Load cache from disk
   */
  private loadCache(): void {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const cacheData = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));
        this.uploadCache = new Map(Object.entries(cacheData));
        console.log(`[FileManager] Loaded ${this.uploadCache.size} files from cache`);
      }
    } catch (error) {
      console.warn('[FileManager] Failed to load cache:', error);
      this.uploadCache = new Map();
    }
  }

  /**
   * Save cache to disk
   */
  private saveCache(): void {
    try {
      const cacheData = Object.fromEntries(this.uploadCache.entries());
      fs.writeFileSync(this.cacheFile, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      console.error('[FileManager] Failed to save cache:', error);
    }
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a Gemini File Manager instance
 *
 * @param apiKey - Gemini API key
 * @param cacheDir - Optional cache directory
 * @returns GeminiFileManager instance
 */
export function createGeminiFileManager(apiKey?: string, cacheDir?: string): GeminiFileManager {
  const key = apiKey || process.env.GEMINI_API_KEY || '';

  if (!key) {
    throw new Error('GEMINI_API_KEY is required');
  }

  return new GeminiFileManager(key, cacheDir);
}
