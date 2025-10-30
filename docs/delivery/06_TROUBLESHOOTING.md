# トラブルシューティングガイド

**対象**: システム障害・エラー対応
**バージョン**: v1.0
**最終更新**: 2025年10月30日

---

## 📋 目次

1. [よくある問題と解決策](#よくある問題と解決策)
2. [ChromaDB関連](#chromadb関連)
3. [Gemini API関連](#gemini-api関連)
4. [ナレッジベース関連](#ナレッジベース関連)
5. [ビルド・デプロイ関連](#ビルドデプロイ関連)
6. [判定結果関連](#判定結果関連)
7. [パフォーマンス関連](#パフォーマンス関連)
8. [ログ確認方法](#ログ確認方法)
9. [緊急時の対応](#緊急時の対応)

---

## よくある問題と解決策

### 問題1: ChromaDBに接続できない

#### 症状
```
Error: Failed to connect to ChromaDB at http://localhost:8000
```

#### 原因
- ChromaDBコンテナが起動していない
- ポート8000が他のプロセスに使用されている
- Docker Desktopが起動していない

#### 解決策

**Step 1: Dockerの状態確認**
```bash
# Dockerが起動しているか確認
docker ps

# ChromaDBコンテナの状態確認
docker-compose ps
```

**Step 2: ChromaDBコンテナ起動**
```bash
# コンテナを起動
docker-compose up -d chroma

# 起動確認
docker-compose logs chroma
```

**Step 3: ポート競合確認**
```bash
# ポート8000の使用状況確認
lsof -i :8000

# 競合している場合は、該当プロセスを停止
kill -9 <PID>
```

**Step 4: 接続確認**
```bash
# ChromaDBヘルスチェック
curl http://localhost:8000/api/v1/heartbeat

# 成功時の出力:
# {"nanosecond heartbeat": 1730000000000000000}
```

**それでも解決しない場合**:
```bash
# コンテナを再起動
docker-compose down
docker-compose up -d chroma

# ログを確認
docker-compose logs -f chroma
```

---

### 問題2: Gemini API エラー

#### 症状A: API Key Invalid
```
Error: API key not valid. Please pass a valid API key.
```

**原因**: GEMINI_API_KEY が無効または未設定

**解決策**:
```bash
# .envファイルを確認
cat .env | grep GEMINI_API_KEY

# APIキーが設定されていない場合
# 1. https://ai.google.dev/ にアクセス
# 2. 新しいAPIキーを生成
# 3. .env に設定
nano .env

# サーバー再起動
npm run dev
```

#### 症状B: Rate Limit Exceeded
```
Error: Rate limit exceeded. Please try again later.
```

**原因**: Gemini APIのレート制限に達した

**解決策**:
```bash
# 1分待ってから再実行
# または
# Gemini 1.5 Flash（高速・低コスト）への切り替えを検討
```

**レート制限**:
- Gemini 1.5 Pro: 2 RPM（無料枠）
- Gemini 1.5 Flash: 15 RPM（無料枠）

#### 症状C: Quota Exceeded
```
Error: Quota exceeded for quota metric 'Generate content API requests per day'.
```

**原因**: 1日の無料枠を使い切った

**解決策**:
- 翌日まで待つ
- 有料プランへのアップグレード
- キャッシュの有効活用

---

### 問題3: ナレッジベース初期化エラー

#### 症状A: Knowledge Files Not Found
```
Error: Failed to load knowledge files from ./knowledge
```

**原因**: knowledge/ ディレクトリが存在しない or ファイルが不足

**解決策**:
```bash
# ディレクトリ構造確認
ls -la knowledge/

# 期待される構造:
# knowledge/
# ├── common/  (100+ファイル)
# ├── HA/      (11ファイル)
# └── SH/      (8ファイル)

# ファイル数確認
find knowledge/ -type f -name "*.txt" | wc -l
# 期待値: 119以上

# ファイルが不足している場合はリポジトリから再取得
git pull origin master
```

#### 症状B: ChromaDB Collection Creation Failed
```
Error: Failed to create collection 'kitano_knowledge'
```

**原因**:
- ChromaDBが起動していない
- 既存のCollectionと競合

**解決策**:
```bash
# ChromaDB起動確認
docker-compose ps

# Collection削除（初期化）
curl -X DELETE http://localhost:8000/api/v1/collections/kitano_knowledge

# 再初期化
npm run setup:vector-db
```

#### 症状C: Out of Memory
```
Error: JavaScript heap out of memory
```

**原因**: メモリ不足

**解決策**:
```bash
# Node.jsのメモリ上限を増やす
NODE_OPTIONS="--max-old-space-size=4096" npm run setup:vector-db
```

---

### 問題4: ポート競合

#### 症状
```
Error: Port 3000 is already in use
```

**原因**: ポート3000が他のプロセスに使用されている

**解決策**:

**方法1: ポートを変更**
```bash
# ポート3001で起動
PORT=3001 npm run dev
```

**方法2: 既存プロセスを停止**
```bash
# ポート3000を使用しているプロセスを確認
lsof -i :3000

# 出力例:
# COMMAND  PID   USER
# node    1234  user

# プロセスを停止
kill -9 1234
```

---

### 問題5: npm install エラー

#### 症状
```
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
```

**原因**: 依存関係の競合

**解決策**:

**方法1: クリーンインストール**
```bash
# node_modules と package-lock.json を削除
rm -rf node_modules package-lock.json

# 再インストール
npm install
```

**方法2: Legacy Peer Deps**
```bash
npm install --legacy-peer-deps
```

**方法3: Node.jsバージョン確認**
```bash
# 現在のバージョン確認
node --version

# 推奨バージョン: 18.x 以上
# 必要に応じてNode.jsを更新
```

---

## ChromaDB関連

### ChromaDBが起動しない

#### 原因と解決策

**原因1: Dockerデーモンが起動していない**
```bash
# Docker Desktopを起動
open -a Docker
```

**原因2: ポート競合**
```bash
# ポート8000確認
lsof -i :8000

# docker-compose.ymlでポートを変更
# ports:
#   - "8001:8000"  # 外部8001、内部8000

# .envも更新
CHROMA_URL=http://localhost:8001
```

**原因3: Volumeエラー**
```bash
# Volumeを削除して再作成
docker-compose down -v
docker-compose up -d chroma
```

### ChromaDBへの接続が遅い

#### 原因
- Vector DBのサイズが大きい
- メモリ不足

#### 解決策
```bash
# Docker Desktopのメモリ割り当てを増やす
# Settings > Resources > Memory: 4GB → 8GB

# コンテナを再起動
docker-compose restart chroma
```

---

## Gemini API関連

### 応答が遅い

#### 原因
- ネットワーク遅延
- Gemini APIの負荷

#### 解決策
```bash
# Gemini 1.5 Flashへの切り替え（高速）
# .envで設定
GEMINI_MODEL=gemini-1.5-flash

# サーバー再起動
npm run dev
```

### トークン数制限エラー

#### 症状
```
Error: Token limit exceeded
```

**原因**: 入力テキストが長すぎる

**解決策**:
- 広告文を分割して複数回実行
- 最大10,000文字まで

---

## ナレッジベース関連

### ナレッジが反映されない

#### 原因
- Vector DB未初期化
- ChromaDB未接続

#### 解決策
```bash
# Vector DBを再初期化
npm run setup:vector-db

# 初期化確認
curl http://localhost:8000/api/v1/collections/kitano_knowledge/count

# 期待値: {"count": 1333}
```

### ナレッジ追加後も検出されない

#### 原因
- Vector DB未更新

#### 解決策
```bash
# 新しいナレッジファイルを追加後、必ずVector DBを更新
npm run setup:vector-db

# 所要時間: 3-5分
```

---

## ビルド・デプロイ関連

### ビルドエラー

#### 症状
```
npm run build
Error: Type error: ...
```

**原因**: TypeScript型エラー

**解決策**:
```bash
# 型エラーの詳細を確認
npm run build 2>&1 | less

# 該当ファイルを修正
# 型定義が不足している場合は追加
```

### Railwayデプロイエラー

#### 症状
- デプロイ失敗
- ビルドタイムアウト

**原因**:
- 環境変数未設定
- メモリ不足
- ビルド時間超過

**解決策**:

**環境変数確認**:
```bash
# Railwayダッシュボードで以下を設定
GEMINI_API_KEY=xxx
CHROMA_URL=http://chroma:8000
NODE_ENV=production
```

**ビルド時間超過**:
```bash
# package.jsonのビルドコマンドを最適化
{
  "scripts": {
    "build": "next build --no-lint"
  }
}
```

---

## 判定結果関連

### 判定結果が期待と異なる

#### 原因1: 商品選択ミス

**解決策**: 商品を正しく選択

| 広告文の商品 | 選択すべき商品コード |
|------------|-------------------|
| ヒアロディープパッチ | HA |
| クリアストロングショット | SH |
| その他 | 該当する商品コード |

#### 原因2: ナレッジが古い

**解決策**:
```bash
# ナレッジを更新
git pull origin master

# Vector DBを再初期化
npm run setup:vector-db
```

#### 原因3: AIの判断ミス

**解決策**:
- 表現を明確にする
- 複数回実行して確認
- 人間の最終確認は必須

### 検出漏れ

#### 原因
- NGキーワード未定義
- ナレッジ不足

**解決策**:
```bash
# NGキーワードを追加
# lib/ng-keywords/conditional-ng.ts を編集

# ナレッジファイルを追加
# knowledge/common/新しいルール.txt

# Vector DBを更新
npm run setup:vector-db
```

---

## パフォーマンス関連

### 処理が遅い

#### 原因と対策

| 原因 | 対策 |
|------|------|
| セグメント数が多い | 広告文を分割 |
| Gemini API遅延 | Flashモデルに切り替え |
| ChromaDB遅延 | メモリ増量、インデックス最適化 |
| ネットワーク遅延 | ローカル環境で実行 |

#### 最適化設定

```bash
# .env で設定
GEMINI_MODEL=gemini-1.5-flash  # 高速モデル
CHROMA_SEARCH_K=3              # 検索結果数を削減（デフォルト5）
```

---

## ログ確認方法

### アプリケーションログ

```bash
# 開発環境
npm run dev
# ログはコンソールに出力

# 本番環境（Railway）
# Railwayダッシュボード > Deployments > Logs
```

### ChromaDBログ

```bash
# Docker ログ確認
docker-compose logs chroma

# リアルタイムログ
docker-compose logs -f chroma
```

### Next.jsログ

```bash
# サーバーサイドログ
# .next/server/app-paths-manifest.json
cat .next/server/app-paths-manifest.json

# ビルドログ
npm run build > build.log 2>&1
cat build.log
```

---

## 緊急時の対応

### システム全体が動かない

#### 復旧手順

**Step 1: 全サービス再起動**
```bash
# Dockerコンテナ停止
docker-compose down

# Dockerコンテナ起動
docker-compose up -d

# Next.jsサーバー再起動
npm run dev
```

**Step 2: 環境変数確認**
```bash
# .envファイル確認
cat .env

# 必須変数が設定されているか確認
# - GEMINI_API_KEY
# - CHROMA_URL
```

**Step 3: データベース確認**
```bash
# ChromaDB接続確認
curl http://localhost:8000/api/v1/heartbeat

# Vector DB確認
curl http://localhost:8000/api/v1/collections/kitano_knowledge/count
```

**Step 4: 初期化**
```bash
# 全て失敗する場合は初期化
rm -rf .next node_modules
npm install
docker-compose down -v
docker-compose up -d chroma
npm run setup:vector-db
npm run dev
```

### 完全な復元

**復元ポイント使用**:
```bash
# RESTORE_POINT_20251030.md を参照
cat RESTORE_POINT_20251030.md

# 手順に従って復元
# 1. コードの復元
# 2. 重要ファイルの検証
# 3. ビルドとテスト
# 4. デプロイ
# 5. 動作確認
```

---

## サポート

### お問い合わせ

**GitHub Issues**: https://github.com/ryu220/kitanoadchecker/issues

### 関連ドキュメント

| ドキュメント | 内容 |
|------------|------|
| `01_OVERVIEW.md` | システム概要 |
| `02_SETUP_GUIDE.md` | セットアップ手順 |
| `03_OPERATION_MANUAL.md` | 運用マニュアル |
| `05_FEATURE_LIST.md` | 機能一覧 |
| `RESTORE_POINT_20251030.md` | 完全復元ポイント |

---

## チェックリスト

### 問題発生時の確認事項

- [ ] Dockerが起動しているか
- [ ] ChromaDBコンテナが起動しているか（`docker-compose ps`）
- [ ] .envファイルが存在し、正しく設定されているか
- [ ] GEMINI_API_KEYが有効か
- [ ] Vector DBが初期化されているか（1,333ドキュメント）
- [ ] ポート3000, 8000が空いているか
- [ ] Node.jsバージョンが18以上か
- [ ] npm installが完了しているか
- [ ] ログにエラーメッセージがないか
- [ ] ネットワーク接続が正常か

---

**作成日**: 2025年10月30日
**対象バージョン**: v1.0
**最終更新**: トラブルシューティング確定
