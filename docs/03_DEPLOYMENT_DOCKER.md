# 03. Docker デプロイガイド - Docker Deployment Guide

## 概要

このガイドは、**kitanoadchecker**をDocker Composeを使用してデプロイする手順を説明します。

Docker Composeを使用することで、ローカル環境や独自サーバーで簡単に本番環境を構築できます。

---

## 前提条件

- Docker 20.10以上
- Docker Compose 2.0以上
- サーバー（オンプレミス、AWS EC2、GCP Compute Engine等）

---

## アーキテクチャ構成

Docker Composeは以下の2つのサービスを起動します：

```
┌─────────────────────────────────────┐
│         Docker Compose              │
│                                     │
│  ┌──────────────┐  ┌─────────────┐ │
│  │     web      │  │   chroma    │ │
│  │  (Next.js)   │←→│ (Vector DB) │ │
│  │  Port: 3000  │  │ Port: 8000  │ │
│  └──────────────┘  └─────────────┘ │
│         ↑                ↑          │
│         │                │          │
│    [HTTP Request]   [Persistent]   │
│                      [Volume]       │
└─────────────────────────────────────┘
```

---

## docker-compose.yml の詳細

プロジェクトルートの`docker-compose.yml`の内容:

```yaml
version: '3.8'

services:
  # ChromaDB Vector Database
  chroma:
    image: chromadb/chroma:latest
    container_name: ad_checker_chroma
    ports:
      - "8000:8000"
    volumes:
      - chroma-data:/chroma/chroma
    environment:
      - CHROMA_SERVER_CORS_ALLOW_ORIGINS=*
      - ALLOW_RESET=true
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/heartbeat"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - ad-checker-network

  # Next.js Web Application
  web:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ad_checker_web
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - CHROMA_URL=http://chroma:8000
    depends_on:
      chroma:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - ad-checker-network

volumes:
  chroma-data:
    driver: local

networks:
  ad-checker-network:
    driver: bridge
```

### 主要設定の説明

| 設定項目 | 説明 |
|---------|------|
| **volumes** | ChromaDBデータを永続化（コンテナ再起動時もデータ保持） |
| **networks** | 2つのサービスが同じネットワークで通信 |
| **depends_on** | ChromaDBが健全（healthy）になってからWebアプリ起動 |
| **healthcheck** | サービスの稼働状態を定期チェック |
| **restart: unless-stopped** | コンテナ停止時に自動再起動 |

---

## デプロイ手順

### ステップ1: 環境変数の設定

`.env`ファイルを作成（本番環境用）:

```bash
# .envファイルを作成
cp .env.example .env
```

**編集内容:**

```bash
# Gemini API Key (Vector DBセットアップ用 - 初回のみ必要)
GEMINI_API_KEY=your_gemini_api_key_here

# ChromaDB URL (Docker Composeでは自動設定)
CHROMA_URL=http://chroma:8000

# Node Environment
NODE_ENV=production
```

**注意:**
- `GEMINI_API_KEY`はVector DBセットアップ時のみ必要
- アプリケーション実行時は、ユーザーがUIでAPIキーを入力

---

### ステップ2: Dockerイメージのビルド

```bash
# すべてのサービスをビルド
docker-compose build

# または個別にビルド
docker-compose build web
docker-compose build chroma
```

**ビルド時間:** 約3〜5分（初回）

**確認:**
```bash
# イメージ一覧を確認
docker images

# 期待される出力:
# REPOSITORY            TAG       IMAGE ID       SIZE
# ad-legal-checker-web  latest    abc123...      450MB
# chromadb/chroma       latest    def456...      1.2GB
```

---

### ステップ3: サービスの起動

```bash
# バックグラウンドで起動
docker-compose up -d

# または、フォアグラウンドでログを確認しながら起動
docker-compose up
```

**起動確認:**
```bash
# コンテナの状態を確認
docker-compose ps

# 期待される出力:
# NAME                COMMAND              SERVICE   STATUS    PORTS
# ad_checker_chroma   ...                  chroma    Up        0.0.0.0:8000->8000/tcp
# ad_checker_web      docker-entry...      web       Up        0.0.0.0:3000->3000/tcp
```

---

### ステップ4: Vector Database の初期化

**初回起動時のみ実行が必要です。**

#### 方法1: 環境変数で自動セットアップ

`.env`ファイルに以下を追加:

```bash
SETUP_VECTOR_DB=true
CLEAR_EXISTING=true
GEMINI_API_KEY=your_api_key_here
```

その後、再起動:

```bash
docker-compose down
docker-compose up -d
```

#### 方法2: コンテナ内で手動実行

```bash
# Webコンテナ内でセットアップスクリプトを実行
docker-compose exec web npm run setup:vector-db
```

**実行時間:** 約5〜10分

**ログ確認:**
```bash
# リアルタイムログを確認
docker-compose logs -f web

# 期待される出力:
# web  | 🚀 Vector DB Setup Started
# web  | ✅ Loaded 131 knowledge files
# web  | ✅ Generated 1,333 chunks with embeddings
# web  | ✅ Vector database setup complete!
```

#### セットアップ後のクリーンアップ

`.env`ファイルから以下を削除:

```bash
# 削除する行:
SETUP_VECTOR_DB=true
CLEAR_EXISTING=true
GEMINI_API_KEY=your_api_key_here  # セキュリティのため削除
```

再起動:

```bash
docker-compose restart web
```

---

### ステップ5: 動作確認

#### 5-1. ヘルスチェック

```bash
# ChromaDBのヘルスチェック
curl http://localhost:8000/api/v1/heartbeat

# Webアプリのヘルスチェック
curl http://localhost:3000/api/health

# 期待される出力:
# {"status":"ok","timestamp":"...","services":{"chromadb":"connected"}}
```

#### 5-2. Webブラウザでアクセス

```
http://localhost:3000
```

#### 5-3. APIテスト

```bash
# セグメント分割API
curl -X POST http://localhost:3000/api/v2/segment \
  -H "Content-Type: application/json" \
  -d '{
    "full_text": "ヒアルロン酸配合。シワに効く。",
    "productId": "HA",
    "apiKey": "YOUR_GEMINI_API_KEY"
  }'
```

---

## 運用コマンド

### サービスの操作

```bash
# 起動
docker-compose up -d

# 停止
docker-compose down

# 再起動
docker-compose restart

# 特定サービスのみ再起動
docker-compose restart web
docker-compose restart chroma

# ログ確認
docker-compose logs -f web

# コンテナ内でコマンド実行
docker-compose exec web sh
docker-compose exec chroma sh
```

### データの管理

```bash
# Volumeの確認
docker volume ls

# Volumeのバックアップ（推奨）
docker run --rm -v ad-legal-checker_chroma-data:/data -v $(pwd):/backup \
  busybox tar czf /backup/chroma-backup-$(date +%Y%m%d).tar.gz /data

# Volumeのリストア
docker run --rm -v ad-legal-checker_chroma-data:/data -v $(pwd):/backup \
  busybox tar xzf /backup/chroma-backup-YYYYMMDD.tar.gz -C /

# Volumeの削除（注意: データが完全に削除されます）
docker-compose down -v
```

### イメージの更新

```bash
# 最新コードをpull
git pull origin main

# イメージを再ビルド
docker-compose build --no-cache

# コンテナを再起動
docker-compose down
docker-compose up -d
```

---

## 本番環境での推奨設定

### 1. リバースプロキシ（Nginx）

Nginxを前段に配置してSSL終端・ロードバランシングを実施:

**docker-compose.prod.yml:**

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on:
      - web
    networks:
      - ad-checker-network

  # 既存のwebサービス（ポートを内部のみに変更）
  web:
    ports: []  # 外部に公開しない
    expose:
      - "3000"
```

**nginx.conf（サンプル）:**

```nginx
upstream web_backend {
    server web:3000;
}

server {
    listen 80;
    server_name adchecker.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name adchecker.example.com;

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    location / {
        proxy_pass http://web_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 2. ログローテーション

Docker Composeでログサイズを制限:

```yaml
services:
  web:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
  chroma:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### 3. リソース制限

メモリ・CPU制限を設定:

```yaml
services:
  web:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 1G
  chroma:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
```

---

## トラブルシューティング

### コンテナが起動しない

```bash
# ログを確認
docker-compose logs web

# 考えられる原因:
# 1. ポート3000が既に使用中
#    → docker-compose.ymlでポートを変更: "3001:3000"
# 2. .envファイルが存在しない
#    → cp .env.example .env
# 3. Dockerfileのビルドエラー
#    → docker-compose build --no-cache web
```

### ChromaDBに接続できない

```bash
# ChromaDBのヘルスチェック
docker-compose exec chroma curl http://localhost:8000/api/v1/heartbeat

# ネットワーク確認
docker network ls
docker network inspect ad-legal-checker_ad-checker-network

# ChromaDBログ確認
docker-compose logs chroma
```

### Volumeデータが消える

**原因:** `docker-compose down -v`で誤ってVolumeを削除

**予防策:**
```bash
# Volumeを削除しない停止コマンド
docker-compose down  # -vオプションなし

# 定期的にバックアップ
./scripts/backup-chroma.sh  # バックアップスクリプトを作成推奨
```

---

## セキュリティ対策

### 1. APIキーを環境変数に保存しない

```bash
# ❌ 避けるべき設定
GEMINI_API_KEY=AIzaSyC...  # .envに本番APIキーを保存

# ✅ 推奨設定
# .envにはVector DBセットアップ時のみ一時的に設定
# セットアップ後は削除
```

### 2. Dockerイメージのセキュリティスキャン

```bash
# Trivyでイメージをスキャン
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image ad-legal-checker-web:latest
```

### 3. ファイアウォール設定

```bash
# サーバーで不要なポートをブロック
# ポート3000と8000を外部からアクセス不可に設定
# Nginxのポート80/443のみ許可
```

---

## パフォーマンス最適化

### 1. マルチステージビルド

Dockerfileでマルチステージビルドを使用してイメージサイズを削減:

```dockerfile
# ビルドステージ
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

# 実行ステージ
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
CMD ["npm", "start"]
```

### 2. Volumeのバックアップ自動化

cronジョブでバックアップスクリプトを定期実行:

```bash
# crontabに追加（毎日午前2時）
0 2 * * * /path/to/kitanoadchecker/scripts/backup-chroma.sh
```

---

## まとめ

Docker Composeデプロイのチェックリスト:

- [ ] Docker & Docker Composeがインストール済み
- [ ] `.env`ファイルが設定済み
- [ ] `docker-compose build`でイメージビルド完了
- [ ] `docker-compose up -d`でサービス起動
- [ ] Vector DBを初期化（初回のみ）
- [ ] ヘルスチェックが成功
- [ ] Webアプリにアクセス可能
- [ ] Nginxでリバースプロキシ設定（本番環境）
- [ ] ログローテーション設定
- [ ] バックアップスクリプト作成

次のステップ:
- **[04_ENVIRONMENT_VARIABLES.md](./04_ENVIRONMENT_VARIABLES.md)** - 環境変数の詳細
- **[07_TROUBLESHOOTING.md](./07_TROUBLESHOOTING.md)** - トラブルシューティング
- **[10_MAINTENANCE_GUIDE.md](./10_MAINTENANCE_GUIDE.md)** - メンテナンス手順
