# デプロイガイド

**本番環境デプロイ完全マニュアル（Railway対応）**

## デプロイ方法一覧

| 方法 | 推奨度 | 難易度 | 費用 | 用途 |
|------|--------|--------|------|------|
| **Railway** | ⭐⭐⭐ | 簡単 | $5〜/月 | 本番環境（推奨） |
| **Docker Compose** | ⭐⭐ | 中級 | 自前サーバー費用 | 社内サーバー運用 |
| **ローカル開発** | ⭐ | 簡単 | 無料 | 開発・テスト |

---

## 1. Railwayデプロイ（推奨）

### 1.1 事前準備

**必要なもの**:
- Railwayアカウント（https://railway.app/）
- GitHubアカウント（ryu220/kitanoadcheckerへのアクセス権限）
- Gemini API Key（ローカルでのVector DB初期化用）

### 1.2 ChromaDBサービス作成

1. **Railwayダッシュボードにログイン**

2. **新しいProjectを作成**
   - 「New Project」をクリック
   - 「Empty Project」を選択

3. **ChromaDB Serviceを追加**
   - 「+ New」をクリック
   - 「Docker Image」を選択

4. **ChromaDB設定**
   ```
   Service name: chroma
   Docker image: chromadb/chroma:0.5.23
   Port: 8000
   ```

5. **環境変数設定**
   ```bash
   ALLOW_RESET=true
   IS_PERSISTENT=true
   ```

6. **Volume設定（データ永続化）**
   - Settings → Volumes
   - Add Volume: `/chroma/chroma`
   - Size: 1GB

7. **デプロイ実行**
   - 自動的にデプロイが開始されます
   - 3〜5分でChromaDBが起動します

8. **Internal URLをメモ**
   ```
   例: chroma.railway.internal:8000
   ```

### 1.3 アプリケーションサービス作成

1. **GitHub Serviceを追加**
   - 同じProject内で「+ New」をクリック
   - 「GitHub Repo」を選択

2. **GitHubリポジトリ連携**
   ```
   Repository: ryu220/kitanoadchecker
   Branch: main
   ```

3. **環境変数設定**
   - Settings → Variables

   ```bash
   # ChromaDB接続先（必須）
   CHROMA_URL=http://chroma.railway.internal:8000

   # Gemini API Key（本番では不要 - ユーザーがUI経由で提供）
   # GEMINI_API_KEY=（設定しない）

   # Node環境
   NODE_ENV=production
   ```

4. **Build & Start設定**
   - Settings → Build
   - Build Command: `npm install`
   - Start Command: `npm start`

5. **ポート設定**
   - Railwayが自動的にPORTを設定（通常3000）

6. **公開ドメイン設定**
   - Settings → Networking
   - 「Generate Domain」をクリック
   - 公開URLが生成されます（例: kitanoadchecker-production.up.railway.app）

7. **デプロイ実行**
   - 自動的にビルド・デプロイが開始されます
   - 5〜10分でデプロイ完了

### 1.4 Vector DB初期化（初回のみ）

**重要**: 本番環境でVector DBを初期化する必要があります。

#### ローカルから初期化（推奨）

```bash
# 1. ローカル環境でリポジトリをクローン
git clone https://github.com/ryu220/kitanoadchecker.git
cd kitanoadchecker

# 2. 依存関係インストール
npm install

# 3. 環境変数設定
export GEMINI_API_KEY=your_gemini_api_key
export CHROMA_URL=http://chroma.railway.internal:8000
# ⚠️ 注意: railway.internalはRailway内部からのみアクセス可能
# 外部からアクセスする場合は公開URLを使用

# 4. Vector DB初期化実行（10〜15分）
npm run setup:vector-db

# 成功メッセージ確認:
# ✅ Vector DB initialization completed successfully!
# ✅ Total chunks: ~5,129
```

#### Railway CLI経由（上級者向け）

```bash
# Railway CLIインストール
npm install -g @railway/cli

# ログイン
railway login

# プロジェクト選択
railway link

# コマンド実行
railway run npm run setup:vector-db
```

### 1.5 動作確認

1. **公開URLにアクセス**
   ```
   https://kitanoadchecker-production.up.railway.app
   ```

2. **Web UIで確認**
   - 商品選択: HA（ヒアロディープパッチ）
   - APIキー入力: Gemini API Key
   - テスト広告文入力:
     ```
     Amazon・楽天で1位を獲得した人気商品です。
     ```
   - 「チェック開始」をクリック

3. **期待結果**
   - セグメント分割: 3秒以内
   - 評価完了: 10秒以内
   - 判定: 不適合（ランキング表現にエビデンスなし）

4. **ヘルスチェック**
   ```bash
   curl https://kitanoadchecker-production.up.railway.app/api/health

   # 期待レスポンス:
   {
     "status": "healthy",
     "timestamp": "2025-10-30T12:00:00.000Z"
   }
   ```

---

## 2. Docker Composeデプロイ（社内サーバー向け）

### 2.1 前提条件

- Docker 20.10+
- Docker Compose 2.0+
- 4GB RAM以上推奨

### 2.2 デプロイ手順

```bash
# 1. リポジトリクローン
git clone https://github.com/ryu220/kitanoadchecker.git
cd kitanoadchecker

# 2. 環境変数設定
cp .env.example .env
nano .env
# GEMINI_API_KEY=your_key（Vector DB初期化用）
# CHROMA_URL=http://chroma:8000

# 3. Docker Composeでビルド・起動
docker-compose up --build -d

# 4. ログ確認
docker-compose logs -f

# 5. Vector DB初期化（初回のみ）
docker-compose exec app npm run setup:vector-db

# 6. 動作確認
curl http://localhost:3000/api/health
```

### 2.3 アクセス

- **Web UI**: http://localhost:3000
- **API**: http://localhost:3000/api/v2/*
- **ChromaDB**: http://localhost:8000（内部アクセスのみ）

---

## 3. ローカル開発環境

```bash
# 1. 依存関係インストール
npm install

# 2. ChromaDB起動
docker-compose up -d chroma

# 3. 環境変数設定
cp .env.example .env
# GEMINI_API_KEY=your_key
# CHROMA_URL=http://localhost:8000

# 4. Vector DB初期化
npm run setup:vector-db

# 5. 開発サーバー起動
npm run dev

# 6. アクセス
http://localhost:3000
```

---

## 4. 環境変数リファレンス

| 変数名 | 必須 | デフォルト | 説明 |
|--------|------|-----------|------|
| `GEMINI_API_KEY` | ローカルのみ | - | Vector DB初期化に必要（本番不要） |
| `CHROMA_URL` | ✅ 必須 | http://localhost:8000 | ChromaDB接続先 |
| `NODE_ENV` | | development | 本番では`production` |
| `PORT` | | 3000 | アプリケーションポート |

### 本番環境の重要ポイント

```bash
# ❌ 本番環境ではGEMINI_API_KEYを設定しない
# GEMINI_API_KEY=xxx  # これは設定不要

# ✅ ユーザーがWeb UIで入力するため不要
# ✅ セキュアでスケーラブルな設計
```

---

## 5. トラブルシューティング

### 5.1 ChromaDBに接続できない

**症状**: `Failed to connect to ChromaDB`

**解決策**:
```bash
# 1. ChromaDB起動確認（Railway）
# Railway Dashboard → chroma service → Logs

# 2. 環境変数確認
echo $CHROMA_URL

# 3. Internal URL使用確認
CHROMA_URL=http://chroma.railway.internal:8000
```

### 5.2 Vector DBにデータがない

**症状**: `No results found in vector search`

**解決策**:
```bash
# ローカルから初期化実行
export CHROMA_URL=http://chroma.railway.internal:8000
export GEMINI_API_KEY=your_key
npm run setup:vector-db
```

### 5.3 ビルドエラー

**症状**: `npm install failed`

**解決策**:
```bash
# Dockerfileで明示的にNode 18指定
FROM node:18-alpine

# package-lockがある場合
npm ci

# ない場合
npm install
```

### 5.4 Gemini APIクォータエラー

**症状**: `429 Too Many Requests`

**解決策**:
- Google AI Studioでクォータ確認
- 有料プラン（Gemini API Pro）への移行検討
- リトライ設定確認（現在: 最大3回、指数バックオフ）

### 5.5 メモリ不足エラー

**症状**: `JavaScript heap out of memory`

**解決策**:
```bash
# Railway Settingsでメモリ増量
512MB → 1GB → 2GB

# または環境変数で調整
NODE_OPTIONS=--max-old-space-size=1024
```

---

## 6. 本番運用チェックリスト

### デプロイ前

- [ ] GitHubリポジトリにすべてのコードがコミット済み
- [ ] `.env`ファイルが`.gitignore`に含まれている
- [ ] `package.json`の`scripts`にビルド・起動コマンドがある
- [ ] Dockerfileが最適化されている（multi-stage build）
- [ ] ナレッジファイルが130ファイルすべて含まれている

### デプロイ時

- [ ] ChromaDBサービスが起動している
- [ ] アプリケーションサービスがビルド成功している
- [ ] 環境変数が正しく設定されている（特に`CHROMA_URL`）
- [ ] Vector DBが初期化されている（~5,129チャンク）
- [ ] ヘルスチェックがpassしている

### デプロイ後

- [ ] Web UIでテストケースを実行して正常動作確認
- [ ] APIエンドポイントがすべて正常にレスポンス
- [ ] ログにエラーが出ていない
- [ ] レスポンス時間が基準内（セグメント分割3秒以内）
- [ ] モニタリング・アラート設定完了

---

## 7. スケーリング・最適化

### 7.1 負荷に応じたスケーリング

```bash
# Railway Auto Scaling
# Settings → Deployment → Replicas
Min replicas: 1
Max replicas: 3
```

### 7.2 ChromaDBの最適化

```bash
# Volume拡張
Settings → Volumes → Resize
1GB → 5GB（ナレッジ追加時）

# Memory増量
512MB → 1GB
```

### 7.3 キャッシュ戦略

現在、以下がキャッシュされています:
- Vector検索結果（インメモリ、セッション単位）
- Gemini APIレスポンス（なし - 実装可能）

---

## 8. セキュリティ

### 8.1 API Key管理

```bash
# ✅ 推奨: ユーザー提供（Web UI経由）
# - サーバー側に保存されない
# - ブラウザlocalStorageに保存
# - セキュアでスケーラブル

# ❌ 非推奨: サーバー環境変数
# - すべてのユーザーで共有される
# - クォータ上限に達しやすい
```

### 8.2 CORS設定

現在は開発環境設定（すべて許可）:
```typescript
// 本番では適切に制限
const allowedOrigins = ['https://yourdomain.com'];
```

### 8.3 ログ管理

機密情報がログに出力されないよう確認:
```bash
# ✅ OK
"Evaluating segment with text: Amazon・楽天で1位..."

# ❌ NG
"API Key: sk-ant-xxxxx..."
```

---

## 9. バックアップ・リストア

### 9.1 Vector DBバックアップ

```bash
# ローカルバックアップ
npm run backup:vector-db

# または手動
curl http://chroma.railway.internal:8000/api/v1/dump > chroma-backup.json
```

### 9.2 リストア

```bash
# 再初期化が最も確実
npm run setup:vector-db:clear
```

---

## 10. コスト試算

### Railway（推奨構成）

| リソース | スペック | 月額費用 |
|---------|---------|---------|
| ChromaDB | 512MB RAM, 1GB Volume | $5 |
| アプリケーション | 512MB RAM | $5 |
| **合計** | | **$10/月** |

### 自前サーバー（Docker Compose）

| リソース | 費用 |
|---------|------|
| サーバー | VPS $5〜$20/月 |
| 電気代 | 自社サーバーの場合 |

---

## サポート

デプロイに関する技術的なお問い合わせ:
- GitHub Issues: https://github.com/ryu220/kitanoadchecker/issues
- ドキュメント: `docs/delivery/`

---

**バージョン**: v1.0
**最終更新**: 2025年10月30日
**対応プラットフォーム**: Railway, Docker Compose, ローカル開発
