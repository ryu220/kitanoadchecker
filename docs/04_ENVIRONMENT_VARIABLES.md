# 04. 環境変数リファレンス - Environment Variables Reference

## 概要

このドキュメントは、**kitanoadchecker**で使用するすべての環境変数の詳細を説明します。

---

## 環境変数一覧

### 必須環境変数

| 変数名 | 説明 | デフォルト値 | 必須レベル |
|-------|------|------------|-----------|
| `CHROMA_URL` | ChromaDB（Vector Database）のURL | `http://localhost:8000` | **必須** |
| `NODE_ENV` | Node.js実行環境 | `development` | 推奨 |

### オプション環境変数

| 変数名 | 説明 | デフォルト値 | 使用タイミング |
|-------|------|------------|--------------|
| `GEMINI_API_KEY` | Gemini API Key | なし | Vector DBセットアップ時のみ |
| `SETUP_VECTOR_DB` | 起動時にVector DBセットアップを実行 | `false` | 初回デプロイ時のみ |
| `CLEAR_EXISTING` | 既存のVector DBデータをクリア | `false` | Vector DB再構築時 |
| `PORT` | Next.jsサーバーのポート番号 | `3000` | ポート変更時 |

---

## 環境変数の詳細

### 1. `CHROMA_URL`

**説明:**
ChromaDB（Vector Database）サービスのエンドポイントURL。

**設定例:**

```bash
# ローカル開発環境
CHROMA_URL=http://localhost:8000

# Docker Compose環境
CHROMA_URL=http://chroma:8000

# Railway環境
CHROMA_URL=https://chroma-production-xxxx.up.railway.app

# カスタムポート
CHROMA_URL=http://localhost:8001
```

**使用箇所:**
- `lib/vector-db/chroma-db.ts` - ChromaDBクライアント初期化
- `scripts/setup-vector-db.ts` - Vector DBセットアップスクリプト
- `app/api/v2/evaluate/route.ts` - 評価API

**検証方法:**

```bash
# URLが正しいか確認
curl $CHROMA_URL/api/v1/heartbeat

# 期待される出力:
# {"nanosecond heartbeat":...}
```

**トラブルシューティング:**

| エラーメッセージ | 原因 | 解決策 |
|----------------|------|--------|
| `Connection refused` | ChromaDBが起動していない | `docker-compose up chroma -d` |
| `Invalid URL` | URLフォーマットが不正 | `http://`または`https://`で始まることを確認 |
| `Timeout` | ChromaDBが応答しない | ChromaDBのログを確認: `docker-compose logs chroma` |

---

### 2. `GEMINI_API_KEY`

**説明:**
Google Gemini APIのAPIキー。**Vector DBセットアップ時のみ必要**です。

**重要な注意事項:**
- **アプリケーション実行時は不要**（ユーザーがUIでAPIキーを入力）
- **本番環境に設定しないこと**（セキュリティリスク）
- `.env`ファイルに保存し、**Gitにコミットしないこと**

**取得方法:**
1. https://aistudio.google.com/app/apikey にアクセス
2. Googleアカウントでログイン
3. 「Create API Key」をクリック
4. APIキーをコピー

**設定例:**

```bash
# ローカル開発環境（Vector DBセットアップ用）
GEMINI_API_KEY=AIzaSyC...（実際のAPIキー）

# 本番環境（Railway/Docker）
# 設定しない（ユーザーがUIで入力）
```

**使用箇所:**
- `scripts/setup-vector-db.ts` - Embedding生成
- `scripts/upload-knowledge.ts` - ナレッジアップロード（Gemini File API）

**ライフサイクル:**

```
1. 初回セットアップ時に.envに追加
   ↓
2. npm run setup:vector-db を実行
   ↓
3. Vector DBセットアップ完了
   ↓
4. .envから GEMINI_API_KEY を削除（セキュリティ）
   ↓
5. アプリケーション実行（ユーザーがUIでAPIキー入力）
```

**トラブルシューティング:**

| エラーメッセージ | 原因 | 解決策 |
|----------------|------|--------|
| `GEMINI_API_KEY environment variable is required` | .envに設定されていない | .envファイルにAPIキーを追加 |
| `Invalid API key` | APIキーが無効 | Google AI Studioで新しいAPIキーを取得 |
| `Quota exceeded` | API呼び出し制限を超えた | 数分待ってから再試行 |

---

### 3. `NODE_ENV`

**説明:**
Node.js実行環境の指定。

**設定値:**

| 値 | 説明 | 用途 |
|---|------|------|
| `development` | 開発環境 | ローカル開発時 |
| `production` | 本番環境 | Railway/Docker本番デプロイ時 |
| `test` | テスト環境 | ユニットテスト実行時 |

**設定例:**

```bash
# ローカル開発
NODE_ENV=development

# 本番環境
NODE_ENV=production

# テスト実行
NODE_ENV=test
```

**影響範囲:**

1. **Next.jsの最適化:**
   - `production`: ビルド最適化、ソースマップ無効化
   - `development`: Hot Reload、詳細エラー表示

2. **ログレベル:**
   - `production`: エラーのみ
   - `development`: デバッグ情報含む

3. **キャッシュ動作:**
   - `production`: 積極的キャッシュ
   - `development`: キャッシュ無効化

**確認方法:**

```bash
# 現在の環境を確認
echo $NODE_ENV

# Node.js内で確認
node -e "console.log(process.env.NODE_ENV)"
```

---

### 4. `SETUP_VECTOR_DB`

**説明:**
起動時に自動的にVector DBセットアップを実行するかどうか。

**設定値:**

| 値 | 説明 |
|---|------|
| `true` | 起動時に`npm run setup:vector-db`を自動実行 |
| `false`（デフォルト） | 通常のNext.jsサーバー起動のみ |

**使用タイミング:**
- **初回デプロイ時のみ**（Railway/Docker本番環境）
- Vector DBの再構築時

**設定例:**

```bash
# 初回デプロイ時
SETUP_VECTOR_DB=true

# 通常時（セットアップ完了後）
# 設定しない、またはfalse
```

**ライフサイクル（Railway）:**

```
1. Railwayの環境変数に SETUP_VECTOR_DB=true を追加
   ↓
2. デプロイ実行
   ↓
3. startup.shがVector DBセットアップを実行
   ↓
4. セットアップ完了を確認
   ↓
5. Railwayの環境変数から SETUP_VECTOR_DB を削除
   ↓
6. 再デプロイ（通常のNext.jsサーバー起動）
```

**関連ファイル:**
- `scripts/startup.sh` - 起動スクリプト

```bash
#!/bin/sh
if [ "$SETUP_VECTOR_DB" = "true" ]; then
  echo "📦 Setting up vector database..."
  npm run setup:vector-db
fi

echo "🌐 Starting Next.js server..."
npm run start:prod
```

---

### 5. `CLEAR_EXISTING`

**説明:**
Vector DBセットアップ時に既存データをクリアするかどうか。

**設定値:**

| 値 | 説明 |
|---|------|
| `true` | 既存データを削除してからセットアップ |
| `false`（デフォルト） | 既存データに追加 |

**使用タイミング:**
- ナレッジベースを完全に再構築する場合
- Vector DBのデータが壊れた場合

**設定例:**

```bash
# 完全再構築
CLEAR_EXISTING=true

# 追加のみ
CLEAR_EXISTING=false
```

**注意:**
- `CLEAR_EXISTING=true`は**すべてのVector DBデータを削除**します
- 実行前に必ずバックアップを取ってください

**バックアップ方法:**

```bash
# Docker Volumeをバックアップ
docker run --rm -v ad-legal-checker_chroma-data:/data -v $(pwd):/backup \
  busybox tar czf /backup/chroma-backup-$(date +%Y%m%d).tar.gz /data
```

---

### 6. `PORT`

**説明:**
Next.jsサーバーが使用するポート番号。

**設定例:**

```bash
# デフォルト
PORT=3000

# カスタムポート
PORT=3001
```

**使用タイミング:**
- ポート3000が既に使用されている場合
- 複数のNext.jsアプリを同時実行する場合

**確認方法:**

```bash
# ポート使用状況を確認
# Windows:
netstat -ano | findstr :3000

# macOS/Linux:
lsof -i :3000
```

---

## 環境別設定例

### ローカル開発環境

```bash
# .env
NODE_ENV=development
CHROMA_URL=http://localhost:8000
GEMINI_API_KEY=AIzaSyC...（Vector DBセットアップ時のみ）
```

### Railway本番環境

**初回デプロイ時:**

| 変数名 | 値 |
|-------|-----|
| `NODE_ENV` | `production` |
| `CHROMA_URL` | `https://chroma-production-xxxx.up.railway.app` |
| `SETUP_VECTOR_DB` | `true` |
| `CLEAR_EXISTING` | `true` |
| `GEMINI_API_KEY` | （一時的に設定） |

**セットアップ完了後:**

| 変数名 | 値 |
|-------|-----|
| `NODE_ENV` | `production` |
| `CHROMA_URL` | `https://chroma-production-xxxx.up.railway.app` |
| ~~`SETUP_VECTOR_DB`~~ | （削除） |
| ~~`CLEAR_EXISTING`~~ | （削除） |
| ~~`GEMINI_API_KEY`~~ | （削除） |

### Docker Compose本番環境

```bash
# .env
NODE_ENV=production
CHROMA_URL=http://chroma:8000
# GEMINI_API_KEY=（Vector DBセットアップ時のみ一時的に設定）
```

---

## セキュリティベストプラクティス

### 1. `.env`ファイルをGitにコミットしない

`.gitignore`に追加:

```gitignore
# Environment variables
.env
.env.local
.env.production
.env.*.local
```

### 2. APIキーを本番環境に保存しない

**❌ 避けるべき設定:**

```bash
# Railway環境変数に永続的に設定
GEMINI_API_KEY=AIzaSyC...
```

**✅ 推奨設定:**

```bash
# Vector DBセットアップ時のみ一時的に設定
# セットアップ完了後は削除
```

### 3. 環境変数の検証

起動時に必須環境変数をチェック:

```typescript
// lib/env-validator.ts
export function validateEnv() {
  const required = ['CHROMA_URL'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
```

### 4. 環境変数のログ出力を避ける

**❌ 避けるべき:**

```typescript
console.log('API Key:', process.env.GEMINI_API_KEY);
```

**✅ 推奨:**

```typescript
console.log('API Key:', process.env.GEMINI_API_KEY?.substring(0, 10) + '...');
```

---

## トラブルシューティング

### 環境変数が読み込まれない

**原因:**
- `.env`ファイルが存在しない
- `.env`ファイルが正しいディレクトリにない
- `dotenv`パッケージがロードされていない

**解決策:**

```bash
# .envファイルが存在するか確認
ls -la .env

# .envファイルの内容を確認
cat .env

# Next.jsは自動的に.envを読み込むため、dotenvは不要
# ただし、スクリプト実行時は明示的にロード
node -r dotenv/config scripts/setup-vector-db.ts
```

### 環境変数の優先順位

Next.jsは以下の優先順位で環境変数を読み込みます:

1. `process.env`（システム環境変数）
2. `.env.$(NODE_ENV).local`
3. `.env.local`
4. `.env.$(NODE_ENV)`
5. `.env`

**例:**

```bash
# .env
CHROMA_URL=http://localhost:8000

# .env.production（本番環境で上書き）
CHROMA_URL=https://chroma-production.up.railway.app
```

---

## まとめ

環境変数設定のチェックリスト:

- [ ] `.env`ファイルが作成されている
- [ ] `CHROMA_URL`が正しく設定されている
- [ ] `NODE_ENV`が適切な値に設定されている
- [ ] `GEMINI_API_KEY`はVector DBセットアップ時のみ設定
- [ ] 本番環境では`GEMINI_API_KEY`を削除済み
- [ ] `.env`ファイルが`.gitignore`に含まれている
- [ ] 環境変数をログ出力していない

次のステップ:
- **[01_SETUP_GUIDE.md](./01_SETUP_GUIDE.md)** - 初回セットアップ
- **[02_DEPLOYMENT_RAILWAY.md](./02_DEPLOYMENT_RAILWAY.md)** - Railwayデプロイ
- **[03_DEPLOYMENT_DOCKER.md](./03_DEPLOYMENT_DOCKER.md)** - Dockerデプロイ
- **[07_TROUBLESHOOTING.md](./07_TROUBLESHOOTING.md)** - トラブルシューティング
