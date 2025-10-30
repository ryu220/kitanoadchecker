/**
 * Knowledge Base Analysis Script
 *
 * 全ナレッジファイルを分析して、以下を抽出：
 * 1. 必須チェックキーワード（注釈が必要なキーワード）
 * 2. 禁止表現（絶対に使用不可）
 * 3. 条件付き表現（文脈チェックが必要）
 * 4. 言える表現・言えない表現
 */

import * as fs from 'fs';
import * as path from 'path';

interface KeywordRule {
  keyword: string;
  category: '必須チェック' | '禁止' | '条件付き' | '注釈必須';
  severity: 'high' | 'medium' | 'low';
  description: string;
  source: string;
  examples?: string[];
  conditions?: string;
}

interface AnalysisResult {
  mandatoryCheck: KeywordRule[];      // 必須チェックキーワード
  prohibited: KeywordRule[];          // 禁止表現
  conditional: KeywordRule[];         // 条件付き表現
  annotationRequired: KeywordRule[];  // 注釈必須キーワード
  totalFiles: number;
  totalRules: number;
}

async function analyzeKnowledge(): Promise<AnalysisResult> {
  const result: AnalysisResult = {
    mandatoryCheck: [],
    prohibited: [],
    conditional: [],
    annotationRequired: [],
    totalFiles: 0,
    totalRules: 0,
  };

  const knowledgeDirs = [
    path.join(process.cwd(), 'knowledge', 'common'),
    path.join(process.cwd(), 'knowledge', 'HA'),
    path.join(process.cwd(), 'knowledge', 'SH'),
  ];

  for (const dir of knowledgeDirs) {
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));

    for (const file of files) {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      result.totalFiles++;

      // ファイル内容を分析
      analyzeFile(content, file, result);
    }
  }

  result.totalRules =
    result.mandatoryCheck.length +
    result.prohibited.length +
    result.conditional.length +
    result.annotationRequired.length;

  return result;
}

function analyzeFile(content: string, fileName: string, result: AnalysisResult) {
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 禁止表現を検出
    if (
      line.includes('禁止') ||
      line.includes('NG') ||
      line.includes('使用不可') ||
      line.includes('表示してはならない')
    ) {
      extractProhibited(line, fileName, result, lines, i);
    }

    // 注釈必須キーワードを検出
    if (
      line.includes('※') ||
      line.includes('注釈') ||
      line.includes('必ず') && line.includes('付ける')
    ) {
      extractAnnotationRequired(line, fileName, result);
    }

    // 条件付き表現を検出
    if (
      line.includes('場合のみ') ||
      line.includes('条件') ||
      line.includes('～であれば')
    ) {
      extractConditional(line, fileName, result);
    }
  }
}

function extractProhibited(
  line: string,
  fileName: string,
  result: AnalysisResult,
  lines: string[],
  index: number
) {
  // 禁止キーワードを抽出
  const prohibitedPatterns = [
    /「(.+?)」.*禁止/g,
    /「(.+?)」.*NG/g,
    /「(.+?)」.*使用不可/g,
    /「(.+?)」.*表示してはならない/g,
  ];

  for (const pattern of prohibitedPatterns) {
    let match;
    while ((match = pattern.exec(line)) !== null) {
      const keyword = match[1];

      // 重複チェック
      if (result.prohibited.some(r => r.keyword === keyword)) continue;

      result.prohibited.push({
        keyword,
        category: '禁止',
        severity: 'high',
        description: line,
        source: fileName,
      });
    }
  }
}

function extractAnnotationRequired(
  line: string,
  fileName: string,
  result: AnalysisResult
) {
  // 注釈必須キーワードを抽出
  const annotationPatterns = [
    /「(.+?)」.*※(.+)/,
    /(.+?)※(.+)/,
    /「(.+?)」.*注釈.*必要/,
  ];

  for (const pattern of annotationPatterns) {
    const match = line.match(pattern);
    if (match) {
      const keyword = match[1].trim();
      const annotation = match[2] ? match[2].trim() : '';

      // 重複チェック
      if (result.annotationRequired.some(r => r.keyword === keyword)) continue;

      result.annotationRequired.push({
        keyword,
        category: '注釈必須',
        severity: 'high',
        description: line,
        source: fileName,
        conditions: annotation,
      });
    }
  }
}

function extractConditional(
  line: string,
  fileName: string,
  result: AnalysisResult
) {
  // 条件付き表現を抽出
  const conditionalPattern = /「(.+?)」.*場合/;
  const match = line.match(conditionalPattern);

  if (match) {
    const keyword = match[1];

    // 重複チェック
    const isDuplicate = result.conditional.some(r => r.keyword === keyword);
    if (isDuplicate) return;

    result.conditional.push({
      keyword,
      category: '条件付き',
      severity: 'medium',
      description: line,
      source: fileName,
      conditions: line,
    });
  }
}

async function main() {
  console.log('='.repeat(100));
  console.log('📊 Knowledge Base Analysis');
  console.log('='.repeat(100));
  console.log('');

  try {
    const result = await analyzeKnowledge();

    console.log('✅ Analysis Complete');
    console.log('');
    console.log(`📁 Total Files Analyzed: ${result.totalFiles}`);
    console.log(`📋 Total Rules Extracted: ${result.totalRules}`);
    console.log('');

    console.log('━'.repeat(100));
    console.log('🚫 Prohibited Expressions (禁止表現)');
    console.log('━'.repeat(100));
    console.log(`Total: ${result.prohibited.length}`);
    console.log('');

    result.prohibited.slice(0, 20).forEach((rule, idx) => {
      console.log(`${idx + 1}. 「${rule.keyword}」`);
      console.log(`   Source: ${rule.source}`);
      console.log(`   Description: ${rule.description.substring(0, 100)}...`);
      console.log('');
    });

    console.log('━'.repeat(100));
    console.log('📌 Annotation Required Keywords (注釈必須)');
    console.log('━'.repeat(100));
    console.log(`Total: ${result.annotationRequired.length}`);
    console.log('');

    result.annotationRequired.slice(0, 20).forEach((rule, idx) => {
      console.log(`${idx + 1}. 「${rule.keyword}」`);
      console.log(`   Source: ${rule.source}`);
      console.log(`   Annotation: ${rule.conditions || 'N/A'}`);
      console.log('');
    });

    console.log('━'.repeat(100));
    console.log('⚠️  Conditional Expressions (条件付き表現)');
    console.log('━'.repeat(100));
    console.log(`Total: ${result.conditional.length}`);
    console.log('');

    result.conditional.slice(0, 20).forEach((rule, idx) => {
      console.log(`${idx + 1}. 「${rule.keyword}」`);
      console.log(`   Source: ${rule.source}`);
      console.log(`   Condition: ${rule.conditions?.substring(0, 100)}...`);
      console.log('');
    });

    // JSON出力
    const outputPath = path.join(process.cwd(), 'knowledge-analysis.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log('');
    console.log(`✅ Analysis saved to: ${outputPath}`);
    console.log('');

  } catch (error) {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  }
}

main();
