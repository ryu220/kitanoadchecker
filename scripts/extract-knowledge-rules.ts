/**
 * Knowledge Base Rule Extraction Script
 *
 * 全ナレッジファイルを分析して以下を抽出:
 * 1. 必須チェックキーワード (Mandatory Check Keywords)
 * 2. 禁止表現 (Prohibited Expressions)
 * 3. 注釈必須キーワード (Annotation Required Keywords)
 * 4. 条件付き表現 (Conditional Expressions)
 *
 * Usage:
 *   npx ts-node scripts/extract-knowledge-rules.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Interfaces
// ============================================================================

interface KeywordRule {
  keyword: string;
  category: 'mandatory' | 'prohibited' | 'annotation-required' | 'conditional';
  severity: 'high' | 'medium' | 'low';
  description: string;
  source: string;
  requiredAnnotation?: string;
  condition?: string;
  allowedProducts?: string[];
  regulatoryCategory?: string; // 薬機法, 景表法, 特商法, 社内基準
  subCategory?: string; // 自社基準, 厚労省適正広告基準, 業界ガイドライン
}

interface ExtractionResult {
  mandatoryKeywords: KeywordRule[];
  prohibitedExpressions: KeywordRule[];
  annotationRequired: KeywordRule[];
  conditionalExpressions: KeywordRule[];
  totalFiles: number;
  totalRules: number;
}

// ============================================================================
// Main Extraction Logic
// ============================================================================

async function extractKnowledgeRules(): Promise<ExtractionResult> {
  const result: ExtractionResult = {
    mandatoryKeywords: [],
    prohibitedExpressions: [],
    annotationRequired: [],
    conditionalExpressions: [],
    totalFiles: 0,
    totalRules: 0,
  };

  const knowledgeDirs = [
    path.join(process.cwd(), 'knowledge', 'common'),
    path.join(process.cwd(), 'knowledge', 'HA'),
    path.join(process.cwd(), 'knowledge', 'SH'),
  ];

  for (const dir of knowledgeDirs) {
    if (!fs.existsSync(dir)) {
      console.warn(`⚠️  Directory not found: ${dir}`);
      continue;
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
    console.log(`📁 Processing directory: ${dir} (${files.length} files)`);

    for (const file of files) {
      const filePath = path.join(dir, file);

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        result.totalFiles++;

        // Analyze file content
        analyzeFile(content, file, dir, result);
      } catch (error) {
        console.warn(`⚠️  Could not read file: ${file} - ${error}`);
        // Try latin1 as fallback encoding
        try {
          const content = fs.readFileSync(filePath, 'latin1');
          result.totalFiles++;
          analyzeFile(content, file, dir, result);
        } catch (err) {
          console.error(`❌ Failed to read file with any encoding: ${file}`);
        }
      }
    }
  }

  result.totalRules =
    result.mandatoryKeywords.length +
    result.prohibitedExpressions.length +
    result.annotationRequired.length +
    result.conditionalExpressions.length;

  return result;
}

// ============================================================================
// File Analysis
// ============================================================================

function analyzeFile(
  content: string,
  fileName: string,
  directory: string,
  result: ExtractionResult
): void {
  const lines = content.split('\n');
  const productId = determineProductId(directory);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Determine regulatory category from filename
    const regulatoryCategory = determineRegulatoryCategory(fileName);
    const subCategory = determineSubCategory(fileName);

    // 1. Extract prohibited expressions
    extractProhibited(line, fileName, productId, regulatoryCategory, subCategory, result);

    // 2. Extract annotation requirements
    extractAnnotationRequired(line, fileName, productId, regulatoryCategory, result);

    // 3. Extract conditional expressions
    extractConditional(line, fileName, productId, regulatoryCategory, result);

    // 4. Extract mandatory check keywords
    extractMandatory(line, fileName, productId, regulatoryCategory, result);
  }
}

// ============================================================================
// Prohibited Expressions Extraction
// ============================================================================

function extractProhibited(
  line: string,
  fileName: string,
  productId: string,
  regulatoryCategory: string,
  subCategory: string,
  result: ExtractionResult
): void {
  const prohibitedPatterns = [
    { pattern: /「(.+?)」.*禁止/g, severity: 'high' as const },
    { pattern: /「(.+?)」.*NG/g, severity: 'high' as const },
    { pattern: /「(.+?)」.*使用不可/g, severity: 'high' as const },
    { pattern: /「(.+?)」.*使用してはならない/g, severity: 'high' as const },
    { pattern: /「(.+?)」.*表示してはならない/g, severity: 'high' as const },
    { pattern: /NG[:：](.+)/g, severity: 'high' as const },
    { pattern: /×[:：](.+)/g, severity: 'high' as const },
  ];

  for (const { pattern, severity } of prohibitedPatterns) {
    let match;
    while ((match = pattern.exec(line)) !== null) {
      const keyword = match[1].trim();

      // Skip if already exists
      if (result.prohibitedExpressions.some(r => r.keyword === keyword)) continue;

      // Skip if too long (likely not a keyword)
      if (keyword.length > 50) continue;

      result.prohibitedExpressions.push({
        keyword,
        category: 'prohibited',
        severity,
        description: line,
        source: fileName,
        allowedProducts: productId === 'common' ? undefined : [productId],
        regulatoryCategory,
        subCategory,
      });
    }
  }

  // Common prohibited expressions (hardcoded important ones)
  const commonProhibited = [
    'シワを解消する',
    'シワを予防する',
    'たるみを改善',
    'クマを改善',
    'シミが消える',
    '根本から改善',
    '肌への浸透',
    '肌内部へ浸透',
    '肌の奥深く浸透',
    '確実に効果がある',
    'これさえあれば',
    '効果を保証',
    'クマ専用',
    '男性専用',
    '女性専用',
    '最高のききめ',
    '無類のききめ',
    '塗るよりも刺すほうが浸透',
    '注入',
    '直注入',
    '医療レベル',
    '治療薬',
  ];

  for (const expr of commonProhibited) {
    if (line.includes(expr)) {
      if (result.prohibitedExpressions.some(r => r.keyword === expr)) continue;

      result.prohibitedExpressions.push({
        keyword: expr,
        category: 'prohibited',
        severity: 'high',
        description: line,
        source: fileName,
        allowedProducts: productId === 'common' ? undefined : [productId],
        regulatoryCategory,
        subCategory,
      });
    }
  }
}

// ============================================================================
// Annotation Required Extraction
// ============================================================================

function extractAnnotationRequired(
  line: string,
  fileName: string,
  productId: string,
  regulatoryCategory: string,
  result: ExtractionResult
): void {
  const annotationPatterns = [
    { pattern: /「(.+?)」.*※(.+)/, annotationGroup: 2 },
    { pattern: /(.+?)※(.+)/, annotationGroup: 2 },
    { pattern: /「(.+?)」.*注釈.*必要/, annotationGroup: 0 },
    { pattern: /「(.+?)」.*注釈.*付ける/, annotationGroup: 0 },
  ];

  for (const { pattern, annotationGroup } of annotationPatterns) {
    const match = line.match(pattern);
    if (match) {
      const keyword = match[1].trim();
      const annotation = annotationGroup > 0 && match[annotationGroup]
        ? match[annotationGroup].trim()
        : '';

      // Skip if already exists
      if (result.annotationRequired.some(r => r.keyword === keyword)) continue;

      // Skip if too long
      if (keyword.length > 30) continue;

      result.annotationRequired.push({
        keyword,
        category: 'annotation-required',
        severity: 'high',
        description: line,
        source: fileName,
        requiredAnnotation: annotation || extractAnnotationFromContext(line, keyword),
        allowedProducts: productId === 'common' ? undefined : [productId],
        regulatoryCategory,
      });
    }
  }

  // Hardcoded important annotation requirements
  const annotationRequirements = [
    { keyword: '浸透', annotation: '※角質層まで' },
    { keyword: 'クマ', annotation: '※乾燥や古い角質によるくすみ、ハリが不足した暗い目の下' },
    { keyword: 'くすみ', annotation: '※乾燥や汚れなどによるもの' },
    { keyword: 'シワ', annotation: '※パッチの物理的効果による' },
    { keyword: '殺菌', annotation: '※消毒の作用機序として' },
    { keyword: '全額返金保証', annotation: '※商品到着後15日以上25日以内に申請、決済手数料・送料は返金対象外' },
    { keyword: '実質無料', annotation: '※実質無料は全額返金保証を利用した場合による' },
  ];

  for (const { keyword, annotation } of annotationRequirements) {
    if (line.includes(keyword)) {
      if (result.annotationRequired.some(r => r.keyword === keyword)) continue;

      result.annotationRequired.push({
        keyword,
        category: 'annotation-required',
        severity: 'high',
        description: line,
        source: fileName,
        requiredAnnotation: annotation,
        allowedProducts: productId === 'common' ? undefined : [productId],
        regulatoryCategory,
      });
    }
  }
}

// ============================================================================
// Conditional Expressions Extraction
// ============================================================================

function extractConditional(
  line: string,
  fileName: string,
  productId: string,
  regulatoryCategory: string,
  result: ExtractionResult
): void {
  const conditionalPatterns = [
    /「(.+?)」.*場合のみ/,
    /「(.+?)」.*条件/,
    /「(.+?)」.*であれば/,
    /「(.+?)」.*に限り/,
  ];

  for (const pattern of conditionalPatterns) {
    const match = line.match(pattern);
    if (match) {
      const keyword = match[1].trim();

      // Skip if already exists
      if (result.conditionalExpressions.some(r => r.keyword === keyword)) continue;

      // Skip if too long
      if (keyword.length > 50) continue;

      result.conditionalExpressions.push({
        keyword,
        category: 'conditional',
        severity: 'medium',
        description: line,
        source: fileName,
        condition: line,
        allowedProducts: productId === 'common' ? undefined : [productId],
        regulatoryCategory,
      });
    }
  }

  // Hardcoded important conditional rules
  const conditionalRules = [
    { keyword: 'シワを伸ばす', condition: 'パッチ商品のみ', annotation: '※パッチの物理的効果による' },
    { keyword: '真皮まで浸透', condition: 'ナイアシンアミド配合商品のみ', annotation: '※有効成分ナイアシンアミド' },
    { keyword: 'シミ対策', condition: '承認済みOTC商品のみ', annotation: '※メラニンの生成を抑え、シミ・ソバカスを防ぐ' },
  ];

  for (const { keyword, condition, annotation } of conditionalRules) {
    if (line.includes(keyword)) {
      if (result.conditionalExpressions.some(r => r.keyword === keyword)) continue;

      result.conditionalExpressions.push({
        keyword,
        category: 'conditional',
        severity: 'medium',
        description: line,
        source: fileName,
        condition,
        requiredAnnotation: annotation,
        regulatoryCategory,
      });
    }
  }
}

// ============================================================================
// Mandatory Keywords Extraction
// ============================================================================

function extractMandatory(
  line: string,
  fileName: string,
  productId: string,
  regulatoryCategory: string,
  result: ExtractionResult
): void {
  const mandatoryKeywords = [
    { keyword: '浸透', severity: 'high' as const, action: '注釈チェック' },
    { keyword: '染み込む', severity: 'high' as const, action: '浸透の言い換え - 注釈チェック' },
    { keyword: '届く', severity: 'medium' as const, action: '浸透の言い換え可能性 - 文脈チェック' },
    { keyword: '侵入する', severity: 'high' as const, action: '浸透の言い換え - 注釈チェック' },
    { keyword: '注入', severity: 'high' as const, action: '禁止（医療行為）' },
    { keyword: '治療', severity: 'high' as const, action: '禁止（医薬品的）' },
    { keyword: '改善', severity: 'high' as const, action: '禁止（医薬品的）' },
    { keyword: '解消', severity: 'high' as const, action: '禁止（医薬品的）' },
    { keyword: '予防', severity: 'high' as const, action: '禁止（医薬品的）' },
    { keyword: 'クマ', severity: 'high' as const, action: '注釈必須' },
    { keyword: 'シミ', severity: 'high' as const, action: '承認済み商品のみ + 注釈必須' },
    { keyword: 'そばかす', severity: 'high' as const, action: '承認済み商品のみ + 注釈必須' },
    { keyword: 'くすみ', severity: 'high' as const, action: '注釈必須' },
    { keyword: 'シワ', severity: 'high' as const, action: 'パッチ商品のみ + 注釈必須' },
    { keyword: 'たるみ', severity: 'medium' as const, action: '特定商品のみ' },
    { keyword: '保証', severity: 'high' as const, action: '禁止（保証表現）' },
    { keyword: '確実', severity: 'high' as const, action: '禁止（保証表現）' },
    { keyword: '最高', severity: 'high' as const, action: '禁止（最上級表現）' },
    { keyword: '無類', severity: 'high' as const, action: '禁止（最上級表現）' },
    { keyword: '最強', severity: 'high' as const, action: '禁止（最上級表現）' },
    { keyword: '殺菌', severity: 'high' as const, action: 'SH商品のみ + 注釈必須' },
    { keyword: '消毒', severity: 'high' as const, action: 'SH商品のみ + 注釈必須' },
    { keyword: '厚生労働省', severity: 'medium' as const, action: '条件付き可' },
    { keyword: '承認', severity: 'medium' as const, action: '条件付き可' },
    { keyword: '合格', severity: 'medium' as const, action: '文脈チェック（試験合格は不可）' },
  ];

  for (const { keyword, severity, action } of mandatoryKeywords) {
    if (line.includes(keyword)) {
      // Skip if already exists
      if (result.mandatoryKeywords.some(r => r.keyword === keyword)) continue;

      result.mandatoryKeywords.push({
        keyword,
        category: 'mandatory',
        severity,
        description: `${action}: ${line}`,
        source: fileName,
        allowedProducts: productId === 'common' ? undefined : [productId],
        regulatoryCategory,
      });
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function determineProductId(directory: string): string {
  if (directory.includes('HA')) return 'HA';
  if (directory.includes('SH')) return 'SH';
  return 'common';
}

function determineRegulatoryCategory(fileName: string): string {
  if (fileName.includes('薬機法') || fileName.includes('薬事')) return '薬機法';
  if (fileName.includes('景表法') || fileName.includes('景品表示法')) return '景表法';
  if (fileName.includes('特商法') || fileName.includes('特定商取引')) return '特商法';
  if (fileName.includes('健増法') || fileName.includes('健康増進')) return '健増法';
  if (fileName.includes('社内')) return '社内基準';

  // Determine from government agency
  if (fileName.includes('厚生労働省')) return '薬機法';
  if (fileName.includes('消費者庁')) return '景表法';
  if (fileName.includes('化粧品工業連合会') || fileName.includes('OTC医薬品協会')) return '薬機法';

  return '社内基準';
}

function determineSubCategory(fileName: string): string {
  if (fileName.includes('社内') || fileName.includes('まとめ')) return '自社基準';
  if (fileName.includes('厚生労働省') || fileName.includes('適正広告基準')) return '厚労省適正広告基準';
  if (fileName.includes('ガイドライン') || fileName.includes('工業連合会') || fileName.includes('協議会')) return '業界ガイドライン';
  if (fileName.includes('消費者庁')) return '消費者庁ガイドライン';

  return '自社基準';
}

function extractAnnotationFromContext(line: string, keyword: string): string {
  // Try to extract annotation from the same line
  const annotationMatch = line.match(/※(.+)/);
  if (annotationMatch) {
    return `※${annotationMatch[1].trim()}`;
  }
  return '';
}

// ============================================================================
// Output Functions
// ============================================================================

async function saveResults(result: ExtractionResult): Promise<void> {
  const outputDir = path.join(process.cwd(), 'config', 'keywords');

  // Create directory if not exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Save each category
  const files = [
    { name: 'mandatory-keywords.json', data: result.mandatoryKeywords },
    { name: 'prohibited-expressions.json', data: result.prohibitedExpressions },
    { name: 'annotation-rules.json', data: result.annotationRequired },
    { name: 'conditional-rules.json', data: result.conditionalExpressions },
  ];

  for (const { name, data } of files) {
    const filePath = path.join(outputDir, name);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`✅ Saved: ${filePath} (${data.length} rules)`);
  }

  // Save summary
  const summaryPath = path.join(outputDir, 'extraction-summary.json');
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        totalFiles: result.totalFiles,
        totalRules: result.totalRules,
        mandatoryKeywords: result.mandatoryKeywords.length,
        prohibitedExpressions: result.prohibitedExpressions.length,
        annotationRequired: result.annotationRequired.length,
        conditionalExpressions: result.conditionalExpressions.length,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf-8'
  );
  console.log(`✅ Saved summary: ${summaryPath}`);
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  console.log('='.repeat(100));
  console.log('📊 Knowledge Base Rule Extraction');
  console.log('='.repeat(100));
  console.log('');

  try {
    const result = await extractKnowledgeRules();

    console.log('');
    console.log('✅ Extraction Complete');
    console.log('');
    console.log(`📁 Total Files Analyzed: ${result.totalFiles}`);
    console.log(`📋 Total Rules Extracted: ${result.totalRules}`);
    console.log('');
    console.log('━'.repeat(100));
    console.log('📊 Rule Breakdown');
    console.log('━'.repeat(100));
    console.log(`  🔹 Mandatory Check Keywords: ${result.mandatoryKeywords.length}`);
    console.log(`  🚫 Prohibited Expressions: ${result.prohibitedExpressions.length}`);
    console.log(`  📌 Annotation Required: ${result.annotationRequired.length}`);
    console.log(`  ⚠️  Conditional Expressions: ${result.conditionalExpressions.length}`);
    console.log('');

    // Show top 10 from each category
    console.log('━'.repeat(100));
    console.log('🚫 Top 10 Prohibited Expressions');
    console.log('━'.repeat(100));
    result.prohibitedExpressions.slice(0, 10).forEach((rule, idx) => {
      console.log(`  ${idx + 1}. 「${rule.keyword}」 [${rule.severity}] - ${rule.source}`);
    });
    console.log('');

    console.log('━'.repeat(100));
    console.log('📌 Top 10 Annotation Required Keywords');
    console.log('━'.repeat(100));
    result.annotationRequired.slice(0, 10).forEach((rule, idx) => {
      console.log(`  ${idx + 1}. 「${rule.keyword}」 → ${rule.requiredAnnotation || 'N/A'}`);
    });
    console.log('');

    // Save results
    await saveResults(result);

    console.log('');
    console.log('🎉 All rules saved to config/keywords/');
    console.log('');

  } catch (error) {
    console.error('❌ Extraction failed:', error);
    process.exit(1);
  }
}

// Run
main();
