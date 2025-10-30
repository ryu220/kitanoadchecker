/**
 * 文脈依存NGキーワード定義
 * Context-Dependent NG Keywords - キーワード単独ではOKだが、前後の文脈次第でNG
 */

export interface ContextDependentNGKeyword {
  keyword: string | string[];
  category: 'youthful' | 'facility' | 'brightness' | 'kuma-improvement' | 'limited-time';
  ngPatterns: {
    pattern: RegExp;
    reason: string;
    example: string;
    severity: 'high';
  }[];
  okPatterns: {
    pattern: RegExp;
    example: string;
  }[];
  description: string;
  referenceKnowledge?: string;
}

/**
 * 若々しい系表現 - 保証表現・若返り表現との組み合わせでNG
 */
export const youthfulKeywords: ContextDependentNGKeyword[] = [
  {
    keyword: ['若々しい', '若々しく', '若々しさ'],
    category: 'youthful',
    description: '若々しい表現は、保証表現や若返り表現と組み合わせるとNG',
    ngPatterns: [
      {
        pattern: /だけで.{0,20}若々しい.{0,20}あなたのものに/,
        reason: '保証表現との組み合わせ',
        example: '週に1回貼って寝るだけで若々しい肌があなたのものに',
        severity: 'high',
      },
      {
        pattern: /若々しい.{0,20}(よみがえる|蘇る|復活)/,
        reason: '若返り表現との組み合わせ',
        example: '若々しい肌がよみがえる',
        severity: 'high',
      },
      {
        pattern: /若々しい.{0,20}(約束|保証)/,
        reason: '保証表現との組み合わせ',
        example: '若々しい目元を約束します',
        severity: 'high',
      },
    ],
    okPatterns: [
      {
        pattern: /若々しい印象/,
        example: 'ハリやツヤが出て、若々しい印象の目の下に導きます',
      },
      {
        pattern: /若々しく(見える|感じる|映る)/,
        example: 'お肌のケアで若々しく見える',
      },
    ],
    referenceKnowledge: 'knowledge/common/27_若々しい印象や若見え表現について.txt',
  },
  {
    keyword: ['若見え'],
    category: 'youthful',
    description: '若見え表現は、保証表現や若返り表現と組み合わせるとNG',
    ngPatterns: [
      {
        pattern: /だけで.{0,20}若見え/,
        reason: '保証表現との組み合わせ',
        example: 'これを使うだけで若見え肌に',
        severity: 'high',
      },
      {
        pattern: /若見え.{0,20}(約束|保証)/,
        reason: '保証表現との組み合わせ',
        example: '若見えを約束',
        severity: 'high',
      },
    ],
    okPatterns: [
      {
        pattern: /若見え(手肌|肌を目指|を目指す)/,
        example: 'ハリのある若見え手肌を目指せます',
      },
    ],
    referenceKnowledge: 'knowledge/common/27_若々しい印象や若見え表現について.txt',
  },
];

/**
 * 専門機関表現 - 医療行為代替の暗示でNG
 */
export const facilityKeywords: ContextDependentNGKeyword[] = [
  {
    keyword: ['専門機関', 'クリニック', '美容皮膚科'],
    category: 'facility',
    description: '専門機関表現は、商品で代替可能と暗示するとNG',
    ngPatterns: [
      {
        pattern: /専門機関.{0,30}考えましたが.{0,30}(この|本|商品)/,
        reason: '医療行為の代替を暗示',
        example: '専門機関に行くことも考えましたが、この商品を使ったらすごく良かった',
        severity: 'high',
      },
      {
        pattern: /(この|本|商品).{0,30}専門機関.{0,30}不要/,
        reason: '医療行為が不要になると暗示',
        example: 'この商品で専門機関が不要に',
        severity: 'high',
      },
      {
        pattern: /専門機関.{0,30}(行かなくても|通わなくても)/,
        reason: '医療行為の代替を暗示',
        example: '専門機関に行かなくても自宅でケア',
        severity: 'high',
      },
    ],
    okPatterns: [
      {
        pattern: /(マッサージ|クリーム|美容液).{0,20}専門機関.{0,20}(色々|様々|いろいろ)/,
        example: '目の下のケアには、マッサージや専門機関、クリームなど色々な方法があります',
      },
    ],
    referenceKnowledge: 'knowledge/common/35_専門機関などの医療行為を想起させる表現の使い方について.txt',
  },
];

/**
 * 明るい系表現 - クマ・くすみとの組み合わせで肌色変化の暗示
 */
export const brightnessKeywords: ContextDependentNGKeyword[] = [
  {
    keyword: ['明るい', '明るく', '明るくなる'],
    category: 'brightness',
    description: '明るい表現は、クマ・くすみ対策と組み合わせると肌色変化を暗示しNG',
    ngPatterns: [
      {
        pattern: /クマ.{0,20}明るい(目元|肌|トーン)/,
        reason: 'クマ対策での肌色変化暗示',
        example: 'クマ対策で明るい目元に',
        severity: 'high',
      },
      {
        pattern: /(目元|目の下).{0,20}明るくなる/,
        reason: '肌色が明るくなる暗示',
        example: '目の下が明るくなる',
        severity: 'high',
      },
      {
        pattern: /くすみ.{0,20}明るい/,
        reason: 'くすみ対策での肌色変化暗示',
        example: 'くすみケアで明るい肌に',
        severity: 'high',
      },
    ],
    okPatterns: [
      {
        pattern: /明るい印象/,
        example: '明るい印象の目元へ',
      },
      {
        pattern: /明るいトーンのメイク/,
        example: '明るいトーンのメイクで華やかに',
      },
      {
        pattern: /明るい(雰囲気|表情)/,
        example: '明るい雰囲気を演出',
      },
    ],
  },
];

/**
 * クマ改善表現 - 改善を暗示する表現でNG
 */
export const kumaImprovementKeywords: ContextDependentNGKeyword[] = [
  {
    keyword: ['救世主', '解決', '悩み解消'],
    category: 'kuma-improvement',
    description: 'クマと組み合わせると改善を暗示しNG',
    ngPatterns: [
      {
        pattern: /クマ.{0,20}救世主/,
        reason: 'クマの改善を暗示',
        example: 'クマ悩みの救世主',
        severity: 'high',
      },
      {
        pattern: /クマ.{0,20}(解決|解消)/,
        reason: 'クマの改善を暗示',
        example: 'クマ悩み解決',
        severity: 'high',
      },
    ],
    okPatterns: [
      {
        pattern: /クマ.{0,20}(対策|ケア|特化)/,
        example: 'クマ対策に特化したケア',
      },
    ],
    referenceKnowledge: 'knowledge/common/25_クマ表現について.txt',
  },
];

/**
 * 期間限定表現 - 時間的限定性を不当に暗示する表現でNG
 */
export const limitedTimeKeywords: ContextDependentNGKeyword[] = [
  {
    keyword: ['今なら', 'いまなら', '今だけ', 'いまだけ'],
    category: 'limited-time',
    description: '時間的限定性を暗示する表現は、通常時でも同じ条件で購入できる場合にNG（景表法上の優良誤認）',
    ngPatterns: [
      {
        pattern: /(今なら|いまなら|今だけ|いまだけ).{0,30}(OFF|オフ|割引|半額|特典|ポイント|円)/,
        reason: '時間的限定性を不当に暗示し、景表法上の優良誤認となる',
        example: '今なら半額の1,815円（税込）でスタート可能',
        severity: 'high',
      },
      {
        pattern: /(今なら|いまなら|今だけ|いまだけ).{0,30}(お得|特別|限定|キャンペーン)/,
        reason: '時間的限定性を不当に暗示し、景表法上の優良誤認となる',
        example: '今ならお得に購入できます',
        severity: 'high',
      },
    ],
    okPatterns: [
      {
        pattern: /今(申込む|申し込む)と/,
        example: '今申込むと55％OFF（事実の表明であり限定性を暗示しない）',
      },
      {
        pattern: /今は.{0,30}(OFF|オフ|割引)/,
        example: '今は55％OFF（現在の状態を表明しており限定性を暗示しない）',
      },
      {
        pattern: /今(この|現在)/,
        example: '今このページから申込むと半額以下に（事実の表明）',
      },
    ],
    referenceKnowledge: 'knowledge/common/42_今ならお得に購入できる等の表現.txt',
  },
];

/**
 * 全ての文脈依存NGキーワード
 */
export const contextDependentNGKeywords: ContextDependentNGKeyword[] = [
  ...youthfulKeywords,
  ...facilityKeywords,
  ...brightnessKeywords,
  ...kumaImprovementKeywords,
  ...limitedTimeKeywords,
];

/**
 * Factory function
 */
export function getContextDependentNGKeywords(): ContextDependentNGKeyword[] {
  return contextDependentNGKeywords;
}

/**
 * カテゴリ別取得
 */
export function getContextDependentNGKeywordsByCategory(
  category: 'youthful' | 'facility' | 'brightness' | 'kuma-improvement' | 'limited-time'
): ContextDependentNGKeyword[] {
  return contextDependentNGKeywords.filter((k) => k.category === category);
}
