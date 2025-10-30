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
  productCategories?: string[]; // 対象商品カテゴリ（未指定の場合は全商品適用）
}

/**
 * 浸透系キーワード - 角質層範囲の注釈が必須
 */
export const penetrationKeywords: ConditionalNGKeyword[] = [
  {
    keyword: ['浸透', '染み込む', '染みこむ', '染込む'],
    category: 'penetration',
    requiredAnnotation: /※.{0,20}角質層/,
    description: '浸透表現には「※角質層まで」等の注釈が必須（化粧品用）',
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
    productCategories: ['HA'], // 化粧品用
  },
  {
    keyword: ['浸透', '染み込む', '染みこむ', '染込む'],
    category: 'penetration',
    requiredAnnotation: /※.{0,20}(背爪表面|表面に|トッププレート表面)/,
    description: '浸透表現には「※背爪表面に」等の注釈が必須（SH商品用：新指定医薬部外品）',
    okExamples: [
      '爪に浸透※　※背爪表面に',
      '爪に浸透※　※表面に',
      '爪に浸透※　※トッププレート表面に',
      '爪ぎわから爪表面に浸透',
    ],
    ngExamples: [
      '爪の中まで浸透',
      '爪にも浸透',
      '爪に染み込む',
    ],
    referenceKnowledge: 'knowledge/SH/77_【薬事・景表法・社内ルールまとめ】薬用『クリアストロングショット アルファ』.txt',
    productCategories: ['SH'], // 新指定医薬部外品用
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
    description: '「殺菌」には有効成分を明示する注釈が必須（化粧品用）',
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
    productCategories: ['HA'], // 化粧品用
  },
  {
    keyword: ['殺菌', 'さっきん'],
    category: 'medical-effect',
    requiredAnnotation: /※.{0,50}(消毒の作用機序|作用機序として)/,
    description: '「殺菌」には作用機序であることを明示する注釈が必須（SH商品用：新指定医薬部外品）',
    okExamples: [
      '殺菌※ジェル ※殺菌は消毒の作用機序として',
      '殺菌※　※消毒の作用機序として',
      '殺菌作用で消毒',
      '殺菌して消毒',
    ],
    ngExamples: [
      '殺菌ジェル（注釈なし）',
      '殺菌成分配合（注釈なし）',
      '殺菌効果で清潔に（注釈なし）',
    ],
    referenceKnowledge: 'knowledge/SH/77_【薬事・景表法・社内ルールまとめ】薬用『クリアストロングショット アルファ』.txt',
    productCategories: ['SH'], // 新指定医薬部外品用
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
 * ランキング・順位表現キーワード - エビデンスの注釈が必須（景表法）
 * Issue #36: Amazon・楽天で1位等のランキング表現を検知
 */
export const rankingKeywords: ConditionalNGKeyword[] = [
  {
    keyword: ['1位', '第1位', '第一位', '一位'],
    category: 'guarantee', // 景表法関連なのでguaranteeカテゴリを流用
    requiredAnnotation: /※.{0,100}(調査|ランキング|集計|Amazon|楽天|Yahoo)/,
    description: 'ランキング・順位表現には景表法により調査機関・調査期間・調査対象を明記したエビデンスが必須です',
    severity: 'high',
    okExamples: [
      'Amazon・楽天で1位※を獲得 ※2024年1月Amazon・楽天ランキング調査',
      '売上NO.1※ ※2024年自社調べ（調査期間：2023/1-12、対象：当社商品）',
      '第1位※獲得 ※楽天ランキング2024年1月集計',
    ],
    ngExamples: [
      'Amazon・楽天で1位を獲得した人気商品です。',
      '売上NO.1の実績',
      'ランキング第1位',
    ],
    referenceKnowledge: 'knowledge/common/37_エビデンス表記について.txt',
  },
  {
    keyword: ['NO.1', 'No.1', 'ナンバーワン', 'ナンバー1', 'No1'],
    category: 'guarantee',
    requiredAnnotation: /※.{0,100}(調査|ランキング|集計|売上|販売)/,
    description: 'NO.1表現には景表法により調査機関・調査期間・調査対象を明記したエビデンスが必須です',
    severity: 'high',
    okExamples: [
      '売上NO.1※ ※2024年自社調べ（調査期間：2023/1-12）',
      '販売数NO.1※ ※楽天市場ランキング調査2024年1月',
    ],
    ngExamples: [
      '売上NO.1を達成',
      '販売実績NO.1',
      'ナンバーワン商品',
    ],
    referenceKnowledge: 'knowledge/common/37_エビデンス表記について.txt',
  },
  {
    keyword: ['トップ', 'TOP'],
    category: 'guarantee',
    requiredAnnotation: /※.{0,100}(調査|ランキング|集計|Amazon|楽天)/,
    description: 'トップ表現（ランキング文脈）には景表法によりエビデンスが必須です',
    severity: 'high',
    okExamples: [
      'Amazonランキングでトップ※獲得 ※2024年1月Amazon調べ',
    ],
    ngExamples: [
      'ランキングトップを獲得',
      'トップの売上実績',
    ],
    referenceKnowledge: 'knowledge/common/37_エビデンス表記について.txt',
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
  ...rankingKeywords, // Issue #36: ランキング表現を追加
];

/**
 * Factory function
 * @param productId - 商品ID（例: 'HA', 'SH'）
 * @returns 商品IDに適用されるConditional NG Keywords
 */
export function getConditionalNGKeywords(productId?: string): ConditionalNGKeyword[] {
  if (!productId) {
    // productIdが指定されていない場合、全てのキーワードを返す
    return conditionalNGKeywords;
  }

  // productIdに基づいてフィルタリング
  return conditionalNGKeywords.filter((keyword) => {
    // productCategoriesが未定義の場合は、全商品に適用される（後方互換性）
    if (!keyword.productCategories) {
      return true;
    }
    // productIdがproductCategoriesに含まれる場合のみ適用
    return keyword.productCategories.includes(productId);
  });
}

/**
 * カテゴリ別取得
 */
export function getConditionalNGKeywordsByCategory(
  category: 'penetration' | 'ingredient' | 'kuma' | 'medical-effect' | 'guarantee'
): ConditionalNGKeyword[] {
  return conditionalNGKeywords.filter((k) => k.category === category);
}
