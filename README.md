# 広告文リーガルチェックツール v1.0 (Ad Legal Checker)

**広告文が法的規制（薬機法、景表法等）に準拠しているかを自動チェックする本番環境対応システム**

---

## 📦 納品物の所在

| 納品物 | ファイル・ディレクトリ | 説明ドキュメント |
|--------|---------------------|-----------------|
| **1. 環境設定一式**<br>（シークレット管理含む） | `.env.example`<br>`package.json`<br>`docker-compose.yml`<br>`Dockerfile` | [02_SETUP_GUIDE.md](docs/delivery/02_SETUP_GUIDE.md)<br>[08_DEPLOYMENT_GUIDE.md](docs/delivery/08_DEPLOYMENT_GUIDE.md) |
| **2. プロンプト群・NGワード等** | `lib/prompts/evaluation-prompt-command-stack.ts` (481行)<br>`lib/ng-keywords/absolute-ng.ts` (28種)<br>`lib/ng-keywords/conditional-ng.ts` (27種)<br>`lib/ng-keywords/context-dependent-ng.ts` (7種)<br>`config/products/HA.json`<br>`config/products/SH.json` | [00_DELIVERY_PACKAGE_MAP.md](docs/delivery/00_DELIVERY_PACKAGE_MAP.md)<br>§3 プロンプト群・ルール設定 |
| **3. ナレッジベース**<br>（Railway構成・バッチ処理） | `knowledge/` (130ファイル、5.13MB)<br>  ├ `common/` (120ファイル)<br>  ├ `HA/` (7ファイル)<br>  └ `SH/` (3ファイル)<br>`scripts/setup-vector-db.ts` | [00_DELIVERY_PACKAGE_MAP.md](docs/delivery/00_DELIVERY_PACKAGE_MAP.md)<br>§4 ナレッジベース<br>[08_DEPLOYMENT_GUIDE.md](docs/delivery/08_DEPLOYMENT_GUIDE.md)<br>§1.4 Vector DB初期化 |
| **4. 代表テストケース**<br>（入出力例15パターン） | `docs/delivery/07_TEST_CASES.md` (365行)<br>  - ランキング表現<br>  - ギネス期間検証<br>  - 保証表現<br>  - 医師推奨表現<br>  - クマ・浸透表現 等 | [07_TEST_CASES.md](docs/delivery/07_TEST_CASES.md) |
| **5. デプロイ手順**<br>（Railwayアカウント再現） | `docs/delivery/08_DEPLOYMENT_GUIDE.md` (487行)<br>  - Railway Project作成<br>  - ChromaDB Service設定<br>  - 環境変数設定<br>  - Vector DB初期化<br>  - 動作確認手順 | [08_DEPLOYMENT_GUIDE.md](docs/delivery/08_DEPLOYMENT_GUIDE.md) |

**📌 詳細はすべて [docs/delivery/00_DELIVERY_PACKAGE_MAP.md](docs/delivery/00_DELIVERY_PACKAGE_MAP.md) に記載されています**

---

## 🎯 システム概要

このシステムは、**RAG（Retrieval-Augmented Generation）技術**と**4層チェックエンジン**を活用し、広告文を「主張(Claim)」単位でインテリジェントに分割し、網羅的かつ正確な法令・自社基準遵守チェックを実現します。

### 📊 導入効果

| 項目 | 従来（手動） | 本システム | 削減効果 |
|------|------------|-----------|---------|
| **チェック時間** | 30分〜1時間 | **約3分** | **90%削減** |
| **見落としリスク** | 高（人的ミス） | **極小（AI+DB）** | **大幅改善** |
| **法令更新対応** | 手動更新必要 | **ナレッジDB更新のみ** | **容易** |

### ✅ 主要機能

- **🤖 AI自動セグメント分割**: Gemini 2.5 Flash Liteによる広告文の意味単位自動分割
- **📚 RAGベース評価**: 130ナレッジファイルから~5,129チャンク生成、関連法規制を動的検索
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
- **HA**: ヒアロディープパッチ（7ファイル）
- **SH**: クリアストロングショット アルファ（3ファイル）
- **共通ナレッジ**: 120ファイル（薬機法・景表法・社内ルール）

## 技術スタック

- **フロントエンド**: Next.js 14.2.33 (React 18)
- **バックエンド**: Next.js API Routes
- **データベース**: ChromaDB 3.0.17 (Vector Database, collection: ad_checker_knowledge)
- **AI/ML**: Google Gemini API (gemini-2.5-flash-lite)
- **Embedding**: text-embedding-004 (vectorization)
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
| **[00_DELIVERY_PACKAGE_MAP.md](docs/delivery/00_DELIVERY_PACKAGE_MAP.md)** | 📦 納品物パッケージマップ・ファイル一覧 | 全員（必読） |
| **[01_OVERVIEW.md](docs/delivery/01_OVERVIEW.md)** | システム概要・機能説明・導入効果 | 全員 |
| **[02_SETUP_GUIDE.md](docs/delivery/02_SETUP_GUIDE.md)** | 環境構築・初回セットアップ手順（約30分） | 開発者・運用担当者 |
| **[03_OPERATION_MANUAL.md](docs/delivery/03_OPERATION_MANUAL.md)** | 日常運用・Web UI操作・API利用方法 | エンドユーザー・運用担当者 |
| **[04_ISSUE_36_FIX.md](docs/delivery/04_ISSUE_36_FIX.md)** | ランキング表現検出機能の技術詳細 | 開発者 |
| **[05_FEATURE_LIST.md](docs/delivery/05_FEATURE_LIST.md)** | 全機能一覧・チェック項目詳細 | 全員 |
| **[06_TROUBLESHOOTING.md](docs/delivery/06_TROUBLESHOOTING.md)** | トラブルシューティング・FAQ | 運用担当者 |
| **[07_TEST_CASES.md](docs/delivery/07_TEST_CASES.md)** | 🧪 代表テストケース集（実例ベース） | テスト担当者・運用担当者 |
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

本システムはRailwayでの本番デプロイに対応しています。詳細な手順は [デプロイガイド](docs/delivery/08_DEPLOYMENT_GUIDE.md) を参照。

#### クイックスタート:

1. **Railwayアカウント作成** - https://railway.app/
2. **GitHubリポジトリ連携** - ryu220/kitanoadcheckerを連携
3. **ChromaDBサービス追加** - Docker Serviceとして追加
4. **環境変数設定**
   - `CHROMA_URL`: ChromaDBサービスのinternal URL
   - `GEMINI_API_KEY`: 本番環境では**不要**（ユーザーがUI経由で提供）
5. **デプロイ実行** - 自動ビルド・デプロイ
6. **Vector DB初期化（初回のみ）** - ローカルから実行

### Docker Compose（ローカル本番環境）

```bash
docker-compose up --build
# http://localhost:3000 でアクセス
```

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

## セキュリティと環境変数

### 環境変数設定

本システムでは以下の環境変数を使用します:

```bash
# ローカル開発時（Vector DB初期化のみ必須）
GEMINI_API_KEY=your_api_key_here

# ChromaDB接続先
CHROMA_URL=http://localhost:8000  # ローカル開発
CHROMA_URL=http://chroma:8000     # 本番Docker内部
```

### 🔐 重要: 本番環境のAPI Key管理

- **本番環境では`GEMINI_API_KEY`環境変数は不要です**
- ユーザーがWeb UIで初回アクセス時にAPIキーを入力
- APIキーはブラウザのlocalStorageに保存（サーバー側には保存されません）
- セキュアでスケーラブルな設計

### セキュリティベストプラクティス

- ✅ API Keyは環境変数で管理（`.env`は`.gitignore`に含まれます）
- ✅ 機密情報はGitにコミットしない
- ✅ 本番環境ではユーザー提供のAPIキーを使用（サーバー保存なし）

## ライセンス

MIT License

## サポート

技術的な問い合わせや不具合報告は、GitHubのIssuesをご利用ください。

## 📝 更新履歴

### v1.0 (2025-10-30) - 納品版
- ✅ **42商品対応**: HA, SH含む全商品カテゴリ対応
- ✅ **130ナレッジファイル**: 薬機法・景表法・社内ルール完備、~5,129チャンク生成
- ✅ **4層チェックエンジン**: NGキーワード → 注釈解析 → RAG検索 → AI判定
- ✅ **62種NGキーワード**: 絶対NG(28) + 条件付NG(27) + 文脈依存(7)
- ✅ **ランキング表現検出**: 「1位」「NO.1」等のエビデンス必須表現を自動検出（Issue #36対応）
- ✅ **Web UI + API**: フロントエンドとバックエンドAPI両対応
- ✅ **本番環境対応**: Railway/Dockerデプロイ対応
- ✅ **完全ドキュメント**: セットアップから運用まで9種類の納品ドキュメント完備

---

## 🏢 プロジェクト情報

**開発元**: 株式会社EptaEight
**バージョン**: v1.0
**納品日**: 2025年10月30日
**リポジトリ**: https://github.com/ryu220/kitanoadchecker

## 📞 サポート

技術的なお問い合わせや不具合報告は、納品ドキュメントをご参照ください。

---

**🎯 本番環境対応完了 - すぐに使用可能です**
