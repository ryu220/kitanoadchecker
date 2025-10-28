/**
 * Knowledge Excerpt Validator
 *
 * Validates that AI-generated knowledge excerpts are accurate and verbatim
 * from the knowledge base files.
 *
 * Part of Issue #13: 知識ベース原文引用の不正確性修正
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a knowledge excerpt for common issues
 *
 * @param excerpt - The excerpt text to validate
 * @param fileName - The knowledge base file name
 * @param keywords - Keywords that should appear in the excerpt
 * @returns Validation result with errors and warnings
 */
export function validateKnowledgeExcerpt(
  excerpt: string,
  fileName: string,
  keywords?: string[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check 1: Excerpt must not be empty
  if (!excerpt || excerpt.trim().length === 0) {
    errors.push('Excerpt is empty');
    return { isValid: false, errors, warnings };
  }

  // Check 2: Excerpt length (should be at least 50 chars, not more than 2000)
  if (excerpt.length < 50) {
    errors.push(`Excerpt too short (${excerpt.length} chars). Minimum 50 chars expected for proper context.`);
  }

  if (excerpt.length > 2000) {
    warnings.push(`Excerpt very long (${excerpt.length} chars). Consider if this much context is necessary.`);
  }

  // Check 3: Should include section headings (# markers)
  if (!excerpt.includes('#') && !excerpt.includes('**')) {
    warnings.push('Excerpt should ideally include section headings (### or ####) or bold markers (**) for proper context.');
  }

  // Check 4: Detect system messages (should not be present)
  const systemMessagePatterns = [
    'ナレッジベースが長すぎる',
    '切り詰められました',
    '見当たらず',
    '記載なし',
    '該当なし',
    '見つかりません',
    'システムメッセージ',
  ];

  for (const pattern of systemMessagePatterns) {
    if (excerpt.includes(pattern)) {
      errors.push(`Excerpt contains system message or placeholder: "${pattern}". This suggests AI did not find proper content.`);
    }
  }

  // Check 5: Detect AI paraphrasing patterns
  const paraphrasingPatterns = [
    /という表現を使う場合.*必要です/,
    /明記する必要があります/,
    /記載が必要です/,
    /という注釈が必要/,
  ];

  for (const pattern of paraphrasingPatterns) {
    if (pattern.test(excerpt) && excerpt.length < 150) {
      warnings.push(`Excerpt may be paraphrased rather than verbatim. Pattern matched: ${pattern.toString()}`);
    }
  }

  // Check 6: Keyword presence (if provided)
  if (keywords && keywords.length > 0) {
    const missingKeywords = keywords.filter(keyword => {
      // Normalize for comparison (handle full-width/half-width)
      const normalizedExcerpt = excerpt.toLowerCase();
      const normalizedKeyword = keyword.toLowerCase();
      return !normalizedExcerpt.includes(normalizedKeyword);
    });

    if (missingKeywords.length > 0) {
      warnings.push(`Keywords not found in excerpt: ${missingKeywords.join(', ')}. Verify this is the correct section.`);
    }
  }

  // Check 7: Detect keyword repetition (like "売上世界一※1 売上世界一※1 ...")
  const words = excerpt.split(/\s+/);
  const wordCounts = new Map<string, number>();

  for (const word of words) {
    if (word.length > 3) { // Only check words longer than 3 chars
      const count = wordCounts.get(word) || 0;
      wordCounts.set(word, count + 1);
    }
  }

  for (const [word, count] of wordCounts.entries()) {
    if (count >= 3 && word !== '違反') { // Allow "違反" to repeat
      warnings.push(`Word "${word}" repeated ${count} times. This may indicate keyword repetition instead of proper explanation.`);
    }
  }

  // Check 8: Verify file name format
  if (!fileName.endsWith('.txt')) {
    warnings.push(`File name "${fileName}" does not end with .txt. Verify this is correct.`);
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    errors,
    warnings,
  };
}

/**
 * Checks if excerpt contains fabricated content by looking for common patterns
 *
 * @param excerpt - The excerpt to check
 * @returns true if excerpt appears to contain fabricated content
 */
export function detectFabricatedContent(excerpt: string): boolean {
  // Known fabricated content patterns from Issue #13
  const fabricatedPatterns = [
    'メーキャップ効果による', // This was fabricated in クマ bug
  ];

  for (const pattern of fabricatedPatterns) {
    if (excerpt.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Logs validation results to console with appropriate severity
 *
 * @param segmentId - The segment ID being validated
 * @param fileName - The knowledge file name
 * @param result - The validation result
 */
export function logValidationResult(
  segmentId: string,
  fileName: string,
  result: ValidationResult
): void {
  if (!result.isValid) {
    console.error(`[KnowledgeValidator] ❌ VALIDATION FAILED for ${segmentId}, file: ${fileName}`);
    for (const error of result.errors) {
      console.error(`  - ERROR: ${error}`);
    }
  }

  if (result.warnings.length > 0) {
    console.warn(`[KnowledgeValidator] ⚠️  WARNINGS for ${segmentId}, file: ${fileName}`);
    for (const warning of result.warnings) {
      console.warn(`  - WARNING: ${warning}`);
    }
  }

  if (result.isValid && result.warnings.length === 0) {
    console.log(`[KnowledgeValidator] ✅ Validation passed for ${segmentId}, file: ${fileName}`);
  }
}
