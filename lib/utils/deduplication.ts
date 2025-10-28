/**
 * Violation Deduplication Utility
 *
 * 違反検知の重複を除去するユーティリティ
 * Issue #27: 重複検知の問題を解決
 */

import type { Violation } from '../types-v2';

/**
 * 違反の重複を除去
 *
 * 同じキーワード・同じ違反タイプの重複を1つに統合
 *
 * @param violations - 違反の配列
 * @returns 重複除去後の違反配列
 */
export function deduplicateViolations(violations: Violation[]): Violation[] {
  if (!violations || violations.length === 0) {
    return [];
  }

  const uniqueViolations: Violation[] = [];
  const seenKeys = new Set<string>();

  for (const violation of violations) {
    // 重複判定用のキーを生成
    const key = generateViolationKey(violation);

    if (seenKeys.has(key)) {
      console.log('[Deduplication] 重複を検出:', {
        key,
        description: violation.description.substring(0, 50) + '...',
      });
      continue; // 重複をスキップ
    }

    seenKeys.add(key);
    uniqueViolations.push(violation);
  }

  const removedCount = violations.length - uniqueViolations.length;
  if (removedCount > 0) {
    console.log(`[Deduplication] ${removedCount}件の重複を除去しました (${violations.length} -> ${uniqueViolations.length})`);
  }

  return uniqueViolations;
}

/**
 * 違反から一意のキーを生成
 *
 * 以下の情報を組み合わせて重複判定：
 * - キーワード（descriptionから抽出）
 * - 参照ファイル（あれば）
 *
 * 注意: 違反タイプは含めない（同じキーワード・同じ問題なら、違反タイプに関係なく重複とみなす）
 */
function generateViolationKey(violation: Violation): string {
  // descriptionからキーワードを抽出
  const keyword = extractKeyword(violation.description);

  // キーの要素（違反タイプは除外）
  const parts: string[] = [
    keyword,
  ];

  // 参照ファイルがあれば追加（より厳密な重複判定）
  if (violation.referenceKnowledge?.file) {
    parts.push(violation.referenceKnowledge.file);
  }

  return parts.join('|').toLowerCase();
}

/**
 * descriptionからキーワードを抽出
 *
 * 例:
 * - "「殺菌」には有効成分を..." -> "殺菌"
 * - "「ヒアルロン酸」という成分名..." -> "ヒアルロン酸"
 * - "「いまなら」という表現..." -> "いまなら"
 */
function extractKeyword(description: string): string {
  // 「...」で囲まれたキーワードを抽出
  const match = description.match(/「([^」]+)」/);
  if (match) {
    return match[1];
  }

  // キーワードが見つからない場合は最初の20文字をキーとする
  return description.substring(0, 20);
}

/**
 * 違反をマージ（より詳細な情報を優先）
 *
 * 同じキーの違反が複数ある場合、以下の優先順位でマージ：
 * 1. referenceKnowledge.fileがあるものを優先
 * 2. referenceKnowledge.excerptが長いものを優先
 * 3. descriptionが長いものを優先
 */
export function mergeViolations(violations: Violation[]): Violation[] {
  if (!violations || violations.length === 0) {
    return [];
  }

  const violationMap = new Map<string, Violation>();

  for (const violation of violations) {
    const key = generateViolationKey(violation);

    const existing = violationMap.get(key);

    if (!existing) {
      // 新規追加
      violationMap.set(key, violation);
    } else {
      // 既存のものとマージ（より詳細なものを優先）
      const merged = selectBetterViolation(existing, violation);
      violationMap.set(key, merged);
    }
  }

  return Array.from(violationMap.values());
}

/**
 * 2つの違反のうち、より詳細なものを選択
 *
 * 優先順位:
 * 1. 違反タイプの優先度（社内基準 > 薬機法 > 景表法 > 特商法 > その他）
 * 2. referenceKnowledge.fileの有無
 * 3. excerptの長さ
 * 4. descriptionの長さ
 */
function selectBetterViolation(a: Violation, b: Violation): Violation {
  // 違反タイプの優先度を定義（数字が小さいほど優先度が高い）
  const priorityMap: Record<string, number> = {
    '社内基準違反': 1,
    '薬機法違反': 2,
    '景表法違反': 3,
    '特商法違反': 4,
    'その他': 5,
  };

  const aPriority = priorityMap[a.type] || 999;
  const bPriority = priorityMap[b.type] || 999;

  // 優先度が高い方を選択（数字が小さい方が優先）
  if (aPriority < bPriority) return a;
  if (bPriority < aPriority) return b;

  // 優先度が同じ場合は、以下の基準で判定

  // referenceKnowledge.fileの有無で判定
  const aHasFile = !!a.referenceKnowledge?.file && a.referenceKnowledge.file !== 'undefined';
  const bHasFile = !!b.referenceKnowledge?.file && b.referenceKnowledge.file !== 'undefined';

  if (aHasFile && !bHasFile) return a;
  if (!aHasFile && bHasFile) return b;

  // excerptの長さで判定
  const aExcerptLength = a.referenceKnowledge?.excerpt?.length || 0;
  const bExcerptLength = b.referenceKnowledge?.excerpt?.length || 0;

  if (aExcerptLength > bExcerptLength) return a;
  if (bExcerptLength > aExcerptLength) return b;

  // descriptionの長さで判定
  const aDescLength = a.description?.length || 0;
  const bDescLength = b.description?.length || 0;

  return aDescLength >= bDescLength ? a : b;
}
