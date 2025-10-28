/**
 * 商品設定ローダー
 *
 * JSON設定ファイルから商品固有の設定を読み込み、バリデーションを行います。
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProductConfig, ValidationResult } from './product-config.schema';
import { ProductId, PRODUCT_IDS } from './types';

/**
 * 設定キャッシュ（パフォーマンス最適化）
 */
const configCache = new Map<ProductId, ProductConfig>();

/**
 * 商品設定を読み込む
 *
 * @param productId - 商品ID
 * @returns 商品設定
 * @throws 設定ファイルが存在しない、またはバリデーションエラーの場合
 *
 * @example
 * const config = loadProductConfig('HA');
 * console.log(config.name); // => "ヒアロディープパッチ"
 */
export function loadProductConfig(productId: ProductId): ProductConfig {
  // キャッシュチェック
  if (configCache.has(productId)) {
    return configCache.get(productId)!;
  }

  // JSONファイル読み込み
  const configPath = path.join(process.cwd(), 'config', 'products', `${productId}.json`);

  if (!fs.existsSync(configPath)) {
    console.warn(`[Product Config] Config file not found: ${configPath}`);
    throw new Error(`Product config not found for ${productId}. Please create config/products/${productId}.json`);
  }

  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent) as ProductConfig;

    // バリデーション
    const validation = validateProductConfig(config);

    if (!validation.valid) {
      throw new Error(`Product config validation failed for ${productId}:\n${validation.errors.join('\n')}`);
    }

    // 警告がある場合はログ出力
    if (validation.warnings.length > 0) {
      console.warn(`[Product Config] Warnings for ${productId}:\n${validation.warnings.join('\n')}`);
    }

    // キャッシュに保存
    configCache.set(productId, config);

    console.log(`[Product Config] ✓ Loaded config for ${productId}: ${config.name}`);

    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${configPath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 商品設定のバリデーション
 *
 * @param config - 商品設定
 * @returns バリデーション結果
 */
export function validateProductConfig(config: ProductConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 必須フィールドチェック
  if (!config.id) {
    errors.push('Missing required field: id');
  }

  if (!config.name) {
    errors.push('Missing required field: name');
  }

  if (!config.category) {
    errors.push('Missing required field: category');
  }

  if (!config.approvedEffects) {
    errors.push('Missing required field: approvedEffects');
  }

  // segmentationKeywordsまたはannotationRulesのいずれかが必須
  if (!config.segmentationKeywords && !config.annotationRules) {
    errors.push('At least one of segmentationKeywords or annotationRules must be defined');
  }

  // 商品IDの妥当性チェック
  if (config.id && !PRODUCT_IDS.includes(config.id)) {
    errors.push(`Invalid product ID: ${config.id}. Must be one of: ${PRODUCT_IDS.join(', ')}`);
  }

  // セグメント化キーワードのチェック
  if (config.segmentationKeywords) {
    const { required, contextDependent, prohibited } = config.segmentationKeywords;

    // キーワード重複チェック
    const allKeywords = [
      ...(required || []),
      ...(contextDependent || []),
      ...(prohibited || [])
    ];

    const duplicates = allKeywords.filter((item, index) => allKeywords.indexOf(item) !== index);

    if (duplicates.length > 0) {
      errors.push(`Duplicate keywords found: ${[...new Set(duplicates)].join(', ')}`);
    }

    // 空配列チェック
    if (required && required.length === 0) {
      warnings.push('segmentationKeywords.required is empty');
    }

    if (prohibited && prohibited.length === 0) {
      warnings.push('segmentationKeywords.prohibited is empty (unusual but allowed)');
    }
  }

  // 注釈ルールのチェック
  if (config.annotationRules && config.segmentationKeywords) {
    const requiredKeywords = config.segmentationKeywords.required || [];

    // 注釈が必要なキーワードに対してルールが定義されているかチェック
    for (const keyword of requiredKeywords) {
      if (!config.annotationRules[keyword]) {
        warnings.push(`Annotation rule not defined for required keyword: ${keyword}`);
      }
    }

    // 注釈ルールのテンプレートチェック
    for (const [keyword, rule] of Object.entries(config.annotationRules)) {
      if (!rule.template || rule.template.trim() === '') {
        errors.push(`Empty annotation template for keyword: ${keyword}`);
      }

      if (!rule.template.startsWith('※')) {
        warnings.push(`Annotation template for "${keyword}" does not start with ※: ${rule.template}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 全商品の設定を読み込む
 *
 * @returns 商品ID → 商品設定のマップ
 */
export function loadAllProductConfigs(): Map<ProductId, ProductConfig> {
  const configs = new Map<ProductId, ProductConfig>();

  for (const productId of PRODUCT_IDS) {
    try {
      const config = loadProductConfig(productId);
      configs.set(productId, config);
    } catch (error) {
      // 設定ファイルが存在しない商品はスキップ（ログのみ）
      console.warn(`[Product Config] Skipping ${productId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return configs;
}

/**
 * キャッシュをクリア（テスト用）
 */
export function clearConfigCache(): void {
  configCache.clear();
  console.log('[Product Config] Cache cleared');
}
