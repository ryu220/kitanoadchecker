# 広告文リーガルチェックツール v1.0 (Ad Legal Checker)

**広告文が法的規制（薬機法、景表法等）に準拠しているかを自動チェックする本番環境対応システム**

## 🎯 システム概要

このシステムは、**RAG（Retrieval-Augmented Generation）技術**と**4層チェックエンジン**を活用し、広告文を「主張(Claim)」単位でインテリジェントに分割し、網羅的かつ正確な法令・自社基準遵守チェックを実現します。

### 📊 導入効果

| 項目 | 従来（手動） | 本システム | 削減効果 |
|------|------------|-----------|---------|
| **チェック時間** | 30分〜1時間 | **約3分** | **90%削減** |
| **見落としリスク** | 高（人的ミス） | **極小（AI+DB）** | **大幅改善** |
| **法令更新対応** | 手動更新必要 | **ナレッジDB更新のみ** | **容易** |

### ✅ 主要機能

- **🤖 AI自動セグメント分割**: Gemini 1.5 Proによる広告文の意味単位自動分割
- **📚 RAGベース評価**: 1,333件のナレッジから関連法規制を動的検索
- **🔍 4層チェックエンジン**: NGキーワード → 注釈解析 → RAG検索 → AI判定
- **📋 詳細レポート生成**: 違反箇所・重大度・修正案・法的根拠を明示
- **🎯 ランキング表現検出**: 「1位」「NO.1」等のエビデンス必須表現を自動検出（Issue #36対応）

### 📖 対応法規制

- **薬機法**（医薬品、医療機器等の品質、有効性及び安全性の確保等に関する法律）
- **景品表示法**（不当景品類及び不当表示防止法）
- **特定商取引法**
- **不正競争防止法**
- **健康増進法**（機能性表示食品）

### 🏷️ 対応商品

**42商品カテゴリ対応**: AI, CA, CH, CK, CR, DS, EA, FS, FV, FZ, GG, HA, HB, HL, HP, HR, HS, HT, JX, KF, KJ, LI, LK, LM, MD, ME, MI, MW, NM, NO, NW, OO, OP, PS, PT, RV, SC, SH, SI, SS, YS, ZS

**⭐ 高度対応商品（専用ナレッジ装備）**:
- **HA**: ヒアロディープパッチ（11ファイル）
- **SH**: クリアストロングショット アルファ（8ファイル）

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

## 📚 納品ドキュメント

詳細なドキュメントは `docs/delivery/` ディレクトリを参照してください:

| ドキュメント | 内容 | 対象読者 |
|------------|------|---------|
| **[01_OVERVIEW.md](docs/delivery/01_OVERVIEW.md)** | システム概要・機能説明・導入効果 | 全員（必読） |
| **[02_SETUP_GUIDE.md](docs/delivery/02_SETUP_GUIDE.md)** | 環境構築・初回セットアップ手順（約30分） | 開発者・運用担当者 |
| **[03_OPERATION_MANUAL.md](docs/delivery/03_OPERATION_MANUAL.md)** | 日常運用・Web UI操作・API利用方法 | エンドユーザー・運用担当者 |
| **[04_ISSUE_36_FIX.md](docs/delivery/04_ISSUE_36_FIX.md)** | ランキング表現検出機能の技術詳細 | 開発者 |
| **[05_FEATURE_LIST.md](docs/delivery/05_FEATURE_LIST.md)** | 全機能一覧・チェック項目詳細 | 全員 |
| **[06_TROUBLESHOOTING.md](docs/delivery/06_TROUBLESHOOTING.md)** | トラブルシューティング・FAQ | 運用担当者 |
| **[RESTORE_POINT_20251030.md](RESTORE_POINT_20251030.md)** | システム完全復元ポイント | 開発者（緊急時） |

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

## 📝 更新履歴

### v1.0 (2025-10-30) - 納品版
- ✅ **42商品対応**: HA, SH含む全商品カテゴリ対応
- ✅ **1,333件ナレッジベース**: 薬機法・景表法・社内ルール完備
- ✅ **4層チェックエンジン**: NGキーワード → 注釈解析 → RAG検索 → AI判定
- ✅ **ランキング表現検出**: 「1位」「NO.1」等のエビデンス必須表現を自動検出（Issue #36対応）
- ✅ **Web UI + API**: フロントエンドとバックエンドAPI両対応
- ✅ **本番環境対応**: Railway/Dockerデプロイ対応
- ✅ **完全ドキュメント**: セットアップから運用まで6種類の納品ドキュメント完備

---

## 🏢 プロジェクト情報

**開発元**: 北野プロジェクト
**バージョン**: v1.0
**納品日**: 2025年10月30日
**リポジトリ**: https://github.com/ryu220/kitanoadchecker

## 📞 サポート

技術的なお問い合わせや不具合報告は、GitHubのIssuesまたは納品ドキュメントをご参照ください。

---

**🎯 本番環境対応完了 - すぐに使用可能です**
