/**
 * 期間表現解析モジュール (FR-TIME-001)
 * Period Expression Analyzer - 広告テキストから期間表現を抽出・正規化
 */

/**
 * 期間表現のタイプ
 */
export type PeriodExpressionType =
  | 'consecutive_years' // X年連続
  | 'date_range' // YYYY年MM月～YYYY年MM月
  | 'calculated_years' // 計算された年数
  | 'full_years' // 満X年
  | 'year_range'; // YYYY年～YYYY年

/**
 * 正規化された期間表現
 */
export interface NormalizedPeriodExpression {
  type: PeriodExpressionType;
  value?: number; // 年数
  startYear?: number;
  startMonth?: number;
  endYear?: number;
  endMonth?: number;
  source: 'main_text' | 'annotation' | 'context';
  originalText: string; // 元のテキスト
  description?: string; // 説明
}

/**
 * 期間表現解析結果
 */
export interface PeriodAnalysisResult {
  expressions: NormalizedPeriodExpression[];
  hasConsecutiveYears: boolean; // X年連続の表現があるか
  hasDateRange: boolean; // 期間範囲の表現があるか
  consistency: {
    isConsistent: boolean; // 期間表現が一貫しているか
    issues: string[]; // 不一致の詳細
  };
}

/**
 * 期間表現を抽出・正規化する
 */
export function analyzePeriodExpressions(
  text: string,
  fullContext?: string
): PeriodAnalysisResult {
  const expressions: NormalizedPeriodExpression[] = [];

  // Pattern 1: X年連続
  const consecutivePattern = /(\d+)年連続/g;
  let match: RegExpExecArray | null;

  while ((match = consecutivePattern.exec(text)) !== null) {
    expressions.push({
      type: 'consecutive_years',
      value: parseInt(match[1]),
      source: 'main_text',
      originalText: match[0],
      description: `${match[1]}年連続`,
    });
  }

  // Pattern 2: YYYY年MM月～YYYY年MM月
  const dateRangePattern =
    /(\d{4})年(\d{1,2})月\s*[～〜~-]\s*(\d{4})年(\d{1,2})月/g;
  while ((match = dateRangePattern.exec(text)) !== null) {
    const startYear = parseInt(match[1]);
    const startMonth = parseInt(match[2]);
    const endYear = parseInt(match[3]);
    const endMonth = parseInt(match[4]);

    expressions.push({
      type: 'date_range',
      startYear,
      startMonth,
      endYear,
      endMonth,
      source: 'annotation',
      originalText: match[0],
      description: `${startYear}年${startMonth}月～${endYear}年${endMonth}月`,
    });
  }

  // Pattern 3: YYYY年～YYYY年 (月なし)
  const yearRangePattern = /(\d{4})年\s*[～〜~-]\s*(\d{4})年/g;
  const tempText = text.replace(dateRangePattern, ''); // 既に処理した部分を除外
  while ((match = yearRangePattern.exec(tempText)) !== null) {
    const startYear = parseInt(match[1]);
    const endYear = parseInt(match[2]);

    expressions.push({
      type: 'year_range',
      startYear,
      endYear,
      source: 'annotation',
      originalText: match[0],
      description: `${startYear}年～${endYear}年`,
    });
  }

  // Pattern 4: 満X年
  const fullYearsPattern = /満(\d+)年/g;
  while ((match = fullYearsPattern.exec(text)) !== null) {
    expressions.push({
      type: 'full_years',
      value: parseInt(match[1]),
      source: 'main_text',
      originalText: match[0],
      description: `満${match[1]}年`,
    });
  }

  // Pattern 5: X年間
  const yearsPattern = /(\d+)年間/g;
  while ((match = yearsPattern.exec(text)) !== null) {
    expressions.push({
      type: 'calculated_years',
      value: parseInt(match[1]),
      source: 'main_text',
      originalText: match[0],
      description: `${match[1]}年間`,
    });
  }

  // 注釈からも抽出 (fullContextがある場合)
  if (fullContext && fullContext !== text) {
    const contextExpressions = extractFromContext(fullContext, text);
    expressions.push(...contextExpressions);
  }

  // 一貫性チェック
  const consistency = checkPeriodConsistency(expressions);

  return {
    expressions,
    hasConsecutiveYears: expressions.some(
      (e) => e.type === 'consecutive_years'
    ),
    hasDateRange: expressions.some(
      (e) => e.type === 'date_range' || e.type === 'year_range'
    ),
    consistency,
  };
}

/**
 * 注釈から期間表現を抽出
 */
function extractFromContext(
  fullContext: string,
  _mainText: string
): NormalizedPeriodExpression[] {
  const expressions: NormalizedPeriodExpression[] = [];

  // 注釈部分を特定（※で始まる行）
  const annotationPattern = /※[^\n]+/g;
  let match: RegExpExecArray | null;

  while ((match = annotationPattern.exec(fullContext)) !== null) {
    const annotation = match[0];

    // この注釈からも期間表現を抽出
    const dateRangePattern =
      /(\d{4})年(\d{1,2})月\s*[～〜~-]\s*(\d{4})年(\d{1,2})月/g;
    let dateMatch: RegExpExecArray | null;

    while ((dateMatch = dateRangePattern.exec(annotation)) !== null) {
      expressions.push({
        type: 'date_range',
        startYear: parseInt(dateMatch[1]),
        startMonth: parseInt(dateMatch[2]),
        endYear: parseInt(dateMatch[3]),
        endMonth: parseInt(dateMatch[4]),
        source: 'annotation',
        originalText: dateMatch[0],
        description: `${dateMatch[1]}年${dateMatch[2]}月～${dateMatch[3]}年${dateMatch[4]}月 (注釈)`,
      });
    }

    // YYYY年～YYYY年 (月なし)
    const yearRangePattern = /(\d{4})年\s*[～〜~-]\s*(\d{4})年/g;
    const tempAnnotation = annotation.replace(dateRangePattern, '');
    let yearMatch: RegExpExecArray | null;

    while ((yearMatch = yearRangePattern.exec(tempAnnotation)) !== null) {
      expressions.push({
        type: 'year_range',
        startYear: parseInt(yearMatch[1]),
        endYear: parseInt(yearMatch[2]),
        source: 'annotation',
        originalText: yearMatch[0],
        description: `${yearMatch[1]}年～${yearMatch[2]}年 (注釈)`,
      });
    }

    // X年連続
    const consecutivePattern = /(\d+)年連続/g;
    let consecutiveMatch: RegExpExecArray | null;

    while ((consecutiveMatch = consecutivePattern.exec(annotation)) !== null) {
      expressions.push({
        type: 'consecutive_years',
        value: parseInt(consecutiveMatch[1]),
        source: 'annotation',
        originalText: consecutiveMatch[0],
        description: `${consecutiveMatch[1]}年連続 (注釈)`,
      });
    }
  }

  return expressions;
}

/**
 * 期間の一貫性をチェック (FR-TIME-002)
 */
export function checkPeriodConsistency(
  expressions: NormalizedPeriodExpression[]
): { isConsistent: boolean; issues: string[] } {
  const issues: string[] = [];

  // X年連続の表現と期間範囲の表現を比較
  const consecutiveYears = expressions.filter(
    (e) => e.type === 'consecutive_years'
  );
  const dateRanges = expressions.filter(
    (e) => e.type === 'date_range' || e.type === 'year_range'
  );

  if (consecutiveYears.length > 0 && dateRanges.length > 0) {
    for (const consecutive of consecutiveYears) {
      for (const range of dateRanges) {
        const calculatedYears = calculateYearsDifference(range);

        if (consecutive.value !== calculatedYears) {
          issues.push(
            `「${consecutive.originalText}」と「${range.originalText}」が一致しません。` +
              `期間範囲から算出される年数は${calculatedYears}年ですが、` +
              `${consecutive.value}年連続と記載されています。`
          );
        }
      }
    }
  }

  // 満X年と期間範囲の比較
  const fullYears = expressions.filter((e) => e.type === 'full_years');
  if (fullYears.length > 0 && dateRanges.length > 0) {
    for (const full of fullYears) {
      for (const range of dateRanges) {
        const calculatedYears = calculateYearsDifference(range);

        if (full.value !== calculatedYears) {
          issues.push(
            `「${full.originalText}」と「${range.originalText}」が一致しません。` +
              `期間範囲から算出される年数は${calculatedYears}年です。`
          );
        }
      }
    }
  }

  return {
    isConsistent: issues.length === 0,
    issues,
  };
}

/**
 * 期間範囲から年数を計算
 */
function calculateYearsDifference(
  range: NormalizedPeriodExpression
): number {
  if (!range.startYear || !range.endYear) {
    return 0;
  }

  // 基本的な年数計算
  let years = range.endYear - range.startYear;

  // 月がある場合、より正確な計算
  if (range.startMonth && range.endMonth) {
    // 月の差を考慮
    const monthsDiff = range.endMonth - range.startMonth;

    // 開始月が終了月より後の場合、1年減らす
    if (monthsDiff < 0) {
      years -= 1;
    }

    // 5年間の表記は、2020年3月～2024年3月の場合、4年と見なすか5年と見なすか
    // ここでは、終了年 - 開始年 + 1 を採用（包括的な計算）
    // 例: 2020年～2024年 = 5年間 (2020, 2021, 2022, 2023, 2024)
    years += 1;
  } else {
    // 月がない場合も包括的に計算
    // 例: 2020年～2024年 = 5年間
    years += 1;
  }

  return years;
}

/**
 * 期間表現の整合性判定結果
 */
export interface PeriodConsistencyResult {
  isValid: boolean;
  violations: Array<{
    type: 'period_mismatch' | 'year_calculation_error';
    severity: 'high' | 'medium';
    description: string;
    expected: string;
    actual: string;
    correctionSuggestion: string;
    referenceKnowledge?: {
      file: string;
      excerpt: string;
    };
  }>;
}

/**
 * 期間表現の整合性を判定 (FR-TIME-002-b)
 */
export function validatePeriodConsistency(
  text: string,
  fullContext?: string
): PeriodConsistencyResult {
  const analysis = analyzePeriodExpressions(text, fullContext);
  const violations: PeriodConsistencyResult['violations'] = [];

  if (!analysis.consistency.isConsistent) {
    for (const issue of analysis.consistency.issues) {
      // 不一致の詳細を解析
      const consecutiveMatch = issue.match(/「(\d+)年連続」/);
      const rangeMatch = issue.match(/「(\d{4})年.*?(\d{4})年」/);
      const calculatedMatch = issue.match(/算出される年数は(\d+)年/);

      if (consecutiveMatch && rangeMatch && calculatedMatch) {
        const claimedYears = parseInt(consecutiveMatch[1]);
        const calculatedYears = parseInt(calculatedMatch[1]);
        const startYear = parseInt(rangeMatch[1]);
        const endYear = parseInt(rangeMatch[2]);

        violations.push({
          type: 'period_mismatch',
          severity: 'high',
          description: `記載期間「${startYear}年～${endYear}年」から算出される年数（${calculatedYears}年）と「${claimedYears}年連続」が一致しません。`,
          expected: `${calculatedYears}年連続`,
          actual: `${claimedYears}年連続`,
          correctionSuggestion: `「${claimedYears}年連続」を「${calculatedYears}年連続」に修正するか、期間を「${startYear}年～${startYear + claimedYears - 1}年」に修正してください。`,
        });
      }
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}
