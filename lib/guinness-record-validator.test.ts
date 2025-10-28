/**
 * ギネス記録精査モジュールのテスト
 */

import { describe, it, expect } from 'vitest';
import {
  detectGuinnessKeywords,
  validateGuinnessRecord,
  GUINNESS_RECORD_MASTER,
} from './guinness-record-validator';

describe('guinness-record-validator', () => {
  describe('detectGuinnessKeywords', () => {
    it('should detect Guinness keywords', () => {
      const text = 'ギネス世界記録™認定';
      const result = detectGuinnessKeywords(text);

      expect(result.hasKeywords).toBe(true);
      expect(result.keywords).toContain('ギネス');
      expect(result.keywords).toContain('世界記録');
    });

    it('should detect No.1 expressions', () => {
      const text = '売上No.1';
      const result = detectGuinnessKeywords(text);

      expect(result.hasKeywords).toBe(true);
      expect(result.keywords).toContain('No.1');
    });

    it('should detect 売上世界一', () => {
      const text = '売上世界一';
      const result = detectGuinnessKeywords(text);

      expect(result.hasKeywords).toBe(true);
      expect(result.keywords).toContain('売上世界一');
    });

    it('should return false for non-Guinness text', () => {
      const text = '高品質な製品です';
      const result = detectGuinnessKeywords(text);

      expect(result.hasKeywords).toBe(false);
      expect(result.keywords).toHaveLength(0);
    });
  });

  describe('validateGuinnessRecord', () => {
    it('should pass for non-Guinness text', () => {
      const text = '高品質な化粧品';
      const result = validateGuinnessRecord(text);

      expect(result.hasGuinnessReference).toBe(false);
      expect(result.isValid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect missing annotation for 売上世界一', () => {
      const text = '売上世界一の製品';
      const result = validateGuinnessRecord(text);

      expect(result.hasGuinnessReference).toBe(true);
      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].type).toBe('annotation_incomplete');
    });

    it('should validate complete annotation', () => {
      const text = '売上世界一※1';
      const fullContext = `売上世界一※1\n※1：TFCO株式会社のグローバル調査、美容用マイクロニードルスキンパッチにおける最大のブランド、2020年～2024年`;

      const result = validateGuinnessRecord(text, fullContext);

      expect(result.hasGuinnessReference).toBe(true);
      expect(result.isValid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect period mismatch', () => {
      const text = '6年連続売上世界一※1';
      const fullContext = `※1：2020年～2024年`;

      const result = validateGuinnessRecord(text, fullContext);

      expect(result.hasGuinnessReference).toBe(true);
      expect(result.isValid).toBe(false);

      // Should have period mismatch violation
      const periodViolation = result.violations.find(
        (v) => v.type === 'period_mismatch'
      );
      expect(periodViolation).toBeDefined();
    });

    it('should detect incorrect period (2019-2025)', () => {
      const text = '売上世界一※1';
      const fullContext = `※1：2019年3月～2025年2月`;

      const result = validateGuinnessRecord(text, fullContext);

      expect(result.isValid).toBe(false);

      const periodViolation = result.violations.find(
        (v) => v.type === 'period_mismatch'
      );
      expect(periodViolation).toBeDefined();
      expect(periodViolation?.description).toContain('期間が誤っています');
    });

    it('should detect missing period in annotation', () => {
      const text = '売上世界一※1';
      const fullContext = `※1：ギネス世界記録™認定`;

      const result = validateGuinnessRecord(text, fullContext);

      expect(result.isValid).toBe(false);

      const annotationViolation = result.violations.find(
        (v) => v.type === 'annotation_incomplete'
      );
      expect(annotationViolation).toBeDefined();
    });

    it.skip('should detect product mismatch (商品名チェックは削除済み)', () => {
      // Note: Product name check removed per knowledge base clarification
      // ヒアロディープパッチ等は個別に認定されており、注釈で「ディープパッチシリーズとして」と記載すればOK
      const text = 'ヒアロディープパッチが売上世界一';
      const result = validateGuinnessRecord(text);

      expect(result.isValid).toBe(false);

      const productViolation = result.violations.find(
        (v) => v.type === 'product_mismatch'
      );
      expect(productViolation).toBeDefined();
      expect(productViolation?.description).toContain('ディープパッチシリーズ');
    });

    it('should provide correction suggestions', () => {
      const text = '売上世界一';
      const result = validateGuinnessRecord(text);

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].correctionSuggestion).toBeDefined();
      expect(result.violations[0].correctionSuggestion.length).toBeGreaterThan(
        0
      );
    });
  });

  describe('Real-world test cases from Issue #23 Comment', () => {
    it('Test Case: 6年連続 + 2019年3月～2025年2月 (CRITICAL BUG)', () => {
      const text = '6年連続売上世界一※1';
      const fullContext = `6年連続売上世界一※1
※1：ディープパッチシリーズとして売上世界一（TFCO株式会社のグローバル調査、美容用マイクロニードルスキンパッチにおける最大のブランド、2019年3月～2025年2月）`;

      const result = validateGuinnessRecord(text, fullContext);

      // 必ず違反を検出すべき
      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);

      // 期間違反が1つにまとめられていることを確認
      const periodViolation = result.violations.find(
        (v) => v.type === 'period_mismatch'
      );
      expect(periodViolation).toBeDefined();

      // すべての違反内容が1つの説明に含まれていることを確認
      expect(periodViolation?.description).toContain('期間が誤っています');
      expect(periodViolation?.description).toContain('連続年数');
      expect(periodViolation?.description).toContain('開始年');
      expect(periodViolation?.description).toContain('終了年');

      console.log('\n【CRITICAL BUG FIX TEST - 統合版】');
      console.log(`Total violations detected: ${result.violations.length}`);
      result.violations.forEach((v, i) => {
        console.log(`\nViolation ${i + 1}:`);
        console.log(`  Type: ${v.type}`);
        console.log(`  Description: ${v.description}`);
        console.log(`  Expected: ${v.expected}`);
        console.log(`  Actual: ${v.actual}`);
      });
    });
  });

  describe('Real-world test cases from Issue #23', () => {
    it('Test Case: Correct Guinness annotation (OK)', () => {
      const text = '5年連続売上世界一※1';
      const fullContext = `5年連続売上世界一※1
※1：ディープパッチシリーズとして売上世界一（TFCO株式会社のグローバル調査、美容用マイクロニードルスキンパッチにおける最大のブランド、2020年～2024年）`;

      const result = validateGuinnessRecord(text, fullContext);

      expect(result.isValid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('Test Case: Wrong period - 6年連続 but 2020-2024 (NG)', () => {
      const text = '6年連続売上世界一※1';
      const fullContext = `※1：2020年～2024年`;

      const result = validateGuinnessRecord(text, fullContext);

      expect(result.isValid).toBe(false);

      const periodViolation = result.violations.find(
        (v) => v.type === 'period_mismatch'
      );
      expect(periodViolation).toBeDefined();
      expect(periodViolation?.severity).toBe('high');
    });

    it('Test Case: Wrong year range - 2019-2025 (NG)', () => {
      const text = '売上世界一※1';
      const fullContext = `※1：2019年3月～2025年2月`;

      const result = validateGuinnessRecord(text, fullContext);

      expect(result.isValid).toBe(false);

      const periodViolation = result.violations.find(
        (v) => v.type === 'period_mismatch'
      );
      expect(periodViolation).toBeDefined();
      expect(periodViolation?.expected).toContain('2020');
      expect(periodViolation?.expected).toContain('2024');
    });

    it('Test Case: Missing annotation (NG)', () => {
      const text = '売上世界一の製品です';

      const result = validateGuinnessRecord(text);

      expect(result.isValid).toBe(false);
      expect(result.violations[0].type).toBe('annotation_incomplete');
      expect(result.violations[0].correctionSuggestion).toContain('TFCO');
      expect(result.violations[0].correctionSuggestion).toContain('2020');
      expect(result.violations[0].correctionSuggestion).toContain('2024');
    });

    it('Test Case: Incomplete annotation (NG)', () => {
      const text = '売上世界一※1';
      const fullContext = `※1：2020年～2024年`; // Missing organization and official title

      const result = validateGuinnessRecord(text, fullContext);

      expect(result.isValid).toBe(false);

      const annotationViolation = result.violations.find(
        (v) => v.type === 'annotation_incomplete'
      );
      expect(annotationViolation).toBeDefined();
      expect(annotationViolation?.description).toContain('不完全');
    });
  });

  describe('GUINNESS_RECORD_MASTER', () => {
    it('should have correct master data', () => {
      expect(GUINNESS_RECORD_MASTER.officialTitle).toContain(
        '美容用マイクロニードル'
      );
      expect(GUINNESS_RECORD_MASTER.certifiedProduct).toBe(
        'ディープパッチシリーズ'
      );
      expect(GUINNESS_RECORD_MASTER.certificationPeriod.startYear).toBe(2020);
      expect(GUINNESS_RECORD_MASTER.certificationPeriod.endYear).toBe(2024);
      expect(GUINNESS_RECORD_MASTER.surveyOrganization).toBe('TFCO株式会社');
    });
  });
});
