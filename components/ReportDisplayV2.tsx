'use client';

import ReactMarkdown from 'react-markdown';
import { useState } from 'react';
import { AnalysisReport } from '@/lib/types-v2';

interface Props {
  report: AnalysisReport;
}

export function ReportDisplayV2({ report }: Props) {
  const [copied, setCopied] = useState(false);
  const [showFullReport, setShowFullReport] = useState(false); // 完全レポートは折りたたみ

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([report.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().split('T')[0];
    a.download = `ad-check-report-${report.input.product_id}-${date}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'medium':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'low':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case 'high':
        return '重大';
      case 'medium':
        return '中程度';
      case 'low':
        return '軽微';
      default:
        return severity;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
      {/* Header Section */}
      <div className="border-b border-gray-200 pb-4 mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">チェック結果</h2>
            <p className="text-sm text-gray-600 mt-1">
              商品: {report.input.product_id} |
              日時: {new Date(report.generatedAt).toLocaleString('ja-JP')}
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={handleCopy}
              className="flex-1 sm:flex-none px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
              aria-label={copied ? 'コピー完了' : 'レポートをコピー'}
            >
              {copied ? (
                <>
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm">コピー完了</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm">コピー</span>
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              aria-label="レポートをダウンロード"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span className="text-sm">ダウンロード</span>
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-blue-50 p-3 rounded-lg">
            <p className="text-xs text-blue-600 font-medium">総セグメント</p>
            <p className="text-2xl font-bold text-blue-900">{report.summary.totalSegments}</p>
          </div>
          <div className="bg-green-50 p-3 rounded-lg">
            <p className="text-xs text-green-600 font-medium">適合</p>
            <p className="text-2xl font-bold text-green-900">{report.summary.compliantSegments}</p>
          </div>
          <div className="bg-red-50 p-3 rounded-lg">
            <p className="text-xs text-red-600 font-medium">違反</p>
            <p className="text-2xl font-bold text-red-900">{report.summary.totalViolations}</p>
          </div>
          <div className="bg-purple-50 p-3 rounded-lg">
            <p className="text-xs text-purple-600 font-medium">処理時間</p>
            <p className="text-2xl font-bold text-purple-900">
              {(report.totalProcessingTimeMs / 1000).toFixed(1)}s
            </p>
          </div>
        </div>

        {/* Violation Breakdown */}
        {report.summary.totalViolations > 0 && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">違反内訳</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-600 font-medium mb-1">重要度別:</p>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-red-600">重大:</span>
                    <span className="font-semibold">{report.summary.violationsBySeverity.high || 0}件</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-orange-600">中程度:</span>
                    <span className="font-semibold">{report.summary.violationsBySeverity.medium || 0}件</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-yellow-600">軽微:</span>
                    <span className="font-semibold">{report.summary.violationsBySeverity.low || 0}件</span>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-gray-600 font-medium mb-1">種別:</p>
                <div className="space-y-1">
                  {Object.entries(report.summary.violationsByType).map(([type, count]) => (
                    <div key={type} className="flex justify-between">
                      <span className="text-gray-700">{type}:</span>
                      <span className="font-semibold">{count}件</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Segment Details - Primary Display (Always Open) */}
      {report.segments.length > 0 && (
        <div className="border-t border-gray-200 pt-6 mb-6">
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg border-2 border-green-200 mb-4">
            <h3 className="text-2xl font-bold text-gray-900 mb-2 flex items-center">
              <svg className="w-7 h-7 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              セグメント別詳細分析
            </h3>
            <p className="text-sm text-gray-600">各セグメントの個別評価結果（{report.segments.length}件）</p>
          </div>

          <div id="segment-details" className="space-y-4">
              {report.segments.map((segment, index) => {
                const evaluation = report.evaluations.find(e => e.segmentId === segment.id);
                const hasViolations = evaluation && evaluation.violations.length > 0;

                return (
                  <div
                    key={segment.id}
                    className={`p-4 rounded-lg border-2 ${
                      hasViolations
                        ? 'border-red-200 bg-red-50'
                        : 'border-green-200 bg-green-50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold text-gray-900">
                        セグメント {index + 1}
                        <span className="ml-2 text-xs font-normal text-gray-500">
                          ({segment.type})
                        </span>
                      </h4>
                      {evaluation && (
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            evaluation.compliance
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {evaluation.compliance ? '適合' : '不適合'}
                        </span>
                      )}
                    </div>

                    <div className="mb-3 p-3 bg-white rounded border border-gray-200">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{segment.text}</p>
                    </div>

                    {evaluation && evaluation.violations.length > 0 && (
                      <div className="space-y-3">
                        {evaluation.violations.map((violation, vIndex) => (
                          <div
                            key={vIndex}
                            className={`p-3 rounded-lg border ${getSeverityColor(violation.severity)}`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <span className="font-semibold text-sm">{violation.type}</span>
                              <span className="text-xs px-2 py-1 rounded bg-white border border-current">
                                {getSeverityLabel(violation.severity)}
                              </span>
                            </div>

                            <p className="text-sm mb-2">{violation.description}</p>

                            {violation.referenceKnowledge && (
                              <div className="mb-2 p-2 bg-white rounded text-xs">
                                <p className="font-medium text-gray-700 mb-1">
                                  根拠: {violation.referenceKnowledge.file}
                                </p>
                                <p className="text-gray-600">{violation.referenceKnowledge.excerpt}</p>
                              </div>
                            )}

                            {violation.correctionSuggestion && (
                              <div className="p-2 bg-white rounded">
                                <p className="text-xs font-medium text-gray-700 mb-1">修正案:</p>
                                <p className="text-sm text-gray-900">{violation.correctionSuggestion}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {evaluation && evaluation.compliance && (
                      <div className="text-sm text-green-700">
                        このセグメントに問題は見つかりませんでした。
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
        </div>
      )}

      {/* Full Markdown Report - Collapsible Secondary Display */}
      <div className="border-t border-gray-200 pt-6">
        <button
          type="button"
          onClick={() => setShowFullReport(!showFullReport)}
          className="flex items-center justify-between w-full text-left font-semibold text-gray-900 mb-4 hover:text-blue-600 transition-colors p-3 bg-gray-50 rounded-lg"
          aria-expanded={showFullReport}
          aria-controls="full-report"
        >
          <span className="flex items-center">
            <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            完全レポート（Markdown形式）
            <span className="ml-2 text-xs font-normal text-gray-500">
              {showFullReport ? '- 非表示' : '- 表示'}
            </span>
          </span>
          <svg
            className={`w-5 h-5 transition-transform ${showFullReport ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showFullReport && (
          <div id="full-report" className="mt-4">
            <div className="prose max-w-none bg-white p-6 rounded-lg border border-gray-200 shadow-sm" role="article" aria-label="完全レポート">
              <ReactMarkdown
                components={{
                  table: ({ node: _node, ...props }) => (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200" {...props} />
                    </div>
                  ),
                  th: ({ node: _node, ...props }) => (
                    <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" {...props} />
                  ),
                  td: ({ node: _node, ...props }) => (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900" {...props} />
                  ),
                  h1: ({ node: _node, ...props }) => (
                    <h1 className="text-3xl font-bold mb-4 text-gray-900" {...props} />
                  ),
                  h2: ({ node: _node, ...props }) => (
                    <h2 className="text-2xl font-bold mb-3 mt-6 text-gray-800" {...props} />
                  ),
                  h3: ({ node: _node, ...props }) => (
                    <h3 className="text-xl font-semibold mb-2 mt-4 text-gray-800" {...props} />
                  ),
                }}
              >
                {report.markdown}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
