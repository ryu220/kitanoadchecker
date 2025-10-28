# 広告文リーガルチェックツール (Ad Legal Checker)

広告文が法的規制（薬機法、景表法等）に準拠しているかを自動チェックするWebアプリケーション。

## 概要

このシステムは、RAG（Retrieval-Augmented Generation）技術を活用し、広告文を「主張(Claim)」単位でインテリジェントに分割し、網羅的かつ正確な法令・自社基準遵守チェックを実現します。

### 主要機能

- **自動セグメント分割**: 広告文を意味のある単位で自動分割
- **RAGベース評価**: 関連する法規制・自社基準を動的検索して評価
- **多層優先順位システム**: 自社基準 > 法令 > ガイドラインの順で適用
- **詳細レポート生成**: 違反箇所、修正案、法的根拠を明示

### 対応法規制

- 薬機法（医薬品、医療機器等の品質、有効性及び安全性の確保等に関する法律）
- 景品表示法（不当景品類及び不当表示防止法）
- 特定商取引法
- 不正競争防止法
- 健康増進法（機能性表示食品）

### 対応商品

**42商品カテゴリ対応**: AI, CA, CH, CK, CR, DS, EA, FS, FV, FZ, GG, HA, HB, HL, HP, HR, HS, HT, JX, KF, KJ, LI, LK, LM, MD, ME, MI, MW, NM, NO, NW, OO, OP, PS, PT, RV, SC, SH, SI, SS, YS, ZS

**高度対応商品（専用ナレッジ装備）**:
- **HA**: ヒアロディープパッチ
- **SH**: クリアストロングショット アルファ

## 技術スタック

- **フロントエンド**: Next.js 14 (React 18)
- **バックエンド**: Next.js API Routes
- **データベース**: ChromaDB (Vector Database)
- **AI/ML**: Google Gemini API
- **言語**: TypeScript (strict mode)
- **デプロイ**: Railway / Docker Compose対応

## クイックスタート

### 前提条件

- Node.js 18.x 以上
- Docker & Docker Compose
- Gemini API Key（[取得方法](https://aistudio.google.com/app/apikey)）

### ローカル開発環境セットアップ

```bash
# 1. リポジトリクローン
git clone https://github.com/ryu220/kitanoadchecker.git
cd kitanoadchecker

# 2. 依存関係インストール
npm install

# 3. 環境変数設定
cp .env.example .env
# .envファイルを編集してGEMINI_API_KEYを設定

# 4. ChromaDB起動
docker-compose up -d chroma

# 5. Vector DB初期化（初回のみ、約10-15分）
npm run setup:vector-db

# 6. 開発サーバー起動
npm run dev

# 7. ブラウザでアクセス
# http://localhost:3000
```

### 環境チェック

```bash
npm run check-env
```

このコマンドで以下を自動チェック:
- ✅ Node Modules
- ✅ 環境変数
- ✅ ナレッジファイル
- ✅ Docker & ChromaDB
- ✅ Vector DBデータ

## ドキュメント

詳細なドキュメントは `docs/` ディレクトリを参照してください:

- **[セットアップガイド](docs/01_SETUP_GUIDE.md)** - 初回セットアップ詳細手順
- **[Railway デプロイ](docs/02_DEPLOYMENT_RAILWAY.md)** - Railway本番環境構築手順
- **[Docker デプロイ](docs/04_DEPLOYMENT_DOCKER.md)** - Docker環境構築手順
- **[環境変数](docs/05_ENVIRONMENT_VARIABLES.md)** - 環境変数詳細説明
- **[ナレッジ管理](docs/06_KNOWLEDGE_MANAGEMENT.md)** - ナレッジベース管理方法
- **[新商品追加](docs/07_PRODUCT_ADDITION_GUIDE.md)** - 新商品追加手順
- **[トラブルシューティング](docs/08_TROUBLESHOOTING.md)** - よくある問題と解決方法
- **[API仕様](docs/09_API_REFERENCE.md)** - API仕様書
- **[アーキテクチャ](docs/10_ARCHITECTURE.md)** - システムアーキテクチャ

## プロジェクト構造

```
kitanoadchecker/
├── app/                      # Next.js App Router
│   ├── api/v2/              # API エンドポイント
│   ├── page.tsx             # メインUI
│   └── layout.tsx
├── components/              # React Components
├── lib/                     # Core Libraries
│   ├── rag-search.ts       # RAG検索エンジン
│   ├── types.ts            # 型定義
│   └── validation.ts       # バリデーション
├── scripts/                 # セットアップスクリプト
│   ├── setup-vector-db.ts  # Vector DB初期化
│   └── check-environment.ts # 環境チェック
├── knowledge/               # ナレッジベース
│   ├── common/             # 共通法規制
│   ├── HA/                 # ヒアロディープパッチ専用
│   └── SH/                 # シャンプー専用
├── config/                  # 設定ファイル
│   ├── knowledge-priority-mapping.csv
│   └── keywords/
├── docs/                    # ドキュメント
├── docker-compose.yml       # Docker構成
├── Dockerfile              # Dockerイメージ定義
└── package.json
```

## 使用方法

### Web UI

1. ブラウザで `http://localhost:3000` にアクセス
2. 商品を選択（例: HA - ヒアロディープパッチ）
3. 広告文を入力またはペースト
4. 「チェック開始」ボタンをクリック
5. 結果レポートを確認

### API

```bash
# セグメント分割API
curl -X POST http://localhost:3000/api/v2/segment \
  -H "Content-Type: application/json" \
  -d '{
    "text": "刺すヒアルロン酸でクマ※1対策",
    "productId": "HA"
  }'

# バッチ評価API
curl -X POST http://localhost:3000/api/v2/evaluate-batch \
  -H "Content-Type: application/json" \
  -d '{
    "segments": [...],
    "productId": "HA",
    "fullText": "広告文全体"
  }'
```

詳細は [API仕様書](docs/09_API_REFERENCE.md) を参照。

## 本番デプロイ

### Railway（推奨）

詳細な手順は [Railway デプロイガイド](docs/02_DEPLOYMENT_RAILWAY.md) を参照。

#### クイックスタート:

1. Railwayアカウント作成
2. GitHubリポジトリ連携
3. ChromaDBサービス追加
4. 環境変数設定（GEMINI_API_KEY, CHROMA_URL）
5. デプロイ実行
6. Vector DB初期化（初回のみ）

## 保守・運用

### ナレッジベース更新

```bash
# 1. knowledge/ ディレクトリにファイル追加/編集

# 2. Vector DB再構築
npm run setup:vector-db:clear

# 3. 動作確認
npm run dev
```

詳細は [ナレッジ管理ガイド](docs/06_KNOWLEDGE_MANAGEMENT.md) を参照。

### 新商品追加

新商品を追加する際の手順は [新商品追加ガイド](docs/07_PRODUCT_ADDITION_GUIDE.md) を参照。

## トラブルシューティング

よくある問題と解決方法は [トラブルシューティング](docs/08_TROUBLESHOOTING.md) を参照。

### よくある質問

**Q: ChromaDBに接続できません**
```bash
# ChromaDBが起動しているか確認
docker ps | grep chroma

# 起動していない場合
docker-compose up -d chroma
```

**Q: Vector DBにデータがありません**
```bash
# 初期化を実行
npm run setup:vector-db
```

**Q: Gemini APIクォータエラー**
- Google AI Studioでクォータ確認
- 有料プランへの移行を検討

## セキュリティ

- ✅ API Keyは環境変数で管理（`.env`は`.gitignore`に含まれます）
- ✅ 機密情報はGitにコミットしない
- ✅ 本番環境では専用APIキーを使用

## ライセンス

MIT License

## サポート

技術的な問い合わせや不具合報告は、GitHubのIssuesをご利用ください。

## 更新履歴

### v1.0.0 (2025-10-29)
- 初回リリース
- 42商品対応
- RAGベース評価システム
- Railway デプロイ対応

---

**開発元**: 北野プロジェクト
**最終更新**: 2025-10-29
