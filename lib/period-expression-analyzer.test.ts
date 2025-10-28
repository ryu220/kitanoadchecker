/**
 * 期間表現解析モジュールのテスト
 */

import { describe, it, expect } from 'vitest';
import {
  analyzePeriodExpressions,
  validatePeriodConsistency,
  checkPeriodConsistency,
} from './period-expression-analyzer';

describe('period-expression-analyzer', () => {
  describe('analyzePeriodExpressions', () => {
    it('should extract consecutive years expression', () => {
      const text = '6年連続売上No.1';
      const result = analyzePeriodExpressions(text);

      expect(result.hasConsecutiveYears).toBe(true);
      expect(result.expressions).toHaveLength(1);
      expect(result.expressions[0].type).toBe('consecutive_years');
      expect(result.expressions[0].value).toBe(6);
    });

    it('should extract date range with months', () => {
      const text = '※1：2020年3月～2024年3月';
      const result = analyzePeriodExpressions(text);

      expect(result.hasDateRange).toBe(true);
      expect(result.expressions).toHaveLength(1);
      expect(result.expressions[0].type).toBe('date_range');
      expect(result.expressions[0].startYear).toBe(2020);
      expect(result.expressions[0].startMonth).toBe(3);
      expect(result.expressions[0].endYear).toBe(2024);
      expect(result.expressions[0].endMonth).toBe(3);
    });

    it('should extract year range without months', () => {
      const text = '2020年～2024年の5年間';
      const result = analyzePeriodExpressions(text);

      expect(result.hasDateRange).toBe(true);
      const yearRange = result.expressions.find((e) => e.type === 'year_range');
      expect(yearRange).toBeDefined();
      expect(yearRange?.startYear).toBe(2020);
      expect(yearRange?.endYear).toBe(2024);
    });

    it('should extract full years expression', () => {
      const text = '満5年の実績';
      const result = analyzePeriodExpressions(text);

      expect(result.expressions).toHaveLength(1);
      expect(result.expressions[0].type).toBe('full_years');
      expect(result.expressions[0].value).toBe(5);
    });

    it('should extract multiple period expressions', () => {
      const text = '6年連続売上No.1 ※1：2020年～2024年の5年間';
      const result = analyzePeriodExpressions(text);

      expect(result.expressions.length).toBeGreaterThanOrEqual(2);
      expect(result.hasConsecutiveYears).toBe(true);
      expect(result.hasDateRange).toBe(true);
    });
  });

  describe('checkPeriodConsistency', () => {
    it('should detect inconsistency between consecutive years and date range', () => {
      const expressions = [
        {
          type: 'consecutive_years' as const,
          value: 6,
          source: 'main_text' as const,
          originalText: '6年連続',
          description: '6年連続',
        },
        {
          type: 'year_range' as const,
          startYear: 2020,
          endYear: 2024,
          source: 'annotation' as const,
          originalText: '2020年～2024年',
          description: '2020年～2024年',
        },
      ];

      const result = checkPeriodConsistency(expressions);

      expect(result.isConsistent).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]).toContain('一致しません');
    });

    it('should pass when periods are consistent', () => {
      const expressions = [
        {
          type: 'consecutive_years' as const,
          value: 5,
          source: 'main_text' as const,
          originalText: '5年連続',
          description: '5年連続',
        },
        {
          type: 'year_range' as const,
          startYear: 2020,
          endYear: 2024,
          source: 'annotation' as const,
          originalText: '2020年～2024年',
          description: '2020年～2024年',
        },
      ];

      const result = checkPeriodConsistency(expressions);

      expect(result.isConsistent).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('validatePeriodConsistency', () => {
    it('should validate consistent periods', () => {
      const text = '5年連続 ※2020年～2024年';
      const result = validatePeriodConsistency(text);

      expect(result.isValid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect period mismatch', () => {
      const text = '6年連続売上No.1 ※1：2020年～2024年';
      const result = validatePeriodConsistency(text);

      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].type).toBe('period_mismatch');
      expect(result.violations[0].severity).toBe('high');
    });

    it('should provide correction suggestions', () => {
      const text = '6年連続 ※2020年～2024年';
      const result = validatePeriodConsistency(text);

      expect(result.isValid).toBe(false);
      expect(result.violations[0].correctionSuggestion).toBeDefined();
      expect(result.violations[0].correctionSuggestion).toContain('修正');
    });
  });

  describe('Real-world test cases', () => {
    it('Test Case: Guinness period verification', () => {
      const text = '6年連続売上世界一';
      const fullContext = '※1：2020年3月～2024年3月';

      const analysis = analyzePeriodExpressions(text, fullContext);

      expect(analysis.hasConsecutiveYears).toBe(true);
      expect(analysis.hasDateRange).toBe(true);

      // Period should be inconsistent (6 years vs 2020-2024 = 5 years)
      expect(analysis.consistency.isConsistent).toBe(false);
    });

    it('Test Case: Correct Guinness annotation', () => {
      const text = '5年連続売上世界一';
      const fullContext =
        '※1：ディープパッチシリーズとして売上世界一（TFCO株式会社のグローバル調査、美容用マイクロニードルスキンパッチにおける最大のブランド、2020年～2024年）';

      const analysis = analyzePeriodExpressions(text, fullContext);

      expect(analysis.consistency.isConsistent).toBe(true);
    });

    it('Test Case: Missing period in annotation', () => {
      const text = '売上世界一';
      const fullContext = '※1：ギネス世界記録™認定';

      const analysis = analyzePeriodExpressions(text, fullContext);

      // No date range found
      expect(analysis.hasDateRange).toBe(false);
    });
  });
});
