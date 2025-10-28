import { z } from 'zod';
import { PRODUCT_IDS } from './types';

/**
 * ユーザー入力のバリデーションスキーマ
 * Issue #14: 入力制限を10,000文字 → 5,000文字に変更（現実的な上限）
 */
export const userInputSchema = z.object({
  full_text: z.string()
    .min(1, '広告文を入力してください')
    .max(5000, '5,000文字以内で入力してください'),
  product_id: z.enum(PRODUCT_IDS, {
    required_error: '商品を選択してください',
    invalid_type_error: '有効な商品IDを選択してください'
  }),
  provided_evidence: z.string().optional()
});

/**
 * バリデーション済みユーザー入力型
 */
export type UserInputValidated = z.infer<typeof userInputSchema>;

/**
 * セグメントのバリデーションスキーマ
 */
export const segmentSchema = z.object({
  id: z.string().uuid('無効なセグメントIDです'),
  text: z.string().min(1, 'セグメントテキストが必要です'),
  type: z.enum(['claim', 'explanation', 'evidence']).optional(),
  position: z.object({
    start: z.number().int().min(0),
    end: z.number().int().min(0)
  }).optional()
});

/**
 * セグメント化リクエストのバリデーションスキーマ
 * Issue #14: 入力制限を50,000文字 → 5,000文字に変更（現実的な上限）
 */
export const segmentRequestSchema = z.object({
  text: z.string()
    .min(1, 'テキストを入力してください')
    .max(5000, '5,000文字以内で入力してください'),
  productId: z.enum(['HA', 'SH'], {
    required_error: '商品IDを選択してください',
    invalid_type_error: '有効な商品ID（HA/SH）を選択してください'
  }),
  apiKey: z.string()
    .min(1, 'Gemini APIキーが必要です')
    .regex(/^[\w-]+$/, '無効なAPIキー形式です')
    .optional() // Issue #28: Rule-based engine doesn't require API key
});

/**
 * 部分レポートのバリデーションスキーマ
 */
export const partialReportSchema = z.object({
  segment_id: z.string().uuid('無効なセグメントIDです'),
  report_markdown: z.string().min(1, 'レポート内容が必要です')
});

/**
 * 最終レポートのバリデーションスキーマ
 */
export const finalReportSchema = z.object({
  markdown: z.string().min(1, '最終レポートが空です'),
  timestamp: z.string().datetime('無効な日時形式です'),
  input: userInputSchema
});

/**
 * V2 Segment schema for report generation
 */
export const segmentV2Schema = z.object({
  id: z.string().min(1, '無効なセグメントIDです'),
  text: z.string().min(1, 'セグメントテキストが必要です'),
  type: z.enum(['claim', 'explanation', 'evidence', 'cta', 'disclaimer']),
  position: z.object({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    line: z.number().int().min(1).optional()
  }),
  importance: z.number().min(0).max(1).optional(),
  relatedSegments: z.array(z.string()).optional()
});

/**
 * Knowledge reference schema
 */
export const knowledgeReferenceSchema = z.object({
  file: z.string().nullable().transform(val => {
    // null or empty → use error placeholder
    if (!val || val.length === 0) {
      return '【エラー：参照元が指定されていません】';
    }
    return val;
  }),
  excerpt: z.string().nullable().transform(val => {
    // null or empty → use error placeholder
    if (!val || val.length === 0) {
      return '【エラー：知識ベースからの引用が欠落しています】';
    }
    return val;
  }),
  section: z.string().optional(),
  url: z.string().url().optional()
});

/**
 * Violation schema
 */
export const violationSchema = z.object({
  type: z.enum(['薬機法違反', '景表法違反', '社内基準違反', '特商法違反', 'その他']),
  severity: z.enum(['high', 'medium', 'low']),
  description: z.string().min(1, '違反の説明が必要です'),
  referenceKnowledge: knowledgeReferenceSchema,
  correctionSuggestion: z.string().nullable().transform(val => {
    // null or empty string → use error placeholder
    if (!val || val.length < 5) {
      return '【エラー：具体的な修正案が生成されませんでした】';
    }
    return val;
  }),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().optional()
});

/**
 * Segment evaluation schema
 */
export const segmentEvaluationSchema = z.object({
  segmentId: z.string().min(1, '無効なセグメントIDです'),
  compliance: z.boolean(),
  violations: z.array(violationSchema),
  supportingEvidence: z.array(z.string()).optional(),
  evaluatedAt: z.string().datetime(),
  processingTimeMs: z.number().int().min(0).optional()
});

/**
 * Text structure schema
 */
export const textStructureSchema = z.object({
  overview: z.string().min(1, '概要が必要です'),
  mainClaims: z.array(z.string()),
  supportingStatements: z.array(z.string()),
  callToActions: z.array(z.string()).optional(),
  tone: z.enum(['persuasive', 'informational', 'promotional', 'mixed']).optional()
});

/**
 * Report generation request schema
 */
export const reportRequestSchema = z.object({
  input: userInputSchema,
  structure: textStructureSchema,
  segments: z.array(segmentV2Schema).min(1, '少なくとも1つのセグメントが必要です'),
  evaluations: z.array(segmentEvaluationSchema).min(1, '少なくとも1つの評価が必要です'),
});
