/**
 * 注釈が必要なキーワードと不要なキーワードの定義
 *
 * このファイルは、広告文中のどのキーワードに注釈マーカー（※1, ※2など）が必要かを定義します。
 *
 * ## ※マーカーの意味（重要）
 *
 * 知識ベースルールで「※マーカー」が使われている場合：
 * - **※の直前のキーワード**: 注釈が必要な対象（アクションキーワード）
 * - **※の後のテキスト**: 文脈・剤型・補足情報（非アクションキーワード）
 *
 * 例: 「殺菌※ジェル」
 * - 「殺菌」: 注釈が必要（KEYWORDS_REQUIRING_ANNOTATION に含まれる）
 * - 「ジェル」: 注釈不要（KEYWORDS_NOT_REQUIRING_ANNOTATION に含まれる、剤型）
 *
 * ## ルールの適用条件
 *
 * - 「殺菌※ジェル」ルールは、セグメント内に「殺菌」が存在する場合のみ適用
 * - 「ジェル」だけではルールを適用しない
 *
 * これにより、「薬用ジェル」セグメントに「殺菌※ジェル」ルールが適用される誤検知を防ぎます。
 */

/**
 * 注釈が必要なキーワード（アクションキーワード）
 *
 * これらのキーワードが広告文に含まれる場合、注釈が必要です。
 * 例: 「浸透」→「浸透※1」+ 注釈定義が必要
 */
export const KEYWORDS_REQUIRING_ANNOTATION: ReadonlyArray<string> = [
  // 浸透・到達系
  '浸透', '注入', '届く', '到達', '送り込む', '押し込む', '染み込む', '染み渡る', '導入', '直送', '直達',

  // 殺菌・除菌系
  '殺菌', '消毒', '除菌', '抗菌', '滅菌',

  // 成分配合系
  '配合', '含有', '含む',

  // 効果・効能系
  '改善', '予防', '対策', '効果', '効能', '作用', '機能',
  '治療', '治す', '緩和', '軽減', '解消',

  // その他（商品固有のアクションキーワード）
  '分解', '除去', '吸収', '中和',
];

/**
 * 注釈が不要なキーワード（剤型・形状・その他の一般的な単語）
 *
 * これらのキーワードは、それ自体では注釈を必要としません。
 * ただし、アクションキーワードと組み合わさる場合は別途評価されます。
 * 例: 「ジェル」→ 注釈不要
 *      「殺菌ジェル」→ 「殺菌」に注釈が必要
 */
export const KEYWORDS_NOT_REQUIRING_ANNOTATION: ReadonlyArray<string> = [
  // 剤型・形状
  'ジェル', 'クリーム', 'ローション', '美容液', '化粧水', '乳液',
  'パック', 'マスク', 'シート', 'オイル', 'エッセンス', 'セラム',
  '液', '剤', '粉', '顆粒', 'カプセル', '錠剤',

  // 一般的な商品説明
  '商品', '製品', '薬用', '医薬部外品', '化粧品',
  'ケア用品', 'スキンケア', 'ボディケア', 'ヘアケア',

  // 一般的な形容詞・副詞
  '新しい', '高い', '低い', '良い', '悪い',
  '多い', '少ない', '大きい', '小さい',

  // その他
  '爪', '肌', '髪', '体', '顔', '手', '足',
];

/**
 * キーワードが注釈を必要とするかチェック
 *
 * @param keyword - チェックするキーワード
 * @param productId - 商品ID（オプション：商品固有チェックを行う場合）
 * @returns 注釈が必要な場合 true
 */
export function requiresAnnotation(keyword: string, productId?: string): boolean {
  // 共通チェック
  if (KEYWORDS_REQUIRING_ANNOTATION.includes(keyword)) {
    return true;
  }

  // 商品固有チェック（productIdが指定されている場合）
  if (productId) {
    try {
      // 動的インポートは非同期なので、同期的にrequireを使用
      // テスト環境ではこれが問題になる可能性があるため、
      // 実際の環境ではloadProductConfigを直接importして使用することを推奨
      const { loadProductConfig } = require('./product-config-loader') as typeof import('./product-config-loader');
      const config = loadProductConfig(productId as any);

      // segmentationKeywords.requiredをチェック
      if (config.segmentationKeywords?.required?.includes(keyword)) {
        return true;
      }

      // annotationRulesもチェック（重要: リグレッション防止）
      if (config.annotationRules && config.annotationRules[keyword]) {
        return config.annotationRules[keyword].required === true;
      }

      return false;
    } catch (error) {
      // 設定ファイルがない場合は共通チェックのみ
      console.warn(`[requiresAnnotation] Failed to load product config for ${productId}:`, error);
      return false;
    }
  }

  return false;
}

/**
 * キーワードが注釈不要なキーワードかチェック
 *
 * @param keyword - チェックするキーワード
 * @returns 注釈が不要な場合 true
 */
export function doesNotRequireAnnotation(keyword: string): boolean {
  return KEYWORDS_NOT_REQUIRING_ANNOTATION.includes(keyword);
}

/**
 * 商品固有の注釈テンプレートを取得
 *
 * @param keyword - キーワード
 * @param productId - 商品ID
 * @returns 注釈テンプレート（存在しない場合は null）
 */
export function getAnnotationTemplate(keyword: string, productId: string): string | null {
  try {
    const { loadProductConfig } = require('./product-config-loader') as typeof import('./product-config-loader');
    const config = loadProductConfig(productId as any);

    return config.annotationRules?.[keyword]?.template || null;
  } catch (error) {
    console.warn(`[getAnnotationTemplate] Failed to load product config for ${productId}:`, error);
    return null;
  }
}
