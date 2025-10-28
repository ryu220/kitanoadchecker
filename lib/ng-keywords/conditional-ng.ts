/**
 * 条件付きNGキーワード定義
 * Conditional NG Keywords - キーワード自体はOKだが、特定の条件（注釈等）が必須
 */

export interface ConditionalNGKeyword {
  keyword: string | string[];
  category: 'penetration' | 'ingredient' | 'kuma' | 'medical-effect' | 'guarantee';
  requiredAnnotation: string | RegExp;
  description: string;
  okExamples: string[];
  ngExamples: string[];
  exceptions?: {
    condition: string;
    allowedPattern: string | RegExp;
  }[];
  referenceKnowledge?: string;
  severity?: 'medium' | 'high'; // 追加: 中程度の注意喚起用
}

/**
 * 浸透系キーワード - 角質層範囲の注釈が必須
 */
export const penetrationKeywords: ConditionalNGKeyword[] = [
  {
    keyword: ['浸透', '染み込む', '染みこむ', '染込む'],
    category: 'penetration',
    requiredAnnotation: /※.{0,20}角質層/,
    description: '浸透表現には「※角質層まで」等の注釈が必須',
    okExamples: [
      '浸透※1する ※1：角質層まで',
      '角質層へ浸透',
      '肌に浸透※角質層まで',
    ],
    ngExamples: [
      '肌に浸透',
      '肌の奥深く浸透',
      '深く浸透※ ※保湿成分',
    ],
    exceptions: [
      {
        condition: '医薬部外品の承認成分',
        allowedPattern: /真皮|表皮/,
      },
    ],
    referenceKnowledge: 'knowledge/common/07_浸透の範囲について.txt',
  },
  {
    keyword: ['届く', '到達', '到達する'],
    category: 'penetration',
    requiredAnnotation: /※.{0,20}角質層|角質層(へ|まで|に)/,
    description: '届く表現には「※角質層まで」等の注釈が必須',
    okExamples: [
      '角質層まで届く',
      '角質層に届く※保湿成分',
    ],
    ngExamples: [
      '肌の奥まで届く',
      '深層まで届く',
    ],
    referenceKnowledge: 'knowledge/common/07_浸透の範囲について.txt',
  },
  {
    keyword: ['注入', '直接', '直接的'],
    category: 'penetration',
    requiredAnnotation: /※.{0,20}角質層/,
    description: '注入・直接表現には「※角質層まで」等の注釈が必須',
    okExamples: [
      'ヒアルロン酸直注入※ ※角質層まで',
      '直接※角質層へ届ける ※保湿成分として',
    ],
    ngExamples: [
      'ヒアルロン酸直注入で目元ケア',
      '肌に直接注入',
      '直接肌に届ける',
    ],
    referenceKnowledge: 'knowledge/common/07_浸透の範囲について.txt',
  },
];

/**
 * 特定成分キーワード - 配合目的の注釈が必須
 */
export const ingredientKeywords: ConditionalNGKeyword[] = [
  {
    keyword: ['ヒアルロン酸', 'ヒアルロン'],
    category: 'ingredient',
    requiredAnnotation: /※.{0,30}(保湿|潤い|ハリ|基剤)/,
    description: 'ヒアルロン酸には配合目的（保湿成分等）の注釈が必須',
    okExamples: [
      'ヒアルロン酸※たっぷり配合 ※保湿成分',
      'ヒアルロン酸※配合 ※潤いを与える成分',
      'ヒアルロン酸※ ※肌にハリを与える',
    ],
    ngExamples: [
      'ヒアルロン酸たっぷり配合',
      'ヒアルロン酸※配合 ※美容成分',
      'ヒアルロン酸※配合 ※エイジングケア成分',
    ],
    exceptions: [
      {
        condition: '一般知識の説明',
        allowedPattern: /ヒアルロン酸は|ヒアルロン酸が|分子|一般的/,
      },
      {
        condition: '他社商品の説明',
        allowedPattern: /多くの|一般的な|他の|従来の/,
      },
    ],
    referenceKnowledge: 'knowledge/common/31_特定成分の特記表示.txt',
  },
  {
    keyword: ['コラーゲン'],
    category: 'ingredient',
    requiredAnnotation: /※.{0,30}(保湿|潤い|ハリ|基剤)/,
    description: 'コラーゲンには配合目的（保湿成分等）の注釈が必須',
    okExamples: [
      'コラーゲン※配合 ※保湿成分',
      'コラーゲン※ ※肌にハリを与える',
    ],
    ngExamples: [
      'コラーゲンたっぷり',
      'コラーゲン※配合 ※美肌成分',
    ],
    referenceKnowledge: 'knowledge/common/31_特定成分の特記表示.txt',
  },
  {
    keyword: ['レチノール'],
    category: 'ingredient',
    requiredAnnotation: /※.{0,30}(保湿|潤い|ハリ|基剤|整肌)/,
    description: 'レチノールには配合目的の注釈が必須',
    okExamples: [
      'レチノール※配合 ※整肌成分',
      '肌にハリを与えるレチノール※ ※保湿成分',
    ],
    ngExamples: [
      'レチノール配合',
      'レチノール※ ※エイジングケア成分',
    ],
    referenceKnowledge: 'knowledge/common/31_特定成分の特記表示.txt',
  },
  {
    keyword: ['プラセンタ'],
    category: 'ingredient',
    requiredAnnotation: /※.{0,30}(保湿|潤い|ハリ|基剤|整肌)/,
    description: 'プラセンタには配合目的の注釈が必須',
    okExamples: [
      'プラセンタ※配合 ※保湿成分',
    ],
    ngExamples: [
      'プラセンタエキス配合',
      'プラセンタ※ ※美容成分',
    ],
    referenceKnowledge: 'knowledge/common/31_特定成分の特記表示.txt',
  },
  {
    keyword: ['セラミド'],
    category: 'ingredient',
    requiredAnnotation: /※.{0,30}(保湿|潤い|ハリ|基剤)/,
    description: 'セラミドには配合目的の注釈が必須',
    okExamples: [
      'セラミド※配合 ※保湿成分',
    ],
    ngExamples: [
      'セラミド配合',
    ],
    referenceKnowledge: 'knowledge/common/31_特定成分の特記表示.txt',
  },
];

/**
 * 医薬的効果キーワード - 有効成分の注釈が必須
 */
export const medicalEffectKeywords: ConditionalNGKeyword[] = [
  {
    keyword: ['殺菌', 'さっきん'],
    category: 'medical-effect',
    requiredAnnotation: /※.{0,50}(有効成分|イソプロピルメチルフェノール|ベンザルコニウム|塩化ベンゼトニウム|成分)/,
    description: '「殺菌」には有効成分を明示する注釈が必須',
    okExamples: [
      '殺菌※ジェル ※有効成分：イソプロピルメチルフェノール',
      '殺菌※成分配合 ※イソプロピルメチルフェノール',
      '殺菌※効果 ※有効成分を配合',
    ],
    ngExamples: [
      '殺菌ジェル',
      '殺菌成分配合',
      '殺菌効果で清潔に',
    ],
    referenceKnowledge: 'knowledge/common/殺菌表現について.txt',
  },
  {
    keyword: ['抗菌', 'こうきん'],
    category: 'medical-effect',
    requiredAnnotation: /※.{0,50}(有効成分|清潔|成分)/,
    description: '「抗菌」には有効成分を明示する注釈が必須',
    okExamples: [
      '抗菌※成分 ※有効成分配合',
    ],
    ngExamples: [
      '抗菌成分配合',
    ],
    referenceKnowledge: 'knowledge/common/殺菌表現について.txt',
  },
  {
    keyword: ['消毒', 'しょうどく'],
    category: 'medical-effect',
    requiredAnnotation: /※.{0,50}(有効成分|成分)/,
    description: '「消毒」には有効成分を明示する注釈が必須',
    okExamples: [
      '消毒※効果 ※有効成分配合',
    ],
    ngExamples: [
      '消毒効果',
    ],
    referenceKnowledge: 'knowledge/common/殺菌表現について.txt',
  },
];

/**
 * クマ表現キーワード - クマ定義の注釈が必須
 */
export const kumaKeywords: ConditionalNGKeyword[] = [
  {
    keyword: ['クマ', 'くま'],
    category: 'kuma',
    requiredAnnotation: /※\d*[\s\S]{0,200}(乾燥|古い角質|くすみ|ハリ|不足|暗い目)/,
    description: 'クマには「※乾燥や古い角質によるくすみ、ハリが不足した暗い目の下」の注釈が必須',
    okExamples: [
      'クマ※対策 ※乾燥や古い角質によるくすみ、ハリが不足した暗い目の下',
      'クマ※に特化したケア ※乾燥や古い角質によるくすみ、ハリが不足した暗い目の下',
      'クマ※1対策 ※1乾燥や古い角質によるくすみ、ハリが不足した暗い目の下',
    ],
    ngExamples: [
      '目の下のクマ対策',
      'クマに悩む方へ',
      'クマ専用クリーム',
    ],
    referenceKnowledge: 'knowledge/common/25_クマ表現について.txt',
  },
  {
    keyword: ['青クマ', '青くま'],
    category: 'kuma',
    requiredAnnotation: /※.{0,50}(潤い|ツヤ|乾燥)/,
    description: '青クマには「※潤いやツヤが失われ乾燥した状態」の注釈が必須',
    okExamples: [
      '青クマ※ケア ※潤いやツヤが失われ乾燥した状態',
    ],
    ngExamples: [
      '青クマ対策',
    ],
    referenceKnowledge: 'knowledge/common/25_クマ表現について.txt',
  },
  {
    keyword: ['茶クマ', '茶くま'],
    category: 'kuma',
    requiredAnnotation: /※.{0,50}(くすみ|乾燥|古い角質)/,
    description: '茶クマには「※くすみ（乾燥や古い角質）」の注釈が必須',
    okExamples: [
      '茶クマ※ケア ※くすみ（乾燥や古い角質）が蓄積されている状態',
    ],
    ngExamples: [
      '茶クマ対策',
    ],
    referenceKnowledge: 'knowledge/common/25_クマ表現について.txt',
  },
  {
    keyword: ['黒クマ', '黒くま'],
    category: 'kuma',
    requiredAnnotation: /※.{0,50}(ハリ|不足|暗)/,
    description: '黒クマには「※ハリ不足により目の下が暗く見える状態」の注釈が必須',
    okExamples: [
      '黒クマ※ケア ※ハリ不足により目の下が暗く見える状態',
    ],
    ngExamples: [
      '黒クマ対策',
    ],
    referenceKnowledge: 'knowledge/common/25_クマ表現について.txt',
  },
];

/**
 * 保証系キーワード - 注釈が必要（注意喚起）
 */
export const refundGuaranteeKeywords: ConditionalNGKeyword[] = [
  {
    keyword: ['全額返金保証', '返金保証', '満足保証'],
    category: 'guarantee',
    requiredAnnotation: /遷移先|LP|ランディングページ/,
    description: '画像や動画内に記載する場合は注釈が必要、広告文の場合は遷移先に記載があれば注釈不要',
    severity: 'medium',
    okExamples: [
      '全額返金保証※ ※遷移先ページに詳細記載',
      '広告文：全額返金保証（遷移先に詳細あり）',
    ],
    ngExamples: [
      '画像内：全額返金保証（注釈なし）',
      '動画内：返金保証（注釈なし）',
    ],
    referenceKnowledge: 'knowledge/common/06_注釈の入れ方について.txt',
  },
];

/**
 * 全ての条件付きNGキーワード
 */
export const conditionalNGKeywords: ConditionalNGKeyword[] = [
  ...penetrationKeywords,
  ...ingredientKeywords,
  ...medicalEffectKeywords,
  ...kumaKeywords,
  ...refundGuaranteeKeywords,
];

/**
 * Factory function
 */
export function getConditionalNGKeywords(): ConditionalNGKeyword[] {
  return conditionalNGKeywords;
}

/**
 * カテゴリ別取得
 */
export function getConditionalNGKeywordsByCategory(
  category: 'penetration' | 'ingredient' | 'kuma' | 'medical-effect' | 'guarantee'
): ConditionalNGKeyword[] {
  return conditionalNGKeywords.filter((k) => k.category === category);
}
