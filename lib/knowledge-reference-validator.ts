/**
 * 知識ベース参照の検証 (Issue #17)
 *
 * AIが生成した referenceKnowledge の正確性を検証します。
 *
 * 検証項目:
 * 1. ファイル名の実在性
 * 2. 引用内容の存在確認
 * 3. 引用長のチェック
 * 4. 禁止ワードチェック（要約・解釈の兆候）
 */

import { KnowledgeFile } from './knowledge-loader';

/**
 * 知識ベース参照の検証結果
 */
export interface KnowledgeReferenceValidationResult {
  /** 検証が成功したか */
  isValid: boolean;
  /** エラーメッセージの配列 */
  errors: string[];
  /** 警告メッセージの配列 */
  warnings: string[];
  /** 修正案（エラー時） */
  correctedReference?: {
    file: string;
    excerpt: string;
  };
}

/**
 * referenceKnowledge の検証
 *
 * @param reference - AIが生成した referenceKnowledge
 * @param knowledgeFiles - 実際の知識ベースファイル一覧
 * @returns 検証結果
 */
export function validateKnowledgeReference(
  reference: { file: string | null; excerpt: string | null },
  knowledgeFiles: KnowledgeFile[]
): KnowledgeReferenceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // null チェック
  if (!reference.file || reference.file.length === 0) {
    errors.push('ファイル名が指定されていません');
    return { isValid: false, errors, warnings };
  }

  if (!reference.excerpt || reference.excerpt.length === 0) {
    errors.push('引用内容が指定されていません');
    return { isValid: false, errors, warnings };
  }

  // 検証1: ファイル名の実在性チェック
  const fileExists = knowledgeFiles.some(f => f.fileName === reference.file);

  if (!fileExists) {
    errors.push(`ファイル "${reference.file}" は存在しません`);

    // ファイル名の候補を提案
    const candidates = knowledgeFiles
      .map(f => f.fileName)
      .filter(name => {
        // 類似度判定（簡易版）
        const refLower = reference.file!.toLowerCase();
        const nameLower = name.toLowerCase();
        return nameLower.includes(refLower) || refLower.includes(nameLower);
      });

    if (candidates.length > 0) {
      warnings.push(`候補ファイル: ${candidates.join(', ')}`);
    }
  }

  // 検証2: 引用内容の存在確認
  if (fileExists) {
    const targetFile = knowledgeFiles.find(f => f.fileName === reference.file)!;
    const excerptExists = targetFile.content.includes(reference.excerpt!);

    if (!excerptExists) {
      errors.push(`ファイル "${reference.file}" に引用内容が見つかりません`);

      // 部分一致で候補を探す
      const excerptWords = reference.excerpt!.split(/\s+/).filter(w => w.length > 2);
      const matchingLines = targetFile.content.split('\n').filter(line => {
        return excerptWords.some(word => line.includes(word));
      });

      if (matchingLines.length > 0) {
        warnings.push(`候補箇所: ${matchingLines[0].substring(0, 100)}...`);
      }
    }
  }

  // 検証3: 引用長のチェック
  const excerptLength = reference.excerpt!.length;

  if (excerptLength < 50) {
    warnings.push(`引用が短すぎます（${excerptLength}文字）。文脈を含めて50文字以上にしてください。`);
  }

  if (excerptLength > 2000) {
    warnings.push(`引用が長すぎます（${excerptLength}文字）。2000文字以内にしてください。`);
  }

  // 検証4: 禁止ワードチェック（要約・解釈の兆候）
  const forbiddenPatterns = [
    '～が必要',
    '～という意味',
    '～を意味する',
    '要するに',
    '簡単に言うと',
    '～のこと',
    '～である'
  ];

  // 知識ベースに実際に存在しない表現が含まれているかチェック
  const suspiciousPhrases = forbiddenPatterns.filter(pattern => {
    const excerptContainsPattern = reference.excerpt!.includes(pattern);
    const knowledgeContainsExcerpt = knowledgeFiles.some(f =>
      f.content.includes(reference.excerpt!)
    );
    return excerptContainsPattern && !knowledgeContainsExcerpt;
  });

  if (suspiciousPhrases.length > 0) {
    warnings.push(`要約の兆候: 「${suspiciousPhrases.join('」「')}」が含まれています`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 複数の referenceKnowledge を一括検証
 *
 * @param references - referenceKnowledge の配列
 * @param knowledgeFiles - 知識ベースファイル一覧
 * @returns 各参照の検証結果の配列
 */
export function validateMultipleReferences(
  references: Array<{ file: string | null; excerpt: string | null }>,
  knowledgeFiles: KnowledgeFile[]
): KnowledgeReferenceValidationResult[] {
  return references.map(ref => validateKnowledgeReference(ref, knowledgeFiles));
}

/**
 * エラー時のプレースホルダー参照を生成
 *
 * @param validationResult - 検証結果
 * @returns エラープレースホルダー
 */
export function createErrorPlaceholder(
  validationResult: KnowledgeReferenceValidationResult
): { file: string; excerpt: string } {
  return {
    file: '【エラー：参照元が不明です】',
    excerpt: `【エラー：引用が見つかりませんでした】\n\n検証エラー: ${validationResult.errors.join(', ')}\n\n警告: ${validationResult.warnings.join(', ')}`
  };
}
