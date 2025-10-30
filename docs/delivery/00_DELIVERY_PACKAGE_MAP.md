# 納品物パッケージマップ

**バージョン**: v1.0
**納品日**: 2025年10月30日
**リポジトリ**: https://github.com/ryu220/kitanoadchecker

---

## 📋 目次

1. [納品物の全体構成](#納品物の全体構成)
2. [ソースコード一式](#ソースコード一式)
3. [環境設定ファイル](#環境設定ファイル)
4. [プロンプト群・ルール設定](#プロンプト群ルール設定)
5. [ナレッジベース](#ナレッジベース)
6. [テストケース](#テストケース)
7. [デプロイ関連ファイル](#デプロイ関連ファイル)
8. [ドキュメント](#ドキュメント)

---

## 納品物の全体構成

```
kitanoadchecker/
├── 📁 app/                    # Next.js アプリケーション（UIとAPI）
├── 📁 components/             # React UIコンポーネント
├── 📁 lib/                    # コアロジック・ビジネスロジック
├── 📁 config/                 # 商品設定・キーワード設定
├── 📁 knowledge/              # ナレッジベース（130ファイル、5.1MB）
├── 📁 scripts/                # セットアップ・運用スクリプト
├── 📁 docs/delivery/          # 納品ドキュメント（7ファイル）
├── 📁 public/                 # 静的ファイル
├── 📄 package.json            # 依存関係とスクリプト定義
├── 📄 .env.example            # 環境変数テンプレート
├── 📄 docker-compose.yml      # Docker構成ファイル
├── 📄 Dockerfile              # コンテナイメージ定義
├── 📄 README.md               # プロジェクト概要
└── 📄 RESTORE_POINT_20251030.md  # 緊急復元ポイント
```

---

## 1. ソースコード一式

### 1.1 アプリケーション本体（app/）

| ファイルパス | 役割 | 重要度 |
|------------|------|--------|
| **app/page.tsx** | メインUI（商品選択・広告文入力・結果表示） | ⭐⭐⭐ |
| **app/layout.tsx** | アプリケーションレイアウト | ⭐⭐ |
| **app/globals.css** | グローバルスタイル | ⭐ |

### 1.2 API エンドポイント（app/api/）

| エンドポイント | ファイル | 役割 | 重要度 |
|--------------|---------|------|--------|
| **GET /api/health** | app/api/health/route.ts | ヘルスチェック | ⭐⭐ |
| **POST /api/v2/segment** | app/api/v2/segment/route.ts | 広告文のセグメント分割 | ⭐⭐⭐ |
| **POST /api/v2/evaluate** | app/api/v2/evaluate/route.ts | 単一セグメント評価 | ⭐⭐⭐ |
| **POST /api/v2/evaluate-batch** | app/api/v2/evaluate-batch/route.ts | 複数セグメント一括評価 | ⭐⭐⭐ |
| **POST /api/v2/report** | app/api/v2/report/route.ts | 総合レポート生成 | ⭐⭐⭐ |
| **POST /api/v2/validate-api-key** | app/api/v2/validate-api-key/route.ts | ユーザーAPIキー検証 | ⭐⭐ |
| **GET /api/v2/test-rag-search** | app/api/v2/test-rag-search/route.ts | RAG検索テスト（開発用） | ⭐ |

### 1.3 UIコンポーネント（components/）

| ファイル | 役割 | 重要度 |
|---------|------|--------|
| **ProductSelectorV2.tsx** | 商品選択UI | ⭐⭐⭐ |
| **ReportDisplayV2.tsx** | 判定結果表示UI | ⭐⭐⭐ |
| **ProgressTrackerV2.tsx** | 処理進捗表示 | ⭐⭐ |
| **ApiKeyModal.tsx** | APIキー入力モーダル | ⭐⭐ |
| **AppSpecifications.tsx** | アプリ仕様説明 | ⭐ |

### 1.4 コアロジック（lib/）

#### 1.4.1 AI・評価エンジン

| ファイル | 役割 | 行数 | 重要度 |
|---------|------|------|--------|
| **gemini-client.ts** | Gemini API クライアント | 578 | ⭐⭐⭐ |
| **rag-search.ts** | RAG検索サービス | - | ⭐⭐⭐ |
| **rag-engine.ts** | RAG検索エンジン | - | ⭐⭐⭐ |
| **embedding-service.ts** | Embedding生成サービス | - | ⭐⭐⭐ |

#### 1.4.2 ナレッジ管理

| ファイル | 役割 | 重要度 |
|---------|------|--------|
| **knowledge-loader.ts** | ナレッジファイル読込 | ⭐⭐⭐ |
| **knowledge-chunker.ts** | ナレッジチャンク分割 | ⭐⭐⭐ |
| **knowledge-mapping.ts** | ナレッジ優先度マッピング | ⭐⭐ |
| **priority-mapping-loader.ts** | 優先度設定読込 | ⭐⭐ |

#### 1.4.3 バリデーター

| ファイル | 役割 | 重要度 |
|---------|------|--------|
| **ng-keyword-validator.ts** | NGキーワード検証メインロジック | ⭐⭐⭐ |
| **annotation-analyzer.ts** | 注釈分析 | ⭐⭐⭐ |
| **guinness-record-validator.ts** | ギネス記録検証 | ⭐⭐ |
| **knowledge-excerpt-validator.ts** | ナレッジ引用検証 | ⭐⭐ |

#### 1.4.4 NGキーワード定義（lib/ng-keywords/）

| ファイル | 内容 | キーワード数 | 重要度 |
|---------|------|-------------|--------|
| **absolute-ng.ts** | 絶対NGキーワード | 28 | ⭐⭐⭐ |
| **conditional-ng.ts** | 条件付NGキーワード（Issue #36対応含む） | 27 | ⭐⭐⭐ |
| **context-dependent-ng.ts** | 文脈依存NGキーワード | 7 | ⭐⭐⭐ |
| **keyword-matcher.ts** | キーワードマッチングロジック | - | ⭐⭐⭐ |

#### 1.4.5 プロンプト（lib/prompts/）

| ファイル | 役割 | 行数 | 重要度 |
|---------|------|------|--------|
| **evaluation-prompt-command-stack.ts** | Gemini評価用コマンドスタックプロンプト | 481 | ⭐⭐⭐ |

#### 1.4.6 その他コアファイル

| ファイル | 役割 | 重要度 |
|---------|------|--------|
| **types.ts / types-v2.ts** | TypeScript型定義 | ⭐⭐⭐ |
| **segment-builder.ts** | セグメント構築 | ⭐⭐ |
| **batch-embedder.ts** | バッチEmbedding生成 | ⭐⭐ |

---

## 2. 環境設定ファイル

### 2.1 環境変数

| ファイル | 役割 | 重要度 |
|---------|------|--------|
| **.env.example** | 環境変数テンプレート（必読） | ⭐⭐⭐ |
| **.env** | 実際の環境変数（Git管理外、各自作成） | ⭐⭐⭐ |

**必須環境変数**:
```bash
# ローカル開発時のみ必要（Vector DB初期化用）
GEMINI_API_KEY=your_api_key_here

# ChromaDB接続先
CHROMA_URL=http://localhost:8000  # ローカル
CHROMA_URL=http://chroma:8000     # 本番（Docker内部）
```

**重要**: 本番環境ではユーザーがUI経由でGEMINI_API_KEYを提供するため、サーバー側でのGEMINI_API_KEY設定は不要です。

### 2.2 依存関係

| ファイル | 役割 | 重要度 |
|---------|------|--------|
| **package.json** | npm依存関係とスクリプト定義 | ⭐⭐⭐ |
| **package-lock.json** | 依存関係ロック | ⭐⭐ |
| **tsconfig.json** | TypeScript設定 | ⭐⭐ |
| **next.config.js** | Next.js設定 | ⭐⭐ |

---

## 3. プロンプト群・ルール設定

### 3.1 プロンプトファイル

| 場所 | 内容 | 詳細 |
|------|------|------|
| **lib/prompts/evaluation-prompt-command-stack.ts** | Gemini評価用プロンプト | コマンドスタック形式（C1-C11）、Few-shot例6パターン |

**プロンプト構造**:
- **[C1]**: セグメント情報理解
- **[C2]**: 知識ベースルール適用前提確認
- **[C2.5]**: エビデンス必須表現検証（最優先）
- **[C3]**: NGキーワードパターン分析
- **[C4]**: 注釈マーカー検証
- **[C5]**: 期間表記検証
- **[C6]**: 複合違反パターン検出
- **[C7-C10]**: 違反内容詳細分析
- **[C11]**: JSON形式レスポンス生成

### 3.2 NGキーワードルール

| 場所 | タイプ | キーワード数 |
|------|-------|-------------|
| **lib/ng-keywords/absolute-ng.ts** | 絶対NG | 28 |
| **lib/ng-keywords/conditional-ng.ts** | 条件付NG | 27（Issue #36: ランキング表現含む） |
| **lib/ng-keywords/context-dependent-ng.ts** | 文脈依存NG | 7 |

**合計**: 62キーワード

**Issue #36対応（ランキング表現）**:
```typescript
{
  keyword: ['1位', '第1位', '第一位', '一位', 'NO.1', 'No.1', 'ナンバーワン', 'トップ', 'TOP'],
  category: 'guarantee',
  requiredAnnotation: /※.{0,100}(調査|ランキング|集計|Amazon|楽天|Yahoo)/,
  description: 'ランキング・順位表現には景表法により調査機関・調査期間・調査対象を明記したエビデンスが必須です',
  severity: 'high',
}
```

### 3.3 商品別ルール

| 場所 | 内容 |
|------|------|
| **config/products/HA.json** | ヒアロディープパッチの商品設定・注釈ルール |
| **config/products/SH.json** | クリアストロングショット アルファの商品設定・注釈ルール |

**HA.json 例**:
```json
{
  "id": "HA",
  "name": "ヒアロディープパッチ",
  "category": "化粧品",
  "approvedEffects": "56項目",
  "annotationRules": {
    "エイジングケア": {
      "required": true,
      "template": "※年齢に応じた保湿のこと",
      "severity": "medium"
    }
  }
}
```

---

## 4. ナレッジベース

### 4.1 構成

| ディレクトリ | ファイル数 | サイズ | 内容 |
|-------------|-----------|--------|------|
| **knowledge/common/** | 120 | 4.76MB | 全商品共通の法規制・ガイドライン |
| **knowledge/HA/** | 7 | 323KB | ヒアロディープパッチ専用ナレッジ |
| **knowledge/SH/** | 3 | 49KB | クリアストロングショット専用ナレッジ |
| **合計** | **130** | **5.13MB** | - |

### 4.2 主要ナレッジファイル（一部抜粋）

#### 共通ナレッジ（knowledge/common/）

| ファイル名 | 内容 | 重要度 |
|-----------|------|--------|
| 01_薬事に関する資料.txt | 薬機法基本規制 | ⭐⭐⭐ |
| 03_景表法について.txt | 景表法基本規制 | ⭐⭐⭐ |
| 37_エビデンス表記について.txt | ランキング表現等のエビデンス要件 | ⭐⭐⭐ |
| 44_ギネス世界記録™について.txt | ギネス記録使用ルール | ⭐⭐ |
| 消費者庁_不当景品類及び不当表示防止法～.txt | 景表法関連通達 | ⭐⭐⭐ |
| 厚生労働省_医薬品等適正広告基準～.txt | 薬機法関連通達 | ⭐⭐⭐ |

#### HA専用ナレッジ（knowledge/HA/）

| ファイル名 | 内容 |
|-----------|------|
| 55_【薬事・景表法・社内ルールまとめ】『ヒアロディープパッチ』.txt | HA商品専用総合ガイド（34.7KB） |
| 日本化粧品工業連合会_化粧品等の適正広告ガイドライン（2020年版）_202005.txt | 化粧品広告ガイドライン |

#### SH専用ナレッジ（knowledge/SH/）

| ファイル名 | 内容 |
|-----------|------|
| 77_【薬事・景表法・社内ルールまとめ】薬用『クリアストロングショット アルファ』.txt | SH商品専用総合ガイド |
| 日本OTC医薬品協会_OTC医薬品等の適正広告ガイドライン～.txt | OTC医薬品広告ガイドライン |

### 4.3 ナレッジ優先度マッピング

| ファイル | 役割 |
|---------|------|
| **config/knowledge-priority-mapping.csv** | ナレッジファイルの優先度定義（1-3） |

**優先度の意味**:
- **3**: 最高（商品専用ルール）
- **2**: 高（重要な法規制）
- **1**: 中（一般的なガイドライン）

### 4.4 Chunking設定

- **maxChunkSize**: 800 tokens（約1,600文字）
- **minChunkSize**: 300 tokens（約600文字）
- **overlap**: 100 tokens（約200文字）
- **分割単位**: 見出し（## または ###）

**推定Chunk数**: 約5,129 chunks（130ファイルから生成）

### 4.5 ナレッジ格納方法

#### 初回セットアップ（ローカル）
```bash
# 1. ChromaDB起動
docker-compose up -d chroma

# 2. Vector DB初期化（embeddings生成）
npm run setup:vector-db
# 所要時間: 約5-10分
# 生成される: 5,129 chunks + embeddings
```

#### ナレッジ追加・更新
```bash
# 1. knowledge/ ディレクトリにファイル追加/編集

# 2. 既存データクリア + 再生成
npm run setup:vector-db:clear

# 3. 動作確認
npm run dev
```

#### 本番環境（Koyeb/Docker）
```bash
# Dockerfile内で自動実行される
# scripts/startup.sh が SETUP_VECTOR_DB=true の場合に初期化
```

---

## 5. テストケース

### 5.1 フロントエンドテストケース

| ファイル | 内容 | テスト対象 |
|---------|------|-----------|
| **frontend_test_guinness_ok1.json** | ギネス表記OK例（正しい期間） | ギネス記録検証 |
| **frontend_test_guinness_ok2.json** | ギネス表記OK例（別パターン） | ギネス記録検証 |
| **frontend_test_guinness_ng1.json** | ギネス表記NG例（期間不正） | ギネス記録検証 |
| **frontend_test_guinness_ng2.json** | ギネス表記NG例（別パターン） | ギネス記録検証 |
| **frontend_test_guinness_ng3.json** | ギネス表記NG例（別パターン） | ギネス記録検証 |

### 5.2 ユニットテスト

| ディレクトリ | テスト数 | カバレッジ目標 |
|-------------|---------|---------------|
| lib/**/*.test.ts | 185+ | 80%+ |

**主要テストファイル**:
- gemini-client.test.ts
- guinness-record-validator.test.ts
- knowledge-excerpt-validator.test.ts
- annotation-analyzer.test.ts
- ng-keyword-validator.test.ts

### 5.3 テスト実行

```bash
# 全テスト実行
npm test

# カバレッジレポート生成
npm run test:coverage

# ギネス表記フロントエンドテスト
npm run test:guinness-frontend
```

### 5.4 代表テストケース（各商品10-20件）

**作成予定**: docs/delivery/TEST_CASES.md
- HA商品: 15件のテストケース
- SH商品: 15件のテストケース
- 共通: 10件のテストケース

---

## 6. デプロイ関連ファイル

### 6.1 Docker関連

| ファイル | 役割 | 重要度 |
|---------|------|--------|
| **docker-compose.yml** | ローカル開発用Docker構成 | ⭐⭐⭐ |
| **Dockerfile** | 本番環境コンテナイメージ定義 | ⭐⭐⭐ |
| **.dockerignore** | Docker buildから除外するファイル | ⭐⭐ |
| **scripts/startup.sh** | コンテナ起動スクリプト | ⭐⭐⭐ |

#### docker-compose.yml構成
```yaml
services:
  chroma:    # ChromaDB（Vector Database）
  web:       # Next.jsアプリケーション
```

#### Dockerfile構成
- **マルチステージビルド**（deps → builder → runner）
- **非rootユーザー実行**（nextjs:nodejs）
- **ヘルスチェック**: /api/health

### 6.2 スクリプト（scripts/）

| ファイル | 役割 | 実行タイミング |
|---------|------|---------------|
| **setup-vector-db.ts** | Vector DB初期化 | 初回セットアップ時 |
| **check-environment.ts** | 環境確認ツール | 環境構築時・トラブル時 |
| **startup.sh** | コンテナ起動処理 | コンテナ起動時（自動） |

### 6.3 デプロイ先

| 環境 | プラットフォーム | 設定ファイル |
|------|----------------|-------------|
| **本番環境** | Koyeb | docker-compose.yml, Dockerfile |
| **ローカル開発** | Docker Desktop | docker-compose.yml |

**注意**: Railwayは使用していません。Koyebでのデプロイを前提としています。

---

## 7. ドキュメント

### 7.1 納品ドキュメント（docs/delivery/）

| ファイル | 対象読者 | 内容 | 重要度 |
|---------|---------|------|--------|
| **00_DELIVERY_PACKAGE_MAP.md** | 全員 | 本ファイル（納品物マップ） | ⭐⭐⭐ |
| **01_OVERVIEW.md** | 全員 | システム概要・機能説明・導入効果 | ⭐⭐⭐ |
| **02_SETUP_GUIDE.md** | 開発者・運用 | 環境構築手順（約30分） | ⭐⭐⭐ |
| **03_OPERATION_MANUAL.md** | 運用・エンドユーザー | 日常運用・操作方法 | ⭐⭐⭐ |
| **04_ISSUE_36_FIX.md** | 開発者 | ランキング表現検出機能の技術詳細 | ⭐⭐ |
| **05_FEATURE_LIST.md** | 全員 | 全機能一覧・チェック項目詳細 | ⭐⭐⭐ |
| **06_TROUBLESHOOTING.md** | 運用 | トラブルシューティング・FAQ | ⭐⭐⭐ |

### 7.2 その他ドキュメント

| ファイル | 内容 | 重要度 |
|---------|------|--------|
| **README.md** | プロジェクト概要・クイックスタート | ⭐⭐⭐ |
| **RESTORE_POINT_20251030.md** | システム完全復元ポイント | ⭐⭐ |

---

## 8. 納品物チェックリスト

### 8.1 必須ファイル

- [x] ソースコード一式（app/, components/, lib/, config/）
- [x] ナレッジベース（knowledge/、130ファイル、5.13MB）
- [x] プロンプト群（lib/prompts/）
- [x] NGキーワードルール（lib/ng-keywords/）
- [x] 商品設定（config/products/）
- [x] 環境設定ファイル（.env.example, package.json）
- [x] デプロイ設定（docker-compose.yml, Dockerfile）
- [x] セットアップスクリプト（scripts/setup-vector-db.ts）
- [x] ドキュメント（docs/delivery/、7ファイル）
- [x] テストケース（frontend_test_*.json）
- [x] README.md（完全版）

### 8.2 動作確認項目

- [x] ローカル環境でのビルド成功
- [x] Docker Composeでの起動成功
- [x] Vector DB初期化成功（5,129 chunks生成）
- [x] Web UI動作確認
- [x] API動作確認
- [x] ランキング表現検出確認（Issue #36）
- [x] ギネス記録検証確認

---

## 9. セットアップから運用開始までの流れ

### ステップ1: リポジトリクローン
```bash
git clone https://github.com/ryu220/kitanoadchecker.git
cd kitanoadchecker
```

### ステップ2: 環境設定
```bash
cp .env.example .env
# .env を編集してGEMINI_API_KEYを設定
```

### ステップ3: 依存関係インストール
```bash
npm install
```

### ステップ4: ChromaDB起動
```bash
docker-compose up -d chroma
```

### ステップ5: Vector DB初期化
```bash
npm run setup:vector-db
# 所要時間: 5-10分
# 5,129 chunks生成
```

### ステップ6: 開発サーバー起動
```bash
npm run dev
# http://localhost:3000 にアクセス
```

### ステップ7: 動作確認
- 商品選択: SH（クリアストロングショット アルファ）
- テスト広告文入力
- 判定実行
- 結果確認

### ステップ8: 本番デプロイ（Koyeb）
詳細は **docs/delivery/02_SETUP_GUIDE.md** の「本番デプロイ」セクション参照

---

## 10. サポート・問い合わせ

### GitHub Issues
https://github.com/ryu220/kitanoadchecker/issues

### 関連ドキュメント参照順序
1. **00_DELIVERY_PACKAGE_MAP.md**（本ファイル） - 全体把握
2. **01_OVERVIEW.md** - システム理解
3. **02_SETUP_GUIDE.md** - 環境構築
4. **03_OPERATION_MANUAL.md** - 日常運用
5. **06_TROUBLESHOOTING.md** - 問題発生時

---

**作成日**: 2025年10月30日
**バージョン**: v1.0
**対象システム**: 広告文リーガルチェックツール v1.0

**🎯 本ドキュメントで納品物の全ファイル・役割・使用方法が完全に把握できます**
