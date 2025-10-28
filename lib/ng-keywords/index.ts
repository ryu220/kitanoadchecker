/**
 * NGキーワード定義モジュール
 * NG Keyword Definitions Module
 */

// Export types and data
export * from './conditional-ng';
export * from './absolute-ng';
export * from './context-dependent-ng';

// Re-export all keyword lists for convenience
import { getConditionalNGKeywords } from './conditional-ng';
import { getAbsoluteNGKeywords } from './absolute-ng';
import { getContextDependentNGKeywords } from './context-dependent-ng';

export const ALL_NG_KEYWORDS = {
  conditional: getConditionalNGKeywords(),
  absolute: getAbsoluteNGKeywords(),
  contextDependent: getContextDependentNGKeywords(),
};

/**
 * 全NGキーワード統計
 */
export function getNGKeywordStats() {
  return {
    conditional: ALL_NG_KEYWORDS.conditional.length,
    absolute: ALL_NG_KEYWORDS.absolute.length,
    contextDependent: ALL_NG_KEYWORDS.contextDependent.length,
    total:
      ALL_NG_KEYWORDS.conditional.length +
      ALL_NG_KEYWORDS.absolute.length +
      ALL_NG_KEYWORDS.contextDependent.length,
  };
}
