# 06. 新規商品追加ガイド - Product Addition Guide

## 概要

このガイドは、**kitanoadchecker**に新しい商品を追加する手順を説明します。

現在、システムは**42商品**に対応していますが、商品固有のナレッジファイルがあるのは**HA**（ヒアロディープパッチ）と**SH**（クリアストロングショット アルファ）のみです。

---

## 新規商品追加の流れ

```
1. 商品IDを lib/types.ts に追加
   ↓
2. 商品固有ナレッジディレクトリを作成
   ↓
3. ナレッジファイルを配置
   ↓
4. knowledge-mapping.csv を更新
   ↓
5. ProductSelectorV2.tsx に商品情報を追加
   ↓
6. Vector DBを再構築
   ↓
7. 動作確認
```

---

## ステップ1: 商品IDを追加

### 1-1. `lib/types.ts` を編集

```typescript
// lib/types.ts

/**
 * 商品ID定数
 * 全43商品の識別子（新規商品を追加）
 */
export const PRODUCT_IDS = [
  'AI', 'CA', 'CH', 'CK', 'CR', 'DS', 'EA', 'FS',
  'FV', 'FZ', 'GG', 'HA', 'HB', 'HL', 'HP', 'HR',
  'HS', 'HT', 'JX', 'KF', 'KJ', 'LI', 'LK', 'LM',
  'MD', 'ME', 'MI', 'MW', 'NM', 'NO', 'NW', 'OO',
  'OP', 'PS', 'PT', 'RV', 'SC', 'SH', 'SI', 'SS',
  'YS', 'ZS',
  'XX' // ← 新規商品IDを追加
] as const;

/**
 * 商品ID型
 */
export type ProductId = typeof PRODUCT_IDS[number];
```

**注意:**
- 商品IDは**2文字の大文字英字**を推奨（例: `XX`, `AB`）
- 既存の商品IDと重複しないこと
- `as const`を忘れずに付ける（TypeScript型推論のため）

---

## ステップ2: ナレッジディレクトリを作成

### 2-1. 商品固有ディレクトリを作成

```bash
# 新規商品「XX」のディレクトリを作成
mkdir knowledge/XX
```

### 2-2. ディレクトリ構成

```
knowledge/
├── common/          # 全商品共通（既存）
├── HA/              # ヒアロディープパッチ（既存）
├── SH/              # クリアストロングショット（既存）
└── XX/              # 新規商品「XX」
    ├── 01_XX商品薬機法ルール.txt
    ├── 02_XX商品景表法ルール.txt
    └── 03_XX商品固有ルール.txt
```

---

## ステップ3: ナレッジファイルを配置

### 3-1. 必要なナレッジファイル

新規商品には、最低限以下のファイルを用意してください：

| ファイル名 | 内容 | 優先度 |
|----------|------|--------|
| `01_XX商品薬機法ルール.txt` | 商品固有の薬機法規制 | P1 |
| `02_XX商品景表法ルール.txt` | 商品固有の景表法規制 | P1 |
| `03_XX商品固有ルール.txt` | その他の社内基準 | P1 |

### 3-2. ファイル作成例

**01_XX商品薬機法ルール.txt:**

```
# XX商品 - 薬機法遵守ルール

## 商品分類
- カテゴリ: 化粧品 / 医薬部外品 / 医療機器
- 承認番号: （該当する場合）

## 効能効果の範囲
XX商品は以下の効能効果のみ訴求可能：
1. ...
2. ...

## 禁止表現
以下の表現は薬機法違反となるため使用禁止：
- 「〇〇が治る」
- 「〇〇に効く」

## 推奨表現
以下の表現を推奨：
- 「〇〇をサポート」
- 「〇〇にアプローチ」

## 注釈の付け方
特定の表現を使用する場合は、以下の注釈を必ず付ける：
- 「浸透※」 → ※角質層まで
```

---

## ステップ4: knowledge-mapping.csv を更新

### 4-1. CSVファイルを編集

`knowledge/knowledge-mapping.csv`に新規商品のマッピングを追加：

```csv
商品カテゴリ,ファイル名,優先度,法令分類,ナレッジタイプ
XX,01_XX商品薬機法ルール,P1,薬機法,社内基準
XX,02_XX商品景表法ルール,P1,景表法,社内基準
XX,03_XX商品固有ルール,P1,その他,社内基準
```

**列の説明:**

| 列名 | 値の例 | 説明 |
|-----|--------|------|
| 商品カテゴリ | `XX` | 新規商品ID |
| ファイル名 | `01_XX商品薬機法ルール` | 拡張子なしのファイル名 |
| 優先度 | `P1` | 社内基準は`P1`（最優先） |
| 法令分類 | `薬機法` | `薬機法`、`景表法`、`特商法`等 |
| ナレッジタイプ | `社内基準` | `社内基準`、`法令`、`ガイドライン` |

### 4-2. 優先度の設定ガイドライン

| 優先度 | 用途 | 例 |
|-------|------|-----|
| **P1** | 社内基準（商品固有） | `XX商品薬機法ルール` |
| **P2** | 法令（必須遵守） | 厚生労働省通知、消費者庁規定 |
| **P3** | ガイドライン | 業界団体ガイドライン |

---

## ステップ5: ProductSelectorV2.tsx を更新

### 5-1. コンポーネントファイルを編集

`components/ProductSelectorV2.tsx`に新規商品情報を追加：

```typescript
// components/ProductSelectorV2.tsx

const AVAILABLE_PRODUCTS: ProductInfo[] = [
  {
    id: 'HA',
    name: 'ヒアロディープパッチ',
    category: '化粧品',
    approvedEffects: '56項目（化粧品効能効果）',
    knowledgeFiles: {
      common: ['common/特商法.txt'],
      specific: {
        yakujihou: ['HA/01_薬機法ルール.txt'],
        keihyouhou: ['HA/02_景表法ルール.txt'],
        other: ['HA/03_商品固有ルール.txt']
      }
    }
  },
  {
    id: 'SH',
    name: 'クリアストロングショット アルファ',
    category: '新指定医薬部外品',
    approvedEffects: '手指・皮膚の洗浄・消毒',
    activeIngredient: 'ベンザルコニウム塩化物',
    knowledgeFiles: {
      common: ['common/特商法.txt'],
      specific: {
        yakujihou: ['SH/01_薬機法ルール.txt'],
        keihyouhou: ['SH/02_景表法ルール.txt'],
        other: ['SH/03_商品固有ルール.txt']
      }
    }
  },
  // ↓ 新規商品を追加
  {
    id: 'XX',
    name: 'XX商品名',
    category: '化粧品', // または '医薬部外品', '医療機器'等
    approvedEffects: '商品の承認効能',
    activeIngredient: '有効成分名（任意）',
    knowledgeFiles: {
      common: ['common/特商法.txt'],
      specific: {
        yakujihou: ['XX/01_XX商品薬機法ルール.txt'],
        keihyouhou: ['XX/02_XX商品景表法ルール.txt'],
        other: ['XX/03_XX商品固有ルール.txt']
      }
    }
  }
];
```

**プロパティの説明:**

| プロパティ | 型 | 説明 | 例 |
|-----------|---|------|-----|
| `id` | `string` | 商品ID | `'XX'` |
| `name` | `string` | 商品名 | `'XX商品名'` |
| `category` | `string` | 商品カテゴリ | `'化粧品'`, `'医薬部外品'` |
| `approvedEffects` | `string` | 承認効能効果 | `'56項目（化粧品効能効果）'` |
| `activeIngredient` | `string?` | 有効成分（任意） | `'ヒアルロン酸'` |
| `knowledgeFiles` | `object` | ナレッジファイルパス | 下記参照 |

**knowledgeFilesの構造:**

```typescript
knowledgeFiles: {
  common: ['common/特商法.txt'],  // 全商品共通ファイル
  specific: {
    yakujihou: ['XX/01_XX商品薬機法ルール.txt'],
    keihyouhou: ['XX/02_XX商品景表法ルール.txt'],
    other: ['XX/03_XX商品固有ルール.txt']
  }
}
```

---

## ステップ6: lib/validation.ts を更新（任意）

商品固有のバリデーションロジックがある場合、`lib/validation.ts`を更新：

```typescript
// lib/validation.ts

export function validateProductSpecificRules(productId: ProductId, text: string): ValidationResult {
  switch (productId) {
    case 'HA':
      // HA商品固有のバリデーション
      return validateHAProduct(text);

    case 'SH':
      // SH商品固有のバリデーション
      return validateSHProduct(text);

    case 'XX':
      // XX商品固有のバリデーション
      return validateXXProduct(text);

    default:
      return { valid: true };
  }
}
```

---

## ステップ7: Vector DBを再構築

### 7-1. ローカル環境

```bash
# 既存データをクリアして再構築
CLEAR_EXISTING=true npm run setup:vector-db
```

**実行時間:** 約5〜10分

**確認:**

```bash
npm run check-env

# 期待される出力:
# ✅ Knowledge files: 134 files found  # ファイル数が増加
# ✅ Vector DB: Data exists (1,450 chunks)  # チャンク数が増加
```

### 7-2. 本番環境（Railway）

#### 1. GitHubにpush

```bash
git add lib/types.ts
git add knowledge/XX/
git add knowledge/knowledge-mapping.csv
git add components/ProductSelectorV2.tsx
git commit -m "Add new product: XX"
git push origin main
```

#### 2. Railway環境変数を一時設定

Railwayダッシュボードで以下を追加:

| 変数名 | 値 |
|-------|-----|
| `SETUP_VECTOR_DB` | `true` |
| `CLEAR_EXISTING` | `true` |
| `GEMINI_API_KEY` | （一時的に設定） |

#### 3. 自動デプロイ待機

GitHubへのpushでRailwayが自動デプロイを開始

#### 4. ログで確認

```
✅ Successfully loaded 134 knowledge files
✅ Generated 1,450 chunks with embeddings
✅ Vector database setup complete!
```

#### 5. 環境変数をクリーンアップ

セットアップ完了後、以下を削除:
- `SETUP_VECTOR_DB`
- `CLEAR_EXISTING`
- `GEMINI_API_KEY`

---

## ステップ8: 動作確認

### 8-1. UIで商品選択

1. ブラウザで`http://localhost:3000`にアクセス
2. 商品選択ドロップダウンを開く
3. 新規商品「XX - XX商品名」が表示されることを確認

### 8-2. テスト広告文でチェック

**テスト用広告文（XX商品）:**

```
XX商品の特徴。効果的な成分配合。
今ならお試し価格1,980円。
```

**手順:**
1. 広告文を入力
2. 商品「XX」を選択
3. Gemini APIキーを入力
4. 「チェック開始」をクリック
5. XX商品固有のナレッジが適用されていることを確認

**確認ポイント:**
- XX商品固有のナレッジファイルが参照されている
- 違反がある場合、XX商品のルールに基づいた修正案が提示される

### 8-3. APIテスト

```bash
curl -X POST http://localhost:3000/api/v2/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "segments": [
      {
        "id": "seg_1",
        "text": "XX商品の特徴",
        "type": "claim",
        "position": {"start": 0, "end": 8}
      }
    ],
    "productId": "XX",
    "apiKey": "YOUR_GEMINI_API_KEY"
  }'
```

**期待される出力:**
- XX商品のナレッジが検索されている
- 評価結果にXX商品のルールが反映されている

---

## トラブルシューティング

### エラー: `Invalid productId`

**原因:** `lib/types.ts`に商品IDが追加されていない

**解決策:**

```typescript
// lib/types.ts
export const PRODUCT_IDS = [
  // ...
  'XX' // ← 追加
] as const;
```

### 商品がドロップダウンに表示されない

**原因:** `ProductSelectorV2.tsx`に商品情報が追加されていない

**解決策:**

```typescript
// components/ProductSelectorV2.tsx
const AVAILABLE_PRODUCTS: ProductInfo[] = [
  // ...
  { id: 'XX', name: 'XX商品名', ... } // ← 追加
];
```

### Vector DBにナレッジが反映されない

**原因:** Vector DBの再構築が実行されていない

**解決策:**

```bash
# 既存データをクリアして再構築
CLEAR_EXISTING=true npm run setup:vector-db
```

### ナレッジファイルが読み込まれない

**原因:** `knowledge-mapping.csv`にマッピングが追加されていない

**解決策:**

```csv
# knowledge/knowledge-mapping.csv に追加
XX,01_XX商品薬機法ルール,P1,薬機法,社内基準
XX,02_XX商品景表法ルール,P1,景表法,社内基準
XX,03_XX商品固有ルール,P1,その他,社内基準
```

---

## ベストプラクティス

### 1. 段階的な追加

```
1. まず1商品を追加してテスト
   ↓
2. 動作確認後、次の商品を追加
   ↓
3. すべての商品で動作確認
```

### 2. ナレッジファイルの品質

- 具体的な良い例・ダメな例を含める
- 注釈の付け方を明記
- 最新の法令に基づく内容

### 3. バージョン管理

```bash
# 商品追加は必ずブランチを作成
git checkout -b feature/add-product-xx

# 実装後にプルリクエスト
git push origin feature/add-product-xx
gh pr create --title "Add product: XX"
```

### 4. テスト

- 商品追加後は必ず動作確認
- テスト広告文を作成してチェック
- APIテストも実施

---

## まとめ

新規商品追加のチェックリスト:

- [ ] `lib/types.ts`に商品IDを追加
- [ ] `knowledge/XX/`ディレクトリを作成
- [ ] ナレッジファイルを配置（最低3ファイル）
- [ ] `knowledge-mapping.csv`を更新
- [ ] `components/ProductSelectorV2.tsx`に商品情報を追加
- [ ] `lib/validation.ts`を更新（任意）
- [ ] Vector DBを再構築
- [ ] UIで商品選択を確認
- [ ] テスト広告文でチェック
- [ ] APIテスト実施
- [ ] 本番環境にデプロイ

次のステップ:
- **[05_KNOWLEDGE_MANAGEMENT.md](./05_KNOWLEDGE_MANAGEMENT.md)** - ナレッジベース管理
- **[08_API_REFERENCE.md](./08_API_REFERENCE.md)** - API仕様書
- **[07_TROUBLESHOOTING.md](./07_TROUBLESHOOTING.md)** - トラブルシューティング
