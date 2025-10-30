/**
 * ナレッジベースHTMLクリーニングスクリプト
 *
 * 目的:
 * - 全ナレッジファイルからHTMLマークアップを除去
 * - 注釈マーカーを * から ※ に統一
 * - Markdown形式を保持
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CleaningResult {
  filePath: string;
  originalSize: number;
  cleanedSize: number;
  htmlTagsRemoved: number;
  markersConverted: number;
  status: 'success' | 'error';
  error?: string;
}

/**
 * HTMLタグを除去する
 */
function removeHtmlTags(content: string): { cleaned: string; tagsRemoved: number } {
  let tagsRemoved = 0;

  // HTMLタグをカウント
  const tagMatches = content.match(/<[^>]+>/g);
  if (tagMatches) {
    tagsRemoved = tagMatches.length;
  }

  // HTMLタグを除去（ただしMarkdownは保持）
  let cleaned = content
    // <span style="...">...</span> を除去
    .replace(/<span[^>]*>(.*?)<\/span>/gs, '$1')
    // 単独の<span>タグを除去
    .replace(/<\/?span[^>]*>/g, '')
    // <br>, <br/>, <br /> を改行に変換
    .replace(/<br\s*\/?>/gi, '\n')
    // <u>...</u> を除去（下線は保持しない）
    .replace(/<u>(.*?)<\/u>/gs, '$1')
    // その他のHTMLタグを除去
    .replace(/<\/?[a-z][^>]*>/gi, '');

  return { cleaned, tagsRemoved };
}

/**
 * 注釈マーカーを * から ※ に変換
 */
function convertAnnotationMarkers(content: string): { converted: string; markersConverted: number } {
  let markersConverted = 0;

  // * + 数字 を ※ + 数字 に変換
  // 例: *1 → ※1, *2 → ※2
  const converted = content.replace(/\*(\d+)/g, (match) => {
    markersConverted++;
    return `※${match.substring(1)}`;
  });

  // 単独の * (数字が続かない場合) を ※ に変換
  // ただし、Markdownの強調記号は保持する必要がある
  // 例: "クマ*対策" → "クマ※対策"
  // ただし: "**太字**" は保持

  return { converted, markersConverted };
}

/**
 * 連続する空行を削減
 */
function normalizeNewlines(content: string): string {
  // 3行以上の連続する空行を2行に削減
  return content.replace(/\n{3,}/g, '\n\n');
}

/**
 * ファイルをクリーニング
 */
function cleanFile(filePath: string): CleaningResult {
  const result: CleaningResult = {
    filePath,
    originalSize: 0,
    cleanedSize: 0,
    htmlTagsRemoved: 0,
    markersConverted: 0,
    status: 'success',
  };

  try {
    // ファイル読み込み
    const originalContent = fs.readFileSync(filePath, 'utf-8');
    result.originalSize = originalContent.length;

    // HTMLタグ除去
    const { cleaned: afterHtmlRemoval, tagsRemoved } = removeHtmlTags(originalContent);
    result.htmlTagsRemoved = tagsRemoved;

    // 注釈マーカー変換
    const { converted: afterMarkerConversion, markersConverted } = convertAnnotationMarkers(afterHtmlRemoval);
    result.markersConverted = markersConverted;

    // 改行正規化
    const finalContent = normalizeNewlines(afterMarkerConversion);
    result.cleanedSize = finalContent.length;

    // ファイルに書き戻し（変更があった場合のみ）
    if (originalContent !== finalContent) {
      fs.writeFileSync(filePath, finalContent, 'utf-8');
      console.log(`✅ クリーニング完了: ${path.basename(filePath)}`);
      console.log(`   HTMLタグ除去: ${result.htmlTagsRemoved}個`);
      console.log(`   マーカー変換: ${result.markersConverted}個`);
      console.log(`   サイズ: ${result.originalSize} → ${result.cleanedSize} bytes`);
    } else {
      console.log(`⏭️  変更なし: ${path.basename(filePath)}`);
    }

  } catch (error) {
    result.status = 'error';
    result.error = error instanceof Error ? error.message : String(error);
    console.error(`❌ エラー: ${path.basename(filePath)} - ${result.error}`);
  }

  return result;
}

/**
 * ディレクトリ内の全.txtファイルをクリーニング
 */
function cleanDirectory(dirPath: string): CleaningResult[] {
  const results: CleaningResult[] = [];

  try {
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isFile() && file.endsWith('.txt')) {
        const result = cleanFile(filePath);
        results.push(result);
      }
    }
  } catch (error) {
    console.error(`❌ ディレクトリ読み込みエラー: ${dirPath}`, error);
  }

  return results;
}

/**
 * サマリーレポート出力
 */
function printSummary(results: CleaningResult[]) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 クリーニング結果サマリー');
  console.log('='.repeat(70));

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const totalHtmlTagsRemoved = results.reduce((sum, r) => sum + r.htmlTagsRemoved, 0);
  const totalMarkersConverted = results.reduce((sum, r) => sum + r.markersConverted, 0);
  const totalOriginalSize = results.reduce((sum, r) => sum + r.originalSize, 0);
  const totalCleanedSize = results.reduce((sum, r) => sum + r.cleanedSize, 0);
  const sizeDiff = totalOriginalSize - totalCleanedSize;
  const sizeReduction = totalOriginalSize > 0 ? (sizeDiff / totalOriginalSize * 100).toFixed(2) : '0.00';

  console.log(`\n処理ファイル数: ${results.length}`);
  console.log(`✅ 成功: ${successCount}`);
  console.log(`❌ エラー: ${errorCount}`);
  console.log(`\n📝 クリーニング内容:`);
  console.log(`   HTMLタグ除去: ${totalHtmlTagsRemoved}個`);
  console.log(`   注釈マーカー変換 (*→※): ${totalMarkersConverted}個`);
  console.log(`\n💾 サイズ変化:`);
  console.log(`   元のサイズ: ${totalOriginalSize.toLocaleString()} bytes`);
  console.log(`   クリーニング後: ${totalCleanedSize.toLocaleString()} bytes`);
  console.log(`   削減: ${sizeDiff.toLocaleString()} bytes (${sizeReduction}%)`);

  if (errorCount > 0) {
    console.log(`\n⚠️  エラーが発生したファイル:`);
    results.filter(r => r.status === 'error').forEach(r => {
      console.log(`   - ${path.basename(r.filePath)}: ${r.error}`);
    });
  }

  console.log('\n' + '='.repeat(70));
}

/**
 * メイン処理
 */
function main() {
  console.log('🧹 ナレッジベースHTMLクリーニング開始\n');

  // knowledge/common ディレクトリをクリーニング
  const knowledgeCommonDir = path.join(__dirname, '..', 'knowledge', 'common');

  console.log(`📂 対象ディレクトリ: ${knowledgeCommonDir}\n`);

  if (!fs.existsSync(knowledgeCommonDir)) {
    console.error(`❌ ディレクトリが存在しません: ${knowledgeCommonDir}`);
    process.exit(1);
  }

  // バックアップディレクトリ作成
  const backupDir = path.join(__dirname, '..', 'knowledge', 'backup_' + Date.now());
  fs.mkdirSync(backupDir, { recursive: true });
  console.log(`💾 バックアップディレクトリ作成: ${backupDir}\n`);

  // バックアップ作成
  const files = fs.readdirSync(knowledgeCommonDir).filter(f => f.endsWith('.txt'));
  files.forEach(file => {
    const src = path.join(knowledgeCommonDir, file);
    const dest = path.join(backupDir, file);
    fs.copyFileSync(src, dest);
  });
  console.log(`✅ ${files.length}ファイルをバックアップしました\n`);

  // クリーニング実行
  const results = cleanDirectory(knowledgeCommonDir);

  // サマリー出力
  printSummary(results);

  console.log('\n✨ クリーニング完了！');
}

// スクリプト実行
main();
