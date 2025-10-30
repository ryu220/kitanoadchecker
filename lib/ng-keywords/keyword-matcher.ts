/**
 * NGキーワードマッチングロジック
 * NG Keyword Matching Logic
 */

import type {
  AbsoluteNGKeyword,
  ConditionalNGKeyword,
  ContextDependentNGKeyword,
} from './index';

export interface KeywordMatch {
  keyword: string;
  matchedText: string;
  position: {
    start: number;
    end: number;
  };
  type: 'absolute' | 'conditional' | 'context-dependent';
  category: string;
  severity?: 'medium' | 'high' | 'critical';
  violationType?: string;
  reason: string;
  hasRequiredAnnotation?: boolean;
  requiredAnnotation?: string | RegExp;
  description: string;
  referenceKnowledge?: string;
  okExamples?: string[]; // 適切な表現例（修正案の生成に使用）
}

/**
 * キーワード配列を正規表現パターンに変換
 */
function keywordToPattern(keyword: string | string[]): RegExp[] {
  const keywords = Array.isArray(keyword) ? keyword : [keyword];
  return keywords.map((k) => new RegExp(k, 'g'));
}

/**
 * 完全NGキーワードをチェック
 */
export function checkAbsoluteNGKeywords(
  text: string,
  keywords: AbsoluteNGKeyword[]
): KeywordMatch[] {
  const matches: KeywordMatch[] = [];

  // Skip annotation explanation segments (e.g., "※1背爪表面に", "※2殺菌は消毒の作用機序として")
  // These are reference materials, not advertising text to be checked
  const trimmedText = text.trim();
  if (/^※\d/.test(trimmedText)) {
    console.log(`[Keyword Matcher] ⏭️  Skipping annotation explanation segment in absolute check: "${trimmedText.substring(0, 50)}..."`);
    return [];
  }

  // NOTE: detectAnnotationRanges() is NO LONGER NEEDED
  // Annotation explanation text is already filtered out by SegmentBuilder

  for (const ngKeyword of keywords) {
    const patterns = keywordToPattern(ngKeyword.keyword);

    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, 'g');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        // 「保証」が「返金保証」「全額返金保証」の文脈で使われている場合はスキップ
        if (match[0] === '保証' || match[0] === '保証します' || match[0] === '保障') {
          const contextStart = Math.max(0, match.index - 10);
          const contextEnd = Math.min(text.length, match.index + match[0].length + 5);
          const context = text.substring(contextStart, contextEnd);

          if (context.includes('返金') || context.includes('満足')) {
            console.log(`[Keyword Matcher] ⏭️  Skipping "${match[0]}" at position ${match.index} (金銭的保証の文脈: "${context}")`);
            continue;
          }
        }

        matches.push({
          keyword: match[0],
          matchedText: match[0],
          position: {
            start: match.index,
            end: match.index + match[0].length,
          },
          type: 'absolute',
          category: ngKeyword.category,
          severity: ngKeyword.severity,
          violationType: ngKeyword.violationType,
          reason: `完全NGキーワード「${match[0]}」を検出`,
          description: ngKeyword.description,
          referenceKnowledge: ngKeyword.referenceKnowledge,
        });
      }
    }
  }

  return matches;
}

// NOTE: detectAnnotationRanges() and isInAnnotationRange() removed (2025-10-30)
// These functions were causing false positives by treating annotation markers
// in advertising text (e.g., "浸透※1・殺菌※2") as annotation explanation text.
// Annotation explanation text is now filtered at the SegmentBuilder level,
// so segments only contain advertising text and no annotation range detection is needed.

/**
 * 条件付きNGキーワードをチェック
 */
export function checkConditionalNGKeywords(
  text: string,
  keywords: ConditionalNGKeyword[],
  fullContext?: string
): KeywordMatch[] {
  const matches: KeywordMatch[] = [];
  const contextText = fullContext || text;

  // Skip annotation explanation segments (e.g., "※1背爪表面に", "※2殺菌は消毒の作用機序として")
  // These are reference materials, not advertising text to be checked
  const trimmedText = text.trim();
  if (/^※\d/.test(trimmedText)) {
    console.log(`[Keyword Matcher] ⏭️  Skipping annotation explanation segment: "${trimmedText.substring(0, 50)}..."`);
    return [];
  }

  // NOTE: detectAnnotationRanges() is NO LONGER NEEDED
  // Annotation explanation text is already filtered out by SegmentBuilder
  // Segments only contain advertising text with annotation markers (※1, ※2)
  // The markers themselves are part of the advertising text and should be checked

  // Track matched ranges to avoid duplicate matches from overlapping keywords
  const matchedRanges: Array<{start: number; end: number; keyword: string}> = [];

  for (const ngKeyword of keywords) {
    const patterns = keywordToPattern(ngKeyword.keyword);

    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, 'g');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        const matchStart = match.index;
        const matchEnd = match.index + match[0].length;

        // Check if this match overlaps with a longer keyword that was already matched
        const matchedKeywordLength = match[0].length;
        const overlaps = matchedRanges.some(range =>
          matchStart >= range.start && matchEnd <= range.end && matchedKeywordLength < range.keyword.length
        );

        if (overlaps) {
          console.log(`[Keyword Matcher] ⏭️  Skipping "${match[0]}" at position ${match.index} (overlaps with longer keyword)`);
          continue;
        }

        // Check if required annotation exists
        const annotationPattern =
          typeof ngKeyword.requiredAnnotation === 'string'
            ? new RegExp(ngKeyword.requiredAnnotation)
            : ngKeyword.requiredAnnotation;

        // Extract annotation text:
        // IMPORTANT: The annotation marker (※1, ※2, etc.) must be IMMEDIATELY after the keyword
        // to avoid false positives from other keywords' annotations.
        // Example: "ヒアルロン酸でクマ※1" - the ※1 belongs to "クマ", NOT "ヒアルロン酸"

        const keywordEnd = match.index + match[0].length;
        const immediateProximityRange = 3; // Allow up to 3 chars (e.g., space + ※)

        // Check for annotation marker IMMEDIATELY after keyword (within 3 chars)
        const immediateText = contextText.substring(keywordEnd, Math.min(contextText.length, keywordEnd + immediateProximityRange));
        const immediateMarkerMatch = immediateText.match(/^\s*※(\d*)/);

        let proximityText = '';
        if (immediateMarkerMatch) {
          // Found marker immediately after keyword
          const markerNumber = immediateMarkerMatch[1]; // Extract marker number (e.g., "1" from "※1")

          // Search for annotation text anywhere in fullContext using the marker number
          // Try multiple patterns in priority order to avoid false positives while maintaining compatibility
          if (markerNumber) {
            const allAnnotationTexts: string[] = [];

            // Pattern 1: After newline (most common, least false positives)
            // Example: "\n※1背爪表面に" or "\n※1 背爪表面に" or "\n※1:背爪表面に"
            // IMPORTANT: Include the marker (※1) in the captured text for pattern matching
            const newlinePattern = new RegExp(`\\n(※${markerNumber}[\\s:：]*[^\\n※]+)`, 'g');
            let match1;
            while ((match1 = newlinePattern.exec(contextText)) !== null) {
              allAnnotationTexts.push(match1[1].trim());
            }

            // Pattern 2: In parentheses (common in inline annotations)
            // Example: "（※1背爪表面に）" or "(※1背爪表面に)"
            // IMPORTANT: Include the marker (※1) in the captured text for pattern matching
            const parenthesesPattern = new RegExp(`[（(](※${markerNumber}[\\s:：]*[^）)]+)[）)]`, 'g');
            let match2;
            while ((match2 = parenthesesPattern.exec(contextText)) !== null) {
              allAnnotationTexts.push(match2[1].trim());
            }

            // Pattern 3: At start of text (for standalone annotation text)
            // Example: "※1背爪表面に" at the beginning of contextText
            // IMPORTANT: Include the marker (※1) in the captured text for pattern matching
            const startPattern = new RegExp(`^(※${markerNumber}[\\s:：]*[^\\n※]+)`, 'm');
            const match3 = startPattern.exec(contextText);
            if (match3) {
              allAnnotationTexts.push(match3[1].trim());
            }

            // Combine all found annotation texts
            proximityText = allAnnotationTexts.join(' ');

            // Debug logging
            if (allAnnotationTexts.length > 0) {
              console.log(`[Keyword Matcher] 📝 Found annotation for ※${markerNumber}: "${proximityText.substring(0, 50)}..."`);
            } else {
              console.log(`[Keyword Matcher] ⚠️  No annotation found for ※${markerNumber} in fullContext`);
            }
          } else {
            // No number specified (just "※"), use limited range search as fallback
            const markerPosition = keywordEnd + immediateMarkerMatch.index!;
            const contentEnd = Math.min(contextText.length, markerPosition + 100);
            proximityText = contextText.substring(markerPosition, contentEnd);
          }
        }

        let hasRequiredAnnotation = proximityText && annotationPattern.test(proximityText);

        // Check exceptions
        if (!hasRequiredAnnotation && ngKeyword.exceptions) {
          for (const exception of ngKeyword.exceptions) {
            const exceptionPattern =
              typeof exception.allowedPattern === 'string'
                ? new RegExp(exception.allowedPattern)
                : exception.allowedPattern;

            // For exceptions, check the full context
            if (exceptionPattern.test(contextText)) {
              hasRequiredAnnotation = true;
              break;
            }
          }
        }

        // Add this match to matchedRanges to prevent shorter overlapping keywords from being checked
        matchedRanges.push({
          start: matchStart,
          end: matchEnd,
          keyword: match[0]
        });

        if (!hasRequiredAnnotation) {
          matches.push({
            keyword: match[0],
            matchedText: match[0],
            position: {
              start: match.index,
              end: match.index + match[0].length,
            },
            type: 'conditional',
            category: ngKeyword.category,
            severity: ngKeyword.severity || 'high',
            reason: `条件付きNGキーワード「${match[0]}」を検出（必須注釈なし）`,
            hasRequiredAnnotation: false,
            requiredAnnotation: ngKeyword.requiredAnnotation,
            description: ngKeyword.description,
            referenceKnowledge: ngKeyword.referenceKnowledge,
            okExamples: ngKeyword.okExamples, // 適切な表現例を含める
          });
        }
      }
    }
  }

  return matches;
}

/**
 * 文脈依存NGキーワードをチェック
 */
export function checkContextDependentNGKeywords(
  text: string,
  keywords: ContextDependentNGKeyword[],
  fullContext?: string
): KeywordMatch[] {
  const matches: KeywordMatch[] = [];
  const contextText = fullContext || text;

  // Skip annotation explanation segments (e.g., "※1背爪表面に", "※2殺菌は消毒の作用機序として")
  // These are reference materials, not advertising text to be checked
  const trimmedText = text.trim();
  if (/^※\d/.test(trimmedText)) {
    console.log(`[Keyword Matcher] ⏭️  Skipping annotation explanation segment in context-dependent check: "${trimmedText.substring(0, 50)}..."`);
    return [];
  }

  // NOTE: detectAnnotationRanges() is NO LONGER NEEDED
  // Annotation explanation text is already filtered out by SegmentBuilder

  for (const ngKeyword of keywords) {
    const patterns = keywordToPattern(ngKeyword.keyword);

    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, 'g');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        // Check if matches NG pattern
        let isNG = false;
        let ngReason = '';
        let severity = 'high' as const;

        for (const ngPattern of ngKeyword.ngPatterns) {
          if (ngPattern.pattern.test(contextText)) {
            isNG = true;
            ngReason = ngPattern.reason;
            severity = ngPattern.severity;
            break;
          }
        }

        // Check if matches OK pattern (override NG)
        if (isNG) {
          for (const okPattern of ngKeyword.okPatterns) {
            if (okPattern.pattern.test(contextText)) {
              isNG = false;
              break;
            }
          }
        }

        if (isNG) {
          matches.push({
            keyword: match[0],
            matchedText: match[0],
            position: {
              start: match.index,
              end: match.index + match[0].length,
            },
            type: 'context-dependent',
            category: ngKeyword.category,
            severity,
            reason: `文脈依存NGキーワード「${match[0]}」を検出（${ngReason}）`,
            description: ngKeyword.description,
            referenceKnowledge: ngKeyword.referenceKnowledge,
          });
        }
      }
    }
  }

  return matches;
}

/**
 * 全NGキーワードチェック（統合）
 */
export function checkAllNGKeywords(
  text: string,
  keywords: {
    absolute: AbsoluteNGKeyword[];
    conditional: ConditionalNGKeyword[];
    contextDependent: ContextDependentNGKeyword[];
  },
  fullContext?: string,
  productId?: string
): {
  matches: KeywordMatch[];
  summary: {
    absolute: number;
    conditional: number;
    contextDependent: number;
    total: number;
    critical: number;
    high: number;
    medium: number;
  };
} {
  // 商品固有のannotationRulesをConditionalNGKeywordsとして追加（リグレッション防止）
  const enhancedConditionalKeywords = [...keywords.conditional];

  if (productId) {
    try {
      const { loadProductConfig } = require('../product-config-loader') as typeof import('../product-config-loader');
      const config = loadProductConfig(productId as any);

      if (config.annotationRules) {
        // 既存のキーワードを Set に格納（重複チェック用）
        const existingKeywords = new Set<string>();
        for (const existing of enhancedConditionalKeywords) {
          const existingKeywordArray = Array.isArray(existing.keyword) ? existing.keyword : [existing.keyword];
          for (const kw of existingKeywordArray) {
            existingKeywords.add(kw);
          }
        }

        // annotationRulesの各キーワードをConditionalNGKeywordとして追加（重複を除く）
        for (const [keyword, rule] of Object.entries(config.annotationRules)) {
          if (rule.required && !existingKeywords.has(keyword)) {
            enhancedConditionalKeywords.push({
              keyword,
              category: 'ingredient',
              description: `「${keyword}」には注釈が必要です。`,
              requiredAnnotation: rule.template,
              referenceKnowledge: rule.referenceKnowledge || `商品固有ルール（${productId}）`,
              okExamples: [`${keyword}※1`],
              ngExamples: [keyword],
            });
          }
        }
      }
    } catch (error) {
      console.warn('[checkAllNGKeywords] Failed to load product config:', error);
    }
  }

  const absoluteMatches = checkAbsoluteNGKeywords(text, keywords.absolute);
  const conditionalMatches = checkConditionalNGKeywords(
    text,
    enhancedConditionalKeywords,
    fullContext
  );
  const contextDependentMatches = checkContextDependentNGKeywords(
    text,
    keywords.contextDependent,
    fullContext
  );

  const allMatches = [
    ...absoluteMatches,
    ...conditionalMatches,
    ...contextDependentMatches,
  ];

  // Count by severity
  const criticalCount = allMatches.filter((m) => m.severity === 'critical').length;
  const highCount = allMatches.filter((m) => m.severity === 'high').length;
  const mediumCount = allMatches.filter((m) => m.severity === 'medium').length;

  return {
    matches: allMatches,
    summary: {
      absolute: absoluteMatches.length,
      conditional: conditionalMatches.length,
      contextDependent: contextDependentMatches.length,
      total: allMatches.length,
      critical: criticalCount,
      high: highCount,
      medium: mediumCount,
    },
  };
}
