'use client';

export type ProcessingStep = 'idle' | 'segmenting' | 'evaluating' | 'reporting' | 'complete' | 'error';

interface Props {
  currentStep: ProcessingStep;
  segmentCount?: number;
  currentSegment?: number;
  estimatedTimeSeconds?: number;
  error?: string;
}

export function ProgressTrackerV2({
  currentStep,
  segmentCount = 0,
  currentSegment = 0,
  estimatedTimeSeconds = 0,
  error
}: Props) {
  const steps = [
    { id: 'segmenting', label: 'セグメント分割', icon: '📝' },
    { id: 'evaluating', label: 'セグメント評価', icon: '🔍' },
    { id: 'reporting', label: 'レポート生成', icon: '📊' }
  ];

  const getStepStatus = (stepId: string) => {
    const stepOrder = ['segmenting', 'evaluating', 'reporting', 'complete'];
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(stepId);

    if (currentStep === 'error') return 'error';
    if (stepIndex < currentIndex || currentStep === 'complete') return 'complete';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  const calculateProgress = () => {
    if (currentStep === 'idle') return 0;
    if (currentStep === 'segmenting') return 20;
    if (currentStep === 'evaluating') {
      if (segmentCount === 0) return 30;
      const evaluationProgress = (currentSegment / segmentCount) * 60;
      return 20 + evaluationProgress;
    }
    if (currentStep === 'reporting') return 85;
    if (currentStep === 'complete') return 100;
    return 0;
  };

  const progress = calculateProgress();

  if (currentStep === 'idle') return null;

  return (
    <div className="bg-white p-6 rounded-lg shadow-md space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">処理中...</h3>
        {estimatedTimeSeconds > 0 && (
          <span className="text-sm text-gray-600">
            推定残り時間: {estimatedTimeSeconds}秒
          </span>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg" role="alert">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-red-600 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="font-semibold text-red-800">エラーが発生しました</h4>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {steps.map((step) => {
          const status = getStepStatus(step.id);
          return (
            <div key={step.id} className="flex items-center space-x-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  status === 'complete'
                    ? 'bg-green-100 text-green-600'
                    : status === 'active'
                    ? 'bg-blue-100 text-blue-600 animate-pulse'
                    : status === 'error'
                    ? 'bg-red-100 text-red-600'
                    : 'bg-gray-100 text-gray-400'
                }`}
                aria-label={`${step.label}のステータス: ${status}`}
              >
                {status === 'complete' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : status === 'active' ? (
                  <div className="w-3 h-3 bg-blue-600 rounded-full" />
                ) : (
                  <div className="w-3 h-3 bg-gray-300 rounded-full" />
                )}
              </div>

              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm font-medium ${
                      status === 'complete'
                        ? 'text-green-700'
                        : status === 'active'
                        ? 'text-blue-700'
                        : 'text-gray-500'
                    }`}
                  >
                    {step.icon} {step.label}
                  </span>
                  {step.id === 'segmenting' && status === 'complete' && segmentCount > 0 && (
                    <span className="text-xs text-gray-500">
                      {segmentCount}セグメント検出
                    </span>
                  )}
                  {step.id === 'evaluating' && status === 'active' && segmentCount > 0 && (
                    <span className="text-xs text-gray-600">
                      {currentSegment} / {segmentCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-2">
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>進捗状況</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="全体の進捗"
          />
        </div>
      </div>
    </div>
  );
}
