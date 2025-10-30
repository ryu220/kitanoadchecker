'use client';

import { useState } from 'react';

export function AppSpecifications() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-6 bg-white rounded-lg shadow-md overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
        aria-expanded={isOpen}
        aria-controls="specifications-content"
      >
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5 text-blue-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h2 className="text-lg font-semibold text-gray-900">
            アプリの仕様・制限事項
          </h2>
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          id="specifications-content"
          className="px-6 pb-6 text-sm text-gray-700 space-y-4"
        >
          {/* 入力制限 - Issue #14: 50,000文字 → 5,000文字に変更 */}
          <section>
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="text-blue-600">📝</span>
              入力制限
            </h3>
            <ul className="list-disc list-inside space-y-1 ml-6">
              <li>広告文: 最大 <strong>5,000文字</strong></li>
              <li>根拠資料: 無制限（ただしAPI制限の影響あり）</li>
              <li className="text-amber-600 text-xs mt-2">
                ⚠️ <strong>推奨: 2,000文字以下</strong>で処理すると安定します
              </li>
              <li className="text-gray-600 text-xs">
                ※ 3,000文字以上の場合、処理に時間がかかる可能性があります
              </li>
            </ul>
          </section>

          {/* APIレート制限 */}
          <section>
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="text-blue-600">⏱️</span>
              APIレート制限
            </h3>
            <ul className="list-disc list-inside space-y-1 ml-6">
              <li>
                Gemini API: 1分あたり 25万トークン
              </li>
              <li>
                推奨: <strong>2,000文字以下</strong>の広告文を一度に処理
              </li>
              <li>
                長文の場合: レート制限エラーが発生する可能性があります
              </li>
              <li>
                エラー発生時: <strong>約30秒待機</strong>してから再試行してください
              </li>
            </ul>
          </section>

          {/* 処理時間の目安 */}
          <section>
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="text-blue-600">🚀</span>
              処理時間の目安
            </h3>
            <ul className="list-disc list-inside space-y-1 ml-6">
              <li>短文（5-10セグメント）: 30-90秒（0.5-1.5分）</li>
              <li>中文（10-20セグメント）: 1-3分</li>
              <li>長文（20-30セグメント）: 2-4.5分</li>
              <li className="text-gray-600 text-xs mt-2">
                ※ セグメント数はテキストの内容により変動します
              </li>
              <li className="text-gray-600 text-xs">
                ※ 処理中に画面に表示される推定時間をご確認ください
              </li>
            </ul>
          </section>

          {/* 注釈検出ルール */}
          <section>
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="text-blue-600">✅</span>
              注釈検出ルール
            </h3>
            <ul className="list-disc list-inside space-y-1 ml-6">
              <li>※1, ※2などの注釈マーカーを自動検出</li>
              <li>
                キーワード（浸透、殺菌など）に注釈マーカーがない場合、自動的に違反フラグ
              </li>
              <li>HA・SH両商品に対応した汎用ロジック</li>
              <li>
                複数キーワードを含む場合、それぞれ個別に評価
              </li>
            </ul>
          </section>

          {/* 対応商品 */}
          <section>
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="text-blue-600">🏷️</span>
              対応商品
            </h3>
            <ul className="list-disc list-inside space-y-1 ml-6">
              <li>HA（ヒアルロン酸系商品）</li>
              <li>SH（スキンヘルス系商品）</li>
            </ul>
          </section>

          {/* トラブルシューティング */}
          <section className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="text-yellow-600">⚠️</span>
              よくある問題と対処法
            </h3>
            <div className="space-y-2 ml-6">
              <div>
                <strong className="text-gray-900">
                  「APIレート制限に達しました」エラー
                </strong>
                <p className="text-gray-700 mt-1">
                  → <strong>30秒待機</strong>してから再試行してください。長文の場合は、テキストを分割して処理することをお勧めします。
                </p>
              </div>
              <div>
                <strong className="text-gray-900">
                  「セグメント化に失敗しました」エラー
                </strong>
                <p className="text-gray-700 mt-1">
                  → APIキーが正しいか確認してください。または、広告文の形式を確認してください。
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
