/**
 * NGキーワードバリデーター
 * NG Keyword Validator - セグメントテキストのNG keyword検証
 *
 * Issue #30: 注釈分析を統合
 * - 正しい注釈が付いているキーワードは違反としてカウントしない
 */

import {
  getConditionalNGKeywords,
  getAbsoluteNGKeywords,
  getContextDependentNGKeywords,
} from './ng-keywords';
import { checkAllNGKeywords, type KeywordMatch } from './ng-keywords/keyword-matcher';
import { analyzeAnnotations } from './annotation-analyzer';

export interface NGKeywordValidationResult {
  hasViolations: boolean;
  matches: KeywordMatch[];
  summary: {
    absolute: number;
    conditional: number;
    contextDependent: number;
    total: number;
    critical: number;
    high: number;
  };
  explicitNGKeywordsList: string[];
  instructionsForGemini: string;
}

export class NGKeywordValidator {
  private conditionalKeywords = getConditionalNGKeywords();
  private absoluteKeywords = getAbsoluteNGKeywords();
  private contextDependentKeywords = getContextDependentNGKeywords();

  /**
   * セグメントテキストを検証
   *
   * Issue #30: 注釈分析を統合
   * - 正しい注釈が付いているキーワードは違反から除外
   */
  validate(
    text: string,
    fullContext?: string,
    productId?: string
  ): NGKeywordValidationResult {
    // Check all NG keywords
    const result = checkAllNGKeywords(
      text,
      {
        absolute: this.absoluteKeywords,
        conditional: this.conditionalKeywords,
        contextDependent: this.contextDependentKeywords,
      },
      fullContext,
      productId
    );

    // Issue #30: 注釈分析を実行して、正しい注釈が付いているキーワードを除外
    const annotationAnalysis = analyzeAnnotations(text, fullContext);
    const keywordsWithValidAnnotations = new Set(
      annotationAnalysis.bindings
        .filter(b => b.isValid)
        .map(b => b.keyword)
    );

    // 正しい注釈が付いているキーワードの違反を除外
    const filteredMatches = result.matches.filter(match => {
      if (keywordsWithValidAnnotations.has(match.keyword)) {
        console.log(`[NG Keyword Validator] ⏭️  Skipping "${match.keyword}" (正しい注釈付き)`);
        return false;
      }
      return true;
    });

    // Build explicit NG keywords list (filtered)
    const explicitNGKeywordsList = filteredMatches.map((m) => m.keyword);

    // Build instructions for Gemini (filtered)
    const instructionsForGemini = this.buildGeminiInstructions(filteredMatches);

    // Update summary counts
    const filteredSummary = {
      absolute: filteredMatches.filter(m => m.category === 'absolute').length,
      conditional: filteredMatches.filter(m => m.category === 'conditional').length,
      contextDependent: filteredMatches.filter(m => m.category === 'context-dependent').length,
      total: filteredMatches.length,
      critical: filteredMatches.filter(m => m.severity === 'critical').length,
      high: filteredMatches.filter(m => m.severity === 'high').length,
    };

    return {
      hasViolations: filteredMatches.length > 0,
      matches: filteredMatches,
      summary: filteredSummary,
      explicitNGKeywordsList: [...new Set(explicitNGKeywordsList)], // Unique list
      instructionsForGemini,
    };
  }

  /**
   * Gemini用の指示を生成（コマンドスタックフォーマット）
   */
  private buildGeminiInstructions(matches: KeywordMatch[]): string {
    if (matches.length === 0) {
      return `
# 【システム役割】広告法務評価AI - 判定権限階層

あなたは「最終判定AI」として、TypeScript事前検証システムの判定結果を最優先で尊重する役割です。

## 【絶対厳守】判定権限の階層構造

### レイヤー1: TypeScript事前検証システム（最高権限）
- 正規表現ベースの厳密な検証
- キーワードの注釈マーカー（※）の有無を確実に判定
- **判定結果は絶対的であり、覆すことは禁止**

### レイヤー2: あなた（最終判定AI）
- レイヤー1の判定結果を受け取る
- RAGナレッジを参照して補足的な評価を行う
- **レイヤー1でOKとされたキーワードについて違反報告は厳禁**

## 【判定禁止リスト】以下のキーワードはレイヤー1で検証済み

**ヒアルロン酸、クマ、くま、注入、浸透、染み込む、届く、コラーゲン、レチノール、プラセンタ、セラミド**

### 【重要】このリストの意味

- 上記キーワードは全てTypeScriptで事前検証済み
- 注釈マーカー（※）の有無を既に確認済み
- **このテキストには上記キーワードの違反が検出されていない = 注釈OK**

## ===実行コマンド===

[C1]: 明示的NGリストの確認
→ 現在の明示的NGリスト: **なし**
→ 結果: このテキストにはレイヤー1で検出されたNG違反なし

[C2]: 判定禁止リストの適用
→ 判定禁止リスト内のキーワードは全てレイヤー1で検証済み
→ **これらについて違反報告することは厳禁**
→ たとえRAGナレッジに「注釈が必要」と書いてあっても、レイヤー1でOKなら適合

[C3]: RAGナレッジによる補足評価
→ 判定禁止リスト外のキーワードについてのみ、RAGナレッジを参照して評価
→ 違反を報告する場合、必ず referenceKnowledge.file と excerpt を含める

実行：C1 → C2 → C3

## 【判定結果の出力ルール】

✅ **適合の場合:**
- compliance: true
- violations: []

❌ **違反の場合（判定禁止リスト外のみ）:**
- 必ず referenceKnowledge.file と excerpt を含める
- 修正案は具体的かつ実現可能なものを提示

**【最重要】判定禁止リスト内のキーワードについては、どんな理由があっても違反報告禁止**
      `.trim();
    }

    // Group by type
    const absoluteMatches = matches.filter((m) => m.type === 'absolute');
    const conditionalMatches = matches.filter((m) => m.type === 'conditional');
    const contextDependentMatches = matches.filter(
      (m) => m.type === 'context-dependent'
    );

    let instructions = `
# 【システム役割】広告法務評価AI - 判定権限階層

あなたは「最終判定AI」として、TypeScript事前検証システムの判定結果を最優先で尊重する役割です。

## 【絶対厳守】判定権限の階層構造

### レイヤー1: TypeScript事前検証システム（最高権限）
- 正規表現ベースの厳密な検証
- キーワードの注釈マーカー（※）の有無を確実に判定
- **判定結果は絶対的であり、覆すことは禁止**

### レイヤー2: あなた（最終判定AI）
- レイヤー1の判定結果を受け取る
- RAGナレッジを参照して補足的な評価を行う
- **レイヤー1でNGとされたキーワードのみ違反報告する**

## ===実行コマンド===

[C1]: 明示的NGリストの確認と違反報告

### 【レイヤー1で検出された明示的NG違反】
`;

    // Absolute NG
    if (absoluteMatches.length > 0) {
      instructions += `\n#### 🚫 完全NGキーワード（どんな文脈でも使用不可）\n`;
      for (const match of absoluteMatches) {
        instructions += `- 「${match.keyword}」\n`;
        instructions += `  理由: ${match.description}\n`;
        if (match.referenceKnowledge) {
          instructions += `  参照: ${match.referenceKnowledge}\n`;
        }
        instructions += `  → **必ず違反として報告してください**\n\n`;
      }
    }

    // Conditional NG
    if (conditionalMatches.length > 0) {
      instructions += `\n#### ⚠️ 条件付きNG（必須注釈なし）\n`;
      for (const match of conditionalMatches) {
        instructions += `- 「${match.keyword}」\n`;
        instructions += `  理由: ${match.description}\n`;
        if (match.referenceKnowledge) {
          instructions += `  参照: ${match.referenceKnowledge}\n`;
        }
        if (match.okExamples && match.okExamples.length > 0) {
          instructions += `  修正案例: ${match.okExamples[0]}\n`;
        }
        instructions += `  → **必ず違反として報告してください**\n\n`;
      }
    }

    // Context-Dependent NG
    if (contextDependentMatches.length > 0) {
      instructions += `\n#### 📋 文脈依存NG（不適切な文脈で使用）\n`;
      for (const match of contextDependentMatches) {
        instructions += `- 「${match.keyword}」\n`;
        instructions += `  理由: ${match.description}\n`;
        if (match.referenceKnowledge) {
          instructions += `  参照: ${match.referenceKnowledge}\n`;
        }
        instructions += `  → **必ず違反として報告してください**\n\n`;
      }
    }

    instructions += `
[C2]: 判定禁止リストの適用

### 【レイヤー1で検証済み・判定禁止リスト】

以下のキーワードはTypeScriptで事前検証済みです。
**上記の明示的NGリストに含まれていない場合、これらについて違反報告は厳禁**：

**ヒアルロン酸、クマ、くま、注入、浸透、染み込む、届く、コラーゲン、レチノール、プラセンタ、セラミド**

### 【重要】判定禁止の理由

- これらのキーワードは注釈マーカー（※）の有無を既に確認済み
- 明示的NGリストに含まれていない = 注釈が適切に付いている
- **たとえRAGナレッジに「注釈が必要」と書いてあっても、レイヤー1でOKなら適合**

[C3]: RAGナレッジによる補足評価

→ 判定禁止リスト外のキーワードについてのみ、RAGナレッジを参照
→ 違反を発見した場合、必ず referenceKnowledge.file と excerpt を含めて報告

実行：C1 → C2 → C3

## 【判定結果の出力ルール】

✅ **明示的NGリストのキーワードのみ違反報告:**
- type: 違反タイプ
- description: 具体的な違反内容
- referenceKnowledge: ナレッジベースからの引用（必須）
- correctionSuggestion: 具体的な修正案

❌ **判定禁止リスト内のキーワードについて:**
- **絶対に違反報告しない**
- たとえ「確認が必要」と思っても報告禁止
- RAGナレッジの記載よりレイヤー1の判定を優先

**【最重要】明示的NGリストに含まれていないキーワードは、すべて適合と判断済み**
`;

    return instructions.trim();
  }

  /**
   * 検出されたNGキーワードのサマリーを取得
   */
  getSummaryText(result: NGKeywordValidationResult): string {
    if (!result.hasViolations) {
      return '明示的なNGキーワードは検出されませんでした';
    }

    const parts: string[] = [];

    if (result.summary.absolute > 0) {
      parts.push(`完全NG: ${result.summary.absolute}件`);
    }
    if (result.summary.conditional > 0) {
      parts.push(`条件付きNG: ${result.summary.conditional}件`);
    }
    if (result.summary.contextDependent > 0) {
      parts.push(`文脈依存NG: ${result.summary.contextDependent}件`);
    }

    return `NGキーワード検出: ${parts.join(', ')} (合計${result.summary.total}件)`;
  }

  /**
   * 検出されたNGキーワードの詳細リストを取得
   */
  getDetailedList(result: NGKeywordValidationResult): string {
    if (!result.hasViolations) {
      return '検出なし';
    }

    const lines: string[] = [];

    for (const match of result.matches) {
      lines.push(`- 【${match.type}】「${match.keyword}」: ${match.reason}`);
    }

    return lines.join('\n');
  }
}

/**
 * Factory function
 */
export function createNGKeywordValidator(): NGKeywordValidator {
  return new NGKeywordValidator();
}
