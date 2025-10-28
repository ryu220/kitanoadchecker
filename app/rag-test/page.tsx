'use client';

import { useState, useEffect } from 'react';
import { ApiKeyModal } from '@/components/ApiKeyModal';
import { ProductSelectorV2 } from '@/components/ProductSelectorV2';

const API_KEY_STORAGE_KEY = 'gemini_api_key';

interface Violation {
  type: string;
  severity: string;
  description: string;
  referenceKnowledge: {
    file: string;
    excerpt: string;
  };
  correctionSuggestion: string;
}

interface SegmentEvaluation {
  segmentId: string;
  compliance: boolean;
  violations: Violation[];
  evaluatedAt: string;
}

interface EvaluationResponse {
  success: boolean;
  data?: {
    evaluations: SegmentEvaluation[];
    summary: {
      totalSegments: number;
      evaluatedSegments: number;
      compliantSegments: number;
      violationCount: number;
    };
    processingTimeMs: number;
  };
  error?: string;
}

const SAMPLE_TEXTS = [
  { text: 'シワを解消する美容液', label: '禁止表現（シワ解消）' },
  { text: 'まるで針が刺さるような感覚で、肌の奥深くまで届きます', label: '婉曲表現（注入）' },
  { text: '肌に浸透して潤いを与えます', label: '注釈必須（浸透）' },
  { text: '肌に浸透※角質層まで して潤いを与えます', label: '注釈あり（OK）' },
  { text: 'クマを改善する', label: '禁止表現（クマ改善）' },
  { text: '最高のききめを保証します', label: '最上級表現+保証' },
  { text: 'うるおいを与えて、肌をなめらかにします', label: '問題なし' },
];

export default function RAGTestPage() {
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [productId, setProductId] = useState<string>('HA');
  const [segmentText, setSegmentText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EvaluationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedKey = sessionStorage.getItem(API_KEY_STORAGE_KEY);
      if (storedKey) {
        setApiKey(storedKey);
      } else {
        setShowApiKeyModal(true);
      }
    }
  }, []);

  const handleApiKeySubmit = (key: string) => {
    setApiKey(key);
    sessionStorage.setItem(API_KEY_STORAGE_KEY, key);
    setShowApiKeyModal(false);
  };

  const handleApiKeyChange = () => {
    setShowApiKeyModal(true);
  };

  const maskApiKey = (key: string) => {
    if (!key) return '';
    if (key.length <= 8) return '****';
    return `${key.substring(0, 4)}...****`;
  };

  const handleSampleClick = (text: string) => {
    setSegmentText(text);
  };

  const handleEvaluate = async () => {
    if (!segmentText.trim()) {
      setError('テキストを入力してください');
      return;
    }

    if (!apiKey) {
      setShowApiKeyModal(true);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/v2/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          segments: [
            {
              id: 'test-segment-1',
              text: segmentText,
              type: 'claim',
              position: { start: 0, end: segmentText.length },
            },
          ],
          productId,
          apiKey,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Evaluation failed');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'high':
        return 'text-red-600 bg-red-50';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50';
      case 'low':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <header className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
            RAGシステム品質チェック
          </h1>
          <p className="text-gray-600 mb-2">
            Vector DB検索 + Gemini API評価 | セマンティック分析
          </p>

          {apiKey && (
            <div className="inline-flex items-center gap-2 text-sm text-gray-600 bg-white px-4 py-2 rounded-lg shadow-sm">
              <span>APIキー: {maskApiKey(apiKey)}</span>
              <button
                onClick={handleApiKeyChange}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                [変更]
              </button>
            </div>
          )}
        </header>

        <ApiKeyModal
          isOpen={showApiKeyModal}
          onSubmit={handleApiKeySubmit}
          initialApiKey={apiKey}
        />

        <div className="space-y-6 bg-white p-6 rounded-lg shadow-md">
          <ProductSelectorV2
            selectedProductId={productId}
            onSelect={setProductId}
            disabled={loading}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              サンプルテキスト:
            </label>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_TEXTS.map((sample, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSampleClick(sample.text)}
                  disabled={loading}
                  className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="segmentText" className="block text-sm font-medium text-gray-700 mb-2">
              広告文セグメント <span className="text-red-500">*</span>
            </label>
            <textarea
              id="segmentText"
              value={segmentText}
              onChange={(e) => setSegmentText(e.target.value)}
              className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
              placeholder="チェックしたい広告文セグメントを入力してください"
              disabled={loading}
            />
            <div className="flex justify-between mt-1">
              <span className="text-sm text-gray-500">
                {segmentText.length} 文字
              </span>
            </div>
          </div>

          <button
            onClick={handleEvaluate}
            disabled={loading || !apiKey}
            className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-colors ${
              loading || !apiKey
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                RAG評価中...
              </span>
            ) : (
              'RAG評価実行'
            )}
          </button>
        </div>

        {error && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-red-600 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="font-semibold text-red-800">エラーが発生しました</h3>
                <p className="mt-1 text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {result?.success && result.data && (
          <div className="mt-6 space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">評価結果サマリー</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-md">
                  <div className="text-2xl font-bold mb-1">
                    {result.data.summary.compliantSegments > 0 ? '✅' : '❌'}
                  </div>
                  <div className="text-sm text-gray-600">
                    {result.data.summary.compliantSegments > 0 ? '準拠' : '違反あり'}
                  </div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-md">
                  <div className="text-2xl font-bold mb-1">{result.data.summary.violationCount}</div>
                  <div className="text-sm text-gray-600">違反件数</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-md">
                  <div className="text-2xl font-bold mb-1">{result.data.summary.evaluatedSegments}</div>
                  <div className="text-sm text-gray-600">評価セグメント数</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-md">
                  <div className="text-2xl font-bold mb-1">{result.data.processingTimeMs}ms</div>
                  <div className="text-sm text-gray-600">処理時間</div>
                </div>
              </div>
            </div>

            {result.data.evaluations.map((evaluation) => (
              <div key={evaluation.segmentId} className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">
                    {evaluation.compliance ? '✅ 準拠' : '❌ 違反検出'}
                  </h3>
                  <span className="text-sm text-gray-500">
                    {new Date(evaluation.evaluatedAt).toLocaleString('ja-JP')}
                  </span>
                </div>

                {evaluation.violations.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="font-semibold text-red-600">
                      違反 ({evaluation.violations.length}件)
                    </h4>
                    {evaluation.violations.map((violation, idx) => (
                      <div key={idx} className="border-l-4 border-red-500 pl-4 py-2 bg-red-50">
                        <div className="flex items-start justify-between mb-2">
                          <div className="font-semibold text-gray-900">
                            {violation.type}
                          </div>
                          <span className={`px-2 py-1 text-xs font-semibold rounded ${getSeverityColor(violation.severity)}`}>
                            {violation.severity}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 mb-2">{violation.description}</p>
                        {violation.correctionSuggestion && (
                          <div className="text-sm text-blue-600 bg-blue-50 p-2 rounded mb-2">
                            💡 修正案: {violation.correctionSuggestion}
                          </div>
                        )}
                        {violation.referenceKnowledge && (
                          <div className="text-xs text-gray-500 mt-2 bg-gray-100 p-2 rounded">
                            <div className="font-semibold mb-1">📚 参照ナレッジ</div>
                            <div>ファイル: {violation.referenceKnowledge.file}</div>
                            <div className="mt-1 italic">&quot;{violation.referenceKnowledge.excerpt.substring(0, 200)}...&quot;</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {evaluation.compliance && (
                  <div className="text-green-600 bg-green-50 p-4 rounded-md">
                    ✅ このセグメントは法令基準に準拠しています
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
