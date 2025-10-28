# 08. API リファレンス - API Reference

## 概要

このドキュメントは、**kitanoadchecker**が提供するREST APIの仕様を説明します。

---

## ベースURL

### ローカル開発環境
```
http://localhost:3000
```

### 本番環境（Railway）
```
https://your-app.up.railway.app
```

---

## 認証

APIキーは**ユーザーが各リクエストに含める**設計です。サーバー側では保存しません。

```json
{
  "apiKey": "AIzaSyC..."
}
```

---

## API エンドポイント一覧

| エンドポイント | メソッド | 説明 |
|---------------|---------|------|
| `/api/health` | GET | ヘルスチェック |
| `/api/v2/segment` | POST | 広告文セグメント分割 |
| `/api/v2/evaluate` | POST | セグメント評価（単一） |
| `/api/v2/evaluate-batch` | POST | セグメント評価（バッチ） |
| `/api/v2/report` | POST | レポート生成 |
| `/api/v2/validate-api-key` | POST | APIキー検証 |

---

## 1. ヘルスチェック API

### `GET /api/health`

アプリケーションとChromaDBの稼働状態を確認します。

#### リクエスト

```bash
curl http://localhost:3000/api/health
```

#### レスポンス

**成功時（200 OK）:**

```json
{
  "status": "ok",
  "timestamp": "2025-10-29T12:34:56.789Z",
  "services": {
    "chromadb": "connected"
  }
}
```

**ChromaDB未接続時（503 Service Unavailable）:**

```json
{
  "status": "error",
  "timestamp": "2025-10-29T12:34:56.789Z",
  "services": {
    "chromadb": "disconnected"
  },
  "error": "ChromaDB is not available"
}
```

---

## 2. セグメント分割 API

### `POST /api/v2/segment`

広告文を意味単位（セグメント）に分割します。

**処理時間:** 約0.1ms（ルールベース高速処理）

#### リクエスト

**エンドポイント:** `/api/v2/segment`

**メソッド:** POST

**Content-Type:** `application/json`

**リクエストボディ:**

```json
{
  "text": "ヒアルロン酸配合。シワに効く。今ならお試し価格1,980円。",
  "productId": "HA",
  "apiKey": "AIzaSyC..."
}
```

**パラメータ:**

| フィールド | 型 | 必須 | 説明 |
|----------|---|------|------|
| `text` | string | ✅ | 広告文全体（最大50,000文字） |
| `productId` | string | ✅ | 商品ID（`HA`, `SH`等） |
| `apiKey` | string | ✅ | Gemini APIキー（後方互換性のため受け付けますが未使用） |

#### レスポンス

**成功時（200 OK）:**

```json
{
  "success": true,
  "data": {
    "segments": [
      {
        "id": "seg_1",
        "text": "ヒアルロン酸配合。",
        "type": "claim",
        "position": {
          "start": 0,
          "end": 11
        },
        "importance": 0.9
      },
      {
        "id": "seg_2",
        "text": "シワに効く。",
        "type": "claim",
        "position": {
          "start": 11,
          "end": 19
        },
        "importance": 1.0
      },
      {
        "id": "seg_3",
        "text": "今ならお試し価格1,980円。",
        "type": "cta",
        "position": {
          "start": 19,
          "end": 36
        },
        "importance": 0.7
      }
    ],
    "totalSegments": 3,
    "productId": "HA",
    "textLength": 36
  }
}
```

**セグメントタイプ:**

| タイプ | 説明 | 例 |
|-------|------|-----|
| `claim` | 主張・効果表現 | 「ヒアルロン酸配合」 |
| `explanation` | 説明・補足情報 | 「角質層まで浸透」 |
| `evidence` | 根拠・エビデンス | 「臨床試験で確認」 |
| `cta` | Call-to-Action（行動喚起） | 「今すぐ購入」 |
| `disclaimer` | 注釈・免責事項 | 「※個人の感想です」 |

**エラー時（400 Bad Request）:**

```json
{
  "success": false,
  "error": "バリデーションエラー",
  "details": [
    {
      "message": "テキストは必須です",
      "path": ["text"]
    }
  ]
}
```

#### cURLサンプル

```bash
curl -X POST http://localhost:3000/api/v2/segment \
  -H "Content-Type: application/json" \
  -d '{
    "text": "ヒアルロン酸配合。シワに効く。",
    "productId": "HA",
    "apiKey": "AIzaSyC..."
  }'
```

---

## 3. セグメント評価 API（単一）

### `POST /api/v2/evaluate`

単一のセグメントまたは複数セグメントを評価します。

**処理時間:** 約5〜15秒（Gemini API呼び出しあり）

#### リクエスト

**エンドポイント:** `/api/v2/evaluate`

**メソッド:** POST

**Content-Type:** `application/json`

**リクエストボディ:**

```json
{
  "segments": [
    {
      "id": "seg_1",
      "text": "シワに効く",
      "type": "claim",
      "position": {
        "start": 0,
        "end": 7
      }
    }
  ],
  "productId": "HA",
  "apiKey": "AIzaSyC...",
  "fullText": "シワに効く。ヒアルロン酸配合。",
  "knowledgeContext": "(オプション)"
}
```

**パラメータ:**

| フィールド | 型 | 必須 | 説明 |
|----------|---|------|------|
| `segments` | array | ✅ | セグメント配列 |
| `productId` | string | ✅ | 商品ID（`HA`, `SH`） |
| `apiKey` | string | ✅ | Gemini APIキー |
| `fullText` | string | ❌ | 広告文全体（コンテキスト用） |
| `knowledgeContext` | string | ❌ | 事前取得したナレッジ（パフォーマンス最適化用） |

#### レスポンス

**成功時（200 OK）:**

```json
{
  "success": true,
  "data": {
    "evaluations": [
      {
        "segmentId": "seg_1",
        "isCompliant": false,
        "violations": [
          {
            "type": "薬機法違反",
            "severity": "high",
            "description": "「効く」は医薬品的効能効果を示す表現であり、化粧品では使用不可",
            "affectedText": "シワに効く",
            "legalBasis": "薬機法第66条、厚生労働省通知（薬生発0929第5号）",
            "suggestedCorrection": "シワにアプローチ",
            "knowledgeSource": "common/52_薬機法_化粧品医薬部外品.txt"
          }
        ],
        "recommendations": [
          "「効く」→「アプローチ」に変更",
          "「※角質層まで」の注釈を追加"
        ],
        "confidence": 0.95,
        "processingTime": 1234
      }
    ],
    "totalEvaluations": 1,
    "totalViolations": 1
  }
}
```

**違反タイプ:**

| タイプ | 説明 |
|-------|------|
| `薬機法違反` | 薬機法に違反する表現 |
| `景表法違反` | 景品表示法に違反する表現 |
| `特商法違反` | 特定商取引法に違反する表現 |
| `社内基準違反` | 社内基準に違反する表現 |

**違反重要度:**

| 重要度 | 説明 |
|-------|------|
| `critical` | 致命的（法的措置の可能性） |
| `high` | 高（修正必須） |
| `medium` | 中（修正推奨） |
| `low` | 低（注意喚起） |

**エラー時（400 Bad Request）:**

```json
{
  "success": false,
  "error": "無効なGemini APIキーです。有効なAPIキーを指定してください。"
}
```

#### cURLサンプル

```bash
curl -X POST http://localhost:3000/api/v2/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "segments": [
      {
        "id": "seg_1",
        "text": "シワに効く",
        "type": "claim",
        "position": {"start": 0, "end": 7}
      }
    ],
    "productId": "HA",
    "apiKey": "AIzaSyC..."
  }'
```

---

## 4. セグメント評価 API（バッチ）

### `POST /api/v2/evaluate-batch`

複数セグメントを一括評価します（最大300セグメント）。

**処理時間:** 約10〜60秒（セグメント数により変動）

#### リクエスト

**エンドポイント:** `/api/v2/evaluate-batch`

**メソッド:** POST

**Content-Type:** `application/json`

**リクエストボディ:**

```json
{
  "segments": [
    {
      "id": "seg_1",
      "text": "ヒアルロン酸配合",
      "type": "claim",
      "position": {"start": 0, "end": 9}
    },
    {
      "id": "seg_2",
      "text": "シワに効く",
      "type": "claim",
      "position": {"start": 10, "end": 17}
    }
  ],
  "productId": "HA",
  "apiKey": "AIzaSyC...",
  "fullText": "ヒアルロン酸配合。シワに効く。"
}
```

**パラメータ:**

| フィールド | 型 | 必須 | 説明 |
|----------|---|------|------|
| `segments` | array | ✅ | セグメント配列（最大300個） |
| `productId` | string | ✅ | 商品ID（`HA`, `SH`） |
| `apiKey` | string | ✅ | Gemini APIキー |
| `fullText` | string | ❌ | 広告文全体 |

#### レスポンス

**成功時（200 OK）:**

```json
{
  "success": true,
  "data": {
    "evaluations": [
      {
        "segmentId": "seg_1",
        "isCompliant": true,
        "violations": [],
        "recommendations": [],
        "confidence": 0.98,
        "processingTime": 850
      },
      {
        "segmentId": "seg_2",
        "isCompliant": false,
        "violations": [
          {
            "type": "薬機法違反",
            "severity": "high",
            "description": "...",
            "affectedText": "シワに効く",
            "suggestedCorrection": "シワにアプローチ"
          }
        ],
        "recommendations": ["..."],
        "confidence": 0.95,
        "processingTime": 1200
      }
    ],
    "totalEvaluations": 2,
    "totalViolations": 1,
    "totalProcessingTime": 2050
  }
}
```

---

## 5. レポート生成 API

### `POST /api/v2/report`

全評価結果を集約し、包括的なMarkdownレポートを生成します。

#### リクエスト

**エンドポイント:** `/api/v2/report`

**メソッド:** POST

**Content-Type:** `application/json`

**リクエストボディ:**

```json
{
  "input": {
    "full_text": "ヒアルロン酸配合。シワに効く。",
    "product_id": "HA"
  },
  "structure": {
    "totalCharacters": 18,
    "totalLines": 1
  },
  "segments": [
    {
      "id": "seg_1",
      "text": "ヒアルロン酸配合。",
      "type": "claim",
      "position": {"start": 0, "end": 10}
    },
    {
      "id": "seg_2",
      "text": "シワに効く。",
      "type": "claim",
      "position": {"start": 10, "end": 18}
    }
  ],
  "evaluations": [
    {
      "segmentId": "seg_1",
      "isCompliant": true,
      "violations": [],
      "recommendations": []
    },
    {
      "segmentId": "seg_2",
      "isCompliant": false,
      "violations": [
        {
          "type": "薬機法違反",
          "severity": "high",
          "description": "...",
          "affectedText": "シワに効く",
          "suggestedCorrection": "シワにアプローチ"
        }
      ],
      "recommendations": ["..."]
    }
  ]
}
```

#### レスポンス

**成功時（200 OK）:**

```json
{
  "success": true,
  "data": {
    "id": "report_20251029_123456",
    "input": {...},
    "structure": {...},
    "segments": [...],
    "evaluations": [...],
    "summary": {
      "totalSegments": 2,
      "compliantSegments": 1,
      "totalViolations": 1,
      "violationsByType": {
        "薬機法違反": 1
      },
      "violationsBySeverity": {
        "high": 1
      }
    },
    "markdown": "# 広告文リーガルチェックレポート\n\n## 概要\n...",
    "generatedAt": "2025-10-29T12:34:56.789Z",
    "totalProcessingTimeMs": 2500
  }
}
```

**Markdownレポートの構造:**

```markdown
# 広告文リーガルチェックレポート

## 概要
- **チェック日時:** 2025-10-29 12:34:56
- **商品:** HA - ヒアロディープパッチ
- **総セグメント数:** 2
- **違反セグメント数:** 1

## 総合評価
⚠️ **要修正** - 1件の違反が検出されました

## 違反詳細

### セグメント #2: "シワに効く。"
- **違反タイプ:** 薬機法違反
- **重要度:** 高
- **説明:** 「効く」は医薬品的効能効果を示す表現であり、化粧品では使用不可
- **修正案:** シワにアプローチ
- **法的根拠:** 薬機法第66条、厚生労働省通知（薬生発0929第5号）

## 推奨修正

| 元の表現 | 修正案 |
|---------|--------|
| シワに効く | シワにアプローチ |
```

---

## 6. APIキー検証 API

### `POST /api/v2/validate-api-key`

Gemini APIキーが有効かどうかを検証します。

#### リクエスト

**エンドポイント:** `/api/v2/validate-api-key`

**メソッド:** POST

**Content-Type:** `application/json`

**リクエストボディ:**

```json
{
  "apiKey": "AIzaSyC..."
}
```

#### レスポンス

**有効なAPIキー（200 OK）:**

```json
{
  "success": true,
  "valid": true,
  "message": "APIキーは有効です"
}
```

**無効なAPIキー（400 Bad Request）:**

```json
{
  "success": false,
  "valid": false,
  "error": "無効なAPIキーです"
}
```

---

## エラーレスポンス

### エラーレスポンスの共通形式

```json
{
  "success": false,
  "error": "エラーメッセージ",
  "details": "詳細情報（任意）"
}
```

### HTTP ステータスコード

| コード | 説明 |
|-------|------|
| 200 | 成功 |
| 400 | バリデーションエラー、無効なリクエスト |
| 500 | サーバー内部エラー |
| 503 | ChromaDB未接続 |

---

## レート制限

現在、レート制限は実装されていません。

**推奨:**
- Gemini API側のクォータ制限に注意
- 連続リクエストは避ける（数秒間隔を推奨）

---

## 使用例（フルワークフロー）

### ステップ1: セグメント分割

```bash
curl -X POST http://localhost:3000/api/v2/segment \
  -H "Content-Type: application/json" \
  -d '{
    "text": "ヒアルロン酸配合。シワに効く。",
    "productId": "HA",
    "apiKey": "AIzaSyC..."
  }' > segments.json
```

### ステップ2: セグメント評価（バッチ）

```bash
curl -X POST http://localhost:3000/api/v2/evaluate-batch \
  -H "Content-Type: application/json" \
  -d "$(cat segments.json | jq '{segments: .data.segments, productId: "HA", apiKey: "AIzaSyC..."}')" \
  > evaluations.json
```

### ステップ3: レポート生成

```bash
curl -X POST http://localhost:3000/api/v2/report \
  -H "Content-Type: application/json" \
  -d '{
    "input": {"full_text": "...", "product_id": "HA"},
    "structure": {...},
    "segments": [...],
    "evaluations": [...]
  }' > report.json
```

---

## まとめ

APIリファレンスのチェックリスト:

- [ ] `/api/health`でヘルスチェック確認
- [ ] `/api/v2/segment`でセグメント分割
- [ ] `/api/v2/evaluate-batch`でバッチ評価
- [ ] `/api/v2/report`でレポート生成
- [ ] エラーハンドリングを実装
- [ ] Gemini APIクォータを監視

次のステップ:
- **[09_ARCHITECTURE.md](./09_ARCHITECTURE.md)** - システムアーキテクチャ
- **[07_TROUBLESHOOTING.md](./07_TROUBLESHOOTING.md)** - トラブルシューティング
- **[10_MAINTENANCE_GUIDE.md](./10_MAINTENANCE_GUIDE.md)** - メンテナンス手順
