/**
 * Vector Database Interface
 *
 * 複数のVector DBに対応できる抽象インターフェース
 * ChromaDB, Pineconeなどの実装を統一的に扱う
 */

/**
 * Vector DBに保存するドキュメント
 */
export interface VectorDBDocument {
  /** ドキュメントID（一意） */
  id: string;

  /** Embeddingベクトル（768次元） */
  embedding: number[];

  /** テキスト本文 */
  text: string;

  /** メタデータ */
  metadata: {
    /** ファイル名 */
    fileName: string;

    /** カテゴリ（common, HA, SH等） */
    category: string;

    /** 商品ID（オプション） */
    productId?: string;

    /** ルールタイプ（浸透、注入、クマ等） */
    ruleType?: string;

    /** 重要度 */
    severity?: 'high' | 'medium' | 'low';

    /** チャンクインデックス */
    chunkIndex?: number;

    /** 総チャンク数 */
    totalChunks?: number;

    /** 追加のカスタムメタデータ */
    [key: string]: string | number | boolean | undefined;
  };
}

/**
 * 検索結果
 */
export interface SearchResult {
  /** ドキュメントID */
  id: string;

  /** テキスト本文 */
  text: string;

  /** メタデータ */
  metadata: VectorDBDocument['metadata'];

  /** 類似度スコア（0-1、高いほど類似） */
  score: number;
}

/**
 * 検索オプション
 */
export interface SearchOptions {
  /** 取得する結果数（default: 20） */
  topK?: number;

  /** 最小類似度スコア（default: 0.5） */
  minScore?: number;

  /** メタデータフィルター */
  filter?: {
    /** 商品IDでフィルタ */
    productId?: string;

    /** カテゴリでフィルタ */
    category?: string;

    /** ルールタイプでフィルタ */
    ruleType?: string;

    /** 重要度でフィルタ */
    severity?: 'high' | 'medium' | 'low';

    /** カスタムフィルター */
    [key: string]: string | number | boolean | undefined;
  };
}

/**
 * Vector Database Interface
 *
 * 全てのVector DB実装が準拠すべきインターフェース
 */
export interface IVectorDB {
  /**
   * Vector DBに接続
   * 初期化処理を行う
   */
  connect(): Promise<void>;

  /**
   * ドキュメントを追加・更新（upsert）
   *
   * @param documents - 追加するドキュメント配列
   * @returns 処理完了
   *
   * @example
   * await vectorDB.upsert([
   *   {
   *     id: 'rule_001',
   *     embedding: [0.1, 0.2, ...],
   *     text: '浸透は角質層までに限定すること',
   *     metadata: { fileName: '07_浸透の範囲について.txt', category: 'common' }
   *   }
   * ]);
   */
  upsert(documents: VectorDBDocument[]): Promise<void>;

  /**
   * ベクトル検索
   *
   * クエリベクトルに類似したドキュメントを検索
   *
   * @param queryEmbedding - クエリのembeddingベクトル
   * @param options - 検索オプション
   * @returns 検索結果（類似度スコア順）
   *
   * @example
   * const results = await vectorDB.search(
   *   queryEmbedding,
   *   { topK: 20, minScore: 0.5, filter: { productId: 'HA' } }
   * );
   */
  search(queryEmbedding: number[], options?: SearchOptions): Promise<SearchResult[]>;

  /**
   * ドキュメント数を取得
   *
   * @param filter - フィルター条件（オプション）
   * @returns ドキュメント数
   */
  count(filter?: SearchOptions['filter']): Promise<number>;

  /**
   * ドキュメントを削除
   *
   * @param ids - 削除するドキュメントID配列
   * @returns 処理完了
   */
  delete(ids: string[]): Promise<void>;

  /**
   * 全てのドキュメントを削除
   *
   * @returns 処理完了
   */
  clear(): Promise<void>;

  /**
   * Vector DBを閉じる
   */
  close(): Promise<void>;

  /**
   * 接続状態を確認
   */
  isConnected(): boolean;
}

/**
 * Vector DB統計情報
 */
export interface VectorDBStats {
  /** 総ドキュメント数 */
  totalDocuments: number;

  /** カテゴリ別ドキュメント数 */
  byCategory: Record<string, number>;

  /** 商品別ドキュメント数 */
  byProduct: Record<string, number>;

  /** Embedding次元数 */
  embeddingDimension: number;
}
