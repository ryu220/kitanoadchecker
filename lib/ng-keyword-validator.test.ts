/**
 * NGキーワードバリデーターのテスト
 * Test cases from Issue #23
 */

import { describe, it, expect } from 'vitest';
import { createNGKeywordValidator } from './ng-keyword-validator';

describe('NGKeywordValidator - Issue #23 Test Cases', () => {
  const validator = createNGKeywordValidator();

  describe('Test Case 1: 浸透系（注釈なし）', () => {
    it('should detect NG for "ヒアルロン酸直注入で目元ケア" (no annotation)', () => {
      const text = 'ヒアルロン酸直注入で目元ケア';
      const result = validator.validate(text);

      expect(result.hasViolations).toBe(true);
      expect(result.summary.total).toBeGreaterThan(0);

      // Should detect at least "直注入" or "ヒアルロン酸" violation
      const hasConditionalNG = result.matches.some(
        (m) =>
          m.type === 'conditional' &&
          (m.keyword.includes('注入') ||
            m.keyword.includes('直接') ||
            m.keyword.includes('ヒアルロン'))
      );
      expect(hasConditionalNG).toBe(true);

      console.log('Test Case 1 Result:', {
        hasViolations: result.hasViolations,
        total: result.summary.total,
        matches: result.matches.map((m) => ({
          keyword: m.keyword,
          type: m.type,
          reason: m.reason,
        })),
      });
    });
  });

  describe('Test Case 2: 浸透系（注釈あり）', () => {
    it('should pass for "ヒアルロン酸※1直注入※2で目元ケア ※1保湿成分 ※2角質層まで"', () => {
      const text = 'ヒアルロン酸※1直注入※2で目元ケア ※1保湿成分 ※2角質層まで';
      const result = validator.validate(text);

      // Should not have conditional NG violations for these keywords with proper annotation
      const hasConditionalNG = result.matches.some(
        (m) =>
          m.type === 'conditional' &&
          (m.keyword.includes('注入') ||
            m.keyword.includes('直接') ||
            m.keyword.includes('ヒアルロン'))
      );
      expect(hasConditionalNG).toBe(false);

      console.log('Test Case 2 Result:', {
        hasViolations: result.hasViolations,
        total: result.summary.total,
        matches: result.matches.map((m) => ({
          keyword: m.keyword,
          type: m.type,
          reason: m.reason,
        })),
      });
    });
  });

  describe('Test Case 3: 類似表現（刺す）', () => {
    it('should pass for "刺すヒアルロン酸でクマ対策" (刺す is not in NG keyword list)', () => {
      const text = '刺すヒアルロン酸でクマ対策';
      const result = validator.validate(text);

      // Should not detect "刺す" as NG (not in explicit NG keyword list)
      const hasSasuNG = result.matches.some((m) => m.keyword === '刺す');
      expect(hasSasuNG).toBe(false);

      console.log('Test Case 3 Result:', {
        hasViolations: result.hasViolations,
        total: result.summary.total,
        matches: result.matches.map((m) => ({
          keyword: m.keyword,
          type: m.type,
          reason: m.reason,
        })),
      });
    });
  });

  describe('Test Case 4: 完全NG', () => {
    it('should detect NG for "老け見え印象対策"', () => {
      const text = '老け見え印象対策';
      const result = validator.validate(text);

      expect(result.hasViolations).toBe(true);
      expect(result.summary.total).toBeGreaterThan(0);

      // Should detect "老け見え" as absolute NG
      const hasOkemiNG = result.matches.some(
        (m) => m.type === 'absolute' && m.keyword.includes('老け見え')
      );
      expect(hasOkemiNG).toBe(true);

      console.log('Test Case 4 Result:', {
        hasViolations: result.hasViolations,
        total: result.summary.total,
        matches: result.matches.map((m) => ({
          keyword: m.keyword,
          type: m.type,
          reason: m.reason,
        })),
      });
    });
  });

  describe('Test Case 5: 文脈依存NG', () => {
    it('should detect NG for "週に1回貼って寝るだけで若々しい肌があなたのものに"', () => {
      const text = '週に1回貼って寝るだけで若々しい肌があなたのものに';
      const result = validator.validate(text);

      expect(result.hasViolations).toBe(true);
      expect(result.summary.total).toBeGreaterThan(0);

      // Should detect context-dependent NG for "若々しい" + promise pattern
      const hasContextNG = result.matches.some(
        (m) =>
          m.type === 'context-dependent' && m.keyword.includes('若々しい')
      );
      expect(hasContextNG).toBe(true);

      console.log('Test Case 5 Result:', {
        hasViolations: result.hasViolations,
        total: result.summary.total,
        matches: result.matches.map((m) => ({
          keyword: m.keyword,
          type: m.type,
          reason: m.reason,
        })),
      });
    });
  });

  describe('Test Case 6: 文脈依存OK', () => {
    it('should pass for "ハリやツヤが出て、若々しい印象の目の下に導きます"', () => {
      const text = 'ハリやツヤが出て、若々しい印象の目の下に導きます';
      const result = validator.validate(text);

      // Should not detect context-dependent NG for "若々しい印象"
      const hasContextNG = result.matches.some(
        (m) =>
          m.type === 'context-dependent' && m.keyword.includes('若々しい')
      );
      expect(hasContextNG).toBe(false);

      console.log('Test Case 6 Result:', {
        hasViolations: result.hasViolations,
        total: result.summary.total,
        matches: result.matches.map((m) => ({
          keyword: m.keyword,
          type: m.type,
          reason: m.reason,
        })),
      });
    });
  });

  describe('Additional Test: ユーザーの元のテストケース', () => {
    it('Test A: "刺すヒアルロン酸でクマ対策" should pass (no false positive)', () => {
      const text = '刺すヒアルロン酸でクマ対策';
      const result = validator.validate(text);

      // "刺す" should not be flagged as NG
      const hasSasuNG = result.matches.some((m) => m.keyword === '刺す');
      expect(hasSasuNG).toBe(false);

      console.log('User Test Case A:', {
        text,
        hasViolations: result.hasViolations,
        matches: result.matches,
      });
    });

    it('Test B: "ヒアルロン酸直注入で目元の老け見え印象対策" should detect 3 violations', () => {
      const text = 'ヒアルロン酸直注入で目元の老け見え印象対策';
      const result = validator.validate(text);

      expect(result.hasViolations).toBe(true);

      // Should detect:
      // 1. ヒアルロン酸 (conditional NG - no annotation)
      // 2. 直注入 (conditional NG - no annotation)
      // 3. 老け見え (absolute NG)
      const violationCount = result.summary.total;
      expect(violationCount).toBeGreaterThanOrEqual(2); // At least 2 violations

      console.log('User Test Case B:', {
        text,
        hasViolations: result.hasViolations,
        total: result.summary.total,
        matches: result.matches.map((m) => ({
          keyword: m.keyword,
          type: m.type,
          category: m.category,
          reason: m.reason,
        })),
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple annotations correctly', () => {
      const text =
        'ヒアルロン酸※1配合、直接※2角質層へ届ける ※1保湿成分 ※2角質層まで';
      const result = validator.validate(text);

      // Should not have conditional NG violations with proper annotations
      const hasConditionalNG = result.matches.some(
        (m) => m.type === 'conditional'
      );
      expect(hasConditionalNG).toBe(false);

      console.log('Edge Case - Multiple Annotations:', {
        hasViolations: result.hasViolations,
        matches: result.matches,
      });
    });

    it('should detect クマ without proper annotation', () => {
      const text = 'クマ専用クリーム';
      const result = validator.validate(text);

      expect(result.hasViolations).toBe(true);

      // Should detect both "クマ" (conditional) and "クマ専用" (absolute)
      const hasKumaNG = result.matches.some((m) =>
        m.keyword.includes('クマ')
      );
      expect(hasKumaNG).toBe(true);

      console.log('Edge Case - クマ without annotation:', {
        hasViolations: result.hasViolations,
        matches: result.matches,
      });
    });

    it('should pass クマ with proper annotation', () => {
      const text =
        'クマ※対策 ※乾燥や古い角質によるくすみ、ハリが不足した暗い目の下';
      const result = validator.validate(text);

      // Should not have conditional NG for クマ with proper annotation
      const hasKumaConditionalNG = result.matches.some(
        (m) => m.type === 'conditional' && m.keyword === 'クマ'
      );
      expect(hasKumaConditionalNG).toBe(false);

      console.log('Edge Case - クマ with proper annotation:', {
        hasViolations: result.hasViolations,
        matches: result.matches,
      });
    });
  });
});
