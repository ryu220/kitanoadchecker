/**
 * SegmentBuilder - セグメント生成器
 *
 * セグメント候補からSegment型を生成します
 * Issue #28: セグメント分割をLLM依存からルールベースに変更
 */

import { Segment } from '../types';
import { Token as _Token, SegmentCandidate } from './types';

/**
 * SegmentBuilder
 */
export class SegmentBuilder {
  /**
   * セグメント候補からSegment型を生成
   *
   * 処理：
   * 0. 注釈説明文セグメントを除外（fullTextで参照されるため個別セグメントは不要）
   * 1. 重複を除去（優先度の高いセグメントを優先）
   * 2. IDを付与（seg_001, seg_002, ...）
   * 3. 位置情報を計算
   * 4. テキストを結合
   *
   * @param candidates - セグメント候補配列
   * @param originalText - 元のテキスト
   * @returns Segment配列
   */
  static build(candidates: SegmentCandidate[], originalText: string): Segment[] {
    // 0. Filter out annotation explanation segments
    // These are NOT advertising text - they are reference materials
    // that should be accessible via fullText for annotation validation
    const filteredCandidates = candidates.filter(candidate => {
      // Check if this candidate is only annotation text tokens
      const hasOnlyAnnotationText = candidate.tokens.every(
        token => token.type === 'annotation-text' || token.type === 'annotation-marker'
      );

      if (hasOnlyAnnotationText) {
        console.log(`[SegmentBuilder] Filtered out annotation explanation segment: "${candidate.tokens.map(t => t.text).join('').substring(0, 50)}..."`);
        return false;
      }

      return true;
    });

    // 1. 重複を除去（優先度の高いセグメントを優先）
    const deduplicatedCandidates = this.deduplicateCandidates(filteredCandidates);

    // 2. 位置順にソート
    deduplicatedCandidates.sort((a, b) => {
      const aStart = Math.min(...a.tokens.map((t) => t.start));
      const bStart = Math.min(...b.tokens.map((t) => t.start));
      return aStart - bStart;
    });

    // 3. Segment型に変換
    const segments: Segment[] = [];

    for (let i = 0; i < deduplicatedCandidates.length; i++) {
      const candidate = deduplicatedCandidates[i];
      const segment = this.candidateToSegment(candidate, i + 1, originalText);

      if (segment) {
        segments.push(segment);
      }
    }

    // 3.5. 注釈マーカーで終わるセグメントの後に続く短いセグメントをマージ
    // 例: "殺菌※2" + "する薬用ジェル" → "殺菌※2する薬用ジェル"
    const mergedSegments = this.mergeFragmentedSegments(segments, originalText);

    // 4. 全文字がセグメントに含まれているか検証
    this.validateCoverage(mergedSegments, originalText);

    return mergedSegments;
  }

  /**
   * 注釈マーカーで終わるセグメントの後に続く短いセグメントをマージ
   *
   * 問題: 注釈マーカー（※1, ※2）で終わるセグメントの後に短いセグメント（< 20文字）が
   * 続く場合、それらを1つのセグメントとしてマージする
   *
   * 例: "殺菌※2" + "する薬用ジェル" → "殺菌※2する薬用ジェル"
   *
   * @param segments - セグメント配列
   * @param originalText - 元のテキスト
   * @returns マージ後のセグメント配列
   */
  private static mergeFragmentedSegments(segments: Segment[], originalText: string): Segment[] {
    if (segments.length === 0) {
      return segments;
    }

    const result: Segment[] = [];

    for (let i = 0; i < segments.length; i++) {
      const current = segments[i];
      const next = segments[i + 1];

      // 現在のセグメントが注釈マーカーで終わっているかチェック
      const endsWithAnnotationMarker = /※\d+\s*$/.test(current.text);

      if (endsWithAnnotationMarker && next && next.text.length <= 20) {
        // 次のセグメントが短い（20文字以下）場合、マージ
        const currentEnd = current.position?.end || 0;
        const nextStart = next.position?.start || 0;
        const gap = nextStart - currentEnd;

        // ギャップが5文字以内の場合のみマージ（隣接している場合）
        if (gap <= 5) {
          const mergedText = originalText.substring(
            current.position?.start || 0,
            next.position?.end || 0
          );

          const merged: Segment = {
            id: current.id,
            text: mergedText,
            type: current.type,
            position: {
              start: current.position?.start || 0,
              end: next.position?.end || 0,
            },
          };

          result.push(merged);
          console.log(`[SegmentBuilder] Merged fragmented segments: "${current.text}" + "${next.text}" → "${mergedText}"`);

          // 次のセグメントはスキップ
          i++;
          continue;
        }
      }

      // マージしない場合は、そのまま追加
      result.push(current);
    }

    return result;
  }

  /**
   * セグメント候補の重複を除去
   *
   * ルール：
   * - 同じ位置範囲にあるセグメントは、優先度の高い方を採用
   * - 部分的に重なる場合は、優先度の高い方を優先
   */
  private static deduplicateCandidates(candidates: SegmentCandidate[]): SegmentCandidate[] {
    const result: SegmentCandidate[] = [];

    // 優先度順にソート（高い順）
    const sortedCandidates = [...candidates].sort((a, b) => b.priority - a.priority);

    for (const candidate of sortedCandidates) {
      const candidateStart = Math.min(...candidate.tokens.map((t) => t.start));
      const candidateEnd = Math.max(...candidate.tokens.map((t) => t.end));

      // 既に追加されているセグメントと重複チェック
      const overlaps = result.some((existing) => {
        const existingStart = Math.min(...existing.tokens.map((t) => t.start));
        const existingEnd = Math.max(...existing.tokens.map((t) => t.end));

        // 重複判定: 50%以上重なっている場合は重複とみなす
        const overlapStart = Math.max(candidateStart, existingStart);
        const overlapEnd = Math.min(candidateEnd, existingEnd);
        const overlapLength = Math.max(0, overlapEnd - overlapStart);

        const candidateLength = candidateEnd - candidateStart;
        const existingLength = existingEnd - existingStart;

        const overlapRatio = overlapLength / Math.min(candidateLength, existingLength);

        return overlapRatio > 0.5;
      });

      if (!overlaps) {
        result.push(candidate);
      }
    }

    return result;
  }

  /**
   * セグメント候補をSegment型に変換
   */
  private static candidateToSegment(
    candidate: SegmentCandidate,
    index: number,
    originalText: string
  ): Segment | null {
    if (candidate.tokens.length === 0) {
      return null;
    }

    // トークンを位置順にソート
    const sortedTokens = [...candidate.tokens].sort((a, b) => a.start - b.start);

    // テキストを結合
    const start = sortedTokens[0].start;
    const end = sortedTokens[sortedTokens.length - 1].end;
    const text = originalText.substring(start, end);

    // typeをマッピング（既存のSegment型は'claim' | 'explanation' | 'evidence'のみ）
    let mappedType: 'claim' | 'explanation' | 'evidence' | undefined;
    if (candidate.type === 'claim') {
      mappedType = 'claim';
    } else if (candidate.type === 'explanation') {
      mappedType = 'explanation';
    } else if (candidate.type === 'evidence') {
      mappedType = 'evidence';
    } else if (candidate.type === 'cta' || candidate.type === 'disclaimer') {
      // cta/disclaimerは'claim'として扱う（既存の型定義に合わせる）
      mappedType = 'claim';
    }

    // Segment型を生成
    const segment: Segment = {
      id: `seg_${String(index).padStart(3, '0')}`, // "seg_001", "seg_002", ...
      text,
      type: mappedType,
      position: {
        start,
        end,
        // lineは既存のSegment型に含まれていないため除外
      },
    };

    return segment;
  }

  /**
   * 全文字がセグメントに含まれているか検証
   *
   * 警告：
   * - カバレッジが80%未満の場合、警告を出力
   */
  private static validateCoverage(segments: Segment[], originalText: string): void {
    const coveredChars = new Set<number>();

    for (const segment of segments) {
      if (segment.position) {
        for (let i = segment.position.start; i < segment.position.end; i++) {
          coveredChars.add(i);
        }
      }
    }

    const coverage = coveredChars.size / originalText.length;

    if (coverage < 0.8) {
      console.warn(
        `[SegmentBuilder] Low coverage: ${(coverage * 100).toFixed(1)}% (${coveredChars.size}/${originalText.length} chars)`
      );
    } else {
      console.log(
        `[SegmentBuilder] Coverage: ${(coverage * 100).toFixed(1)}% (${coveredChars.size}/${originalText.length} chars)`
      );
    }
  }

  /**
   * セグメントをデバッグ表示用にフォーマット
   */
  static formatSegments(segments: Segment[]): string {
    return segments
      .map((segment, index) => {
        const pos = segment.position ? `${segment.position.start}-${segment.position.end}` : 'N/A';
        const type = segment.type || 'N/A';
        const text = segment.text.substring(0, 50).replace(/\n/g, '\\n');

        return `[${index}] ${segment.id} | ${type.padEnd(15)} | ${pos.padEnd(10)} | "${text}"`;
      })
      .join('\n');
  }
}
