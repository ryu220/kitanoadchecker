'use client';

import { useState, useEffect } from 'react';

interface Props {
  isOpen: boolean;
  onSubmit: (apiKey: string) => void;
  initialApiKey?: string;
}

export function ApiKeyModal({ isOpen, onSubmit, initialApiKey = '' }: Props) {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  // Update internal state when initialApiKey changes
  useEffect(() => {
    setApiKey(initialApiKey);
    setError(''); // Clear any previous errors
  }, [initialApiKey]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!apiKey.trim()) {
      setError('APIキーを入力してください');
      return;
    }

    if (!apiKey.startsWith('AIza')) {
      setError('有効なGemini APIキーを入力してください（AIzaで始まる必要があります）');
      return;
    }

    // Validate API key with actual API call
    setIsValidating(true);

    try {
      const response = await fetch('/api/v2/validate-api-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey }),
      });

      const data = await response.json();

      if (!response.ok || !data.valid) {
        // Handle specific error types
        if (data.error === 'quota_exceeded') {
          setError('⚠️ クォータ制限に達しています。Google AI Studioで新しいAPI Keyを作成してください。');
        } else if (data.error === 'invalid_key') {
          setError('❌ 無効なAPI Keyです。正しいGemini API Keyを入力してください。');
        } else {
          setError(`❌ ${data.message || 'API Keyの検証に失敗しました'}`);
        }
        setIsValidating(false);
        return;
      }

      // API key is valid
      onSubmit(apiKey);
    } catch (err) {
      console.error('API Key validation error:', err);
      setError('❌ API Keyの検証中にエラーが発生しました。ネットワーク接続を確認してください。');
      setIsValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Gemini APIキーの設定
        </h2>

        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            このツールは Google Gemini API を使用します。APIキーは sessionStorage に保存され、ブラウザを閉じると削除されます。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-2">
              API キー <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                error ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="AIza..."
              autoFocus
              aria-label="Gemini APIキー入力"
              aria-required="true"
              aria-invalid={!!error}
            />
            {error && (
              <p className="text-sm text-red-500 mt-1" role="alert">{error}</p>
            )}
          </div>

          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-sm text-gray-700 mb-2">
              <strong>APIキーの取得方法:</strong>
            </p>
            <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
              <li>
                <a
                  href="https://aistudio.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Google AI Studio
                </a>
                にアクセス
              </li>
              <li>「Get API Key」をクリック</li>
              <li>新しいAPIキーを作成</li>
              <li>ここに貼り付け</li>
            </ol>
          </div>

          <button
            type="submit"
            disabled={isValidating}
            className={`w-full py-3 px-4 text-white rounded-lg font-medium transition-colors ${
              isValidating
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
            aria-label="APIキーを保存して開始"
          >
            {isValidating ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                検証中...
              </span>
            ) : (
              'キーを保存して開始'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
