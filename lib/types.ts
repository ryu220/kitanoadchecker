/**
 * 商品ID定数
 * 全42商品の識別子
 */
export const PRODUCT_IDS = [
  'AI', 'CA', 'CH', 'CK', 'CR', 'DS', 'EA', 'FS',
  'FV', 'FZ', 'GG', 'HA', 'HB', 'HL', 'HP', 'HR',
  'HS', 'HT', 'JX', 'KF', 'KJ', 'LI', 'LK', 'LM',
  'MD', 'ME', 'MI', 'MW', 'NM', 'NO', 'NW', 'OO',
  'OP', 'PS', 'PT', 'RV', 'SC', 'SH', 'SI', 'SS',
  'YS', 'ZS'
] as const;

/**
 * 商品ID型
 */
export type ProductId = typeof PRODUCT_IDS[number];

/**
 * ユーザー入力データ
 */
export interface UserInput {
  /** 広告文全体（最大10,000文字） */
  full_text: string;
  /** 商品ID */
  product_id: ProductId;
  /** ユーザー提供のエビデンス（オプション） */
  provided_evidence?: string;
}

/**
 * セグメント（分割された広告文の一部）
 */
export interface Segment {
  /** セグメントID（UUID） */
  id: string;
  /** 元のテキスト */
  text: string;
  /** セグメントタイプ（オプション） */
  type?: 'claim' | 'explanation' | 'evidence';
  /** 位置情報（オプション） */
  position?: {
    start: number;
    end: number;
  };
}

/**
 * 部分レポート（セグメントごとのチェック結果）
 */
export interface PartialReport {
  /** 対応するセグメントID */
  segment_id: string;
  /** Markdown形式のレポート */
  report_markdown: string;
}

/**
 * 最終レポート（統合されたチェック結果）
 */
export interface FinalReport {
  /** Markdown形式の最終レポート */
  markdown: string;
  /** 生成日時（ISO 8601形式） */
  timestamp: string;
  /** 入力データの参照 */
  input: UserInput;
}

/**
 * APIレスポンス型（共通）
 */
export interface ApiResponse<T> {
  /** 成功フラグ */
  success: boolean;
  /** レスポンスデータ */
  data?: T;
  /** エラーメッセージ */
  error?: string;
}
