# セットアップガイド

**対象**: 開発環境・ローカル環境のセットアップ
**所要時間**: 約30分
**前提条件**: Node.js 18以上、Docker、Git

---

## 📋 目次

1. [前提条件の確認](#前提条件の確認)
2. [リポジトリのクローン](#リポジトリのクローン)
3. [依存関係のインストール](#依存関係のインストール)
4. [環境変数の設定](#環境変数の設定)
5. [ChromaDBの起動](#chromadbの起動)
6. [ナレッジベースの初期化](#ナレッジベースの初期化)
7. [開発サーバーの起動](#開発サーバーの起動)
8. [動作確認](#動作確認)
9. [トラブルシューティング](#トラブルシューティング)

---

## 前提条件の確認

### 必須ソフトウェア

| ソフトウェア | 必須バージョン | 確認コマンド |
|------------|--------------|-------------|
| **Node.js** | 18.0.0 以上 | `node --version` |
| **npm** | 9.0.0 以上 | `npm --version` |
| **Docker** | 20.0.0 以上 | `docker --version` |
| **Docker Compose** | 2.0.0 以上 | `docker-compose --version` |
| **Git** | 2.0.0 以上 | `git --version` |

### 環境確認

```bash
# Node.jsバージョン確認
node --version
# 出力例: v18.17.0

# npmバージョン確認
npm --version
# 出力例: 9.8.1

# Dockerバージョン確認
docker --version
# 出力例: Docker version 24.0.6

# Docker Composeバージョン確認
docker-compose --version
# 出力例: Docker Compose version v2.21.0
```

---

## リポジトリのクローン

```bash
# HTTPSでクローン
git clone https://github.com/ryu220/kitanoadchecker.git

# SSH でクローン（推奨）
git clone git@github.com:ryu220/kitanoadchecker.git

# ディレクトリに移動
cd kitanoadchecker
```

---

## 依存関係のインストール

```bash
# npm パッケージのインストール
npm install

# インストール確認
npm list --depth=0
```

### 主要パッケージ

| パッケージ | バージョン | 用途 |
|-----------|----------|------|
| next | 14.2.33 | Webフレームワーク |
| react | 18.3.1 | UIライブラリ |
| chromadb | 1.8.1 | Vector Database |
| @google/generative-ai | 最新 | Gemini API |
| typescript | 5.5.x | 型安全性 |

---

## 環境変数の設定

### 1. .env ファイルの作成

```bash
# .env.example をコピー
cp .env.example .env

# エディタで開く
nano .env  # または code .env, vim .env
```

### 2. 必須環境変数の設定

**.env ファイル**:
```bash
# ================================================
# 🔐 API Keys（必須）
# ================================================

# Google Gemini API Key
# 取得方法: https://ai.google.dev/
GEMINI_API_KEY=AIzaSy...（あなたのAPIキー）

# ================================================
# 📊 ChromaDB設定
# ================================================

# ChromaDB接続URL
CHROMA_URL=http://localhost:8000

# Collection名
CHROMA_COLLECTION_NAME=kitano_knowledge

# ================================================
# 🛠️ アプリケーション設定
# ================================================

# 動作モード
NODE_ENV=development

# Next.js ポート
PORT=3000

# ================================================
# 📁 ファイルパス設定
# ================================================

# ナレッジベースディレクトリ
KNOWLEDGE_BASE_PATH=./knowledge

# 商品マスタパス
PRODUCT_CONFIG_PATH=./config/products
```

### 3. APIキーの取得方法

#### Google Gemini API Key

1. https://ai.google.dev/ にアクセス
2. 「Get API Key」をクリック
3. Google アカウントでログイン
4. API Keyを生成
5. `.env` の `GEMINI_API_KEY` に設定

---

## ChromaDBの起動

### Docker Composeで起動

```bash
# ChromaDBコンテナを起動
docker-compose up -d chroma

# 起動確認
docker-compose ps

# 出力例:
# NAME                COMMAND                  SERVICE   STATUS    PORTS
# chroma              "uvicorn chromadb.ap…"   chroma    running   0.0.0.0:8000->8000/tcp
```

### 動作確認

```bash
# ChromaDB ヘルスチェック
curl http://localhost:8000/api/v1/heartbeat

# 成功時の出力:
# {"nanosecond heartbeat": 1730000000000000000}
```

---

## ナレッジベースの初期化

### Vector DBにナレッジを格納

```bash
# ナレッジベース初期化スクリプトを実行
npm run setup:vector-db

# 実行時間: 約3-5分
# 処理内容: 1,333ドキュメントをChromaDBに格納
```

### 初期化プロセス

```
[1/4] knowledge/ ディレクトリ読み込み...
├── common/ (100+ファイル)
├── HA/ (11ファイル)
└── SH/ (8ファイル)

[2/4] ドキュメント分割・埋め込み生成...
├── 優先度マッピング適用
├── メタデータ付与
└── Vector化（OpenAI Embeddings）

[3/4] ChromaDB格納...
└── Collection: kitano_knowledge

[4/4] 完了
✅ 1,333 documents indexed successfully
```

### 確認

```bash
# ChromaDB内のドキュメント数確認
curl http://localhost:8000/api/v1/collections/kitano_knowledge/count

# 期待値: {"count": 1333}
```

---

## 開発サーバーの起動

```bash
# 開発サーバーを起動
npm run dev

# 出力:
#  ▲ Next.js 14.2.33
#  - Local:   http://localhost:3000
#  - Ready in 2.3s
```

### 起動確認

ブラウザで以下にアクセス:
- **メイン画面**: http://localhost:3000
- **APIヘルスチェック**: http://localhost:3000/api/health

---

## 動作確認

### 1. Web UIでのテスト

1. http://localhost:3000 にアクセス
2. 商品選択: 「SH（クリアストロングショット アルファ）」
3. テスト広告文を入力:

```
汚い爪をキレイにする殺菌ジェル。

Amazon・楽天で1位を獲得した人気商品です。

全額返金保証も付いて安心です。
```

4. 「判定実行」ボタンをクリック

### 2. 期待される判定結果

```
セグメント 1
不適合
汚い爪をキレイにする殺菌ジェル。

【薬機法違反】（重大）
「殺菌」には作用機序であることを明示する注釈が必須

【修正案】
殺菌※ジェル ※殺菌は消毒の作用機序として

---

セグメント 2
不適合
Amazon・楽天で1位を獲得した人気商品です。

【景表法違反】（重大）
ランキング・順位表現には調査機関・期間・対象を明記したエビデンスが必須

【修正案】
Amazon・楽天で1位※を獲得した人気商品です。
※2024年1月Amazon・楽天ランキング調査

---

セグメント 3
不適合
全額返金保証も付いて安心です。

【薬機法違反】（中程度）
「全額返金保証」には詳細条件の明示が必須

【修正案】
全額返金保証※も付いて安心です。
※詳細は遷移先ページに記載
```

### 3. APIでのテスト

```bash
# セグメント分割API
curl -X POST http://localhost:3000/api/v2/segment \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Amazon・楽天で1位を獲得した人気商品です。",
    "productId": "SH",
    "apiKey": "test"
  }'

# 評価API
curl -X POST http://localhost:3000/api/v2/evaluate-batch \
  -H "Content-Type: application/json" \
  -d '{
    "segments": [
      {
        "id": "seg-1",
        "text": "Amazon・楽天で1位を獲得した人気商品です。",
        "type": "explanation"
      }
    ],
    "productId": "SH",
    "apiKey": "test"
  }'
```

---

## トラブルシューティング

### 問題1: ChromaDBに接続できない

**症状**:
```
Error: Failed to connect to ChromaDB at http://localhost:8000
```

**原因**: ChromaDBコンテナが起動していない

**解決策**:
```bash
# コンテナ状態確認
docker-compose ps

# 停止している場合は起動
docker-compose up -d chroma

# ログ確認
docker-compose logs chroma
```

### 問題2: Gemini API エラー

**症状**:
```
Error: API key not valid. Please pass a valid API key.
```

**原因**: GEMINI_API_KEY が設定されていないか、無効

**解決策**:
```bash
# .env ファイルを確認
cat .env | grep GEMINI_API_KEY

# APIキーが正しく設定されているか確認
# 必要に応じて https://ai.google.dev/ で新しいキーを取得
```

### 問題3: ナレッジベース初期化エラー

**症状**:
```
Error: Failed to load knowledge files
```

**原因**: knowledge/ ディレクトリが存在しないか、ファイルが不足

**解決策**:
```bash
# knowledge/ ディレクトリ確認
ls -la knowledge/

# 期待される構造:
# knowledge/
# ├── common/  (100+ファイル)
# ├── HA/      (11ファイル)
# └── SH/      (8ファイル)

# ファイル数確認
find knowledge/ -type f | wc -l
# 期待値: 119以上
```

### 問題4: ポート競合

**症状**:
```
Error: Port 3000 is already in use
```

**解決策**:
```bash
# ポート使用状況確認
lsof -i :3000

# 既存プロセスを停止するか、別のポートを使用
PORT=3001 npm run dev
```

### 問題5: npm install エラー

**症状**:
```
npm ERR! code ERESOLVE
```

**解決策**:
```bash
# node_modules削除して再インストール
rm -rf node_modules package-lock.json
npm install

# それでも失敗する場合は legacy peer deps を使用
npm install --legacy-peer-deps
```

---

## 環境チェックツール

### 自動チェックスクリプト

```bash
# 環境確認スクリプト実行
npm run check:environment

# 出力例:
# ✅ Node.js version: v18.17.0
# ✅ npm version: 9.8.1
# ✅ Docker is running
# ✅ ChromaDB is accessible
# ✅ .env file exists
# ✅ GEMINI_API_KEY is set
# ⚠️  Vector DB not initialized (run: npm run setup:vector-db)
```

---

## 次のステップ

セットアップが完了したら、以下のドキュメントを参照してください:

- **使い方マニュアル**: `03_OPERATION_MANUAL.md`
- **本番環境デプロイ**: `05_DEPLOYMENT_RAILWAY.md`
- **トラブルシューティング**: `06_TROUBLESHOOTING.md`

---

**作成日**: 2025年10月30日
**対象バージョン**: v1.0
**更新**: セットアップ手順確定
