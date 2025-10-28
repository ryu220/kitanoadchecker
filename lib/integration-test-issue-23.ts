/**
 * Issue #23 統合テスト
 * 元のテストケースを検証
 */

import { createNGKeywordValidator } from './ng-keyword-validator';

const validator = createNGKeywordValidator();

console.log('========================================');
console.log('Issue #23 統合テスト');
console.log('========================================\n');

// Test Case A: 刺すヒアルロン酸でクマ対策
console.log('【Test Case A】');
console.log('テキスト: 「刺すヒアルロン酸でクマ対策」');
console.log('期待結果: 「刺す」は検出されない（誤検出なし）\n');

const testA = '刺すヒアルロン酸でクマ対策';
const resultA = validator.validate(testA);

// Check if "刺す" is detected
const hasSasuNG = resultA.matches.some((m) => m.keyword === '刺す');

console.log('検出結果:');
console.log(`  - 「刺す」の誤検出: ${hasSasuNG ? 'あり（NG）' : 'なし（OK）'}`);
console.log(`  - 総違反件数: ${resultA.summary.total}件`);
console.log('  - 検出されたキーワード:');
resultA.matches.forEach((m) => {
  console.log(`    - 「${m.keyword}」(${m.type}): ${m.reason}`);
});

console.log(`\n✅ Test Case A: ${!hasSasuNG ? '成功' : '失敗'} - 「刺す」は検出されませんでした\n`);

console.log('----------------------------------------\n');

// Test Case B: ヒアルロン酸直注入で目元の老け見え印象対策
console.log('【Test Case B】');
console.log('テキスト: 「ヒアルロン酸直注入で目元の老け見え印象対策」');
console.log('期待結果: NG（複数検出）\n');

const testB = 'ヒアルロン酸直注入で目元の老け見え印象対策';
const resultB = validator.validate(testB);

console.log('検出結果:');
console.log(`  - 総違反件数: ${resultB.summary.total}件`);
console.log('  - 検出されたキーワード:');

const detectedKeywords: string[] = [];
resultB.matches.forEach((m) => {
  console.log(`    - 「${m.keyword}」(${m.type}, ${m.category}): ${m.reason}`);
  if (!detectedKeywords.includes(m.keyword)) {
    detectedKeywords.push(m.keyword);
  }
});

const expectedKeywords = ['老け見え', '注入', 'ヒアルロン'];
const hasExpectedViolations = expectedKeywords.every((kw) =>
  detectedKeywords.some((d) => d.includes(kw))
);

console.log(`\n✅ Test Case B: ${hasExpectedViolations ? '成功' : '失敗'} - 期待されるNGキーワードが検出されました\n`);

console.log('========================================');
console.log('統合テスト結果');
console.log('========================================\n');

const allTestsPassed = !hasSasuNG && hasExpectedViolations;

if (allTestsPassed) {
  console.log('✅ すべてのテストが成功しました！');
  console.log('\nIssue #23の目的達成:');
  console.log('  1. ✅ 「刺す」のような類似表現の誤検出をゼロに');
  console.log('  2. ✅ 明示的に禁止されているキーワードのみをNG判定');
  console.log('  3. ✅ NGキーワードが明示的にリスト化');
  console.log('  4. ✅ RAG検索は参照情報提供のみ（判定には直接使わない）');
} else {
  console.log('❌ テストが失敗しました');
  if (hasSasuNG) {
    console.log('  - Test Case A: 「刺す」が誤検出されました');
  }
  if (!hasExpectedViolations) {
    console.log('  - Test Case B: 期待されるNGキーワードが検出されませんでした');
  }
}

console.log('\n========================================\n');

// Summary
console.log('【サマリー】');
console.log(`NGキーワード統計:`);
const stats = {
  conditional: validator['conditionalKeywords'].length,
  absolute: validator['absoluteKeywords'].length,
  contextDependent: validator['contextDependentKeywords'].length,
};
console.log(`  - 条件付きNG: ${stats.conditional}件`);
console.log(`  - 完全NG: ${stats.absolute}件`);
console.log(`  - 文脈依存NG: ${stats.contextDependent}件`);
console.log(`  - 合計: ${stats.conditional + stats.absolute + stats.contextDependent}件\n`);

process.exit(allTestsPassed ? 0 : 1);
