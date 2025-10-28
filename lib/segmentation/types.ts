/**
 * ルールベースセグメント分割 - 型定義
 *
 * Issue #28: セグメント分割をLLM依存からルールベースに変更
 */

import { Segment, ProductId } from '../types';
import { ProductConfig } from '../product-config.schema';

/**
 * トークン型
 */
export type TokenType =
  | 'structural-delimiter'  // 【】構造的デリミタ
  | 'paragraph'             // 段落
  | 'sentence'              // 文
  | 'keyword'               // キーワード
  | 'annotation-marker'     // 注釈マーカー（※1, ※2）
  | 'annotation-text'       // 注釈本文
  | 'price'                 // 価格情報
  | 'cta'                   // CTA（Call To Action）
  | 'text';                 // 通常テキスト

/**
 * トークン
 */
export interface Token {
  /** トークンタイプ */
  type: TokenType;

  /** テキスト */
  text: string;

  /** 開始位置（文字数） */
  start: number;

  /** 終了位置（文字数） */
  end: number;

  /** 行番号（1-based） */
  line: number;

  /** メタデータ（オプション） */
  metadata?: {
    /** キーワード名 */
    keyword?: string;

    /** 注釈マーカー番号（※1 → "1"） */
    annotationNumber?: string;

    /** 価格（円） */
    price?: number;

    /** 優先度（高いほど優先） */
    priority?: number;
  };
}

/**
 * セグメント候補
 */
export interface SegmentCandidate {
  /** トークンリスト */
  tokens: Token[];

  /** セグメントタイプ */
  type: 'claim' | 'explanation' | 'evidence' | 'cta' | 'disclaimer';

  /** 重要度（0-1） */
  importance: number;

  /** 優先度（数値が大きいほど優先） */
  priority: number;

  /** マージ済みフラグ */
  merged?: boolean;

  /** 関連する注釈マーカー番号 */
  annotationMarkers?: string[];
}

/**
 * キーワードルール
 */
export interface KeywordRule {
  /** キーワードパターン（正規表現） */
  pattern: RegExp;

  /** セグメントタイプ */
  type: 'claim' | 'explanation' | 'evidence' | 'cta' | 'disclaimer';

  /** 重要度（0-1） */
  importance: number;

  /** 優先度（数値が大きいほど優先） */
  priority: number;

  /** キーワード名 */
  name: string;

  /** 拡張パターン（価格情報を含む場合など） */
  extendPattern?: RegExp;
}

/**
 * セグメント分割設定
 */
export interface SegmentationConfig {
  /** 商品ID */
  productId: ProductId;

  /** 商品設定 */
  productConfig: ProductConfig;

  /** キーワードルール */
  keywordRules: KeywordRule[];

  /** デバッグモード */
  debug?: boolean;
}

/**
 * セグメント分割結果
 */
export interface SegmentationResult {
  /** セグメント配列 */
  segments: Segment[];

  /** 処理時間（ミリ秒） */
  processingTime: number;

  /** トークン数 */
  tokenCount: number;

  /** デバッグ情報（debug=trueの場合のみ） */
  debug?: {
    tokens: Token[];
    candidates: SegmentCandidate[];
  };
}
