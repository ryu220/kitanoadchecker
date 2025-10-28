/**
 * ChromaDB Vector Database Implementation (Real ChromaDB Server)
 *
 * This implementation connects to a real ChromaDB server running in Docker.
 * Embeddings are persisted in ChromaDB's Volume for permanent storage.
 *
 * Design Philosophy:
 * - NO server-side API key usage (to avoid quota dependency on server admin)
 * - Pre-generate embeddings using setup-vector-db.ts script
 * - Runtime: Load pre-existing embeddings from ChromaDB (no API key needed)
 * - User API keys: Only for query embedding generation (1 per request)
 */

import type {
  IVectorDB,
  VectorDBDocument,
  SearchResult,
  SearchOptions,
} from './interface';
import { createKnowledgeLoaderForRAG } from '../knowledge-loader-for-rag';
import { createKnowledgeChunker } from '../knowledge-chunker';
import { createBatchEmbedder } from '../batch-embedder';
import { createEmbeddingService } from '../embedding-service';
import { ChromaClient, Collection } from 'chromadb';

/**
 * Custom No-Op Embedding Function
 * We use pre-generated embeddings, so no embedding function is needed at runtime
 */
class NoOpEmbeddingFunction {
  async generate(_texts: string[]): Promise<number[][]> {
    // This should never be called since we provide embeddings directly
    throw new Error('NoOpEmbeddingFunction should not be called - we use pre-generated embeddings');
  }
}

export interface ChromaDBConfig {
  url: string;
  collectionName?: string;
  apiKey?: string; // Gemini API key (ONLY for setup script, NOT for runtime!)
  autoLoad?: boolean; // Auto-load knowledge on connect (ONLY for setup script!)
}

/**
 * ChromaDB Vector Database Implementation
 *
 * Connects to real ChromaDB server (http://chroma:8000 in production)
 */
export class ChromaVectorDB implements IVectorDB {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private connected = false;
  private collectionName: string;
  private apiKey?: string;
  private autoLoad: boolean;

  constructor(config: ChromaDBConfig) {
    // Parse URL to extract host, port, and SSL settings
    const url = new URL(config.url);
    const isSSL = url.protocol === 'https:';
    const host = url.hostname;
    const port = url.port || (isSSL ? '443' : '8000');

    console.log(`[ChromaDB] Initializing client with host=${host}, port=${port}, ssl=${isSSL}`);

    // Use new initialization method (path is deprecated)
    this.client = new ChromaClient({
      path: isSSL ? `https://${host}:${port}` : `http://${host}:${port}`
    });

    this.collectionName = config.collectionName || 'ad_checker_knowledge';
    this.apiKey = config.apiKey;
    this.autoLoad = config.autoLoad !== false; // Default: true (for setup script)
  }

  async connect(): Promise<void> {
    console.log(`[ChromaDB] Connecting to ChromaDB server...`);
    console.log(`[ChromaDB] ChromaDB URL: ${this.client['_path'] || 'NOT SET'}`);
    console.log(`[ChromaDB] Collection: ${this.collectionName}`);

    try {
      // Get or create collection
      // CRITICAL: Use NoOpEmbeddingFunction to avoid DefaultEmbeddingFunction
      // We use pre-generated embeddings, so no embedding function is needed at runtime
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        embeddingFunction: new NoOpEmbeddingFunction() as any,
        metadata: {
          description: 'Ad checker knowledge base embeddings',
          createdAt: new Date().toISOString()
        }
      });

      this.connected = true;

      // Check existing documents
      const count = await this.count();
      console.log(`[ChromaDB] ✅ Connected to ChromaDB`);
      console.log(`[ChromaDB] Existing documents: ${count}`);

      // Auto-load knowledge base (ONLY if autoLoad=true AND no existing documents)
      // This is used ONLY by setup-vector-db.ts script, NOT by runtime!
      if (this.autoLoad && count === 0) {
        console.log('[ChromaDB] No documents found. Auto-loading knowledge base...');

        if (!this.apiKey) {
          console.warn('[ChromaDB] ⚠️  WARNING: No API key provided for auto-loading.');
          console.warn('[ChromaDB] Please provide an API key or run setup-vector-db.ts');
        } else {
          await this.loadKnowledgeBase(this.apiKey);
        }
      }

      console.log(`[ChromaDB] Ready with ${await this.count()} documents`);

    } catch (error) {
      console.error('[ChromaDB] ❌ Failed to connect:', error);
      throw new Error(`ChromaDB connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load knowledge base and generate embeddings
   *
   * ⚠️  WARNING: This method is ONLY for setup-vector-db.ts script!
   * ⚠️  DO NOT call this at runtime (it will consume API quota)
   */
  async loadKnowledgeBase(apiKey: string): Promise<void> {
    try {
      console.log('[ChromaDB] Loading knowledge base...');

      // 1. Load knowledge files
      const loader = createKnowledgeLoaderForRAG();
      const knowledgeFiles = await loader.loadAll();
      console.log(`[ChromaDB] Loaded ${knowledgeFiles.length} knowledge files`);

      // 2. Chunk files
      const chunker = createKnowledgeChunker();
      const allChunks = [];
      for (const file of knowledgeFiles) {
        const chunks = chunker.chunk(file.content, file.metadata);
        allChunks.push(...chunks);
      }
      console.log(`[ChromaDB] Created ${allChunks.length} chunks`);

      // 3. Generate embeddings
      const embeddingService = createEmbeddingService(apiKey);
      const batchEmbedder = createBatchEmbedder(embeddingService);
      const embeddings = await batchEmbedder.embedBatch(allChunks.map(c => c.text));
      console.log(`[ChromaDB] Generated ${embeddings.length} embeddings`);

      // 4. Upsert to ChromaDB
      const documents: VectorDBDocument[] = allChunks.map((chunk, i) => ({
        id: chunk.id,
        text: chunk.text,
        embedding: embeddings[i],
        metadata: chunk.metadata,
      }));

      await this.upsert(documents);

      console.log(`[ChromaDB] ✅ Successfully loaded ${documents.length} documents`);
    } catch (error) {
      console.error('[ChromaDB] ❌ Failed to load knowledge base:', error);
      throw error;
    }
  }

  async upsert(documents: VectorDBDocument[]): Promise<void> {
    if (!this.connected || !this.collection) {
      throw new Error('Not connected to ChromaDB');
    }

    if (documents.length === 0) {
      console.warn('[ChromaDB] Upsert called with empty documents array');
      return;
    }

    try {
      console.log(`[ChromaDB] Upserting ${documents.length} documents...`);

      // ChromaDB requires specific format
      const ids = documents.map(doc => doc.id);
      const embeddings = documents.map(doc => doc.embedding);
      // Filter out undefined values from metadata (ChromaDB doesn't accept undefined)
      const metadatas = documents.map(doc => {
        const metadata = doc.metadata || {};
        const cleanMetadata: Record<string, string | number | boolean | null> = {};
        for (const [key, value] of Object.entries(metadata)) {
          if (value !== undefined) {
            cleanMetadata[key] = value === null ? null : value;
          }
        }
        return cleanMetadata;
      });
      const texts = documents.map(doc => doc.text);

      // Batch upsert (ChromaDB handles batching internally)
      const BATCH_SIZE = 100;
      for (let i = 0; i < documents.length; i += BATCH_SIZE) {
        const batchIds = ids.slice(i, i + BATCH_SIZE);
        const batchEmbeddings = embeddings.slice(i, i + BATCH_SIZE);
        const batchMetadatas = metadatas.slice(i, i + BATCH_SIZE);
        const batchDocuments = texts.slice(i, i + BATCH_SIZE);

        await this.collection.add({
          ids: batchIds,
          embeddings: batchEmbeddings,
          metadatas: batchMetadatas,
          documents: batchDocuments,
        });

        console.log(`[ChromaDB] Upserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(documents.length / BATCH_SIZE)}`);
      }

      console.log(`[ChromaDB] ✅ Upserted ${documents.length} documents`);
    } catch (error) {
      console.error('[ChromaDB] ❌ Upsert failed:', error);
      throw new Error(`ChromaDB upsert failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async search(queryEmbedding: number[], options?: SearchOptions): Promise<SearchResult[]> {
    if (!this.connected || !this.collection) {
      throw new Error('Not connected to ChromaDB');
    }

    try {
      const topK = options?.topK || 20;
      const minScore = options?.minScore || 0.5;
      const filter = options?.filter;

      console.log(`[ChromaDB] Searching with topK=${topK}, minScore=${minScore}`);

      // Query ChromaDB
      const results = await this.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: topK * 2, // Get more results to filter by minScore
        where: filter as any, // Type cast to satisfy ChromaDB's Where type
      });

      // Convert ChromaDB results to SearchResult format
      const searchResults: SearchResult[] = [];

      if (results.ids && results.ids[0] && results.distances && results.distances[0]) {
        for (let i = 0; i < results.ids[0].length; i++) {
          const id = results.ids[0][i];
          const distance = results.distances[0][i];

          // Skip if distance is null
          if (distance === null || distance === undefined) {
            continue;
          }

          // Convert distance to similarity score (cosine similarity)
          // ChromaDB returns L2 distance by default, but we configured it for cosine
          // For cosine distance: similarity = 1 - distance
          const similarity = 1 - distance;

          // Filter by minimum score
          if (similarity < minScore) {
            continue;
          }

          const text = results.documents?.[0]?.[i] || '';
          const metadata = results.metadatas?.[0]?.[i] as SearchResult['metadata'] || {};

          searchResults.push({
            id,
            text,
            metadata,
            score: similarity,
          });
        }
      }

      // Sort by score descending and take topK
      searchResults.sort((a, b) => b.score - a.score);
      const topResults = searchResults.slice(0, topK);

      console.log(`[ChromaDB] ✅ Found ${topResults.length} results (filtered from ${searchResults.length})`);

      return topResults;
    } catch (error) {
      console.error('[ChromaDB] ❌ Search failed:', error);
      throw new Error(`ChromaDB search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async count(_filter?: SearchOptions['filter']): Promise<number> {
    if (!this.connected || !this.collection) {
      throw new Error('Not connected to ChromaDB');
    }

    try {
      const result = await this.collection.count();
      return result;
    } catch (error) {
      console.error('[ChromaDB] ❌ Count failed:', error);
      throw new Error(`ChromaDB count failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async delete(ids: string[]): Promise<void> {
    if (!this.connected || !this.collection) {
      throw new Error('Not connected to ChromaDB');
    }

    try {
      await this.collection.delete({ ids });
      console.log(`[ChromaDB] Deleted ${ids.length} documents`);
    } catch (error) {
      console.error('[ChromaDB] ❌ Delete failed:', error);
      throw new Error(`ChromaDB delete failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async clear(): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to ChromaDB');
    }

    try {
      // Delete collection and recreate
      await this.client.deleteCollection({ name: this.collectionName });
      this.collection = await this.client.createCollection({
        name: this.collectionName,
        embeddingFunction: new NoOpEmbeddingFunction() as any,
        metadata: {
          description: 'Ad checker knowledge base embeddings',
          createdAt: new Date().toISOString()
        }
      });
      console.log(`[ChromaDB] Cleared collection: ${this.collectionName}`);
    } catch (error) {
      console.error('[ChromaDB] ❌ Clear failed:', error);
      throw new Error(`ChromaDB clear failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async close(): Promise<void> {
    this.connected = false;
    this.collection = null;
    console.log('[ChromaDB] Connection closed');
  }

  isConnected(): boolean {
    return this.connected && this.collection !== null;
  }
}

/**
 * Factory function to create ChromaDB instance
 */
export function createChromaVectorDB(config: ChromaDBConfig): ChromaVectorDB {
  return new ChromaVectorDB(config);
}
