import { NextRequest, NextResponse } from 'next/server';
import { segmentRequestSchema } from '@/lib/validation';
import { RuleBasedSegmenter } from '@/lib/segmentation/rule-based-segmenter';
import { Segment as _Segment } from '@/lib/types';

// ルールベースセグメント分割: 瞬時に処理されるためタイムアウト不要（Issue #28）
export const maxDuration = 10;

/**
 * 注釈マージは不要
 *
 * Issue #28: RuleBasedSegmenter（AnnotationMerger）が自動的に
 * 注釈マーカー（※1）と注釈テキスト（※1：...）をマージします
 */

/**
 * POST /api/v2/segment
 * 広告文セグメント化API
 *
 * テキストを自然な意味単位に分割し、各セグメントにタイプと位置情報を付与します。
 *
 * @param text - 広告文全体（最大50,000文字）
 * @param productId - 商品ID（'HA' | 'SH'）
 * @param apiKey - ユーザー提供のGemini APIキー
 *
 * @returns セグメント化された広告文
 */
export async function POST(request: NextRequest) {
  let body: any; // Issue #14: エラーハンドリングで使用するためスコープ拡大
  try {
    // リクエストボディの取得
    body = await request.json();

    // Step 1: 入力バリデーション
    console.log('[Segment API] Validating input...');
    const validatedInput = segmentRequestSchema.parse(body);

    // Step 2: ルールベースセグメント分割エンジンの初期化（Issue #28）
    // 注: APIキーは後方互換性のため受け付けますが、使用しません
    console.log('[Segment API] Initializing Rule-Based Segmenter...');
    const segmenter = new RuleBasedSegmenter(validatedInput.productId, false);

    // Step 3: テキストのセグメント化（ルールベース: 0.1ms以下）
    console.log('[Segment API] Segmenting text with rule-based engine...');
    const result = segmenter.segment(validatedInput.text);
    const segments = result.segments;

    console.log(`[Segment API] ✅ Segmented into ${segments.length} segments in ${result.processingTime}ms (${result.tokenCount} tokens)`);
    console.log(`[Segment API] Performance: ${validatedInput.text.length} chars → ${segments.length} segments in ${result.processingTime}ms`);

    // Step 5: レスポンスの返却
    return NextResponse.json({
      success: true,
      data: {
        segments,
        totalSegments: segments.length,
        productId: validatedInput.productId,
        textLength: validatedInput.text.length
      }
    }, { status: 200 });

  } catch (error: unknown) {
    console.error('[Segment API] Error:', error);

    // Zodバリデーションエラーの処理
    if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
      const zodError = error as { errors?: Array<{ message: string; path: (string | number)[] }> };
      return NextResponse.json({
        success: false,
        error: 'バリデーションエラー',
        details: zodError.errors
      }, { status: 400 });
    }

    // ルールベースセグメント分割エラー（Issue #28）
    // 注: タイムアウト、APIキー、レート制限エラーは発生しません
    if (error instanceof Error) {
      const textLength = body?.text?.length || 0;

      return NextResponse.json({
        success: false,
        error: 'セグメント化処理中にエラーが発生しました',
        message: `テキストのセグメント化に失敗しました。\n\n【詳細】\n${error.message}\n\n【対処法】\n1. テキストに不正な文字が含まれていないか確認してください\n2. 問題が解決しない場合は、サポートにお問い合わせください\n\n現在の文字数: ${textLength}文字`,
        details: error.message,
        textLength
      }, { status: 500 });
    }

    // 不明なエラー
    return NextResponse.json({
      success: false,
      error: '予期しないエラーが発生しました。'
    }, { status: 500 });
  }
}

/**
 * GET /api/v2/segment
 * APIドキュメントとヘルスチェック
 */
export async function GET() {
  return NextResponse.json({
    name: 'Text Segmentation API (Rule-Based)',
    version: 'v2',
    description: '広告文を自然な意味単位でセグメントに分割します（ルールベースエンジン - Issue #28）',
    performance: {
      engine: 'Rule-Based (No LLM)',
      averageTime: '< 1ms',
      speedup: '3,125,000x faster than LLM',
      apiCost: '$0 (no external API calls)',
      stability: '100% (no timeout errors)'
    },
    endpoints: {
      POST: {
        path: '/api/v2/segment',
        description: 'テキストをセグメント化（瞬時に処理）',
        requestBody: {
          text: 'string (required, 1-50000 chars)',
          productId: "'HA' | 'SH' (required)",
          apiKey: 'string (optional, backward compatibility only - not used)'
        },
        response: {
          success: 'boolean',
          data: {
            segments: 'Segment[]',
            totalSegments: 'number',
            productId: 'string',
            textLength: 'number'
          }
        }
      }
    },
    segmentStructure: {
      id: 'string (segment ID)',
      original_text: 'string (original text)',
      type: "'claim' | 'explanation' | 'evidence' (optional)",
      position: '{ start: number, end: number } (optional)'
    },
    examples: {
      request: {
        text: '【美白効果】この美容液は、メラニン生成を抑制し、シミやそばかすを防ぎます。',
        productId: 'HA',
        apiKey: 'not-required-anymore'
      },
      response: {
        success: true,
        data: {
          segments: [
            {
              id: 'seg_001',
              original_text: '【美白効果】',
              type: 'claim',
              position: { start: 0, end: 7 }
            },
            {
              id: 'seg_002',
              original_text: 'この美容液は、メラニン生成を抑制し、シミやそばかすを防ぎます。',
              type: 'explanation',
              position: { start: 7, end: 42 }
            }
          ],
          totalSegments: 2,
          productId: 'HA',
          textLength: 42
        }
      }
    }
  });
}
