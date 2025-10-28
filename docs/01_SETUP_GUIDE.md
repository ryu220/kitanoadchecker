# 01. セットアップガイド - Setup Guide

## 概要

このガイドは、**kitanoadchecker**（広告文リーガルチェックツール）を初めてセットアップする際の詳細な手順を説明します。

## 前提条件 (Prerequisites)

### 必須環境

以下のソフトウェアがインストールされている必要があります：

#### 1. **Node.js 18以上**

```bash
# バージョン確認
node --version
# v18.0.0以上であることを確認

npm --version
# 9.0.0以上であることを確認
```

**インストール方法:**
- 公式サイト: https://nodejs.org/
- 推奨: LTS版（Long Term Support）

#### 2. **Docker & Docker Compose**

ChromaDB（Vector Database）の実行に必要です。

```bash
# バージョン確認
docker --version
# Docker version 20.10.0以上

docker-compose --version
# Docker Compose version 2.0.0以上
```

**インストール方法:**
- Windows: Docker Desktop for Windows
- macOS: Docker Desktop for Mac
- Linux: Docker Engine + Docker Compose

公式サイト: https://www.docker.com/get-started

#### 3. **Git**

```bash
# バージョン確認
git --version
```

**インストール方法:**
- 公式サイト: https://git-scm.com/

#### 4. **Gemini API Key**

Google AI Studioから取得します。

**取得手順:**
1. https://aistudio.google.com/app/apikey にアクセス
2. Googleアカウントでログイン
3. 「Create API Key」をクリック
4. APIキーをコピー（後で使用）

**注意:**
- APIキーは秘密情報です。第三者と共有しないでください
- `.env`ファイルに保存し、Gitにコミットしないこと

---

## ステップ1: プロジェクトのクローン

```bash
# GitHubからプロジェクトをクローン
git clone https://github.com/your-org/kitanoadchecker.git

# プロジェクトディレクトリに移動
cd kitanoadchecker
```

---

## ステップ2: 依存パッケージのインストール

```bash
# Node.jsパッケージをインストール
npm install
```

**実行時間:** 約1〜3分

**確認:**
```bash
# node_modulesディレクトリが作成されたことを確認
ls node_modules
```

---

## ステップ3: 環境変数の設定

### 3-1. `.env`ファイルの作成

```bash
# .env.exampleをコピーして.envを作成
cp .env.example .env
```

### 3-2. `.env`ファイルの編集

エディタで`.env`ファイルを開き、以下の値を設定します：

```bash
# ==================================
# Environment Variables for Local Development
# ==================================

# Gemini API Key (必須 - Vector DB セットアップ時のみ)
# 取得先: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your_actual_gemini_api_key_here

# ChromaDB URL (ローカル開発時)
CHROMA_URL=http://localhost:8000

# Node Environment
NODE_ENV=development
```

**重要:**
- `GEMINI_API_KEY`は**Vector DBセットアップ時のみ必要**です
- アプリケーション実行時は、ユーザーがUIでAPIキーを入力します
- 本番環境（Railway等）では、`GEMINI_API_KEY`を環境変数に設定**しないでください**

---

## ステップ4: ChromaDB (Vector Database) の起動

### 4-1. Docker Composeでサービス起動

```bash
# ChromaDBをバックグラウンドで起動
docker-compose up chroma -d
```

**実行内容:**
- ChromaDBコンテナをダウンロード（初回のみ）
- ポート8000でChromaDBを起動
- データ永続化用Volumeを作成

### 4-2. 起動確認

```bash
# コンテナの状態を確認
docker-compose ps

# 期待される出力:
# NAME                COMMAND             SERVICE   STATUS    PORTS
# ad_checker_chroma   ...                 chroma    Up        0.0.0.0:8000->8000/tcp
```

**ヘルスチェック:**
```bash
# ChromaDBのヘルスチェックエンドポイントにアクセス
curl http://localhost:8000/api/v1/heartbeat

# 期待される出力:
# {"nanosecond heartbeat":...}
```

### 4-3. トラブルシューティング

**エラー: ポート8000が既に使用されている**

```bash
# 既存のプロセスを確認
# Windows:
netstat -ano | findstr :8000

# macOS/Linux:
lsof -i :8000

# 該当プロセスを停止するか、.envでポートを変更
CHROMA_URL=http://localhost:8001
```

**エラー: Docker Daemonが起動していない**

```bash
# Docker Desktopを起動してください
# Windows: Docker Desktopアプリを起動
# macOS: Dockerアプリケーションを起動
# Linux: sudo systemctl start docker
```

---

## ステップ5: Vector Database の初期化

### 5-1. ナレッジベースをChromaDBに登録

```bash
# Vector DBセットアップスクリプトを実行
npm run setup:vector-db
```

**実行内容:**
1. `knowledge/`ディレクトリ内の全ナレッジファイルを読み込み
2. Gemini APIでEmbedding（ベクトル）を生成
3. ChromaDBに保存

**実行時間:** 約3〜5分（ナレッジファイル数により変動）

**進捗表示:**
```
================================================================================
🚀 Vector DB Setup Started
================================================================================

📌 Configuration:
   Gemini API Key: AIzaSyCxxx...
   ChromaDB URL: http://localhost:8000
   Clear existing data: false

📦 Initializing services...
✅ Services initialized (with Issue #32 priority metadata)

🔌 Connecting to Vector DB...
📚 Loading knowledge files with priority metadata...
✅ Loaded 131 files total

✂️  Chunking files...
✅ Total chunks created: 1,333

🧮 Generating embeddings...
   This may take a few minutes for 1,333 chunks...
✅ Successfully generated embeddings for 1,333 chunks

💾 Saving to Vector DB...
✅ Successfully saved 1,333 documents to Vector DB

📊 Priority breakdown:
   - P1 (Company Standards): 125 chunks
   - P2 (Laws): 556 chunks
   - P3 (Guidelines): 583 chunks

✅ Vector database setup complete!
⏱️  Total time: 3m 24s
```

### 5-2. セットアップ確認

```bash
# 環境チェックツールを実行
npm run check-env
```

**期待される出力:**
```
🔍 Environment Check Started
================================================================================

✅ Node Modules: Installed
✅ .env file: Exists
✅ Knowledge files: 131 files found
✅ Docker Compose: Installed
✅ ChromaDB: Running (http://localhost:8000)
✅ Vector DB: Data exists (1,333 chunks)

🎉 Environment is ready for development!
```

---

## ステップ6: 開発サーバーの起動

```bash
# Next.js開発サーバーを起動
npm run dev
```

**実行内容:**
- Next.jsアプリケーションをポート3000で起動
- Hot Reloadが有効（ファイル変更時に自動再読み込み）

**起動確認:**
```
  ▲ Next.js 14.2.0
  - Local:        http://localhost:3000
  - Environments: .env

 ✓ Ready in 2.3s
```

---

## ステップ7: ブラウザでアクセス

### 7-1. アプリケーションを開く

ブラウザで以下のURLにアクセス:

```
http://localhost:3000
```

### 7-2. 動作確認

**テスト用広告文:**
```
ヒアルロン酸配合。目元の小じわに効果的。
今ならお試し価格1,980円。
```

**手順:**
1. 広告文をテキストエリアに入力
2. 商品を選択（例: HA - ヒアロディープパッチ）
3. Gemini APIキーを入力
4. 「チェック開始」ボタンをクリック
5. 結果レポートが表示されることを確認

**期待される結果:**
- セグメント分割が実行される
- 各セグメントに対する法令チェック結果が表示される
- 違反がある場合は修正案が提示される

---

## ステップ8: APIテスト（オプション）

### cURLでAPIをテスト

```bash
# セグメント分割API
curl -X POST http://localhost:3000/api/v2/segment \
  -H "Content-Type: application/json" \
  -d '{
    "full_text": "ヒアルロン酸配合。シワに効く。",
    "productId": "HA",
    "apiKey": "YOUR_GEMINI_API_KEY"
  }'

# 評価API
curl -X POST http://localhost:3000/api/v2/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "segments": [
      {
        "id": "seg_1",
        "text": "ヒアルロン酸配合",
        "type": "claim",
        "position": {"start": 0, "end": 9}
      }
    ],
    "productId": "HA",
    "apiKey": "YOUR_GEMINI_API_KEY"
  }'
```

---

## 次のステップ

セットアップが完了したら、以下のドキュメントを参照してください：

- **[02_DEPLOYMENT_RAILWAY.md](./02_DEPLOYMENT_RAILWAY.md)** - Railwayへの本番デプロイ
- **[03_DEPLOYMENT_DOCKER.md](./03_DEPLOYMENT_DOCKER.md)** - Dockerでのデプロイ
- **[04_ENVIRONMENT_VARIABLES.md](./04_ENVIRONMENT_VARIABLES.md)** - 環境変数の詳細
- **[05_KNOWLEDGE_MANAGEMENT.md](./05_KNOWLEDGE_MANAGEMENT.md)** - ナレッジベースの管理
- **[08_API_REFERENCE.md](./08_API_REFERENCE.md)** - API仕様書

---

## トラブルシューティング

### エラー: `GEMINI_API_KEY environment variable is required`

**原因:** `.env`ファイルに`GEMINI_API_KEY`が設定されていない

**解決策:**
```bash
# .envファイルを確認
cat .env

# GEMINI_API_KEYが空の場合は設定
# エディタで.envを開き、APIキーを追加
```

### エラー: `ChromaDB connection failed`

**原因:** ChromaDBが起動していない、またはURLが間違っている

**解決策:**
```bash
# ChromaDBの状態を確認
docker-compose ps

# 起動していない場合
docker-compose up chroma -d

# URLを確認
echo $CHROMA_URL
# http://localhost:8000 であることを確認
```

### エラー: `Cannot find module 'xxx'`

**原因:** 依存パッケージがインストールされていない

**解決策:**
```bash
# node_modulesを削除して再インストール
rm -rf node_modules package-lock.json
npm install
```

### エラー: ポート3000が既に使用されている

**原因:** 別のアプリケーションがポート3000を使用中

**解決策:**
```bash
# 別のポートで起動
PORT=3001 npm run dev

# または既存プロセスを停止
# Windows: netstat -ano | findstr :3000
# macOS/Linux: lsof -i :3000
```

---

## 環境チェックツールの詳細

`npm run check-env`は以下をチェックします：

| チェック項目 | 説明 | エラー時の対処 |
|-------------|------|---------------|
| Node Modules | `node_modules/`が存在するか | `npm install`を実行 |
| .env File | `.env`ファイルが存在するか | `.env.example`をコピー |
| Knowledge Files | `knowledge/`ディレクトリにファイルが存在するか | リポジトリを再クローン |
| Docker Compose | `docker-compose`コマンドが使用可能か | Docker Desktopをインストール |
| ChromaDB | ChromaDBが起動しているか | `docker-compose up chroma -d` |
| Vector DB Data | Vector DBにデータが存在するか（任意） | `npm run setup:vector-db` |

---

## まとめ

これで開発環境のセットアップが完了しました。

**確認チェックリスト:**
- [ ] Node.js 18+がインストールされている
- [ ] Dockerがインストールされている
- [ ] `.env`ファイルが設定されている
- [ ] ChromaDBが起動している
- [ ] Vector DBにデータが登録されている
- [ ] `npm run dev`でアプリケーションが起動する
- [ ] http://localhost:3000 にアクセスできる

問題がある場合は、[07_TROUBLESHOOTING.md](./07_TROUBLESHOOTING.md)を参照してください。
