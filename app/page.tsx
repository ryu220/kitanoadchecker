'use client';

import { useState } from 'react';
import { ProductSelectorV2 } from '@/components/ProductSelectorV2';
import { ProgressTrackerV2, ProcessingStep } from '@/components/ProgressTrackerV2';
import { ReportDisplayV2 } from '@/components/ReportDisplayV2';
import { AppSpecifications } from '@/components/AppSpecifications';
import { AnalysisReport, Segment, SegmentEvaluation } from '@/lib/types-v2';

export default function Home() {

  // Form state
  const [productId, setProductId] = useState<string>('HA');
  const [adText, setAdText] = useState('');
  const [evidence, setEvidence] = useState('');
  const [showEvidence, setShowEvidence] = useState(false);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<ProcessingStep>('idle');
  const [segments, setSegments] = useState<Segment[]>([]);
  const [currentSegment] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(0);

  // Results
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!adText.trim()) {
      setError('広告文を入力してください');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setReport(null);
    setCurrentStep('segmenting');
    setEstimatedTime(30);

    try {
      // Combine ad text with evidence (if provided)
      const fullTextWithEvidence = evidence.trim()
        ? `${adText}\n${evidence}`
        : adText;

      // Step 1: Segment the ad text
      const segmentResponse = await fetch('/api/v2/segment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: fullTextWithEvidence,
          productId: productId,
        }),
      });

      if (!segmentResponse.ok) {
        const errorData = await segmentResponse.json();
        throw new Error(errorData.error || 'セグメント分割に失敗しました');
      }

      const segmentData = await segmentResponse.json();
      const detectedSegments: Segment[] = segmentData.data.segments;
      setSegments(detectedSegments);
      setCurrentStep('evaluating');

      // Issue #15: Calculate estimated time based on batch processing
      // Batch size: 20 segments per batch
      // Estimated time per batch: 10-15 seconds
      const BATCH_SIZE = 20;
      const numberOfBatches = Math.ceil(detectedSegments.length / BATCH_SIZE);
      const estimatedTimePerBatch = 12; // seconds
      setEstimatedTime(numberOfBatches * estimatedTimePerBatch);

      console.log(`[Frontend] Processing ${detectedSegments.length} segments in ${numberOfBatches} batches...`);

      // Step 2: Evaluate segments in batches
      // Issue #15: Use batch evaluation API to avoid rate limits
      const allEvaluations: SegmentEvaluation[] = [];

      for (let i = 0; i < detectedSegments.length; i += BATCH_SIZE) {
        const batch = detectedSegments.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

        console.log(`[Frontend] Evaluating batch ${batchNumber}/${numberOfBatches} (${batch.length} segments)...`);

        const evaluateResponse = await fetch('/api/v2/evaluate-batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            segments: batch,
            productId: productId,
            fullText: fullTextWithEvidence, // Add full text with evidence for context
          }),
        });

        if (!evaluateResponse.ok) {
          let errorMessage = `バッチ ${batchNumber} の評価に失敗しました`;

          try {
            const errorData = await evaluateResponse.json();
            errorMessage = errorData.error || errorMessage;

            // Add more context for server errors (500)
            if (evaluateResponse.status === 500) {
              errorMessage += '\n\n💡 サーバーエラーが発生しました。以下を確認してください：\n';
              errorMessage += '1. ChromaDBが起動しているか: docker ps | grep chroma\n';
              errorMessage += '2. 環境が正しくセットアップされているか: npm run check-env\n';
              errorMessage += '3. APIキーが有効か確認してください\n\n';
              errorMessage += `詳細: ${errorData.message || '不明なエラー'}`;
            }
          } catch {
            // If error parsing fails, use default message
          }

          throw new Error(errorMessage);
        }

        const evaluationData = await evaluateResponse.json();
        allEvaluations.push(...evaluationData.data.evaluations);

        console.log(`[Frontend] ✅ Batch ${batchNumber}/${numberOfBatches} completed (${evaluationData.data.evaluations.length} evaluations)`);
      }

      console.log(`[Frontend] ✅ All batches completed. Total evaluations: ${allEvaluations.length}`);

      const evaluations: SegmentEvaluation[] = allEvaluations;

      setCurrentStep('reporting');
      setEstimatedTime(5);

      // Step 3: Generate final report
      const reportResponse = await fetch('/api/v2/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: {
            full_text: fullTextWithEvidence,
            product_id: productId,
            provided_evidence: evidence || undefined,
          },
          structure: {
            overview: `${productId}商品の広告文チェック`,
            mainClaims: [],
            supportingStatements: [],
            tone: 'promotional' as const,
          },
          segments: detectedSegments,
          evaluations: evaluations,
        }),
      });

      if (!reportResponse.ok) {
        const errorData = await reportResponse.json();
        throw new Error(errorData.error || 'レポート生成に失敗しました');
      }

      const reportData = await reportResponse.json();
      setReport(reportData.data);
      setCurrentStep('complete');
      setEstimatedTime(0);

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'エラーが発生しました';
      setError(errorMessage);
      setCurrentStep('error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <header className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
            広告文リーガルチェックツール
          </h1>
          <p className="text-gray-600 mb-2">
            HA・SH専用版 | Powered by Gemini API
          </p>
        </header>

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow-md">
          {/* Product Selection */}
          <ProductSelectorV2
            selectedProductId={productId}
            onSelect={setProductId}
            disabled={isProcessing}
          />

          {/* Ad Text Input */}
          <div>
            <label htmlFor="adText" className="block text-sm font-medium text-gray-700 mb-2">
              広告文 <span className="text-red-500">*</span>
            </label>
            <textarea
              id="adText"
              value={adText}
              onChange={(e) => setAdText(e.target.value)}
              className="w-full h-48 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
              placeholder="チェックしたい広告文を入力してください"
              disabled={isProcessing}
              aria-label="広告文入力"
              aria-required="true"
            />
            <div className="flex justify-between mt-1">
              <span className="text-sm text-gray-500">
                {adText.length} 文字
              </span>
            </div>
          </div>

          {/* Evidence Input (Collapsible) */}
          <div>
            <button
              type="button"
              onClick={() => setShowEvidence(!showEvidence)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
              aria-expanded={showEvidence}
              aria-controls="evidence-section"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showEvidence ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              根拠資料（任意）
            </button>

            {showEvidence && (
              <div id="evidence-section" className="mt-2">
                <textarea
                  id="evidence"
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  className="w-full h-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="根拠資料や補足情報があれば入力してください"
                  disabled={isProcessing}
                  aria-label="根拠資料入力"
                />
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isProcessing}
            className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-colors ${
              isProcessing
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
            aria-label={isProcessing ? 'チェック実行中' : 'チェック開始'}
          >
            {isProcessing ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                チェック中...
              </span>
            ) : (
              'チェック開始'
            )}
          </button>
        </form>

        {/* Progress Tracker */}
        {isProcessing && (
          <div className="mt-6">
            <ProgressTrackerV2
              currentStep={currentStep}
              segmentCount={segments.length}
              currentSegment={currentSegment}
              estimatedTimeSeconds={estimatedTime}
              error={error || undefined}
            />
          </div>
        )}

        {/* Error Display */}
        {error && !isProcessing && (
          <div
            className={`mt-6 p-4 rounded-lg ${
              error.includes('レート制限')
                ? 'bg-yellow-50 border border-yellow-200'
                : 'bg-red-50 border border-red-200'
            }`}
            role="alert"
          >
            <div className="flex items-start">
              {error.includes('レート制限') ? (
                <svg className="w-5 h-5 text-yellow-600 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-red-600 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <div className="flex-1">
                <h3 className={`font-semibold ${
                  error.includes('レート制限') ? 'text-yellow-800' : 'text-red-800'
                }`}>
                  {error.includes('レート制限') ? 'APIレート制限' : 'エラーが発生しました'}
                </h3>
                <p className={`mt-1 ${
                  error.includes('レート制限') ? 'text-yellow-700' : 'text-red-700'
                }`}>
                  {error}
                </p>
                {error.includes('レート制限') && (
                  <div className="mt-3 p-3 bg-yellow-100 rounded border border-yellow-300">
                    <p className="text-sm text-yellow-900 font-medium">💡 対処方法:</p>
                    <ul className="mt-2 text-sm text-yellow-800 list-disc list-inside space-y-1">
                      <li>約30秒待ってから再試行してください</li>
                      <li>長文の場合は、テキストを分割して処理してください</li>
                      <li>詳しくは下の「アプリの仕様・制限事項」をご確認ください</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Report Display */}
        {report && <ReportDisplayV2 report={report} />}

        {/* App Specifications */}
        <AppSpecifications />
      </div>
    </main>
  );
}
