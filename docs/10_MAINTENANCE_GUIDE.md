# 10. メンテナンスガイド - Maintenance Guide

## 概要

このガイドは、**kitanoadchecker**の定期メンテナンス手順と運用管理方法を説明します。

---

## 定期メンテナンスタスク

### 日次メンテナンス

| タスク | 頻度 | 重要度 | 所要時間 |
|-------|------|--------|---------|
| [ヘルスチェック確認](#ヘルスチェック) | 毎日 | 高 | 1分 |
| [エラーログ確認](#ログ監視) | 毎日 | 高 | 5分 |

### 週次メンテナンス

| タスク | 頻度 | 重要度 | 所要時間 |
|-------|------|--------|---------|
| [Gemini APIクォータ確認](#gemini-apiクォータ管理) | 週1回 | 中 | 2分 |
| [パフォーマンスレポート確認](#パフォーマンス監視) | 週1回 | 中 | 10分 |

### 月次メンテナンス

| タスク | 頻度 | 重要度 | 所要時間 |
|-------|------|--------|---------|
| [Vector DBバックアップ](#vector-dbバックアップ) | 月1回 | 高 | 5分 |
| [ナレッジベース更新確認](#ナレッジベース更新) | 月1回 | 高 | 30分 |
| [依存パッケージ更新](#依存パッケージ更新) | 月1回 | 中 | 20分 |

### 四半期メンテナンス

| タスク | 頻度 | 重要度 | 所要時間 |
|-------|------|--------|---------|
| [セキュリティ監査](#セキュリティ監査) | 四半期1回 | 高 | 2時間 |
| [パフォーマンス最適化](#パフォーマンス最適化) | 四半期1回 | 中 | 4時間 |

---

## ヘルスチェック

### 1. システム稼働確認

**頻度:** 毎日

**手順:**

```bash
# 1. ヘルスチェックエンドポイントにアクセス
curl https://your-app.up.railway.app/api/health

# 期待される出力:
# {
#   "status": "ok",
#   "timestamp": "2025-10-29T12:34:56.789Z",
#   "services": {
#     "chromadb": "connected"
#   }
# }
```

**異常時の対応:**

```bash
# ChromaDB未接続の場合
# Railway:
# 1. Railwayダッシュボードでchromaサービスを確認
# 2. 再起動が必要な場合: Settings → Restart

# Docker:
# 1. ChromaDBの状態を確認
docker-compose ps chroma

# 2. 再起動
docker-compose restart chroma
```

### 2. Vector DBデータ確認

**頻度:** 週1回

```bash
# ローカル環境
curl http://localhost:8000/api/v1/collections

# 期待される出力:
# ["ad_checker_knowledge"]

# ドキュメント数を確認（環境チェックツール）
npm run check-env

# 期待される出力:
# ✅ Vector DB: Data exists (1,333 chunks)
```

---

## ログ監視

### 1. エラーログ確認

**頻度:** 毎日

**ローカル環境:**

```bash
# Next.jsログ
# ターミナルに表示される

# ChromaDBログ
docker-compose logs chroma --tail 100
```

**Railway環境:**

```
1. Railwayダッシュボードを開く
2. Webアプリサービスを選択
3. Deployments → 最新デプロイ → Logs
```

**確認ポイント:**

| ログメッセージ | 重要度 | 対応 |
|--------------|--------|------|
| `Error: Connection refused` | 高 | ChromaDB再起動 |
| `Error: Quota exceeded` | 中 | Gemini APIクォータ確認 |
| `Warning: Cache size exceeded` | 低 | キャッシュクリア検討 |

### 2. アクセスログ分析

**頻度:** 週1回

**確認項目:**

```bash
# リクエスト数の推移
# - /api/v2/segment
# - /api/v2/evaluate-batch
# - /api/v2/report

# エラー率の推移
# - 5xx エラー（サーバーエラー）
# - 4xx エラー（クライアントエラー）
```

---

## Gemini APIクォータ管理

### 1. クォータ確認

**頻度:** 週1回

**手順:**

1. Google AI Studioにアクセス: https://aistudio.google.com/
2. ログイン
3. 「API Quota」を確認

**確認項目:**

| 項目 | 無料枠 | 推奨アラート閾値 |
|-----|--------|----------------|
| リクエスト数/分 | 60回 | 80%（48回） |
| リクエスト数/日 | 1,500回 | 80%（1,200回） |

### 2. クォータ超過時の対応

**即時対応:**

```
1. ユーザーに一時的な利用制限を案内
2. 数分待ってから再試行
```

**長期対応:**

```
1. Gemini APIの有料プランを検討
2. レート制限の実装
3. キャッシュの活用強化
```

---

## Vector DBバックアップ

### 1. バックアップスクリプト

**頻度:** 月1回

**Docker環境:**

```bash
#!/bin/bash
# scripts/backup-chroma.sh

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/chroma-backup-${TIMESTAMP}.tar.gz"

# バックアップディレクトリを作成
mkdir -p ${BACKUP_DIR}

# ChromaDB Volumeをバックアップ
docker run --rm \
  -v ad-legal-checker_chroma-data:/data \
  -v $(pwd)/${BACKUP_DIR}:/backup \
  busybox tar czf /backup/chroma-backup-${TIMESTAMP}.tar.gz /data

echo "✅ Backup completed: ${BACKUP_FILE}"

# 古いバックアップを削除（30日以上前）
find ${BACKUP_DIR} -name "chroma-backup-*.tar.gz" -mtime +30 -delete
```

**実行:**

```bash
chmod +x scripts/backup-chroma.sh
./scripts/backup-chroma.sh
```

### 2. バックアップの自動化（cron）

```bash
# crontabに追加
crontab -e

# 毎月1日午前2時に実行
0 2 1 * * /path/to/kitanoadchecker/scripts/backup-chroma.sh >> /var/log/chroma-backup.log 2>&1
```

### 3. リストア手順

```bash
# バックアップファイルを指定してリストア
BACKUP_FILE="backups/chroma-backup-20251029_020000.tar.gz"

docker run --rm \
  -v ad-legal-checker_chroma-data:/data \
  -v $(pwd):/backup \
  busybox tar xzf /backup/${BACKUP_FILE} -C /

echo "✅ Restore completed from: ${BACKUP_FILE}"

# ChromaDBを再起動
docker-compose restart chroma
```

---

## ナレッジベース更新

### 1. 法令改正の確認

**頻度:** 月1回

**確認先:**

| 機関 | URL | 確認内容 |
|-----|-----|---------|
| 厚生労働省 | https://www.mhlw.go.jp/ | 薬機法改正 |
| 消費者庁 | https://www.caa.go.jp/ | 景表法改正 |
| 経済産業省 | https://www.meti.go.jp/ | 特商法改正 |

### 2. ナレッジファイル更新

**手順:**

```bash
# 1. 新規/更新ファイルをknowledge/common/に配置
cp new-regulation.txt knowledge/common/54_新規法令.txt

# 2. knowledge-mapping.csvを更新
# CSVエディタで以下を追加:
# 全商品,54_新規法令,P2,薬機法,法令

# 3. Vector DBを再構築
CLEAR_EXISTING=true npm run setup:vector-db

# 4. 動作確認
npm run check-env

# 5. Gitにコミット
git add knowledge/
git commit -m "Update knowledge: Add new regulation (Law XX)"
git push origin main
```

### 3. 本番環境への反映

**Railway:**

```
1. GitHubへpush（上記手順5）
2. Railwayが自動デプロイ開始
3. 環境変数を一時設定:
   - SETUP_VECTOR_DB=true
   - CLEAR_EXISTING=true
   - GEMINI_API_KEY=（一時的）
4. デプロイ完了を確認
5. 環境変数を削除
```

---

## 依存パッケージ更新

### 1. パッケージバージョン確認

**頻度:** 月1回

```bash
# 最新バージョンを確認
npm outdated

# 出力例:
# Package                Current  Wanted  Latest
# next                   14.2.0   14.2.5  14.3.0
# @google/generative-ai  0.24.1   0.24.2  0.25.0
```

### 2. パッケージ更新手順

**マイナーアップデート:**

```bash
# 1. package.jsonのバージョンを更新
# 例: "next": "^14.2.0" → "^14.2.5"

# 2. インストール
npm install

# 3. 型チェック
npm run typecheck

# 4. ビルド
npm run build

# 5. 動作確認
npm run dev
```

**メジャーアップデート:**

```bash
# 1. 変更履歴を確認
# 例: Next.js 14 → 15の場合、Breaking Changesを確認

# 2. ステージング環境で検証
# 3. 動作確認後、本番環境に適用
```

### 3. セキュリティパッチ

**緊急対応が必要な場合:**

```bash
# セキュリティ脆弱性を確認
npm audit

# 自動修正を試みる
npm audit fix

# 手動修正が必要な場合
npm audit fix --force

# ビルド・テストを実行
npm run build
npm test
```

---

## パフォーマンス監視

### 1. レスポンス時間の測定

**頻度:** 週1回

**測定方法:**

```bash
# セグメント分割API
time curl -X POST http://localhost:3000/api/v2/segment \
  -H "Content-Type: application/json" \
  -d '{...}'

# 期待値: 0.1秒以下

# 評価API（バッチ）
time curl -X POST http://localhost:3000/api/v2/evaluate-batch \
  -H "Content-Type: application/json" \
  -d '{...}'

# 期待値: 10〜60秒（セグメント数により変動）
```

### 2. パフォーマンス劣化時の対応

**確認ポイント:**

| 症状 | 原因候補 | 対応 |
|-----|---------|------|
| セグメント分割が遅い | - | ルールベースなので通常遅延なし |
| RAG検索が遅い | ChromaDBメモリ不足 | ChromaDBのメモリ増強 |
| 評価が遅い | Gemini APIレスポンス遅延 | キャッシュ活用、リクエスト分散 |

**最適化手順:**

```bash
# 1. キャッシュクリア
# lib/cache/rag-search-cache.ts
# キャッシュサイズを確認

# 2. ChromaDBの再起動
docker-compose restart chroma

# 3. Vector DBの最適化
# 不要なドキュメントを削除（該当する場合）
```

---

## セキュリティ監査

### 1. 脆弱性スキャン

**頻度:** 四半期1回

**ツール:**

```bash
# 1. npm audit
npm audit

# 2. Dockerイメージスキャン（Trivy）
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image ad-legal-checker-web:latest

# 3. 環境変数チェック
# .envファイルがGitにコミットされていないか確認
git ls-files .env
# 出力なしが正常
```

### 2. アクセス制限の確認

**確認項目:**

```
1. APIキーがサーバー環境変数に保存されていないか
   → Railway/Dockerの環境変数を確認
   → GEMINI_API_KEYが設定されていないこと

2. ChromaDBが外部からアクセス可能でないか
   → ファイアウォール設定を確認
   → ポート8000が内部のみアクセス可能

3. HTTPSが有効か
   → Railway: 自動的にHTTPS
   → セルフホスト: Nginx等でSSL終端を設定
```

---

## データ整合性チェック

### 1. Vector DBデータ確認

**頻度:** 月1回

```bash
# 1. ドキュメント数を確認
npm run check-env

# 期待される出力:
# ✅ Vector DB: Data exists (1,333 chunks)

# 2. ナレッジファイル数と一致するか確認
find knowledge/ -name "*.txt" | wc -l
# 期待値: 131ファイル（common）+ 商品固有ファイル

# 3. 不一致の場合、Vector DBを再構築
CLEAR_EXISTING=true npm run setup:vector-db
```

---

## 緊急対応手順

### 1. サービスダウン時

**手順:**

```
1. ヘルスチェック実行
   curl https://your-app.up.railway.app/api/health

2. ChromaDB確認
   - Railway: chromaサービスの状態を確認
   - Docker: docker-compose ps chroma

3. ログ確認
   - エラーメッセージを特定

4. サービス再起動
   - Railway: Settings → Restart
   - Docker: docker-compose restart

5. 再度ヘルスチェック
   curl https://your-app.up.railway.app/api/health
```

### 2. Vector DBデータ破損時

**手順:**

```bash
# 1. バックアップから復元
./scripts/restore-chroma.sh backups/chroma-backup-YYYYMMDD.tar.gz

# 2. バックアップがない場合、再構築
CLEAR_EXISTING=true npm run setup:vector-db

# 3. 動作確認
npm run check-env
```

---

## チェックリスト

### 日次チェックリスト

- [ ] ヘルスチェック実行（`/api/health`）
- [ ] エラーログ確認（Railway/Docker）

### 週次チェックリスト

- [ ] Gemini APIクォータ確認
- [ ] パフォーマンスレポート確認
- [ ] アクセスログ分析

### 月次チェックリスト

- [ ] Vector DBバックアップ実行
- [ ] ナレッジベース更新確認（法令改正）
- [ ] 依存パッケージ更新確認（`npm outdated`）
- [ ] Vector DBデータ整合性確認

### 四半期チェックリスト

- [ ] セキュリティ監査実行（`npm audit`, Trivy）
- [ ] パフォーマンス最適化検討
- [ ] バックアップ復元テスト

---

## ドキュメントメンテナンス

### ドキュメント更新タイミング

| ドキュメント | 更新タイミング |
|------------|--------------|
| **[01_SETUP_GUIDE.md](./01_SETUP_GUIDE.md)** | 環境構築手順変更時 |
| **[02_DEPLOYMENT_RAILWAY.md](./02_DEPLOYMENT_RAILWAY.md)** | デプロイ手順変更時 |
| **[05_KNOWLEDGE_MANAGEMENT.md](./05_KNOWLEDGE_MANAGEMENT.md)** | ナレッジ構造変更時 |
| **[08_API_REFERENCE.md](./08_API_REFERENCE.md)** | API仕様変更時 |
| **[09_ARCHITECTURE.md](./09_ARCHITECTURE.md)** | アーキテクチャ変更時 |
| **本ドキュメント** | メンテナンス手順変更時 |

---

## まとめ

メンテナンスガイドのポイント:

- **日次**: ヘルスチェック、エラーログ確認
- **週次**: クォータ管理、パフォーマンス監視
- **月次**: バックアップ、ナレッジ更新、パッケージ更新
- **四半期**: セキュリティ監査、最適化

定期メンテナンスを実施することで、システムの安定稼働を維持できます。

次のステップ:
- **[01_SETUP_GUIDE.md](./01_SETUP_GUIDE.md)** - 初回セットアップ
- **[07_TROUBLESHOOTING.md](./07_TROUBLESHOOTING.md)** - トラブルシューティング
- **[09_ARCHITECTURE.md](./09_ARCHITECTURE.md)** - システムアーキテクチャ
