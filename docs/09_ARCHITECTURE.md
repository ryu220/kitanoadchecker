# 09. システムアーキテクチャ - System Architecture

## 概要

このドキュメントは、**kitanoadchecker**（広告文リーガルチェックツール）のシステムアーキテクチャを説明します。

---

## システム全体図

```
┌─────────────────────────────────────────────────────────────────┐
│                         User (Browser)                          │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js Application                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     Frontend (React)                      │  │
│  │  - ProductSelectorV2 (商品選択)                           │  │
│  │  - TextInput (広告文入力)                                 │  │
│  │  - ReportViewer (レポート表示)                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                             │                                    │
│                             ↓ API Call                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     Backend (API Routes)                  │  │
│  │  - /api/v2/segment (セグメント分割)                      │  │
│  │  - /api/v2/evaluate-batch (評価)                         │  │
│  │  - /api/v2/report (レポート生成)                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                             │                                    │
│                    ┌────────┴────────┐                          │
│                    ↓                 ↓                          │
│  ┌─────────────────────────┐  ┌──────────────────────┐         │
│  │   RAG Search Engine     │  │  Rule-Based Engine   │         │
│  │  - Semantic Search      │  │  - Segmentation      │         │
│  │  - Priority Boosting    │  │  - NG Keywords       │         │
│  │  - Keyword Matching     │  │  - Pattern Detection │         │
│  └────────────┬────────────┘  └──────────────────────┘         │
│               │                                                  │
└───────────────┼──────────────────────────────────────────────────┘
                │
                ↓ Vector Search / Embedding
┌─────────────────────────────────────────────────────────────────┐
│                      External Services                          │
│  ┌─────────────────────┐        ┌───────────────────────────┐  │
│  │   ChromaDB          │        │   Google Gemini API       │  │
│  │  (Vector Database)  │        │  - Text Generation        │  │
│  │  - 1,333 chunks     │        │  - Embedding Generation   │  │
│  │  - Persistent       │        │  - Evaluation             │  │
│  └─────────────────────┘        └───────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 技術スタック

### フロントエンド

| 技術 | バージョン | 用途 |
|-----|-----------|------|
| **Next.js** | 14.2+ | フレームワーク（App Router） |
| **React** | 18.3+ | UIライブラリ |
| **TypeScript** | 5.8+ | 型安全性 |
| **Tailwind CSS** | 3.4+ | スタイリング |
| **React Markdown** | 9.0+ | Markdownレンダリング |

### バックエンド

| 技術 | バージョン | 用途 |
|-----|-----------|------|
| **Next.js API Routes** | 14.2+ | RESTful API |
| **Zod** | 3.23+ | バリデーション |
| **ChromaDB Client** | 3.0+ | Vector Database接続 |
| **Google Generative AI SDK** | 0.24+ | Gemini API連携 |

### データベース・インフラ

| 技術 | バージョン | 用途 |
|-----|-----------|------|
| **ChromaDB** | latest | Vector Database（ナレッジ保存） |
| **Docker** | 20.10+ | コンテナ化 |
| **Docker Compose** | 2.0+ | マルチコンテナ管理 |

### デプロイ

| プラットフォーム | 用途 |
|----------------|------|
| **Railway** | PaaS（本番環境） |
| **Docker** | セルフホスティング |

---

## データフロー

### 1. 広告文チェックフロー

```
[ユーザー入力]
    ↓
┌─────────────────────┐
│ 1. セグメント分割   │
│ /api/v2/segment     │
│ - Rule-Based        │
│ - 0.1ms以下         │
└─────────┬───────────┘
          ↓
┌─────────────────────┐
│ 2. RAG検索          │
│ - Vector DB検索     │
│ - 優先度ブースト    │
│ - Top 5 取得        │
└─────────┬───────────┘
          ↓
┌─────────────────────┐
│ 3. セグメント評価   │
│ /api/v2/evaluate    │
│ - Gemini API呼出    │
│ - 法令チェック      │
│ - 修正案生成        │
└─────────┬───────────┘
          ↓
┌─────────────────────┐
│ 4. レポート生成     │
│ /api/v2/report      │
│ - 統計集計          │
│ - Markdown生成      │
└─────────┬───────────┘
          ↓
    [レポート表示]
```

### 2. Vector DB初期化フロー

```
[初回セットアップ]
    ↓
┌─────────────────────────────┐
│ 1. ナレッジファイル読込     │
│ - knowledge/common/ (131)   │
│ - knowledge/HA/ (8)         │
│ - knowledge/SH/ (N)         │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│ 2. チャンク分割             │
│ - 1,000文字単位             │
│ - 優先度メタデータ付与      │
│ - 1,333 chunks生成          │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│ 3. Embedding生成            │
│ - Gemini API呼出            │
│ - 768次元ベクトル           │
│ - バッチ処理                │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│ 4. ChromaDBに保存           │
│ - Collection作成            │
│ - Vector + Metadata保存     │
│ - Persistent Volume格納     │
└─────────────────────────────┘
```

---

## RAG（Retrieval-Augmented Generation）システム

### RAG検索の仕組み

```
[セグメントテキスト: "シワに効く"]
    ↓
┌─────────────────────────────────────┐
│ 1. クエリ拡張                       │
│ - 類似表現辞書で拡張                │
│ - "効く" → ["効果的", "作用", ...] │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 2. Embedding生成（ユーザーAPI Key） │
│ - Gemini Embedding API呼出          │
│ - 768次元ベクトル生成               │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 3. Vector Search                    │
│ - ChromaDBでコサイン類似度計算      │
│ - Top 20候補を取得                  │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 4. リランキング                     │
│ - 優先度ブースト適用                │
│   - P1（社内基準）: 2.0倍           │
│   - P2（法令）: 1.0倍               │
│   - P3（ガイドライン）: 1.0倍       │
│ - キーワード完全一致: 1.3倍         │
│ - 商品固有ファイル: 1.5倍           │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 5. Top 5選定                        │
│ - 最終スコアでソート                │
│ - 上位5件を返却                     │
└─────────────────────────────────────┘
```

### 優先度マッピング

| 優先度 | ブースト倍率 | 用途 |
|-------|------------|------|
| **P1** | 2.0x | 社内基準（最優先） |
| **P2** | 1.0x | 法令（必須遵守） |
| **P3** | 1.0x | ガイドライン（推奨） |

**商品固有ファイル:** 1.5倍ブースト（例: HA商品でHA/ファイルを優先）

**キーワード完全一致:** 1.3倍ブースト（例: 「浸透」が含まれる）

---

## セキュリティ設計

### 1. APIキー管理

**設計思想:**
- **サーバー側でAPIキーを保存しない**
- ユーザーがリクエストごとにAPIキーを送信
- Vector DBセットアップ時のみ、一時的に環境変数に設定

**メリット:**
- サーバー管理者のGemini APIクォータを消費しない
- APIキー漏洩リスクの最小化
- ユーザー自身のAPIキー管理

### 2. データ永続化

**ChromaDB Volume:**
- Dockerの永続Volumeでデータ保存
- コンテナ再起動時もデータ保持
- 定期バックアップ推奨

### 3. HTTPS通信

**本番環境:**
- RailwayはHTTPSを自動提供
- Let's Encrypt SSL証明書
- TLS 1.2以上

---

## パフォーマンス最適化

### 1. ルールベースセグメント分割

**従来（Gemini API使用）:**
- 処理時間: 5〜15秒
- コスト: APIクォータ消費

**現在（ルールベース）:**
- 処理時間: **0.1ms以下**
- コスト: ゼロ（API不要）
- 精度: 同等

### 2. RAGキャッシュ

```typescript
// lib/cache/rag-search-cache.ts
class RAGCache {
  // セグメントテキスト + 商品ID をキーにキャッシュ
  get(text: string, productId: string): string | null;
  set(text: string, productId: string, knowledge: string): void;
}
```

**効果:**
- 同じセグメントの再検索を回避
- RAG検索時間を90%削減
- メモリ使用量: 約50MB

### 3. Vector DBの事前構築

**設計:**
- ナレッジベースのEmbeddingを事前生成
- ランタイムではVector Searchのみ実行
- ユーザーAPIキーはクエリEmbedding生成のみ使用（1回/リクエスト）

**メリット:**
- リクエスト時のAPI呼出を最小化
- レスポンス時間を短縮
- コスト削減

---

## スケーラビリティ

### 現在の制限

| 項目 | 制限値 | 備考 |
|-----|--------|------|
| 広告文最大文字数 | 50,000文字 | セグメント分割API |
| 最大セグメント数 | 300個 | バッチ評価API |
| Vector DBサイズ | 1,333 chunks | ナレッジベース全体 |
| 同時リクエスト数 | 制限なし | Gemini APIクォータに依存 |

### スケールアウト戦略

**水平スケーリング:**
1. Next.jsアプリを複数インスタンスで起動
2. ロードバランサーで負荷分散
3. ChromaDBは共有（単一インスタンス）

**垂直スケーリング:**
1. ChromaDBのメモリを増強
2. Next.jsのWorker数を増加
3. Gemini APIのクォータを拡大

---

## 監視・ログ

### 1. ログレベル

| レベル | 内容 | 環境 |
|-------|------|------|
| **ERROR** | エラー | 本番・開発 |
| **WARN** | 警告 | 本番・開発 |
| **INFO** | 情報 | 開発のみ |
| **DEBUG** | デバッグ | ローカルのみ |

### 2. ログ出力例

```typescript
// api/v2/evaluate/route.ts
console.log('[Evaluate API] Received request with', body.segments?.length, 'segments');
console.log('[Evaluate API] RAG CACHE HIT! Using cached knowledge context');
console.error('[Evaluate API] Error:', error);
```

### 3. メトリクス

**推奨監視項目:**
- リクエスト数（/api/v2/*）
- レスポンス時間（平均・P95・P99）
- エラー率
- ChromaDB接続状態
- Gemini APIクォータ使用量

---

## ディレクトリ構造

```
kitanoadchecker/
├── app/                         # Next.js App Router
│   ├── api/                     # API Routes
│   │   ├── health/              # ヘルスチェック
│   │   └── v2/                  # API v2
│   │       ├── segment/         # セグメント分割
│   │       ├── evaluate/        # 評価（単一）
│   │       ├── evaluate-batch/  # 評価（バッチ）
│   │       └── report/          # レポート生成
│   ├── page.tsx                 # トップページ
│   └── layout.tsx               # レイアウト
│
├── lib/                         # コアライブラリ
│   ├── types.ts                 # 型定義
│   ├── types-v2.ts              # 型定義（v2）
│   ├── validation.ts            # バリデーション
│   ├── gemini-client.ts         # Gemini APIクライアント
│   ├── rag-search.ts            # RAG検索エンジン
│   ├── embedding-service.ts     # Embedding生成
│   ├── vector-db/               # Vector DB
│   │   ├── interface.ts         # インターフェース
│   │   └── chroma-db.ts         # ChromaDB実装
│   ├── segmentation/            # セグメント分割
│   │   ├── rule-based-segmenter.ts
│   │   ├── keyword-detector.ts
│   │   └── annotation-merger.ts
│   ├── ng-keywords/             # NGキーワード
│   │   ├── absolute-ng.ts       # 絶対NG
│   │   ├── conditional-ng.ts    # 条件付きNG
│   │   └── context-dependent-ng.ts
│   ├── cache/                   # キャッシュ
│   │   ├── rag-search-cache.ts
│   │   └── prompt-cache-manager.ts
│   └── prompts/                 # プロンプト
│       └── evaluation-prompt-command-stack.ts
│
├── components/                  # Reactコンポーネント
│   ├── ProductSelectorV2.tsx    # 商品選択
│   ├── TextInput.tsx            # テキスト入力
│   └── ReportViewer.tsx         # レポート表示
│
├── knowledge/                   # ナレッジベース
│   ├── common/                  # 全商品共通（131ファイル）
│   ├── HA/                      # HA商品固有（8ファイル）
│   ├── SH/                      # SH商品固有
│   └── knowledge-mapping.csv    # 優先度マッピング
│
├── scripts/                     # スクリプト
│   ├── setup-vector-db.ts       # Vector DBセットアップ
│   ├── check-environment.ts     # 環境チェック
│   └── startup.sh               # 起動スクリプト
│
├── docker-compose.yml           # Docker Compose設定
├── Dockerfile                   # Dockerイメージ定義
├── .env.example                 # 環境変数テンプレート
├── package.json                 # 依存関係
└── tsconfig.json                # TypeScript設定
```

---

## 依存関係

### 主要依存パッケージ

```json
{
  "dependencies": {
    "@google/generative-ai": "^0.24.1",  // Gemini API
    "chromadb": "^3.0.17",               // Vector DB
    "dotenv": "^17.2.3",                 // 環境変数
    "next": "^14.2.0",                   // Next.js
    "react": "^18.3.0",                  // React
    "react-markdown": "^9.0.0",          // Markdown表示
    "zod": "^3.23.0"                     // バリデーション
  }
}
```

---

## まとめ

アーキテクチャのポイント:

- **Next.js App Router**: モダンなフルスタックフレームワーク
- **RAG検索**: Vector DBで高精度なナレッジ検索
- **ルールベース処理**: 超高速セグメント分割（0.1ms）
- **セキュアな設計**: APIキーはサーバー側に保存しない
- **スケーラブル**: 水平・垂直スケーリング対応
- **Docker化**: コンテナ化で環境依存を排除

次のステップ:
- **[10_MAINTENANCE_GUIDE.md](./10_MAINTENANCE_GUIDE.md)** - メンテナンス手順
- **[08_API_REFERENCE.md](./08_API_REFERENCE.md)** - API仕様書
- **[07_TROUBLESHOOTING.md](./07_TROUBLESHOOTING.md)** - トラブルシューティング
