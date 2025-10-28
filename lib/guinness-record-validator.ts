/**
 * ギネス記録精査モジュール (FR-GUIN-001, FR-GUIN-002)
 * Guinness Record Validator - ギネス記録情報の詳細精査
 */

import {
  analyzePeriodExpressions,
} from './period-expression-analyzer';

/**
 * ギネス記録情報
 */
export interface GuinnessRecordInfo {
  officialTitle: string; // 正確な認定名
  certifiedProduct: string; // 認定対象物/サービス
  certificationPeriod: {
    startYear: number;
    startMonth?: number;
    endYear: number;
    endMonth?: number;
    description: string; // 例: "2020年3月～2024年3月"
  };
  surveyOrganization: string; // 調査機関名
  trademark: string; // 商標表記 (例: "ギネス世界記録™")
  officialGuidelines?: string; // 公式表記ガイドライン
}

/**
 * ギネス記録検証結果
 */
export interface GuinnessValidationResult {
  hasGuinnessReference: boolean; // ギネス記録への言及があるか
  violations: GuinnessViolation[];
  isValid: boolean;
}

/**
 * ギネス記録違反
 */
export interface GuinnessViolation {
  type:
    | 'title_mismatch' // 記録内容の不一致
    | 'period_mismatch' // 期間の不整合
    | 'product_mismatch' // 対象物の不一致
    | 'annotation_incomplete'; // 注釈の不適切性
  severity: 'high' | 'medium';
  description: string;
  expected: string; // 期待される正しい表記
  actual: string; // 実際の表記
  correctionSuggestion: string;
  referenceKnowledge?: {
    file: string;
    excerpt: string;
  };
}

/**
 * ギネス記録のマスターデータ
 * 実際の運用では、RAGナレッジベースから取得
 */
export const GUINNESS_RECORD_MASTER: GuinnessRecordInfo = {
  officialTitle:
    '美容用マイクロニードルスキンパッチにおける最大のブランド',
  certifiedProduct: 'ディープパッチシリーズ',
  certificationPeriod: {
    startYear: 2020,
    endYear: 2024,
    description: '2020年～2024年',
  },
  surveyOrganization: 'TFCO株式会社',
  trademark: 'ギネス世界記録™',
  officialGuidelines:
    'ギネス世界記録™の表示には、認定名、調査機関、調査期間の明記が必須',
};

/**
 * テキストからギネス関連キーワードを検出
 */
export function detectGuinnessKeywords(text: string): {
  hasKeywords: boolean;
  keywords: string[];
} {
  const guinnessKeywords = [
    'ギネス',
    '世界記録',
    'No.1',
    'No1',
    'ナンバーワン',
    'ナンバー1',
    '売上世界一',
  ];

  const detected = guinnessKeywords.filter((keyword) =>
    text.includes(keyword)
  );

  return {
    hasKeywords: detected.length > 0,
    keywords: detected,
  };
}

/**
 * ギネス記録情報を検証 (FR-GUIN-002)
 */
export function validateGuinnessRecord(
  text: string,
  fullContext?: string,
  masterRecord: GuinnessRecordInfo = GUINNESS_RECORD_MASTER
): GuinnessValidationResult {
  const detectionResult = detectGuinnessKeywords(text);

  if (!detectionResult.hasKeywords) {
    return {
      hasGuinnessReference: false,
      violations: [],
      isValid: true,
    };
  }

  const violations: GuinnessViolation[] = [];

  // FR-GUIN-002-a: 記録内容の一致チェック
  checkRecordTitleConsistency(text, masterRecord, violations);

  // FR-GUIN-002-b: 期間の整合性チェック
  checkPeriodConsistency(text, fullContext, masterRecord, violations);

  // FR-GUIN-002-c: 対象物の一致チェック
  // Note: Product name check removed per knowledge base clarification
  // ヒアロディープパッチ、ミケンディープパッチ等は個別に認定されている
  // 注釈で「ディープパッチシリーズとして」と記載されていればOK
  // checkProductConsistency(text, masterRecord, violations);

  // FR-GUIN-002-d: 注釈の適切性チェック
  checkAnnotationCompleteness(text, fullContext, masterRecord, violations);

  return {
    hasGuinnessReference: true,
    violations,
    isValid: violations.length === 0,
  };
}

/**
 * 記録内容の一致チェック (FR-GUIN-002-a)
 */
function checkRecordTitleConsistency(
  text: string,
  masterRecord: GuinnessRecordInfo,
  violations: GuinnessViolation[]
): void {
  // 「売上世界一」のような簡略表現をチェック
  if (text.includes('売上世界一')) {
    // 注釈があるか確認
    const hasAnnotation = /売上世界一\s*[※*]\s*\d+/.test(text);

    if (!hasAnnotation) {
      violations.push({
        type: 'annotation_incomplete',
        severity: 'high',
        description:
          '「売上世界一」の表現には、正確な認定名を記載した注釈が必須です。',
        expected: `売上世界一※1\n※1：${masterRecord.officialTitle}`,
        actual: '売上世界一（注釈なし）',
        correctionSuggestion: `「売上世界一※1」として、注釈に「※1：${masterRecord.surveyOrganization}のグローバル調査、${masterRecord.officialTitle}、${masterRecord.certificationPeriod.description}」を追加してください。`,
        referenceKnowledge: {
          file: 'knowledge/common/44_ギネス世界記録™について.txt',
          excerpt: `正しい認定名: ${masterRecord.officialTitle}`,
        },
      });
    }
  }

  // 誤った認定名の使用をチェック
  const incorrectTitles = [
    '世界一のマイクロニードルパッチ',
    'マイクロニードルパッチ売上世界一',
  ];

  for (const incorrectTitle of incorrectTitles) {
    if (text.includes(incorrectTitle)) {
      violations.push({
        type: 'title_mismatch',
        severity: 'high',
        description: `認定名「${incorrectTitle}」は正確ではありません。`,
        expected: masterRecord.officialTitle,
        actual: incorrectTitle,
        correctionSuggestion: `正確な認定名「${masterRecord.officialTitle}」を使用してください。`,
        referenceKnowledge: {
          file: 'knowledge/common/44_ギネス世界記録™について.txt',
          excerpt: `正しい認定名: ${masterRecord.officialTitle}`,
        },
      });
    }
  }
}

/**
 * 期間の整合性チェック (FR-GUIN-002-b + RULE-PERIOD-01, 02, 03)
 * すべての期間違反を1つにまとめて報告
 */
function checkPeriodConsistency(
  text: string,
  fullContext: string | undefined,
  masterRecord: GuinnessRecordInfo,
  violations: GuinnessViolation[]
): void {
  // 期間表現を解析
  const periodAnalysis = analyzePeriodExpressions(text, fullContext);

  // 連続年数の表現を取得
  const consecutiveYears = periodAnalysis.expressions.filter(
    (e) => e.type === 'consecutive_years'
  );

  // 期間範囲の表現を取得
  const dateRanges = periodAnalysis.expressions.filter(
    (e) => e.type === 'date_range' || e.type === 'year_range'
  );

  if (dateRanges.length === 0) {
    // ギネス記録に言及しているのに期間が記載されていない
    violations.push({
      type: 'annotation_incomplete',
      severity: 'high',
      description:
        'ギネス世界記録™の認定には、認定期間の明記が必須です。',
      expected: masterRecord.certificationPeriod.description,
      actual: '期間の記載なし',
      correctionSuggestion: `注釈に認定期間「${masterRecord.certificationPeriod.description}」を追加してください。`,
      referenceKnowledge: {
        file: 'knowledge/common/44_ギネス世界記録™について.txt',
        excerpt: `認定期間: ${masterRecord.certificationPeriod.description}`,
      },
    });
    return;
  }

  // 正しい連続年数を計算（マスターレコードから）
  const correctConsecutiveYears =
    masterRecord.certificationPeriod.endYear -
    masterRecord.certificationPeriod.startYear +
    1;

  // すべての期間違反を収集
  const errors: string[] = [];
  let actualPeriodDescription = '';
  let hasViolation = false;

  // RULE-PERIOD-02: 連続年数チェック
  if (consecutiveYears.length > 0) {
    for (const consecutive of consecutiveYears) {
      if (consecutive.value !== correctConsecutiveYears) {
        errors.push(`連続年数: 広告「${consecutive.value}年連続」vs 正「${correctConsecutiveYears}年連続」`);
        hasViolation = true;
      }
    }
  }

  // RULE-PERIOD-03: 期間範囲チェック（開始年・終了年・月）
  for (const range of dateRanges) {
    actualPeriodDescription = range.description || range.originalText;

    // 開始年のチェック
    if (
      range.startYear &&
      range.startYear !== masterRecord.certificationPeriod.startYear
    ) {
      errors.push(`開始年: 広告「${range.startYear}年」vs 正「${masterRecord.certificationPeriod.startYear}年」`);
      hasViolation = true;
    }

    // 終了年のチェック
    if (
      range.endYear &&
      range.endYear !== masterRecord.certificationPeriod.endYear
    ) {
      errors.push(`終了年: 広告「${range.endYear}年」vs 正「${masterRecord.certificationPeriod.endYear}年」`);
      hasViolation = true;
    }

    // RULE-PERIOD-01: 月のチェック
    if (range.startMonth || range.endMonth) {
      // ナレッジは年単位のみ（月情報なし）
      errors.push(`期間粒度: 広告は月単位を含むが、ナレッジは年単位のみ`);
      hasViolation = true;
    }
  }

  // 違反がある場合、1つにまとめて報告
  if (hasViolation) {
    const errorDetails = errors.join('、');
    const expectedPeriod = consecutiveYears.length > 0
      ? `${masterRecord.certificationPeriod.description}（${correctConsecutiveYears}年連続）`
      : masterRecord.certificationPeriod.description;

    violations.push({
      type: 'period_mismatch',
      severity: 'high',
      description: `【景表法違反・優良誤認】期間が誤っています。${errorDetails}`,
      expected: expectedPeriod,
      actual: actualPeriodDescription,
      correctionSuggestion: `期間を正しい内容「${expectedPeriod}」に修正してください。`,
      referenceKnowledge: {
        file: 'knowledge/common/44_ギネス世界記録™について.txt',
        excerpt: `正しい認定期間: ${masterRecord.certificationPeriod.description}（${correctConsecutiveYears}年連続）`,
      },
    });
  }
}

/**
 * 対象物の一致チェック (FR-GUIN-002-c)
 */
function _checkProductConsistency(
  text: string,
  masterRecord: GuinnessRecordInfo,
  violations: GuinnessViolation[]
): void {
  // 特定の商品名（例: ヒアロディープパッチ）がギネス記録の直接の対象であるかのように誤認させる表現をチェック
  const specificProducts = ['ヒアロディープパッチ', 'ミケンディープパッチ'];

  for (const product of specificProducts) {
    // 「[商品名]が売上世界一」のような直接的な表現
    const directClaimPattern = new RegExp(
      `${product}[がは].*?(?:売上世界一|ギネス|世界記録)`,
      'g'
    );

    if (directClaimPattern.test(text)) {
      violations.push({
        type: 'product_mismatch',
        severity: 'high',
        description: `ギネス記録の認定対象は「${masterRecord.certifiedProduct}」であり、特定商品「${product}」に直接適用されるかのように誤認させる可能性があります。`,
        expected: `${masterRecord.certifiedProduct}として売上世界一`,
        actual: `${product}が売上世界一`,
        correctionSuggestion: `「${masterRecord.certifiedProduct}」としての認定であることを明記し、「${product}」が「${masterRecord.certifiedProduct}」の一部であることを注釈で説明してください。`,
        referenceKnowledge: {
          file: 'knowledge/common/44_ギネス世界記録™について.txt',
          excerpt: `認定対象: ${masterRecord.certifiedProduct}（シリーズ全体）`,
        },
      });
    }
  }
}

/**
 * 注釈の適切性チェック (FR-GUIN-002-d)
 */
function checkAnnotationCompleteness(
  text: string,
  fullContext: string | undefined,
  masterRecord: GuinnessRecordInfo,
  violations: GuinnessViolation[]
): void {
  // 注釈マーカーがあるか確認
  const hasAnnotationMarker = /[※*]\s*\d+/.test(text);

  if (!hasAnnotationMarker) {
    violations.push({
      type: 'annotation_incomplete',
      severity: 'high',
      description: 'ギネス世界記録™への言及には注釈が必須です。',
      expected: `※1：${masterRecord.surveyOrganization}のグローバル調査、${masterRecord.officialTitle}、${masterRecord.certificationPeriod.description}`,
      actual: '注釈なし',
      correctionSuggestion: `注釈を追加し、調査機関（${masterRecord.surveyOrganization}）、正確な認定名（${masterRecord.officialTitle}）、認定期間（${masterRecord.certificationPeriod.description}）を明記してください。`,
      referenceKnowledge: {
        file: 'knowledge/common/44_ギネス世界記録™について.txt',
        excerpt: masterRecord.officialGuidelines || '',
      },
    });
    return;
  }

  // fullContextがある場合、注釈の内容をチェック
  if (fullContext) {
    const annotationPattern = /※\s*\d+[：:]\s*([^\n]+)/g;
    let match: RegExpExecArray | null;
    let hasCompleteAnnotation = false;

    while ((match = annotationPattern.exec(fullContext)) !== null) {
      const annotationText = match[1];

      // 必須要素がすべて含まれているかチェック
      const hasOrganization = annotationText.includes(
        masterRecord.surveyOrganization
      );
      const hasPeriod =
        annotationText.includes(
          `${masterRecord.certificationPeriod.startYear}`
        ) &&
        annotationText.includes(`${masterRecord.certificationPeriod.endYear}`);
      const hasOfficialTitle =
        annotationText.includes(masterRecord.officialTitle) ||
        annotationText.includes('美容用マイクロニードル');

      if (hasOrganization && hasPeriod && hasOfficialTitle) {
        hasCompleteAnnotation = true;
        break;
      }
    }

    if (!hasCompleteAnnotation) {
      violations.push({
        type: 'annotation_incomplete',
        severity: 'medium',
        description:
          '注釈が不完全です。調査機関、認定名、認定期間のいずれかが欠けています。',
        expected: `※1：${masterRecord.surveyOrganization}のグローバル調査、${masterRecord.officialTitle}、${masterRecord.certificationPeriod.description}`,
        actual: '注釈が不完全',
        correctionSuggestion: `注釈に、調査機関（${masterRecord.surveyOrganization}）、正確な認定名（${masterRecord.officialTitle}）、認定期間（${masterRecord.certificationPeriod.description}）をすべて含めてください。`,
        referenceKnowledge: {
          file: 'knowledge/common/44_ギネス世界記録™について.txt',
          excerpt: `必須項目: 1) 調査機関名、2) 正確な認定名、3) 認定期間`,
        },
      });
    }
  }
}

/**
 * RAGから取得したギネス記録情報をパース
 * (FR-GUIN-001の実装例)
 */
export function parseGuinnessRecordFromRAG(
  ragKnowledge: string
): GuinnessRecordInfo | null {
  // RAGナレッジから情報を抽出
  // 実際の実装では、より堅牢なパーサーを使用

  // 認定名を抽出
  const titleMatch = ragKnowledge.match(
    /認定名[：:]\s*([^\n]+)|正しい認定名[：:]\s*([^\n]+)/
  );
  const officialTitle = titleMatch
    ? titleMatch[1] || titleMatch[2]
    : GUINNESS_RECORD_MASTER.officialTitle;

  // 認定対象を抽出
  const productMatch = ragKnowledge.match(/認定対象[：:]\s*([^\n]+)/);
  const certifiedProduct = productMatch
    ? productMatch[1]
    : GUINNESS_RECORD_MASTER.certifiedProduct;

  // 認定期間を抽出
  const periodMatch = ragKnowledge.match(
    /認定期間[：:]\s*(\d{4})年.*?(\d{4})年/
  );
  const certificationPeriod = periodMatch
    ? {
        startYear: parseInt(periodMatch[1]),
        endYear: parseInt(periodMatch[2]),
        description: `${periodMatch[1]}年～${periodMatch[2]}年`,
      }
    : GUINNESS_RECORD_MASTER.certificationPeriod;

  // 調査機関を抽出
  const orgMatch = ragKnowledge.match(/調査機関[：:]\s*([^\n]+)/);
  const surveyOrganization = orgMatch
    ? orgMatch[1]
    : GUINNESS_RECORD_MASTER.surveyOrganization;

  return {
    officialTitle,
    certifiedProduct,
    certificationPeriod,
    surveyOrganization,
    trademark: 'ギネス世界記録™',
  };
}
