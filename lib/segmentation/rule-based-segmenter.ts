/**
 * RuleBasedSegmenter - ルールベースセグメント分割エンジン
 *
 * LLM依存を排除し、ルールベースで広告文をセグメントに分割します
 * Issue #28: セグメント分割をLLM依存からルールベースに変更
 *
 * パフォーマンス目標：
 * - 処理時間: 0.1秒以下（平均）
 * - 最大処理時間: 0.5秒（5,000文字）
 * - 精度: 既存LLMプロンプトのルールを100%再現
 */

import { Segment as _Segment, ProductId } from '../types';
import { loadProductConfig } from '../product-config-loader';
import { SegmentationConfig, SegmentationResult } from './types';
import { Tokenizer } from './tokenizer';
import { KeywordDetector } from './keyword-detector';
import { AnnotationMerger } from './annotation-merger';
import { SegmentBuilder } from './segment-builder';

/**
 * RuleBasedSegmenter
 */
export class RuleBasedSegmenter {
  private config: SegmentationConfig;

  /**
   * コンストラクタ
   *
   * @param productId - 商品ID
   * @param debug - デバッグモード（詳細ログを出力）
   */
  constructor(productId: ProductId, debug = false) {
    const productConfig = loadProductConfig(productId);

    this.config = {
      productId,
      productConfig,
      keywordRules: [], // 今後拡張可能
      debug,
    };
  }

  /**
   * テキストをセグメントに分割
   *
   * アルゴリズム：
   * 1. トークナイズ（文・段落分解）
   * 2. キーワード検出（セグメント候補生成）
   * 3. 注釈マージ（本文 + 注釈マーカーを結合）
   * 4. セグメント生成（ID付与、位置情報計算、注釈説明文を除外）
   *
   * @param text - 広告文（根拠資料を含む可能性あり）
   * @returns セグメント分割結果
   */
  segment(text: string): SegmentationResult {
    const startTime = Date.now();

    if (!text || text.trim().length === 0) {
      return {
        segments: [],
        processingTime: Date.now() - startTime,
        tokenCount: 0,
      };
    }

    // 1. トークナイズ（全文）
    const tokens = Tokenizer.tokenize(text);

    if (this.config.debug) {
      console.log('[RuleBasedSegmenter] === Tokenization ===');
      console.log(Tokenizer.formatTokens(tokens));
    }

    // 2. キーワード検出
    const candidates = KeywordDetector.detect(tokens, this.config);

    if (this.config.debug) {
      console.log(`[RuleBasedSegmenter] === Keyword Detection (${candidates.length} candidates) ===`);
      candidates.forEach((c, i) => {
        const text = c.tokens.map((t) => t.text).join('');
        console.log(`[${i}] ${c.type.padEnd(15)} | priority=${c.priority} | "${text.substring(0, 50)}"`);
      });
    }

    // 3. 注釈マージ
    const mergedCandidates = AnnotationMerger.merge(candidates, tokens);

    if (this.config.debug) {
      console.log(`[RuleBasedSegmenter] === Annotation Merging (${mergedCandidates.length} candidates) ===`);
      console.log(AnnotationMerger.debugAnnotations(tokens));
    }

    // 4. セグメント生成
    const segments = SegmentBuilder.build(mergedCandidates, text);

    if (this.config.debug) {
      console.log(`[RuleBasedSegmenter] === Segment Building (${segments.length} segments) ===`);
      console.log(SegmentBuilder.formatSegments(segments));
    }

    const processingTime = Date.now() - startTime;

    console.log(
      `[RuleBasedSegmenter] ✅ Completed in ${processingTime}ms (${tokens.length} tokens → ${segments.length} segments)`
    );

    const result: SegmentationResult = {
      segments,
      processingTime,
      tokenCount: tokens.length,
    };

    if (this.config.debug) {
      result.debug = {
        tokens,
        candidates: mergedCandidates,
      };
    }

    return result;
  }

  /**
   * パフォーマンスベンチマーク
   *
   * @param text - テストテキスト
   * @param iterations - 反復回数
   * @returns 統計情報
   */
  benchmark(text: string, iterations = 100): {
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } {
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      this.segment(text);
      const elapsed = performance.now() - startTime;
      times.push(elapsed);
    }

    times.sort((a, b) => a - b);

    return {
      avg: times.reduce((sum, t) => sum + t, 0) / times.length,
      min: times[0],
      max: times[times.length - 1],
      p50: times[Math.floor(times.length * 0.5)],
      p95: times[Math.floor(times.length * 0.95)],
      p99: times[Math.floor(times.length * 0.99)],
    };
  }
}
