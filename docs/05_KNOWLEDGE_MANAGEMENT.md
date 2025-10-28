# 05. ナレッジベース管理ガイド - Knowledge Management Guide

## 概要

このガイドは、**kitanoadchecker**のナレッジベース（法規制・社内基準ファイル）を管理する方法を説明します。

ナレッジベースは、広告文の法令遵守チェックの精度を左右する最も重要な要素です。

---

## ナレッジベースの構造

### ディレクトリ構成

```
knowledge/
├── common/                    # 全商品共通のナレッジ（131ファイル）
│   ├── 01_薬事に関する資料.txt
│   ├── 02_プラスで確認すべき薬事関連情報.txt
│   ├── 03_景表法について.txt
│   ├── 04_特商法.txt
│   ├── ...
│   └── （法令・社内基準ファイル）
│
├── HA/                        # HA商品固有ナレッジ
│   ├── 08_「塗る・刺すの浸透比較」や「他社比較」の表現・コンテンツについて（ディープパッチシリーズ）.txt
│   ├── 11_針の拡大図について.txt
│   ├── 25_クマ表現について.txt
│   ├── 26_くすみ表現について.txt
│   ├── 55_【薬事・景表法・社内ルールまとめ】『ヒアロディープパッチ』.txt
│   └── （その他HA固有ファイル）
│
├── SH/                        # SH商品固有ナレッジ
│   ├── （SH商品固有ファイル）
│   └── ...
│
└── knowledge-mapping.csv      # 優先度マッピングファイル
```

### ファイル分類

| ディレクトリ | 説明 | ファイル数 | 用途 |
|-------------|------|-----------|------|
| `common/` | 全商品共通のナレッジ | 約131ファイル | 薬機法、景表法、特商法、社内基準 |
| `HA/` | ヒアロディープパッチ固有 | 約8ファイル | HA商品特有の規制・基準 |
| `SH/` | クリアストロングショット固有 | 数ファイル | SH商品特有の規制・基準 |

---

## ファイル命名規則

### 推奨命名規則

```
[番号]_[カテゴリー]_[内容].txt

例:
01_薬事に関する資料.txt
44_ギネス世界記録™について.txt
55_【薬事・景表法・社内ルールまとめ】『ヒアロディープパッチ』.txt
```

### 法令ファイルの命名

```
[発行機関]_[文書タイトル]_[発行日YYYYMMDD].txt

例:
厚生労働省_医薬品等適正広告基準の解説及び留意事項等について（薬生発0929第5号）_20170929.txt
消費者庁_No.1 表示に関する実態調査報告書_20240926.txt
公正取引委員会_No.1表示に関する実態調査報告書_20080613.txt
```

---

## ファイルフォーマット

### テキストファイル形式

- **文字エンコーディング:** UTF-8
- **拡張子:** `.txt`
- **改行コード:** LF（Unix形式）または CRLF（Windows形式）

### 構造化推奨フォーマット

```
# タイトル

## 概要
[ナレッジの概要を記述]

## 規制内容
[具体的な規制内容]

## 良い例
- 例1: ...
- 例2: ...

## ダメな例
- 例1: ...
- 例2: ...

## 注意事項
[特記事項]

## 参照
[関連法令・社内基準へのリンク]
```

**例:**

```
# 浸透の範囲について

## 概要
化粧品における「浸透」表現の許容範囲を定める。

## 規制内容
化粧品は「角質層まで」の浸透表現のみ許可される。
「真皮」「皮下組織」への浸透を示唆する表現は薬機法違反。

## 良い例
- 「角質層に浸透」
- 「肌（角質層）に届く」
- 「角質層の奥深く※まで浸透」
  ※角質層まで

## ダメな例
- 「肌の奥深くまで浸透」（注釈なし）
- 「真皮に届く」
- 「皮下組織に浸透」

## 注意事項
「浸透」表現使用時は必ず「※角質層まで」の注釈を付ける。
```

---

## 優先度マッピングシステム

### knowledge-mapping.csv の構造

`knowledge-mapping.csv`は、各ナレッジファイルに優先度を割り当てます。

**構造:**

```csv
商品カテゴリ,ファイル名,優先度,法令分類,ナレッジタイプ
全商品,45_ステマ規制（景表法）社内基準,P1,景表法,社内基準
全商品,厚生労働省_医薬品等適正広告基準の解説及び留意事項等について（薬生発0929第5号）_20170929,P2,薬機法,法令
全商品,日本化粧品工業連合会_化粧品等の適正広告ガイドライン（2020年版）_202005,P3,薬機法,ガイドライン
```

### 優先度レベル

| 優先度 | 説明 | ブースト倍率 | 用途 |
|-------|------|------------|------|
| **P1** | 社内基準（最優先） | 2.0倍 | 自社独自の厳格な基準 |
| **P2** | 法令（必須遵守） | 1.0倍 | 薬機法、景表法、特商法等 |
| **P3** | ガイドライン（推奨） | 1.0倍 | 業界団体ガイドライン |

### RAG検索時の優先度

RAG（Retrieval-Augmented Generation）検索時、優先度に応じてスコアをブースト:

```typescript
// lib/rag-search.ts
const finalScore = similarity * priorityBoost * keywordBoost;

// 優先度ブースト:
// - P1（社内基準）: 2.0倍
// - P2（法令）: 1.0倍
// - P3（ガイドライン）: 1.0倍
```

---

## ナレッジファイルの追加

### 手順

#### 1. ファイルを配置

**全商品共通の場合:**

```bash
# knowledge/common/ にファイルを追加
cp new-knowledge.txt knowledge/common/53_新規基準について.txt
```

**商品固有の場合:**

```bash
# 商品ディレクトリにファイルを追加
cp ha-specific-rule.txt knowledge/HA/56_HA商品固有ルール.txt
```

#### 2. knowledge-mapping.csv を更新

`knowledge/knowledge-mapping.csv`を編集:

```csv
全商品,53_新規基準について,P1,景表法,社内基準
HA,56_HA商品固有ルール,P1,薬機法,社内基準
```

**列の説明:**

| 列名 | 説明 | 例 |
|-----|------|-----|
| 商品カテゴリ | `全商品`、`HA`、`SH`等 | `全商品` |
| ファイル名 | 拡張子なしのファイル名 | `53_新規基準について` |
| 優先度 | `P1`、`P2`、`P3` | `P1` |
| 法令分類 | `薬機法`、`景表法`、`特商法`等 | `景表法` |
| ナレッジタイプ | `社内基準`、`法令`、`ガイドライン` | `社内基準` |

#### 3. Vector DBを再構築

```bash
# 既存データをクリアして再構築
CLEAR_EXISTING=true npm run setup:vector-db
```

**実行時間:** 約5〜10分

#### 4. 動作確認

```bash
# 環境チェック
npm run check-env

# 期待される出力:
# ✅ Knowledge files: 132 files found  # +1ファイル増加
# ✅ Vector DB: Data exists (1,400 chunks)  # チャンク数増加
```

---

## ナレッジファイルの更新

### 既存ファイルの修正

#### 1. ファイルを編集

```bash
# エディタで編集
nano knowledge/common/45_ステマ規制（景表法）社内基準.txt
```

#### 2. Vector DBを再構築

```bash
# 既存データをクリアして再構築
CLEAR_EXISTING=true npm run setup:vector-db
```

**注意:**
- ファイル内容の変更は、Vector DB再構築まで反映されません
- 本番環境では、再デプロイが必要です

---

## ナレッジファイルの削除

### 手順

#### 1. ファイルを削除

```bash
# ファイルを削除
rm knowledge/common/old-rule.txt
```

#### 2. knowledge-mapping.csv を更新

該当行を削除または優先度を`P3`に下げる

#### 3. Vector DBを再構築

```bash
CLEAR_EXISTING=true npm run setup:vector-db
```

---

## バッチ更新（複数ファイル追加）

### 手順

#### 1. 複数ファイルを一括追加

```bash
# ディレクトリごとコピー
cp -r new-knowledge-files/* knowledge/common/
```

#### 2. knowledge-mapping.csv を一括編集

スプレッドシート等で編集後、CSVとして保存

#### 3. Vector DBを再構築

```bash
CLEAR_EXISTING=true npm run setup:vector-db
```

---

## 本番環境でのナレッジ更新

### Railway環境

#### 1. GitHubにpush

```bash
git add knowledge/
git commit -m "Update knowledge base: Add new regulations"
git push origin main
```

#### 2. Vector DB再構築用環境変数を設定

Railwayダッシュボードで以下を一時的に追加:

| 変数名 | 値 |
|-------|-----|
| `SETUP_VECTOR_DB` | `true` |
| `CLEAR_EXISTING` | `true` |
| `GEMINI_API_KEY` | （一時的に設定） |

#### 3. 自動デプロイ待機

GitHubへのpushでRailwayが自動デプロイを開始

#### 4. ログで確認

```
✅ Successfully loaded 132 knowledge files  # 更新されたファイル数
✅ Generated 1,400 chunks with embeddings   # 増加したチャンク数
✅ Vector database setup complete!
```

#### 5. 環境変数をクリーンアップ

セットアップ完了後、以下を削除:
- `SETUP_VECTOR_DB`
- `CLEAR_EXISTING`
- `GEMINI_API_KEY`

### Docker環境

#### 1. ナレッジファイルを更新

```bash
# ホスト側でファイルを更新
cp new-knowledge.txt knowledge/common/
```

#### 2. Webコンテナ内で再構築

```bash
# コンテナ内でセットアップスクリプトを実行
docker-compose exec web npm run setup:vector-db
```

または、環境変数で自動化:

```bash
# .envに一時的に追加
SETUP_VECTOR_DB=true
CLEAR_EXISTING=true
GEMINI_API_KEY=your_api_key

# 再起動
docker-compose restart web
```

---

## ナレッジベースのバックアップ

### 推奨バックアップ方法

#### 1. ファイルレベルのバックアップ

```bash
# knowledgeディレクトリをバックアップ
tar czf knowledge-backup-$(date +%Y%m%d).tar.gz knowledge/

# バックアップを確認
tar tzf knowledge-backup-20251029.tar.gz
```

#### 2. Vector DBのバックアップ

```bash
# ChromaDB Volumeをバックアップ
docker run --rm \
  -v ad-legal-checker_chroma-data:/data \
  -v $(pwd):/backup \
  busybox tar czf /backup/chroma-backup-$(date +%Y%m%d).tar.gz /data
```

#### 3. Git バージョン管理

```bash
# ナレッジ変更をコミット
git add knowledge/
git commit -m "Update knowledge: Add new regulation XX"
git push origin main
```

---

## トラブルシューティング

### エラー: `Failed to load knowledge files`

**原因:** ファイルが存在しない、または読み取り権限がない

**解決策:**

```bash
# ファイルの存在を確認
ls -la knowledge/common/

# 権限を確認
chmod 644 knowledge/common/*.txt
```

### エラー: `Invalid CSV format in knowledge-mapping.csv`

**原因:** CSVファイルのフォーマットが不正

**解決策:**

```bash
# CSVファイルを確認
cat knowledge/knowledge-mapping.csv

# UTF-8エンコーディングを確認
file knowledge/knowledge-mapping.csv

# 改行コードを統一
dos2unix knowledge/knowledge-mapping.csv  # Unix形式に変換
```

### Vector DB再構築が失敗する

**原因:** Gemini APIクォータ超過、またはChromaDB接続エラー

**解決策:**

```bash
# ChromaDBの状態を確認
curl http://localhost:8000/api/v1/heartbeat

# Gemini APIクォータを確認
# https://aistudio.google.com/

# 数分待ってから再試行
npm run setup:vector-db
```

---

## ベストプラクティス

### 1. 定期的なバックアップ

```bash
# cronジョブで毎日バックアップ
0 2 * * * /path/to/backup-knowledge.sh
```

### 2. バージョン管理

```bash
# ナレッジ変更は必ずGitでバージョン管理
git add knowledge/
git commit -m "Update: Add new regulation about XX"
```

### 3. 優先度の適切な設定

- **P1**: 自社の厳格な基準のみ
- **P2**: 法令（薬機法、景表法等）
- **P3**: 業界ガイドライン

### 4. ファイル名の一貫性

- 番号を連番にする（01, 02, 03...）
- 法令ファイルは発行日を含める
- わかりやすいタイトルを付ける

### 5. 定期的な見直し

- 法令改正時にナレッジを更新
- 古いガイドラインは削除または優先度を下げる

---

## まとめ

ナレッジベース管理のチェックリスト:

- [ ] ナレッジファイルがUTF-8で保存されている
- [ ] ファイル名が命名規則に従っている
- [ ] `knowledge-mapping.csv`に優先度が設定されている
- [ ] Vector DBを再構築済み
- [ ] バックアップが定期的に取られている
- [ ] Git でバージョン管理されている
- [ ] 本番環境にデプロイ済み

次のステップ:
- **[06_PRODUCT_ADDITION_GUIDE.md](./06_PRODUCT_ADDITION_GUIDE.md)** - 新規商品追加手順
- **[10_MAINTENANCE_GUIDE.md](./10_MAINTENANCE_GUIDE.md)** - メンテナンス手順
- **[07_TROUBLESHOOTING.md](./07_TROUBLESHOOTING.md)** - トラブルシューティング
