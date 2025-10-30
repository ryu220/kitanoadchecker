# デプロイガイド

**本番環境デプロイ完全マニュアル（Koyeb対応）**

## デプロイ方法一覧

| 方法 | 推奨度 | 難易度 | 費用 | 用途 |
|------|--------|--------|------|------|
| **Koyeb** | ⭐⭐⭐ | 簡単 | $7〜/月 | 本番環境（推奨） |
| **Docker Compose** | ⭐⭐ | 中級 | 自前サーバー費用 | 社内サーバー運用 |
| **ローカル開発** | ⭐ | 簡単 | 無料 | 開発・テスト |

---

## 1. Koyebデプロイ（推奨）

### 1.1 事前準備

**必要なもの**:
- Koyebアカウント（https://www.koyeb.com/）
- GitHubアカウント（ryu220/kitanoadcheckerへのアクセス権限）
- Gemini API Key（ローカルでのVector DB初期化用）

### 1.2 ChromaDBサービス作成

1. **Koyebダッシュボードにログイン**

2. **新しいServiceを作成**
   - 「Create Service」をクリック
   - 「Docker」を選択

3. **ChromaDB設定**
   ```
   Service name: kitanoadchecker-chroma
   Docker image: chromadb/chroma:0.5.23
   Port: 8000
   Instance type: Small (512MB RAM推奨)
   Region: Frankfurt (or Tokyo)
   ```

4. **環境変数設定**
   ```bash
   ALLOW_RESET=true
   IS_PERSISTENT=true
   ```

5. **Persistent Storage設定**
   - Volume: `/chroma/chroma` (1GB)
   - これでChromaDBのデータが永続化されます

6. **デプロイ実行**
   - 「Deploy」をクリック
   - 3〜5分でChromaDBが起動します

7. **Internal URLをメモ**
   ```
   例: kitanoadchecker-chroma.koyeb.app:8000
   または内部URL: kitanoadchecker-chroma-xxxxx.koyeb.svc.cluster.local:8000
   ```

### 1.3 アプリケーションサービス作成

1. **新しいServiceを作成**
   - 「Create Service」をクリック
   - 「GitHub」を選択

2. **GitHubリポジトリ連携**
   ```
   Repository: ryu220/kitanoadchecker
   Branch: main
   ```

3. **Build設定**
   ```
   Build command: npm install
   Start command: npm start
   Dockerfile: Dockerfile（自動検出）
   ```

4. **環境変数設定**
   ```bash
   # ChromaDB接続先（必須）
   CHROMA_URL=http://kitanoadchecker-chroma.koyeb.app:8000

   # または内部URL（推奨 - 高速）
   CHROMA_URL=http://kitanoadchecker-chroma-xxxxx.koyeb.svc.cluster.local:8000

   # Gemini API Key（本番では不要 - ユーザーがUI経由で提供）
   # GEMINI_API_KEY=（設定しない）

   # Node環境
   NODE_ENV=production
   ```

5. **ポート設定**
   ```
   Port: 3000
   ```

6. **Instance設定**
   ```
   Instance type: Small (512MB RAM)以上
   Instances: 1〜2（負荷に応じて）
   Region: Frankfurt（ChromaDBと同じリージョン推奨）
   ```

7. **デプロイ実行**
   - 「Deploy」をクリック
   - 5〜10分でビルド・デプロイ完了

8. **公開URLを確認**
   ```
   例: https://kitanoadchecker-xxxxx.koyeb.app
   ```

### 1.4 Vector DB初期化（初回のみ）

**重要**: 本番環境でVector DBを初期化する必要があります。

#### 方法1: ローカルから初期化（推奨）

```bash
# 1. ローカル環境でリポジトリをクローン
git clone https://github.com/ryu220/kitanoadchecker.git
cd kitanoadchecker

# 2. 依存関係インストール
npm install

# 3. 環境変数設定
export GEMINI_API_KEY=your_gemini_api_key
export CHROMA_URL=http://kitanoadchecker-chroma.koyeb.app:8000

# 4. Vector DB初期化実行（10〜15分）
npm run setup:vector-db

# 成功メッセージ確認:
# ✅ Vector DB initialization completed successfully!
# ✅ Total chunks: ~5,129
```

#### 方法2: Koyeb Web Shell経由（上級者向け）

1. Koyebダッシュボード → アプリケーションService → 「Shell」タブ
2. シェルで実行:
   ```bash
   cd /app
   GEMINI_API_KEY=your_key npm run setup:vector-db
   ```

### 1.5 動作確認

1. **公開URLにアクセス**
   ```
   https://kitanoadchecker-xxxxx.koyeb.app
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
   curl https://kitanoadchecker-xxxxx.koyeb.app/api/health

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
# 1. ChromaDB起動確認
curl http://kitanoadchecker-chroma.koyeb.app:8000/api/v1/heartbeat

# 2. 環境変数確認
echo $CHROMA_URL

# 3. Internal URL使用（Koyeb内部）
CHROMA_URL=http://kitanoadchecker-chroma-xxxxx.koyeb.svc.cluster.local:8000
```

### 5.2 Vector DBにデータがない

**症状**: `No results found in vector search`

**解決策**:
```bash
# ローカルから初期化実行
export CHROMA_URL=http://kitanoadchecker-chroma.koyeb.app:8000
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
# Koyeb Instance typeをアップグレード
Small (512MB) → Medium (1GB) → Large (2GB)

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
# Koyeb Auto Scaling設定
Min instances: 1
Max instances: 3
CPU threshold: 70%
Memory threshold: 80%
```

### 7.2 ChromaDBの最適化

```bash
# Persistent Storage拡張
Volume size: 1GB → 5GB（ナレッジ追加時）

# Instance type upgrade
Small (512MB) → Medium (1GB)
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
curl http://kitanoadchecker-chroma.koyeb.app:8000/api/v1/dump > chroma-backup.json
```

### 9.2 リストア

```bash
# 再初期化が最も確実
npm run setup:vector-db:clear
```

---

## 10. コスト試算

### Koyeb（推奨構成）

| リソース | スペック | 月額費用 |
|---------|---------|---------|
| ChromaDB | Small (512MB) | $7 |
| アプリケーション | Small (512MB) | $7 |
| **合計** | | **$14/月** |

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
**対応プラットフォーム**: Koyeb, Docker Compose, ローカル開発
