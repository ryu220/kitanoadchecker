/**
 * Tokenizer - トークナイザー
 *
 * テキストを意味的な単位（トークン）に分解します
 * Issue #28: セグメント分割をLLM依存からルールベースに変更
 */

import { Token, TokenType as _TokenType } from './types';

/**
 * Tokenizer
 */
export class Tokenizer {
  /**
   * テキストをトークンに分解
   *
   * 優先順位：
   * 1. 構造的デリミタ【】
   * 2. 注釈マーカー（※1, ※2）と注釈本文
   * 3. 段落（空行区切り）
   * 4. 文（句点区切り）
   *
   * @param text - 入力テキスト
   * @returns トークン配列
   */
  static tokenize(text: string): Token[] {
    if (!text || text.length === 0) {
      return [];
    }

    const tokens: Token[] = [];
    let currentLine = 1;
    let currentPosition = 0;

    // 1. 構造的デリミタ【】を検出
    const structuralTokens = this.extractStructuralDelimiters(text);

    // 2. 注釈本文を検出（優先）
    const annotationTexts = this.extractAnnotationTexts(text);

    // 3. 注釈マーカーを検出（注釈本文と重複しないもののみ）
    const annotationMarkers = this.extractAnnotationMarkers(text, annotationTexts);

    // 4. トークンをマージして優先順位順にソート
    const allTokens = [
      ...structuralTokens,
      ...annotationTexts,
      ...annotationMarkers,
    ].sort((a, b) => a.start - b.start);

    // 4. トークン間のギャップを埋める（通常テキスト）
    let lastEnd = 0;

    for (const token of allTokens) {
      if (token.start > lastEnd) {
        // ギャップがある場合、通常テキストとして追加
        const gapText = text.substring(lastEnd, token.start);
        const gapTokens = this.tokenizeGap(gapText, lastEnd, currentLine);
        tokens.push(...gapTokens);
      }

      tokens.push(token);
      lastEnd = token.end;

      // 行番号を更新
      const lineBreaks = text.substring(currentPosition, token.end).match(/\n/g);
      if (lineBreaks) {
        currentLine += lineBreaks.length;
      }
      currentPosition = token.end;
    }

    // 5. 最後のギャップを埋める
    if (lastEnd < text.length) {
      const gapText = text.substring(lastEnd);
      const gapTokens = this.tokenizeGap(gapText, lastEnd, currentLine);
      tokens.push(...gapTokens);
    }

    return tokens;
  }

  /**
   * 構造的デリミタ【】を抽出
   */
  private static extractStructuralDelimiters(text: string): Token[] {
    const tokens: Token[] = [];
    const pattern = /【([^】]+)】/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const fullText = match[0]; // "【美白効果】"
      const start = match.index;
      const end = start + fullText.length;
      const line = text.substring(0, start).split('\n').length;

      tokens.push({
        type: 'structural-delimiter',
        text: fullText,
        start,
        end,
        line,
        metadata: {
          priority: 100, // 最高優先度
        },
      });
    }

    return tokens;
  }

  /**
   * 注釈マーカー（※1, ※2, *1, *2）を抽出
   *
   * 注釈本文（annotation-text）と重複するマーカーはスキップします
   */
  private static extractAnnotationMarkers(text: string, annotationTexts: Token[]): Token[] {
    const tokens: Token[] = [];
    const pattern = /[※＊*](\d+)/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const fullText = match[0]; // "※1"
      const number = match[1]; // "1"
      const start = match.index;
      const end = start + fullText.length;
      const line = text.substring(0, start).split('\n').length;

      // Skip if this marker is part of an annotation text token
      const isPartOfAnnotationText = annotationTexts.some(annToken =>
        start >= annToken.start && end <= annToken.end
      );

      if (isPartOfAnnotationText) {
        continue; // これは注釈本文の一部なのでスキップ
      }

      tokens.push({
        type: 'annotation-marker',
        text: fullText,
        start,
        end,
        line,
        metadata: {
          annotationNumber: number,
          priority: 90, // 高優先度
        },
      });
    }

    return tokens;
  }

  /**
   * 注釈本文（※1：角質層まで or ※1角質層まで）を抽出
   *
   * サポートする形式:
   * 1. "※1：角質層まで" - コロン付き（従来形式）
   * 2. "※1殺菌は消毒の作用機序として" - コロンなし、行頭に配置（新形式）
   */
  private static extractAnnotationTexts(text: string): Token[] {
    const tokens: Token[] = [];

    // Format 1: ※1：explanation (with colon)
    const colonPattern = /[※＊*](\d+)[：:]\s*([^\n]+)/g;
    let match;

    while ((match = colonPattern.exec(text)) !== null) {
      const fullText = match[0]; // "※1：角質層まで"
      const number = match[1]; // "1"
      const _annotationText = match[2]; // "角質層まで"
      const start = match.index;
      const end = start + fullText.length;
      const line = text.substring(0, start).split('\n').length;

      tokens.push({
        type: 'annotation-text',
        text: fullText,
        start,
        end,
        line,
        metadata: {
          annotationNumber: number,
          priority: 90, // 高優先度
        },
      });
    }

    // Format 2: ※1explanation (without colon, at line start)
    // Pattern: newline followed by ※\d, then text until next newline or end
    const lineStartPattern = /(?:^|\n)([※＊*](\d+)([^\n※]+))/g;

    while ((match = lineStartPattern.exec(text)) !== null) {
      const fullText = match[1]; // "※1殺菌は消毒の作用機序として"
      const number = match[2]; // "1"
      const start = match.index + (match[0].startsWith('\n') ? 1 : 0); // Skip leading newline
      const end = start + fullText.length;
      const line = text.substring(0, start).split('\n').length;

      // Check if this overlaps with any colon-format tokens
      const overlaps = tokens.some(t =>
        (start >= t.start && start < t.end) ||
        (end > t.start && end <= t.end)
      );

      if (!overlaps) {
        tokens.push({
          type: 'annotation-text',
          text: fullText,
          start,
          end,
          line,
          metadata: {
            annotationNumber: number,
            priority: 90, // 高優先度
          },
        });
      }
    }

    return tokens;
  }

  /**
   * ギャップ（トークン間の通常テキスト）をトークン化
   *
   * 優先順位：
   * 1. 段落（空行区切り）
   * 2. 文（句点区切り）
   */
  private static tokenizeGap(text: string, startOffset: number, startLine: number): Token[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const tokens: Token[] = [];

    // 段落で分割
    const paragraphs = text.split(/\n\s*\n/);
    let currentOffset = startOffset;
    let currentLine = startLine;

    for (const paragraph of paragraphs) {
      if (paragraph.trim().length === 0) {
        currentOffset += paragraph.length + 2; // "\n\n"
        const lineBreaks = paragraph.match(/\n/g);
        if (lineBreaks) {
          currentLine += lineBreaks.length + 2;
        }
        continue;
      }

      // 文で分割（句読点を含めて抽出）
      // Issue #28 fix: 句読点を前の文と結合するため、matchを使用
      const sentencePattern = /[^。．！？\n]+[。．！？\n]+|[^。．！？\n]+$/g;
      const sentences = paragraph.match(sentencePattern) || [];
      let sentenceOffset = currentOffset;

      for (const sentence of sentences) {
        if (sentence.length === 0 || sentence.trim().length === 0) {
          continue;
        }

        tokens.push({
          type: 'sentence',
          text: sentence,
          start: sentenceOffset,
          end: sentenceOffset + sentence.length,
          line: currentLine,
        });

        sentenceOffset += sentence.length;

        // 行番号を更新
        const lineBreaks = sentence.match(/\n/g);
        if (lineBreaks) {
          currentLine += lineBreaks.length;
        }
      }

      currentOffset += paragraph.length + 2; // "\n\n"
      currentLine += 2;
    }

    return tokens;
  }

  /**
   * トークンをデバッグ表示用にフォーマット
   */
  static formatTokens(tokens: Token[]): string {
    return tokens
      .map((token, index) => {
        const metadata = token.metadata ? JSON.stringify(token.metadata) : '';
        return `[${index}] ${token.type.padEnd(20)} | "${token.text.substring(0, 30).replace(/\n/g, '\\n')}" | ${token.start}-${token.end} ${metadata}`;
      })
      .join('\n');
  }
}
