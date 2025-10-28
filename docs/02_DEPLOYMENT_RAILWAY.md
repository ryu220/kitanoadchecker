# 02. Railway デプロイガイド - Railway Deployment Guide

## 概要

このガイドは、**kitanoadchecker**をRailwayプラットフォームにデプロイする手順を説明します。

**Railway**は、GitHubと連携した自動デプロイが可能なPaaSで、ChromaDBのような永続ストレージが必要なアプリケーションに最適です。

---

## Railwayの特徴

- **自動デプロイ:** GitHubへのpush時に自動でデプロイ
- **Volume対応:** ChromaDBのデータを永続化可能（10GB推奨）
- **環境変数管理:** セキュアな環境変数設定
- **無料枠あり:** 月間500時間まで無料（ホビープロジェクト向け）

---

## 前提条件

- GitHubアカウント
- Railwayアカウント（無料で作成可能）
- プロジェクトがGitHubリポジトリにpush済み

---

## ステップ1: Railwayアカウント作成

### 1-1. アカウント登録

1. https://railway.app/ にアクセス
2. 「Start a New Project」をクリック
3. GitHubアカウントで認証

### 1-2. GitHubリポジトリ連携

1. Railwayダッシュボードで「New Project」をクリック
2. 「Deploy from GitHub repo」を選択
3. リポジトリ一覧から`kitanoadchecker`を選択

---

## ステップ2: ChromaDBサービスのセットアップ

### 2-1. ChromaDBサービスを追加

1. Railwayプロジェクト画面で「+ New Service」をクリック
2. 「Empty Service」を選択
3. サービス名を`chroma`に設定

### 2-2. Dockerイメージ設定

1. `chroma`サービスの設定画面を開く
2. 「Settings」タブを選択
3. 「Source」セクションで以下を設定:
   - **Source Type:** Docker Image
   - **Image:** `chromadb/chroma:latest`

### 2-3. Volume（永続ストレージ）設定

**重要:** ChromaDBのデータを永続化するため、必ずVolumeを設定してください。

1. `chroma`サービスの「Settings」タブで「Volumes」セクションへ
2. 「+ Add Volume」をクリック
3. 以下を入力:
   - **Mount Path:** `/chroma/chroma`
   - **Size:** `10GB`（推奨）

### 2-4. 環境変数設定（ChromaDB）

「Variables」タブで以下の環境変数を追加:

| 変数名 | 値 | 説明 |
|--------|-----|------|
| `CHROMA_SERVER_CORS_ALLOW_ORIGINS` | `*` | CORS設定（全オリジン許可） |
| `ALLOW_RESET` | `true` | リセット機能を有効化 |

### 2-5. ポート設定

1. 「Settings」タブの「Networking」セクションへ
2. 「Generate Domain」をクリック
3. ChromaDBの公開URLが生成される（例: `chroma-production-xxxx.up.railway.app`）

**注:** このURLは後でWebアプリの環境変数に設定します。

---

## ステップ3: Webアプリケーションのセットアップ

### 3-1. Webサービスを追加

1. Railwayプロジェクト画面で「+ New Service」をクリック
2. 「GitHub Repo」を選択
3. `kitanoadchecker`リポジトリを選択

### 3-2. ビルド設定

Railwayは`Dockerfile`を自動検出してビルドします。

**確認:** リポジトリに`Dockerfile`が存在することを確認してください。

### 3-3. 環境変数設定（Webアプリ）

「Variables」タブで以下の環境変数を追加:

| 変数名 | 値 | 説明 |
|--------|-----|------|
| `NODE_ENV` | `production` | 本番環境モード |
| `CHROMA_URL` | `https://chroma-production-xxxx.up.railway.app` | ChromaDBのURL（ステップ2-5で生成） |

**重要な注意事項:**

- **`GEMINI_API_KEY`は設定しないでください！**
- ユーザーがUIでAPIキーを入力する設計です
- サーバー側でAPIキーを管理しません

### 3-4. ポート設定

1. 「Settings」タブの「Networking」セクションへ
2. 「Generate Domain」をクリック
3. Webアプリの公開URLが生成される（例: `kitanoadchecker-production.up.railway.app`）

---

## ステップ4: Vector Database の初期化

**初回デプロイ時のみ実行が必要です。**

### 4-1. 環境変数で初期化を有効化

1. Webアプリサービスの「Variables」タブを開く
2. 以下の環境変数を**一時的に**追加:

| 変数名 | 値 | 説明 |
|--------|-----|------|
| `SETUP_VECTOR_DB` | `true` | 起動時にVector DBセットアップを実行 |
| `CLEAR_EXISTING` | `true` | 既存データをクリア（任意） |
| `GEMINI_API_KEY` | `your_api_key` | セットアップ用（一時的） |

### 4-2. デプロイ実行

環境変数を保存すると、自動的に再デプロイが開始されます。

### 4-3. ログで進捗確認

1. Webアプリサービスの「Deployments」タブを開く
2. 最新のデプロイをクリック
3. ログを確認:

```
🚀 Starting up application...
📦 Setting up vector database...

> ad-legal-checker@0.1.0 setup:vector-db
> tsx scripts/setup-vector-db.ts

================================================================================
🚀 Vector DB Setup Started
================================================================================

✅ Successfully loaded 131 knowledge files
✅ Generated 1,333 chunks with embeddings
📊 Priority breakdown:
   - P1 (Company Standards): 125 chunks
   - P2 (Laws): 556 chunks
   - P3 (Guidelines): 583 chunks
✅ Vector database setup complete!

🌐 Starting Next.js server...
```

**実行時間:** 約5〜10分

### 4-4. セットアップ後のクリーンアップ

**Vector DBセットアップが完了したら、以下の環境変数を削除してください:**

1. `SETUP_VECTOR_DB` - 削除
2. `CLEAR_EXISTING` - 削除
3. `GEMINI_API_KEY` - **削除（重要）**

**理由:**
- 次回デプロイ時にVector DBセットアップをスキップ
- APIキーをサーバー側に保存しない（セキュリティ上の理由）

削除後、自動的に再デプロイされ、通常のNext.jsサーバーが起動します。

---

## ステップ5: 動作確認

### 5-1. ヘルスチェック

ブラウザまたはcURLで以下にアクセス:

```bash
curl https://your-app.up.railway.app/api/health
```

**期待される出力:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-29T12:34:56.789Z",
  "services": {
    "chromadb": "connected"
  }
}
```

### 5-2. Webアプリケーション確認

ブラウザで以下にアクセス:

```
https://your-app.up.railway.app
```

**テスト:**
1. 広告文を入力
2. 商品を選択（例: HA）
3. Gemini APIキーを入力
4. 「チェック開始」をクリック
5. 結果が表示されることを確認

---

## ステップ6: カスタムドメイン設定（オプション）

### 6-1. ドメインを追加

1. Webアプリサービスの「Settings」タブを開く
2. 「Domains」セクションで「+ Custom Domain」をクリック
3. 独自ドメイン（例: `adchecker.example.com`）を入力

### 6-2. DNS設定

Railway画面に表示されるCNAMEレコードを、ドメインのDNS設定に追加します。

**例:**
```
Type: CNAME
Name: adchecker
Value: kitanoadchecker-production.up.railway.app
```

### 6-3. SSL証明書

Railwayが自動的にLet's Encrypt SSL証明書を発行します（数分で完了）。

---

## ステップ7: 自動デプロイの確認

### 7-1. GitHubへpush

```bash
# ローカルで変更をコミット
git add .
git commit -m "Update feature"
git push origin main
```

### 7-2. Railway自動デプロイ

Railwayが自動的に：
1. 最新コミットを検出
2. Dockerイメージをビルド
3. デプロイ
4. ヘルスチェック実行

**デプロイ時間:** 約2〜5分

---

## トラブルシューティング

### エラー: `GEMINI_API_KEY environment variable is required`

**原因:** Vector DBセットアップ時に`GEMINI_API_KEY`が設定されていない

**解決策:**
1. Webアプリサービスの「Variables」タブを開く
2. `GEMINI_API_KEY`を一時的に追加
3. `SETUP_VECTOR_DB=true`を設定
4. 再デプロイ
5. セットアップ完了後、両方の環境変数を削除

### エラー: `ChromaDB connection failed`

**原因:** `CHROMA_URL`が正しくない、またはChromaDBサービスが起動していない

**解決策:**
1. ChromaDBサービスが起動していることを確認
2. ChromaDBの公開URLをコピー（`chroma`サービスの「Settings」→「Networking」）
3. Webアプリの`CHROMA_URL`環境変数を更新

### エラー: `Failed to generate embeddings`

**原因:** Gemini APIの呼び出し制限を超えた

**解決策:**
- 数分待ってから再試行
- Gemini API Studioでクォータを確認: https://aistudio.google.com/

### デプロイが失敗する

**原因:** Dockerfileのビルドエラー

**解決策:**
1. ローカルで`docker build -t test .`を実行してエラーを確認
2. `package.json`の`start`スクリプトを確認:
   ```json
   "start": "sh scripts/startup.sh"
   ```
3. `scripts/startup.sh`が存在し、実行可能であることを確認

---

## メンテナンス

### ログの確認

1. Railwayダッシュボードで該当サービスを選択
2. 「Deployments」タブで最新デプロイをクリック
3. リアルタイムログを確認

### 環境変数の変更

1. 「Variables」タブで変数を編集
2. 保存すると自動的に再デプロイ

### Volumeのバックアップ

**重要:** RailwayはVolumesのバックアップ機能を提供していません。

**推奨バックアップ方法:**
1. ローカルでVector DBセットアップを実行
2. `docker cp`でChromaDBデータをバックアップ
3. 定期的に再実行

---

## コスト管理

### 無料枠

- **月間500時間**まで無料
- 2サービス（Web + ChromaDB）で約250時間/月

### 有料プラン

- **Developer Plan:** $5/月
- 月間500時間以上の利用時に必要

### コスト削減のヒント

1. **開発環境と本番環境を分ける**
   - 開発環境: ローカルDocker
   - 本番環境: Railway

2. **不要な時はサービスを停止**
   - Railwayダッシュボードで「Sleep」設定

---

## まとめ

Railwayデプロイのチェックリスト:

- [ ] Railwayアカウント作成
- [ ] GitHubリポジトリ連携
- [ ] ChromaDBサービス作成（Volumeを10GB設定）
- [ ] Webアプリサービス作成
- [ ] 環境変数設定（`NODE_ENV`, `CHROMA_URL`）
- [ ] Vector DB初期化（`SETUP_VECTOR_DB=true`で一時実行）
- [ ] 初期化後に`GEMINI_API_KEY`を削除
- [ ] ヘルスチェック確認
- [ ] Webアプリ動作確認
- [ ] 自動デプロイ確認

次のステップ:
- **[04_ENVIRONMENT_VARIABLES.md](./04_ENVIRONMENT_VARIABLES.md)** - 環境変数の詳細
- **[05_KNOWLEDGE_MANAGEMENT.md](./05_KNOWLEDGE_MANAGEMENT.md)** - ナレッジベース更新方法
- **[07_TROUBLESHOOTING.md](./07_TROUBLESHOOTING.md)** - トラブルシューティング
- **[10_MAINTENANCE_GUIDE.md](./10_MAINTENANCE_GUIDE.md)** - メンテナンス手順
