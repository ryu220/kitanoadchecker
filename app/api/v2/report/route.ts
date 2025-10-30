import { NextRequest, NextResponse } from 'next/server';
import { reportRequestSchema } from '@/lib/validation';
import {
  TextStructure,
  Segment,
  SegmentEvaluation,
  ViolationType,
  ViolationSeverity,
  AnalysisReport,
} from '@/lib/types-v2';
import { UserInput } from '@/lib/types';

/**
 * POST /api/v2/report
 * 包括的なレポート生成API
 *
 * 全てのセグメント評価結果を集約し、統計情報とMarkdownレポートを生成します。
 *
 * @param input - ユーザー入力データ
 * @param structure - テキスト構造分析結果
 * @param segments - セグメント配列
 * @param evaluations - セグメント評価結果配列
 * @param apiKey - Gemini APIキー
 *
 * @returns 包括的な分析レポート
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // リクエストボディの取得
    const body = await request.json();

    // Step 1: 入力バリデーション
    console.log('[Report API] Validating input...');
    const validatedInput = reportRequestSchema.parse(body);

    // Step 2: データ整合性チェック
    console.log('[Report API] Checking data consistency...');
    const evaluationIds = new Set(validatedInput.evaluations.map(e => e.segmentId));

    // 全てのセグメントに対応する評価があるかチェック
    const missingEvaluations = validatedInput.segments
      .filter(s => !evaluationIds.has(s.id))
      .map(s => s.id);

    if (missingEvaluations.length > 0) {
      return NextResponse.json({
        success: false,
        error: '一部のセグメントに評価が欠けています',
        details: `Missing evaluations for: ${missingEvaluations.join(', ')}`
      }, { status: 400 });
    }

    // Step 4: 統計情報の集約
    console.log('[Report API] Aggregating statistics...');
    const statistics = aggregateStatistics(
      validatedInput.segments,
      validatedInput.evaluations
    );

    // Step 5: 総合評価ステータスの決定
    const overallStatus = determineOverallStatus(statistics);

    // Step 6: Markdownレポートの生成
    console.log('[Report API] Generating markdown report...');
    const markdown = generateMarkdownReport(
      validatedInput.input,
      validatedInput.structure,
      validatedInput.segments,
      validatedInput.evaluations,
      statistics,
      overallStatus
    );

    // Step 7: 最終レポートの構築
    const report: AnalysisReport = {
      id: generateReportId(),
      input: validatedInput.input,
      structure: validatedInput.structure,
      segments: validatedInput.segments as Segment[],
      evaluations: validatedInput.evaluations,
      summary: {
        totalSegments: statistics.totalSegments,
        compliantSegments: statistics.compliantSegments,
        totalViolations: statistics.totalViolations,
        violationsByType: statistics.violationsByType,
        violationsBySeverity: statistics.violationsBySeverity,
      },
      markdown,
      generatedAt: new Date().toISOString(),
      totalProcessingTimeMs: Date.now() - startTime,
    };

    console.log('[Report API] Report generated successfully');

    // Step 8: レスポンスの返却
    return NextResponse.json({
      success: true,
      data: report
    }, { status: 200 });

  } catch (error: unknown) {
    console.error('[Report API] Error:', error);

    // Zodバリデーションエラーの処理
    if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
      const zodError = error as { errors?: Array<{ message: string; path: (string | number)[] }> };
      return NextResponse.json({
        success: false,
        error: 'バリデーションエラー',
        details: zodError.errors
      }, { status: 400 });
    }

    // その他のエラー
    if (error instanceof Error) {
      return NextResponse.json({
        success: false,
        error: 'レポート生成中にエラーが発生しました',
        details: error.message
      }, { status: 500 });
    }

    // 不明なエラー
    return NextResponse.json({
      success: false,
      error: '予期しないエラーが発生しました'
    }, { status: 500 });
  }
}

/**
 * GET /api/v2/report
 * APIドキュメントとヘルスチェック
 */
export async function GET() {
  return NextResponse.json({
    name: 'Report Generation API',
    version: 'v2',
    description: '広告文の包括的なレポートを生成します',
    endpoints: {
      POST: {
        path: '/api/v2/report',
        description: '評価結果から包括的なレポートを生成',
        requestBody: {
          input: 'UserInput (required)',
          structure: 'TextStructure (required)',
          segments: 'Segment[] (required, min 1)',
          evaluations: 'SegmentEvaluation[] (required, min 1)',
          apiKey: 'string (required, Gemini API key)'
        },
        response: {
          success: 'boolean',
          data: {
            id: 'string (report ID)',
            input: 'UserInput',
            structure: 'TextStructure',
            segments: 'Segment[]',
            evaluations: 'SegmentEvaluation[]',
            summary: {
              totalSegments: 'number',
              compliantSegments: 'number',
              totalViolations: 'number',
              violationsByType: 'Record<ViolationType, number>',
              violationsBySeverity: 'Record<ViolationSeverity, number>'
            },
            markdown: 'string (full report)',
            generatedAt: 'string (ISO timestamp)',
            totalProcessingTimeMs: 'number'
          }
        }
      }
    },
    reportStructure: {
      sections: [
        '総合評価 (Overall status)',
        '統計情報 (Statistics)',
        'セグメント別評価 (Segment evaluations)',
        '推奨アクション (Recommended actions)'
      ],
      format: 'Markdown with Japanese content'
    },
    examples: {
      request: {
        input: {
          full_text: '【美白効果】この美容液は、メラニン生成を抑制します。',
          product_id: 'HA'
        },
        structure: {
          overview: '美白効果を訴求する美容液の広告',
          mainClaims: ['美白効果'],
          supportingStatements: ['メラニン生成抑制'],
          tone: 'promotional'
        },
        segments: [
          {
            id: 'seg_1',
            text: '【美白効果】',
            type: 'claim',
            position: { start: 0, end: 7 }
          }
        ],
        evaluations: [
          {
            segmentId: 'seg_1',
            compliance: false,
            violations: [
              {
                type: '薬機法違反',
                severity: 'high',
                description: '医薬品的効能効果の標榜',
                referenceKnowledge: {
                  file: '薬機法ガイドライン.pdf',
                  excerpt: '化粧品は医薬品的効能効果を標榜できない'
                },
                correctionSuggestion: '【うるおい美容液】'
              }
            ],
            evaluatedAt: '2025-10-15T12:00:00Z'
          }
        ],
        apiKey: 'your-gemini-api-key'
      }
    }
  });
}

/**
 * Helper: 統計情報を集約
 */
function aggregateStatistics(
  segments: Segment[],
  evaluations: SegmentEvaluation[]
): {
  totalSegments: number;
  compliantSegments: number;
  nonCompliantSegments: number;
  totalViolations: number;
  violationsByType: Record<ViolationType, number>;
  violationsBySeverity: Record<ViolationSeverity, number>;
} {
  const compliantSegments = evaluations.filter(e => e.compliance).length;
  const allViolations = evaluations.flatMap(e => e.violations);

  const violationsByType: Record<ViolationType, number> = {
    '社内基準違反': 0,
    '薬機法違反': 0,
    '景表法違反': 0,
    '特商法違反': 0,
    'その他': 0,
  };

  const violationsBySeverity: Record<ViolationSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  allViolations.forEach(violation => {
    violationsByType[violation.type]++;
    violationsBySeverity[violation.severity]++;
  });

  return {
    totalSegments: segments.length,
    compliantSegments,
    nonCompliantSegments: segments.length - compliantSegments,
    totalViolations: allViolations.length,
    violationsByType,
    violationsBySeverity,
  };
}

/**
 * Helper: 総合評価ステータスを決定（OK/要修正の2段階）
 */
function determineOverallStatus(statistics: ReturnType<typeof aggregateStatistics>): string {
  if (statistics.totalViolations === 0) {
    return 'OK';
  } else {
    return '要修正';
  }
}

/**
 * Helper: Markdownレポートを生成
 */
function generateMarkdownReport(
  input: UserInput,
  structure: TextStructure,
  segments: Segment[],
  evaluations: SegmentEvaluation[],
  statistics: ReturnType<typeof aggregateStatistics>,
  overallStatus: string
): string {
  const statusEmoji = overallStatus === 'OK' ? '✅' : '❌';
  const timestamp = new Date().toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  let markdown = `# 広告文リーガルチェック結果

## 📊 総合評価

- **判定**: ${statusEmoji} **${overallStatus}**
- **商品ID**: ${input.product_id}
- **検査日時**: ${timestamp}
- **広告文長**: ${input.full_text.length}文字

---

## 📈 統計情報

### セグメント分析
- **総セグメント数**: ${statistics.totalSegments}件
- **適合セグメント数**: ${statistics.compliantSegments}件
- **違反セグメント数**: ${statistics.nonCompliantSegments}件

### 違反タイプ別
- **社内基準違反**: ${statistics.violationsByType['社内基準違反']}件
- **薬機法違反**: ${statistics.violationsByType['薬機法違反']}件
- **景表法違反**: ${statistics.violationsByType['景表法違反']}件
- **特商法違反**: ${statistics.violationsByType['特商法違反']}件
- **その他**: ${statistics.violationsByType['その他']}件

---

## 📝 要修正セグメント

`;

  // 要修正セグメントのみを表示
  let violationCount = 0;
  evaluations.forEach((evaluation, index) => {
    const segment = segments.find(s => s.id === evaluation.segmentId);
    if (!segment) return;

    // 違反がないセグメントはスキップ
    if (evaluation.violations.length === 0) return;

    violationCount++;
    const segmentNumber = index + 1;

    markdown += `### セグメント ${segmentNumber}: "${segment.text}"

**判定**: ❌ 要修正

#### 違反内容

`;

    evaluation.violations.forEach((violation, vIndex) => {
      markdown += `##### ${vIndex + 1}. ${violation.type}

**説明**:
${violation.description}

📖 **参考ナレッジ**: ${violation.referenceKnowledge.file}
${violation.referenceKnowledge.section ? `- **条項**: ${violation.referenceKnowledge.section}` : ''}
> ${violation.referenceKnowledge.excerpt || '引用元が見つかりませんでした'}

✏️ **修正案**:
\`\`\`
${violation.correctionSuggestion}
\`\`\`

${violation.notes ? `**備考**: ${violation.notes}` : ''}

`;
    });

    // エビデンス情報
    if (evaluation.supportingEvidence && evaluation.supportingEvidence.length > 0) {
      markdown += `#### サポートエビデンス\n\n`;
      evaluation.supportingEvidence.forEach((evidence, eIndex) => {
        markdown += `${eIndex + 1}. ${evidence}\n`;
      });
      markdown += `\n`;
    }

    markdown += `---\n\n`;
  });

  // 違反がない場合のメッセージ
  if (violationCount === 0) {
    markdown += `✅ 全てのセグメントが基準を満たしています。\n\n---\n\n`;
  }

  markdown += `---

**レポート生成日時**: ${timestamp}
**分析システム**: Ad Legal Checker V2
`;

  return markdown;
}

/**
 * Helper: セグメントタイプを日本語に翻訳
 * (現在は未使用だが、将来の拡張用に保持)
 */
function _translateSegmentType(type: string): string {
  const typeMap: Record<string, string> = {
    claim: '主張・訴求',
    explanation: '説明・詳細',
    evidence: '根拠・エビデンス',
    cta: 'アクションフレーズ',
    disclaimer: '免責事項',
  };
  return typeMap[type] || type;
}

/**
 * Helper: 重要度を日本語に翻訳
 * (現在は未使用だが、将来の拡張用に保持)
 */
function _translateSeverity(severity: ViolationSeverity): string {
  const severityMap: Record<ViolationSeverity, string> = {
    critical: '最高',
    high: '高',
    medium: '中',
    low: '低',
  };
  return severityMap[severity];
}

/**
 * Helper: レポートIDを生成
 */
function generateReportId(): string {
  return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
