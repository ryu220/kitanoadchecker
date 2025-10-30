/**
 * AnnotationMerger - 注釈マージャー
 *
 * 注釈マーカー（※1, ※2）を検出して、本文セグメントと注釈セグメントを結合します
 * Issue #28: セグメント分割をLLM依存からルールベースに変更
 * Issue #11: 注釈マーカーの統一
 */

import { Token, SegmentCandidate } from './types';

/**
 * AnnotationMerger
 */
export class AnnotationMerger {
  /**
   * 注釈マーカーを検出して本文セグメントと結合
   *
   * アルゴリズム：
   * 1. 各セグメント候補から注釈マーカーを検出
   * 2. 注釈マーカーに対応する注釈本文を検索
   * 3. 本文セグメントと注釈セグメントを結合
   * 4. 使用済み注釈セグメントをマークして重複除去
   *
   * @param candidates - セグメント候補配列
   * @param allTokens - 全トークン配列（注釈本文検索用）
   * @returns マージ後のセグメント候補配列
   */
  static merge(candidates: SegmentCandidate[], allTokens: Token[]): SegmentCandidate[] {
    const mergedCandidates: SegmentCandidate[] = [];
    const usedAnnotationNumbers = new Set<string>();

    for (const candidate of candidates) {
      // 1. セグメント内の注釈マーカーを検出
      let annotationMarkers = this.findAnnotationMarkers(candidate.tokens);

      // 2. セグメントに隣接する注釈マーカーも検出（Issue #30: 注釈統合修正）
      const adjacentMarkers = this.findAdjacentAnnotationMarkers(candidate.tokens, allTokens);
      if (adjacentMarkers.length > 0) {
        annotationMarkers = [...annotationMarkers, ...adjacentMarkers];
      }

      if (annotationMarkers.length === 0) {
        // 注釈マーカーがない場合はそのまま追加
        mergedCandidates.push(candidate);
        continue;
      }

      // 3. 注釈マーカーに対応する注釈本文を検索（参照のみ、マージしない）
      // 注釈本文はセグメントに含めず、fullTextで参照可能にする
      for (const marker of annotationMarkers) {
        const annotationNumber = marker.metadata?.annotationNumber;

        if (!annotationNumber) {
          continue;
        }

        // 注釈番号を記録（重複チェック用）
        usedAnnotationNumbers.add(annotationNumber);
      }

      // 4. 注釈マーカーのみをセグメントに追加（注釈本文は含めない）
      // 注釈本文はfullTextに残り、keyword-matcher.tsが注釈番号で検索して使用する
      if (adjacentMarkers.length > 0) {
        const mergedTokens = [
          ...candidate.tokens,
          ...adjacentMarkers,  // 注釈マーカーのみ追加
        ].sort((a, b) => a.start - b.start);

        mergedCandidates.push({
          ...candidate,
          tokens: mergedTokens,
          priority: candidate.priority + 5, // 注釈マーカー付きは優先度を上げる
          merged: true,
          annotationMarkers: annotationMarkers.map((m) => m.metadata?.annotationNumber || ''),
        });
      } else {
        mergedCandidates.push(candidate);
      }
    }

    return mergedCandidates;
  }

  /**
   * トークン配列から注釈マーカーを検出
   */
  private static findAnnotationMarkers(tokens: Token[]): Token[] {
    return tokens.filter((token) => token.type === 'annotation-marker');
  }

  /**
   * セグメントに隣接する注釈マーカーを検出
   *
   * Issue #30: 注釈マーカーがセグメントのすぐ後ろにある場合、
   * それを含めてマージする必要がある
   *
   * 例: "世界一" + "※1" → これらを同じセグメントに統合
   *
   * @param candidateTokens - セグメント候補のトークン配列
   * @param allTokens - 全トークン配列
   * @returns 隣接する注釈マーカーの配列
   */
  private static findAdjacentAnnotationMarkers(candidateTokens: Token[], allTokens: Token[]): Token[] {
    if (candidateTokens.length === 0) {
      return [];
    }

    // セグメント候補の最後のトークンの終了位置を取得
    const candidateEnd = Math.max(...candidateTokens.map(t => t.end));

    // 隣接する注釈マーカーを検索
    // "隣接"の定義: セグメント終了位置から5文字以内に開始する注釈マーカー
    const adjacentMarkers = allTokens.filter(token => {
      if (token.type !== 'annotation-marker') {
        return false;
      }

      // マーカーがセグメントの直後にあるかチェック
      // 例: "世界一" (end=5) + "※1" (start=5) → adjacent=true
      // 例: "世界一" (end=5) + "、" + "※1" (start=6) → adjacent=true (1文字以内)
      const distance = token.start - candidateEnd;
      return distance >= 0 && distance <= 5;
    });

    return adjacentMarkers;
  }

  /**
   * 注釈番号に対応する注釈本文を検索
   *
   * @param annotationNumber - 注釈番号（"1", "2", ...）
   * @param allTokens - 全トークン配列
   * @returns 注釈本文トークン（見つからない場合はundefined）
   */
  private static findAnnotationText(annotationNumber: string, allTokens: Token[]): Token | undefined {
    return allTokens.find(
      (token) =>
        token.type === 'annotation-text' &&
        token.metadata?.annotationNumber === annotationNumber
    );
  }

  /**
   * 注釈マーカーと注釈本文の対応関係をデバッグ表示
   */
  static debugAnnotations(allTokens: Token[]): string {
    const lines: string[] = ['=== Annotation Analysis ==='];

    // 注釈マーカーを検出
    const markers = allTokens.filter((t) => t.type === 'annotation-marker');
    const texts = allTokens.filter((t) => t.type === 'annotation-text');

    lines.push(`Found ${markers.length} annotation markers:`);
    for (const marker of markers) {
      lines.push(`  ※${marker.metadata?.annotationNumber} at position ${marker.start}`);
    }

    lines.push(`Found ${texts.length} annotation texts:`);
    for (const text of texts) {
      lines.push(`  ※${text.metadata?.annotationNumber}: "${text.text}"`);
    }

    // 対応関係をチェック
    lines.push('Matching:');
    for (const marker of markers) {
      const number = marker.metadata?.annotationNumber;
      const matchingText = texts.find((t) => t.metadata?.annotationNumber === number);

      if (matchingText) {
        lines.push(`  ✅ ※${number} → "${matchingText.text}"`);
      } else {
        lines.push(`  ❌ ※${number} → (not found)`);
      }
    }

    return lines.join('\n');
  }
}
