/**
 * 注釈構造分析システム (Issue #30)
 *
 * セグメント内の注釈マーカー付きキーワードと注釈テキストを分析し、
 * Geminiに明示的に注釈構造を伝えるためのロジック。
 *
 * 【目的】
 * - 「クマ※1」のようなキーワード+注釈マーカーを検出
 * - 「（※1...）」のような注釈テキストを検出
 * - キーワードと注釈テキストを紐付け
 * - Geminiに注釈構造を明示的に伝えて正しい評価を実現
 */

/**
 * 注釈マーカー付きキーワード
 */
export interface AnnotationMarkerMatch {
  /** キーワード（例: "クマ"） */
  keyword: string;
  /** 注釈マーカー（例: "※1"） */
  marker: string;
  /** テキスト内の位置 */
  position: number;
}

/**
 * 注釈テキスト
 */
export interface AnnotationTextMatch {
  /** 注釈マーカー（例: "※1"） */
  marker: string;
  /** 注釈の内容テキスト（例: "乾燥や古い角質によるくすみ..."） */
  text: string;
  /** テキスト内の位置 */
  position: number;
  /** 注釈の場所（セグメント内 or fullText内） */
  location: 'segment' | 'fullText';
}

/**
 * キーワードと注釈テキストの紐付け結果
 */
export interface AnnotationBinding {
  /** キーワード（例: "クマ"） */
  keyword: string;
  /** 注釈マーカー（例: "※1"） */
  marker: string;
  /** 注釈テキスト（存在する場合） */
  annotationText: string | null;
  /** 注釈の場所 */
  location: 'segment' | 'fullText' | null;
  /** 注釈が存在するか */
  isValid: boolean;
}

/**
 * 注釈分析結果
 */
export interface AnnotationAnalysisResult {
  /** 注釈マーカー付きキーワードの一覧 */
  keywordsWithMarkers: AnnotationMarkerMatch[];
  /** 注釈テキストの一覧 */
  annotationTexts: AnnotationTextMatch[];
  /** キーワードと注釈テキストの紐付け結果 */
  bindings: AnnotationBinding[];
  /** 注釈マーカー付きキーワードが存在するか */
  hasAnnotatedKeywords: boolean;
}

/**
 * 注釈マーカーのパターン
 *
 * 検出対象:
 * - ※1, ※2, ※3... (全角)
 * - *1, *2, *3... (半角)
 * - 注1, 注2, 注3...
 */
const ANNOTATION_MARKER_PATTERNS = [
  /※(\d+)/g,  // ※1, ※2, ※3
  /\*(\d+)/g, // *1, *2, *3
  /注(\d+)/g, // 注1, 注2, 注3
];

/**
 * 注釈テキストのパターン
 *
 * 検出対象:
 * - （※1...）（括弧で囲まれた注釈）
 * - （*1...）
 * - ※1 ... (行頭の注釈)
 * - (space)※1... (スペース後の注釈、括弧なし)
 * - ...に※2... (連続する注釈、Issue #30 regression fix)
 */
const ANNOTATION_TEXT_PATTERNS = [
  /（※(\d+)([^）]+)）/g,        // （※1乾燥や...）
  /（\*(\d+)([^）]+)）/g,       // （*1乾燥や...）
  /\(※(\d+)([^)]+)\)/g,       // (※1乾燥や...) 半角括弧
  /\(\*(\d+)([^)]+)\)/g,      // (*1乾燥や...) 半角括弧
  /[\s\u3000]※(\d+)([^※\s\u3000]+[^\s\u3000]*)/g,  // スペース後の ※1乾燥や... (括弧なし)
  /(?<=[ぁ-んァ-ヶー一-龠々])※(\d+)([^※\s\u3000]+)/g,  // 連続注釈: ...に※2... (Issue #30 regression fix)
  /^※(\d+)[\s:：](.+)$/gm,    // 行頭の ※1 乾燥や...
  /^注(\d+)[\s:：](.+)$/gm,    // 行頭の 注1 乾燥や...
];

/**
 * 注釈マーカー付きキーワードを抽出
 *
 * @param text - 検索対象テキスト
 * @returns 注釈マーカー付きキーワードの配列
 *
 * @example
 * ```typescript
 * const text = "クマ※1対策とヒアルロン酸※2配合";
 * const keywords = extractKeywordsWithMarkers(text);
 * // [
 * //   { keyword: "クマ", marker: "※1", position: 0 },
 * //   { keyword: "ヒアルロン酸", marker: "※2", position: 6 }
 * // ]
 * ```
 */
export function extractKeywordsWithMarkers(text: string): AnnotationMarkerMatch[] {
  const results: AnnotationMarkerMatch[] = [];

  for (const pattern of ANNOTATION_MARKER_PATTERNS) {
    const regex = new RegExp(pattern);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const markerPosition = match.index;
      const markerType = match[0][0]; // ※, *, 注
      const markerNumber = match[1];
      const marker = `${markerType}${markerNumber}`;

      // マーカーの直前にあるキーワードを抽出
      // 例: "クマ※1" → "クマ"
      // 例: "刺すヒアルロン酸でクマ※1" → "クマ"
      const beforeMarker = text.substring(0, markerPosition);

      // より適切なキーワード抽出:
      // カタカナ連続、または漢字連続、またはひらがな連続、または英数字連続を単語とみなす
      // 長音記号や助詞で区切る
      const keywordMatch = beforeMarker.match(/([ァ-ヶー]+|[一-龠々]+|[ぁ-ん]+|[a-zA-Z0-9]+)$/);

      if (keywordMatch) {
        const keyword = keywordMatch[1];

        // 長音記号で終わっている場合、カタカナ部分のみ抽出
        if (keyword.match(/^[ァ-ヶー]+$/)) {
          // カタカナと長音記号の組み合わせをそのまま使用
          // (no action needed)
        }

        const keywordPosition = markerPosition - keyword.length;

        results.push({
          keyword,
          marker,
          position: keywordPosition,
        });
      }
    }
  }

  return results;
}

/**
 * 注釈テキストを抽出
 *
 * @param text - 検索対象テキスト
 * @param location - 注釈の場所 ('segment' | 'fullText')
 * @returns 注釈テキストの配列
 *
 * @example
 * ```typescript
 * const text = "クマ※1対策（※1乾燥や古い角質によるくすみ、ハリが不足した暗い目の下）";
 * const annotations = extractAnnotationTexts(text, 'segment');
 * // [
 * //   {
 * //     marker: "※1",
 * //     text: "乾燥や古い角質によるくすみ、ハリが不足した暗い目の下",
 * //     position: 6,
 * //     location: "segment"
 * //   }
 * // ]
 * ```
 */
export function extractAnnotationTexts(
  text: string,
  location: 'segment' | 'fullText'
): AnnotationTextMatch[] {
  const results: AnnotationTextMatch[] = [];

  for (const pattern of ANNOTATION_TEXT_PATTERNS) {
    const regex = new RegExp(pattern);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const markerNumber = match[1];
      const annotationText = match[2] ? match[2].trim() : '';

      // マーカーのタイプを判定（※, *, 注）
      const fullMatch = match[0];
      let markerType = '※';
      if (fullMatch.includes('*')) {
        markerType = '*';
      } else if (fullMatch.includes('注')) {
        markerType = '注';
      }

      const marker = `${markerType}${markerNumber}`;

      results.push({
        marker,
        text: annotationText,
        position: match.index,
        location,
      });
    }
  }

  return results;
}

/**
 * キーワードと注釈テキストを紐付け
 *
 * @param keywordsWithMarkers - 注釈マーカー付きキーワードの配列
 * @param annotationTexts - 注釈テキストの配列
 * @returns 紐付け結果の配列
 *
 * @example
 * ```typescript
 * const keywords = [{ keyword: "クマ", marker: "※1", position: 0 }];
 * const annotations = [{ marker: "※1", text: "乾燥や...", position: 6, location: "segment" }];
 * const bindings = bindAnnotations(keywords, annotations);
 * // [
 * //   {
 * //     keyword: "クマ",
 * //     marker: "※1",
 * //     annotationText: "乾燥や...",
 * //     location: "segment",
 * //     isValid: true
 * //   }
 * // ]
 * ```
 */
export function bindAnnotations(
  keywordsWithMarkers: AnnotationMarkerMatch[],
  annotationTexts: AnnotationTextMatch[]
): AnnotationBinding[] {
  return keywordsWithMarkers.map((kwm) => {
    // 同じマーカーの注釈テキストを検索
    // セグメント内を優先、見つからなければfullText内を検索
    const segmentAnnotation = annotationTexts.find(
      (at) => at.marker === kwm.marker && at.location === 'segment'
    );

    const fullTextAnnotation = annotationTexts.find(
      (at) => at.marker === kwm.marker && at.location === 'fullText'
    );

    const annotation = segmentAnnotation || fullTextAnnotation;

    return {
      keyword: kwm.keyword,
      marker: kwm.marker,
      annotationText: annotation ? annotation.text : null,
      location: annotation ? annotation.location : null,
      isValid: !!annotation,
    };
  });
}

/**
 * セグメントの注釈構造を分析
 *
 * @param segmentText - セグメントテキスト
 * @param fullText - 広告文全体（オプション）
 * @returns 注釈分析結果
 *
 * @example
 * ```typescript
 * const segmentText = "クマ※1対策（※1乾燥や古い角質によるくすみ、ハリが不足した暗い目の下）";
 * const result = analyzeAnnotations(segmentText);
 *
 * console.log(result.hasAnnotatedKeywords); // true
 * console.log(result.bindings);
 * // [
 * //   {
 * //     keyword: "クマ",
 * //     marker: "※1",
 * //     annotationText: "乾燥や古い角質によるくすみ、ハリが不足した暗い目の下",
 * //     location: "segment",
 * //     isValid: true
 * //   }
 * // ]
 * ```
 */
export function analyzeAnnotations(
  segmentText: string,
  fullText?: string
): AnnotationAnalysisResult {
  // 1. セグメント内の注釈マーカー付きキーワードを抽出
  const keywordsWithMarkers = extractKeywordsWithMarkers(segmentText);

  // 2. セグメント内の注釈テキストを抽出
  const segmentAnnotations = extractAnnotationTexts(segmentText, 'segment');

  // 3. fullText内の注釈テキストを抽出（fullTextがある場合）
  const fullTextAnnotations = fullText
    ? extractAnnotationTexts(fullText, 'fullText')
    : [];

  // 4. 注釈テキストを結合
  const allAnnotations = [...segmentAnnotations, ...fullTextAnnotations];

  // 5. キーワードと注釈テキストを紐付け
  const bindings = bindAnnotations(keywordsWithMarkers, allAnnotations);

  return {
    keywordsWithMarkers,
    annotationTexts: allAnnotations,
    bindings,
    hasAnnotatedKeywords: keywordsWithMarkers.length > 0,
  };
}

/**
 * 注釈分析結果を人間可読な形式で出力（デバッグ用）
 *
 * @param result - 注釈分析結果
 * @returns フォーマットされた文字列
 */
export function formatAnnotationAnalysis(result: AnnotationAnalysisResult): string {
  if (!result.hasAnnotatedKeywords) {
    return '注釈マーカー付きキーワードは検出されませんでした。';
  }

  const lines: string[] = [];
  lines.push(`注釈マーカー付きキーワード: ${result.keywordsWithMarkers.length}個`);
  lines.push('');

  result.bindings.forEach((binding, index) => {
    lines.push(`${index + 1}. 「${binding.keyword}${binding.marker}」`);
    if (binding.isValid) {
      lines.push(`   ✅ 注釈テキスト: 「${binding.annotationText}」`);
      lines.push(`   📍 注釈の場所: ${binding.location === 'segment' ? 'セグメント内' : '広告文全体'}`);
    } else {
      lines.push(`   ❌ 注釈テキストが見つかりません`);
    }
    lines.push('');
  });

  return lines.join('\n');
}
