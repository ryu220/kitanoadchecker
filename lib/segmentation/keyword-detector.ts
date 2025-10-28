/**
 * KeywordDetector - キーワード検出器
 *
 * トークンからキーワードを検出し、セグメント候補を生成します
 * Issue #28: セグメント分割をLLM依存からルールベースに変更
 */

import { Token, SegmentCandidate, KeywordRule as _KeywordRule, SegmentationConfig } from './types';
import { ProductConfig } from '../product-config.schema';

/**
 * KeywordDetector
 */
export class KeywordDetector {
  /**
   * キーワードを検出してセグメント候補を生成
   *
   * @param tokens - トークン配列
   * @param config - セグメント分割設定
   * @returns セグメント候補配列
   */
  static detect(tokens: Token[], config: SegmentationConfig): SegmentCandidate[] {
    const candidates: SegmentCandidate[] = [];

    // 1. 構造的デリミタを優先的に処理
    candidates.push(...this.detectStructuralDelimiters(tokens));

    // 2. 特商法キーワードを検出
    candidates.push(...this.detectCommercialLawKeywords(tokens));

    // 3. 商品固有キーワードを検出
    candidates.push(...this.detectProductKeywords(tokens, config.productConfig));

    // 4. 通常の文をセグメント候補として追加
    candidates.push(...this.detectSentences(tokens));

    // 5. 優先度順にソート（高い順）
    candidates.sort((a, b) => b.priority - a.priority);

    return candidates;
  }

  /**
   * 構造的デリミタ【】を検出
   */
  private static detectStructuralDelimiters(tokens: Token[]): SegmentCandidate[] {
    const candidates: SegmentCandidate[] = [];

    for (const token of tokens) {
      if (token.type === 'structural-delimiter') {
        candidates.push({
          tokens: [token],
          type: 'claim',
          importance: 1.0,
          priority: 100, // 最高優先度
        });
      }
    }

    return candidates;
  }

  /**
   * 特商法違反になりやすいキーワードを検出
   *
   * 優先順位2: 以下のキーワード + 価格情報
   * - 「いまなら」「今なら」「今だけ」
   * - 「限定」「先着」
   * - 「実質無料」「実質0円」「全額返金保証」
   */
  private static detectCommercialLawKeywords(tokens: Token[]): SegmentCandidate[] {
    const candidates: SegmentCandidate[] = [];
    const text = tokens.map((t) => t.text).join('');

    // パターン1: 「いまなら」「今なら」「今だけ」+ 価格情報
    const urgencyPricePattern = /(?:いまなら|今なら|今だけ)[^。\n]*?(?:\d+[,，]?\d*円|税込|OFF|割引|半額)[^。\n]*/g;
    const matches1 = this.findMatches(text, urgencyPricePattern, tokens);
    for (const match of matches1) {
      candidates.push({
        tokens: match.tokens,
        type: 'cta',
        importance: 0.9,
        priority: 90,
      });
    }

    // パターン2: 「限定」「先着」+ 期間/数量
    // 「期間限定」のような前置パターンと「限定...期間」のような後置パターンの両方に対応
    const limitedPattern = /(?:期間限定|数量限定|(?:限定|先着)[^。\n]*?(?:\d+|期間|数量))[^。\n]*/g;
    const matches2 = this.findMatches(text, limitedPattern, tokens);
    for (const match of matches2) {
      candidates.push({
        tokens: match.tokens,
        type: 'cta',
        importance: 0.9,
        priority: 90,
      });
    }

    // パターン3: 「実質無料」「実質0円」「全額返金保証」
    const freePattern = /(?:実質無料|実質0円|全額返金保証)[^。\n]*/g;
    const matches3 = this.findMatches(text, freePattern, tokens);
    for (const match of matches3) {
      candidates.push({
        tokens: match.tokens,
        type: 'cta',
        importance: 0.9,
        priority: 90,
      });
    }

    // パターン4: 価格表示
    const pricePattern = /\d+[,，]?\d*円[^。\n]*/g;
    const matches4 = this.findMatches(text, pricePattern, tokens);
    for (const match of matches4) {
      // 既に他のパターンでマッチしている場合はスキップ
      const alreadyMatched = candidates.some((c) =>
        this.tokensOverlap(c.tokens, match.tokens)
      );

      if (!alreadyMatched) {
        candidates.push({
          tokens: match.tokens,
          type: 'cta',
          importance: 0.8,
          priority: 85,
        });
      }
    }

    return candidates;
  }

  /**
   * 商品固有キーワードを検出
   *
   * config/products/{productId}.json の annotationRules で required: true のキーワード
   */
  private static detectProductKeywords(tokens: Token[], productConfig: ProductConfig): SegmentCandidate[] {
    const candidates: SegmentCandidate[] = [];

    if (!productConfig.annotationRules) {
      return candidates;
    }

    const text = tokens.map((t) => t.text).join('');

    // annotationRules から required: true のキーワードを取得
    for (const [keyword, rule] of Object.entries(productConfig.annotationRules)) {
      if (!rule.required) {
        continue;
      }

      // キーワードを含む文を検出
      const pattern = new RegExp(`[^。\n]*${this.escapeRegExp(keyword)}[^。\n]*`, 'g');
      const matches = this.findMatches(text, pattern, tokens);

      for (const match of matches) {
        candidates.push({
          tokens: match.tokens,
          type: 'claim',
          importance: 0.85,
          priority: 80,
        });
      }
    }

    return candidates;
  }

  /**
   * 通常の文をセグメント候補として追加
   *
   * 全てのトークンタイプ（sentence, text, annotation-marker, annotation-text）を
   * セグメント候補として追加し、テキストの全範囲をカバーする
   */
  private static detectSentences(tokens: Token[]): SegmentCandidate[] {
    const candidates: SegmentCandidate[] = [];

    for (const token of tokens) {
      if (token.text.trim().length === 0) {
        continue; // 空白のみのトークンはスキップ
      }

      // 全てのトークンタイプをセグメント候補として追加
      // これにより、100%のテキストカバレッジを実現
      if (token.type === 'sentence' || token.type === 'text') {
        candidates.push({
          tokens: [token],
          type: 'explanation',
          importance: 0.5,
          priority: 10, // 低優先度
        });
      } else if (token.type === 'annotation-marker') {
        // 注釈マーカーは後でマージされる可能性があるが、
        // マージされなかった場合のために候補として追加
        candidates.push({
          tokens: [token],
          type: 'explanation',
          importance: 0.3,
          priority: 5, // より低い優先度
        });
      } else if (token.type === 'annotation-text') {
        // 注釈テキストも同様に候補として追加
        candidates.push({
          tokens: [token],
          type: 'evidence',
          importance: 0.7,
          priority: 15, // やや高めの優先度（注釈は重要）
        });
      }
    }

    return candidates;
  }

  /**
   * 正規表現パターンでマッチした部分をトークンに変換
   */
  private static findMatches(
    text: string,
    pattern: RegExp,
    tokens: Token[]
  ): Array<{ text: string; tokens: Token[] }> {
    const matches: Array<{ text: string; tokens: Token[] }> = [];
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const matchText = match[0];
      const matchStart = match.index;
      const matchEnd = matchStart + matchText.length;

      // マッチした範囲に含まれるトークンを抽出
      const matchedTokens = tokens.filter((token) => {
        // トークンがマッチ範囲と重なっている
        return token.start < matchEnd && token.end > matchStart;
      });

      if (matchedTokens.length > 0) {
        matches.push({
          text: matchText,
          tokens: matchedTokens,
        });
      }
    }

    return matches;
  }

  /**
   * 正規表現用に文字列をエスケープ
   */
  private static escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * トークン配列が重なっているかチェック
   */
  private static tokensOverlap(tokens1: Token[], tokens2: Token[]): boolean {
    for (const t1 of tokens1) {
      for (const t2 of tokens2) {
        if (t1.start < t2.end && t1.end > t2.start) {
          return true;
        }
      }
    }
    return false;
  }
}
