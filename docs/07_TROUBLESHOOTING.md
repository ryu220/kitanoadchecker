# 07. トラブルシューティングガイド - Troubleshooting Guide

## 概要

このドキュメントは、**kitanoadchecker**の一般的な問題と解決策をまとめたものです。

---

## 目次

1. [ChromaDB接続エラー](#chromadb接続エラー)
2. [Gemini APIエラー](#gemini-apiエラー)
3. [Vector DB初期化エラー](#vector-db初期化エラー)
4. [ビルドエラー](#ビルドエラー)
5. [デプロイエラー](#デプロイエラー)
6. [実行時エラー](#実行時エラー)
7. [パフォーマンス問題](#パフォーマンス問題)

---

## ChromaDB接続エラー

### エラー: `Connection refused (ECONNREFUSED)`

**症状:**
```
Error: connect ECONNREFUSED 127.0.0.1:8000
```

**原因:**
ChromaDBが起動していない、またはポートが間違っている

**解決策:**

```bash
# 1. ChromaDBの状態を確認
docker-compose ps

# 2. ChromaDBが起動していない場合
docker-compose up chroma -d

# 3. ヘルスチェック
curl http://localhost:8000/api/v1/heartbeat

# 期待される出力:
# {"nanosecond heartbeat":...}
```

**環境変数の確認:**

```bash
# .envファイルを確認
cat .env | grep CHROMA_URL

# 期待される値:
# CHROMA_URL=http://localhost:8000
```

---

### エラー: `ChromaDB returned 404`

**症状:**
```
Error: Collection 'ad_checker_knowledge' not found
```

**原因:**
Vector DBが初期化されていない

**解決策:**

```bash
# Vector DBをセットアップ
npm run setup:vector-db

# または既存データをクリアして再セットアップ
CLEAR_EXISTING=true npm run setup:vector-db
```

---

### エラー: `Timeout waiting for ChromaDB`

**症状:**
```
Error: ChromaDB request timeout after 30000ms
```

**原因:**
- ChromaDBが過負荷
- ネットワーク接続が遅い
- ChromaDBのメモリ不足

**解決策:**

```bash
# 1. ChromaDBのログを確認
docker-compose logs chroma

# 2. ChromaDBを再起動
docker-compose restart chroma

# 3. メモリ使用量を確認
docker stats ad_checker_chroma

# 4. メモリ不足の場合、Dockerリソース制限を増やす
# docker-compose.ymlでメモリ制限を調整
```

---

## Gemini APIエラー

### エラー: `Invalid API key`

**症状:**
```
Error: API key not valid. Please pass a valid API key.
```

**原因:**
無効なGemini APIキー

**解決策:**

```bash
# 1. Google AI StudioでAPIキーを再確認
# https://aistudio.google.com/app/apikey

# 2. .envファイルを更新
GEMINI_API_KEY=AIzaSyC...（新しいAPIキー）

# 3. アプリケーションを再起動
npm run dev
```

---

### エラー: `Quota exceeded`

**症状:**
```
Error: Resource has been exhausted (e.g. check quota).
```

**原因:**
Gemini APIの呼び出し制限を超えた

**解決策:**

```bash
# 1. Google AI Studioでクォータを確認
# https://aistudio.google.com/

# 2. 数分待ってから再試行

# 3. クォータ超過が頻発する場合:
#    - リクエスト頻度を減らす
#    - 有料プランに移行
#    - レート制限を実装
```

**レート制限の実装例:**

```typescript
// lib/rate-limiter.ts
import pLimit from 'p-limit';

// 同時リクエスト数を1に制限
const limit = pLimit(1);

export async function callGeminiWithLimit(fn: () => Promise<any>) {
  return limit(fn);
}
```

---

### エラー: `Model not found`

**症状:**
```
Error: Model 'gemini-2.0-flash-exp' not found
```

**原因:**
指定したモデルが存在しない、またはAPIキーに権限がない

**解決策:**

```bash
# 1. 使用可能なモデルを確認
# https://ai.google.dev/models/gemini

# 2. lib/gemini-client.tsでモデル名を確認
# デフォルト: 'gemini-2.0-flash-exp'

# 3. モデル名を変更（必要に応じて）
MODEL_NAME='gemini-1.5-flash'
```

---

## Vector DB初期化エラー

### エラー: `GEMINI_API_KEY environment variable is required`

**症状:**
```
❌ Error: GEMINI_API_KEY environment variable is required
```

**原因:**
Vector DBセットアップ時に`GEMINI_API_KEY`が設定されていない

**解決策:**

```bash
# 1. .envファイルにAPIキーを追加
echo "GEMINI_API_KEY=AIzaSyC..." >> .env

# 2. セットアップを再実行
npm run setup:vector-db
```

---

### エラー: `Failed to load knowledge files`

**症状:**
```
Error: ENOENT: no such file or directory, scandir 'knowledge/common'
```

**原因:**
knowledgeディレクトリが存在しない、または空

**解決策:**

```bash
# 1. knowledgeディレクトリの存在を確認
ls -la knowledge/

# 2. ファイル数を確認
find knowledge/ -name "*.txt" | wc -l

# 期待される出力: 131以上

# 3. ファイルが不足している場合、GitHubから再クローン
git pull origin main
```

---

### エラー: `Failed to generate embeddings`

**症状:**
```
Error: Failed to generate embeddings for chunk 123
```

**原因:**
- Gemini APIエラー
- ネットワークエラー
- チャンクサイズが大きすぎる

**解決策:**

```bash
# 1. ネットワーク接続を確認
ping api.google.com

# 2. Gemini APIキーを確認
curl -H "x-goog-api-key: YOUR_API_KEY" \
  https://generativelanguage.googleapis.com/v1/models

# 3. チャンクサイズを小さくする（lib/knowledge-chunker.ts）
# デフォルト: 1000文字 → 500文字に変更
```

---

## ビルドエラー

### エラー: `Cannot find module 'xxx'`

**症状:**
```
Error: Cannot find module '@/lib/types'
```

**原因:**
依存パッケージがインストールされていない

**解決策:**

```bash
# 1. node_modulesを削除
rm -rf node_modules package-lock.json

# 2. 再インストール
npm install

# 3. TypeScriptの型チェック
npm run typecheck
```

---

### エラー: `Type error: Type 'string' is not assignable to type 'ProductId'`

**症状:**
```
Type error: Type '"XX"' is not assignable to type 'ProductId'.
```

**原因:**
`lib/types.ts`に新規商品IDが追加されていない

**解決策:**

```typescript
// lib/types.ts
export const PRODUCT_IDS = [
  // ...
  'XX' // ← 追加
] as const;
```

---

### エラー: `ESLint errors found`

**症状:**
```
Error: ESLint found 5 errors
```

**解決策:**

```bash
# 1. ESLintエラーを確認
npm run lint

# 2. 自動修正を試みる
npm run lint -- --fix

# 3. 手動で修正が必要な場合、エラー箇所を確認
```

---

## デプロイエラー

### Railway: `Build failed`

**症状:**
Railwayのデプロイログで`Build failed`エラー

**原因:**
- Dockerfileのビルドエラー
- 依存パッケージのインストールエラー
- メモリ不足

**解決策:**

```bash
# 1. ローカルでDockerビルドをテスト
docker build -t test .

# 2. エラーログを確認
docker build -t test . 2>&1 | tee build.log

# 3. package.jsonの依存関係を確認
npm ls

# 4. Railwayのビルドログを確認
# ダッシュボード → Deployments → Build Logs
```

---

### Railway: `Deployment timeout`

**症状:**
デプロイが10分以上かかり、タイムアウト

**原因:**
- Vector DBセットアップに時間がかかっている
- ビルドプロセスが遅い

**解決策:**

```bash
# 1. SETUP_VECTOR_DBを無効化
# Railwayの環境変数からSETUP_VECTOR_DBを削除

# 2. Vector DBは別途セットアップ
# 一度デプロイが成功したら、SETUP_VECTOR_DB=trueで再デプロイ

# 3. ビルドキャッシュを有効化（Dockerfile）
# RailwayはDockerキャッシュを自動的に使用
```

---

### Docker Compose: `Port already in use`

**症状:**
```
Error: Bind for 0.0.0.0:3000 failed: port is already allocated
```

**原因:**
ポート3000が既に使用されている

**解決策:**

```bash
# 1. ポート使用状況を確認
# Windows:
netstat -ano | findstr :3000

# macOS/Linux:
lsof -i :3000

# 2. 既存プロセスを停止
kill -9 <PID>

# 3. または、docker-compose.ymlでポートを変更
ports:
  - "3001:3000"  # ホスト側を3001に変更
```

---

## 実行時エラー

### エラー: `Segmentation failed`

**症状:**
広告文がセグメント分割されない

**原因:**
- Gemini APIエラー
- プロンプトが長すぎる
- APIキーが無効

**解決策:**

```bash
# 1. APIキーを確認
curl -X POST http://localhost:3000/api/v2/validate-api-key \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "YOUR_API_KEY"}'

# 2. 広告文の長さを確認
# 最大10,000文字まで

# 3. ログを確認
# ブラウザのコンソール（F12）でエラーを確認
```

---

### エラー: `Evaluation failed`

**症状:**
セグメント評価が失敗する

**原因:**
- RAG検索エラー
- Vector DBデータが存在しない
- Gemini APIエラー

**解決策:**

```bash
# 1. Vector DBを確認
curl http://localhost:8000/api/v1/collections

# 期待される出力:
# ["ad_checker_knowledge"]

# 2. Vector DBデータを確認
npm run check-env

# 3. Vector DBを再構築
CLEAR_EXISTING=true npm run setup:vector-db
```

---

### エラー: `Report generation failed`

**症状:**
レポート生成が失敗する

**原因:**
- 部分レポートが空
- Markdown生成エラー

**解決策:**

```bash
# 1. ブラウザのコンソールでエラーを確認

# 2. APIレスポンスを確認
# Network タブでレスポンスをチェック

# 3. サーバーログを確認
# ターミナルでNext.jsのログを確認
```

---

## パフォーマンス問題

### 問題: `Evaluation is slow (>30 seconds)`

**症状:**
評価に30秒以上かかる

**原因:**
- RAG検索が遅い
- Gemini APIレスポンスが遅い
- セグメント数が多すぎる

**解決策:**

```bash
# 1. RAGキャッシュを有効化（デフォルトで有効）
# lib/cache/rag-search-cache.ts

# 2. セグメント数を減らす
# セグメント分割の粒度を調整

# 3. Gemini APIのタイムアウトを延長
# lib/gemini-client.ts
const client = new GoogleGenerativeAI({
  apiKey,
  timeout: 60000  // 60秒に延長
});
```

---

### 問題: `High memory usage`

**症状:**
メモリ使用量が高い（>2GB）

**原因:**
- Vector DBデータが大きすぎる
- キャッシュが肥大化
- メモリリーク

**解決策:**

```bash
# 1. メモリ使用量を確認
docker stats

# 2. ChromaDBのメモリ制限を設定
# docker-compose.yml
services:
  chroma:
    deploy:
      resources:
        limits:
          memory: 1G

# 3. Next.jsのメモリ制限を設定
NODE_OPTIONS="--max-old-space-size=2048" npm run dev
```

---

## ログの確認方法

### ローカル環境

```bash
# Next.jsのログ
# ターミナルに表示される

# ChromaDBのログ
docker-compose logs chroma

# リアルタイムログ
docker-compose logs -f web
docker-compose logs -f chroma
```

### Railway環境

```
1. Railwayダッシュボードを開く
2. 該当サービスを選択
3. Deployments タブを開く
4. 最新のデプロイをクリック
5. ログを確認
```

### Docker環境

```bash
# すべてのログ
docker-compose logs

# 特定サービスのログ
docker-compose logs web
docker-compose logs chroma

# リアルタイムログ
docker-compose logs -f
```

---

## デバッグモード

### 詳細ログを有効化

```bash
# .env
NODE_ENV=development
DEBUG=true  # デバッグモードを有効化

# 再起動
npm run dev
```

### ブラウザのデバッグ

```
1. F12キーでDeveloper Toolsを開く
2. Consoleタブでエラーを確認
3. NetworkタブでAPIリクエスト/レスポンスを確認
4. Sourcesタブでブレークポイントを設定
```

---

## サポート

### 問題が解決しない場合

1. **GitHubイシューを作成:**
   - https://github.com/your-org/kitanoadchecker/issues
   - エラーメッセージ、ログ、環境情報を含める

2. **ドキュメントを確認:**
   - [01_SETUP_GUIDE.md](./01_SETUP_GUIDE.md)
   - [02_DEPLOYMENT_RAILWAY.md](./02_DEPLOYMENT_RAILWAY.md)
   - [04_ENVIRONMENT_VARIABLES.md](./04_ENVIRONMENT_VARIABLES.md)

3. **コミュニティに質問:**
   - Stack Overflow
   - Discord（準備中）

---

## よくある質問（FAQ）

### Q1: Vector DBセットアップに何分かかりますか？

**A:** 約5〜10分です。ナレッジファイル数とGemini APIのレスポンス速度によります。

---

### Q2: APIキーはどこで取得できますか？

**A:** Google AI Studioで取得できます: https://aistudio.google.com/app/apikey

---

### Q3: 本番環境でAPIキーを保存すべきですか？

**A:** いいえ、本番環境ではAPIキーを環境変数に保存しないでください。ユーザーがUIでAPIキーを入力する設計です。

---

### Q4: Vector DBデータはどこに保存されますか？

**A:** DockerのVolumeに保存されます（`ad-legal-checker_chroma-data`）。

---

### Q5: ナレッジファイルを更新したらどうすればいいですか？

**A:** `CLEAR_EXISTING=true npm run setup:vector-db`でVector DBを再構築してください。

---

## まとめ

トラブルシューティングのチェックリスト:

- [ ] ChromaDBが起動している
- [ ] Gemini APIキーが有効
- [ ] Vector DBが初期化されている
- [ ] 環境変数が正しく設定されている
- [ ] ログでエラーを確認
- [ ] 必要に応じてサービスを再起動

さらなるサポートが必要な場合:
- **[08_API_REFERENCE.md](./08_API_REFERENCE.md)** - API仕様書
- **[10_MAINTENANCE_GUIDE.md](./10_MAINTENANCE_GUIDE.md)** - メンテナンス手順
- GitHubイシュー: https://github.com/your-org/kitanoadchecker/issues
