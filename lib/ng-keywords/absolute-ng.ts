/**
 * 完全NGキーワード定義
 * Absolute NG Keywords - どんな文脈でも使用不可
 */

export interface AbsoluteNGKeyword {
  keyword: string | string[];
  category: 'rejuvenation' | 'guarantee' | 'medical' | 'out-of-scope';
  severity: 'high' | 'critical';
  description: string;
  violationType: '薬機法違反' | '社内基準違反' | '景表法違反';
  referenceKnowledge?: string;
}

/**
 * 若返り表現 - 絶対NG
 */
export const rejuvenationKeywords: AbsoluteNGKeyword[] = [
  {
    keyword: ['若返り', '若返る'],
    category: 'rejuvenation',
    severity: 'critical',
    description: '若返り表現は効能効果範囲外のため絶対NG',
    violationType: '薬機法違反',
    referenceKnowledge: 'knowledge/common/27_若々しい印象や若見え表現について.txt',
  },
  {
    keyword: ['よみがえる', '蘇る', '甦る'],
    category: 'rejuvenation',
    severity: 'critical',
    description: '復活・再生表現は効能効果範囲外のため絶対NG',
    violationType: '薬機法違反',
    referenceKnowledge: 'knowledge/common/27_若々しい印象や若見え表現について.txt',
  },
  {
    keyword: ['復活する', '復活'],
    category: 'rejuvenation',
    severity: 'critical',
    description: '復活表現は効能効果範囲外のため絶対NG',
    violationType: '薬機法違反',
    referenceKnowledge: 'knowledge/common/27_若々しい印象や若見え表現について.txt',
  },
  {
    keyword: ['再生', '再生する'],
    category: 'rejuvenation',
    severity: 'critical',
    description: '再生表現は医療行為を想起させるため絶対NG',
    violationType: '薬機法違反',
  },
];

/**
 * 保証表現 - 景表法違反
 */
export const guaranteeKeywords: AbsoluteNGKeyword[] = [
  {
    keyword: ['約束します', '約束', 'お約束'],
    category: 'guarantee',
    severity: 'critical',
    description: '効果を約束する表現は景表法違反',
    violationType: '景表法違反',
    referenceKnowledge: 'knowledge/common/27_若々しい印象や若見え表現について.txt',
  },
  {
    keyword: ['保証します', '保証', '保障'],
    category: 'guarantee',
    severity: 'critical',
    description: '効果を保証する表現は景表法違反',
    violationType: '景表法違反',
  },
  {
    keyword: ['必ず', '絶対', '確実に', '100%'],
    category: 'guarantee',
    severity: 'critical',
    description: '断定的な効果表現は景表法違反',
    violationType: '景表法違反',
  },
  {
    keyword: ['完全に', '完璧に', '完璧な'],
    category: 'guarantee',
    severity: 'high',
    description: '完全性を保証する表現は景表法違反',
    violationType: '景表法違反',
  },
  {
    keyword: ['永久に', '永遠に'],
    category: 'guarantee',
    severity: 'critical',
    description: '永続性を保証する表現は景表法違反',
    violationType: '景表法違反',
  },
];

/**
 * 医療行為想起表現 - 薬機法違反
 */
export const medicalKeywords: AbsoluteNGKeyword[] = [
  {
    keyword: ['治療', '治療する'],
    category: 'medical',
    severity: 'critical',
    description: '治療表現は医療行為を想起させるため絶対NG',
    violationType: '薬機法違反',
    referenceKnowledge: 'knowledge/common/35_専門機関などの医療行為を想起させる表現の使い方について.txt',
  },
  {
    keyword: ['治す', '治る', '治ります'],
    category: 'medical',
    severity: 'critical',
    description: '治癒表現は医療行為を想起させるため絶対NG',
    violationType: '薬機法違反',
  },
  {
    keyword: ['完治', '全治'],
    category: 'medical',
    severity: 'critical',
    description: '完治表現は医療行為を想起させるため絶対NG',
    violationType: '薬機法違反',
  },
  {
    keyword: ['手術', '施術'],
    category: 'medical',
    severity: 'critical',
    description: '手術表現は医療行為を想起させるため絶対NG',
    violationType: '薬機法違反',
  },
  {
    keyword: ['注射'],
    category: 'medical',
    severity: 'critical',
    description: '注射表現は医療行為を想起させるため絶対NG（文脈による）',
    violationType: '薬機法違反',
  },
];

/**
 * 効能効果範囲外表現 - 薬機法違反
 */
export const outOfScopeKeywords: AbsoluteNGKeyword[] = [
  {
    keyword: ['改善', '改善する', '改善します'],
    category: 'out-of-scope',
    severity: 'critical',
    description: '「改善」表現は注釈があっても化粧品効能の逸脱となるため絶対NG（化粧品の効能効果56項目に含まれない）',
    violationType: '薬機法違反',
    referenceKnowledge: 'knowledge/HA/55_【薬事・景表法・社内ルールまとめ】『ヒアロディープパッチ』　.txt',
  },
  {
    keyword: ['予防', '予防する', '予防します'],
    category: 'out-of-scope',
    severity: 'critical',
    description: '「予防」表現は注釈があっても化粧品効能の逸脱となるため絶対NG（化粧品では「防ぐ」を使用）',
    violationType: '薬機法違反',
    referenceKnowledge: 'knowledge/HA/55_【薬事・景表法・社内ルールまとめ】『ヒアロディープパッチ』　.txt',
  },
  {
    keyword: ['緩和', '緩和する', '緩和します'],
    category: 'out-of-scope',
    severity: 'critical',
    description: '「緩和」表現は医療行為を想起させるため絶対NG（化粧品の効能効果56項目に含まれない）',
    violationType: '薬機法違反',
    referenceKnowledge: 'knowledge/common/05_化粧品の効能効果（56項目）について.txt',
  },
  {
    keyword: ['軽減', '軽減する', '軽減します'],
    category: 'out-of-scope',
    severity: 'critical',
    description: '「軽減」表現は医療行為を想起させるため絶対NG（化粧品の効能効果56項目に含まれない）',
    violationType: '薬機法違反',
    referenceKnowledge: 'knowledge/common/05_化粧品の効能効果（56項目）について.txt',
  },
  {
    keyword: ['解消', '解消する', '解消します'],
    category: 'out-of-scope',
    severity: 'critical',
    description: '「解消」表現は医療行為を想起させるため絶対NG（化粧品の効能効果56項目に含まれない）',
    violationType: '薬機法違反',
    referenceKnowledge: 'knowledge/common/05_化粧品の効能効果（56項目）について.txt',
  },
  {
    keyword: ['アンチエイジング'],
    category: 'out-of-scope',
    severity: 'high',
    description: 'アンチエイジングは効能効果範囲外（エイジングケアはOK）',
    violationType: '薬機法違反',
  },
  {
    keyword: ['老化防止', '老化を防ぐ'],
    category: 'out-of-scope',
    severity: 'critical',
    description: '老化防止表現は効能効果範囲外',
    violationType: '薬機法違反',
  },
  {
    keyword: ['シミ消し', 'シミを消す', 'シミが消える'],
    category: 'out-of-scope',
    severity: 'critical',
    description: 'シミ消し表現は効能効果範囲外',
    violationType: '薬機法違反',
    referenceKnowledge: 'knowledge/common/05_化粧品の効能効果（56項目）について.txt',
  },
  {
    keyword: ['シワ改善', 'シワを改善'],
    category: 'out-of-scope',
    severity: 'critical',
    description: 'シワ改善は認可成分なしでは効能効果範囲外',
    violationType: '薬機法違反',
    referenceKnowledge: 'knowledge/common/05_化粧品の効能効果（56項目）について.txt',
  },
  {
    keyword: ['ニキビ治療', 'ニキビを治す'],
    category: 'out-of-scope',
    severity: 'critical',
    description: 'ニキビ治療表現は効能効果範囲外かつ医療行為想起',
    violationType: '薬機法違反',
  },
  {
    keyword: ['美白効果', '美白'],
    category: 'out-of-scope',
    severity: 'high',
    description: '美白表現は認可成分なしでは効能効果範囲外（メラニン抑制等の注釈必要）',
    violationType: '薬機法違反',
    referenceKnowledge: 'knowledge/common/05_化粧品の効能効果（56項目）について.txt',
  },
  {
    keyword: ['クマ専用'],
    category: 'out-of-scope',
    severity: 'critical',
    description: 'クマ専用表現はNG（クマは部位ではない）',
    violationType: '社内基準違反',
    referenceKnowledge: 'knowledge/common/25_クマ表現について.txt',
  },
  {
    keyword: ['クマが改善', 'クマを改善', 'クマを予防'],
    category: 'out-of-scope',
    severity: 'critical',
    description: 'クマ改善・予防表現は注釈があっても化粧品効能の逸脱となるため絶対NG',
    violationType: '薬機法違反',
    referenceKnowledge: 'knowledge/HA/55_【薬事・景表法・社内ルールまとめ】『ヒアロディープパッチ』　.txt',
  },
];

/**
 * 全ての完全NGキーワード
 */
export const absoluteNGKeywords: AbsoluteNGKeyword[] = [
  ...rejuvenationKeywords,
  ...guaranteeKeywords,
  ...medicalKeywords,
  ...outOfScopeKeywords,
];

/**
 * Factory function
 */
export function getAbsoluteNGKeywords(): AbsoluteNGKeyword[] {
  return absoluteNGKeywords;
}

/**
 * カテゴリ別取得
 */
export function getAbsoluteNGKeywordsByCategory(
  category: 'rejuvenation' | 'guarantee' | 'medical' | 'out-of-scope'
): AbsoluteNGKeyword[] {
  return absoluteNGKeywords.filter((k) => k.category === category);
}

/**
 * 重要度別取得
 */
export function getAbsoluteNGKeywordsBySeverity(
  severity: 'high' | 'critical'
): AbsoluteNGKeyword[] {
  return absoluteNGKeywords.filter((k) => k.severity === severity);
}
