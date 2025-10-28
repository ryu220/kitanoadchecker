/**
 * 商品設定スキーマ定義
 *
 * 全42商品の設定をデータ駆動で管理するための型定義
 */

import { ProductId } from './types';

/**
 * 商品カテゴリ
 */
export type ProductCategory = '化粧品' | '新指定医薬部外品' | '医薬部外品' | '食品';

/**
 * 注釈ルールの重要度
 */
export type AnnotationSeverity = 'high' | 'medium' | 'low';

/**
 * 注釈ルール定義
 */
export interface AnnotationRule {
  /** 注釈が必要かどうか */
  required: boolean;

  /** 注釈テンプレート（例: "※角質層まで"） */
  template: string;

  /** 重要度 */
  severity: AnnotationSeverity;

  /** 知識ベースファイル名（例: knowledge/common/26_くすみ表現について.txt） */
  referenceKnowledge?: string;
}

/**
 * セグメント化キーワード定義
 */
export interface SegmentationKeywords {
  /** 注釈が必要なキーワード（独立セグメント化） */
  required?: string[];

  /** 文脈で判定が変わるキーワード（独立セグメント化） */
  contextDependent?: string[];

  /** 絶対NGのキーワード（独立セグメント化） */
  prohibited?: string[];

  /** 複合表現チェックが必要なキーワード */
  compoundChecks?: string[];
}

/**
 * 知識ベースファイル設定
 */
export interface KnowledgeFiles {
  /** 共通ファイル（全商品共通） */
  common: string[];

  /** 商品固有ファイル */
  specific: {
    /** 薬機法関連 */
    yakujihou: string[];

    /** 景表法関連 */
    keihyouhou: string[];

    /** その他（商品固有ルール等） */
    other: string[];
  };
}

/**
 * 商品設定インターフェース
 */
export interface ProductConfig {
  /** 商品ID（2文字） */
  id: ProductId;

  /** 商品名 */
  name: string;

  /** 商品カテゴリ */
  category: ProductCategory;

  /** 認められた効能効果 */
  approvedEffects: string;

  /** 有効成分（医薬部外品の場合） */
  activeIngredient?: string;

  /** セグメント化キーワード（オプショナル、annotationRulesのみでも可） */
  segmentationKeywords?: SegmentationKeywords;

  /** 注釈ルール（キーワード → ルール） */
  annotationRules?: Record<string, AnnotationRule>;

  /** 知識ベースファイル設定（オプション、デフォルトはknowledge-mapping.csvから取得） */
  knowledgeFiles?: KnowledgeFiles;
}

/**
 * 商品設定のバリデーション結果
 */
export interface ValidationResult {
  /** バリデーションが成功したか */
  valid: boolean;

  /** エラーメッセージのリスト */
  errors: string[];

  /** 警告メッセージのリスト */
  warnings: string[];
}
