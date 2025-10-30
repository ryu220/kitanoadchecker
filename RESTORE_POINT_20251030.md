# システム状態復元ポイント - 2025-10-30

## 📌 この文書について

このドキュメントは、Issue #36修正後の**完全な動作状態**を記録したものです。
将来、システムに問題が発生した際に、この状態に戻すための情報を全て含んでいます。

---

## ✅ 現在の動作確認済み検知項目

### 1. ランキング・順位表現（Issue #36修正）

**検知対象キーワード**:
- `1位`, `第1位`, `第一位`, `一位`
- `NO.1`, `No.1`, `ナンバーワン`, `ナンバー1`, `No1`
- `トップ`, `TOP` (ランキング文脈)

**必須注釈**: `※調査機関・調査期間・調査対象`
**Severity**: high
**法的根拠**: 景表法（不当景品類及び不当表示防止法）

**テストケース**:
```
入力: "Amazon・楽天で1位を獲得した人気商品です。"
期待: 景表法違反（重大）として検知
```

### 2. 浸透系キーワード

**検知対象**:
- `浸透`, `染み込む`, `染みこむ`, `染込む`
- `届く`, `到達`, `到達する`
- `注入`, `直接`, `直接的`

**必須注釈**:
- 化粧品（HA）: `※角質層まで`
- 医薬部外品（SH）: `※背爪表面に`

**Severity**: high

### 3. 医薬的効果キーワード

**検知対象**:
- `殺菌`, `さっきん`
- `抗菌`, `こうきん`
- `消毒`, `しょうどく`

**必須注釈**:
- 化粧品（HA）: `※有効成分：〇〇`
- 医薬部外品（SH）: `※消毒の作用機序として`

**Severity**: high

### 4. 特定成分キーワード

**検知対象**:
- `ヒアルロン酸`, `ヒアルロン`
- `コラーゲン`
- `レチノール`
- `プラセンタ`
- `セラミド`

**必須注釈**: `※保湿成分` / `※潤い` / `※ハリ` / `※基剤`
**Severity**: medium

### 5. クマ表現キーワード

**検知対象**:
- `クマ`, `くま`
- `青クマ`, `青くま`
- `茶クマ`, `茶くま`
- `黒クマ`, `黒くま`

**必須注釈**: `※乾燥や古い角質によるくすみ、ハリが不足した暗い目の下`
**Severity**: medium

### 6. 保証系キーワード

**検知対象**:
- `全額返金保証`, `返金保証`, `満足保証`

**必須注釈**: `※遷移先ページに詳細記載` (画像・動画内の場合)
**Severity**: medium

### 7. 文脈依存NGキーワード

**検知対象**:
- `いまなら`, `今なら` (時間的限定性)
- その他多数

**Severity**: medium～high

---

## 📁 重要ファイルの現在の状態

### 1. NGキーワード定義（メインファイル）

**ファイル**: `lib/ng-keywords/conditional-ng.ts`

**重要**: このファイルが全てのNGキーワードを定義しています。
`config/keywords/conditional-rules.json` は**使用されていません**。

**現在の構造**:
```typescript
// 行1-100: ヘッダー、インターフェース定義
export interface ConditionalNGKeyword { ... }

// 行25-100: 浸透系キーワード
export const penetrationKeywords: ConditionalNGKeyword[] = [ ... ];

// 行105-190: 特定成分キーワード
export const ingredientKeywords: ConditionalNGKeyword[] = [ ... ];

// 行195-259: 医薬的効果キーワード
export const medicalEffectKeywords: ConditionalNGKeyword[] = [ ... ];

// 行264-321: クマ表現キーワード
export const kumaKeywords: ConditionalNGKeyword[] = [ ... ];

// 行326-343: 保証系キーワード
export const refundGuaranteeKeywords: ConditionalNGKeyword[] = [ ... ];

// 行345-400: ランキングキーワード（Issue #36で追加）
export const rankingKeywords: ConditionalNGKeyword[] = [ ... ];

// 行405-412: 全キーワードの統合
export const conditionalNGKeywords: ConditionalNGKeyword[] = [
  ...penetrationKeywords,
  ...ingredientKeywords,
  ...medicalEffectKeywords,
  ...kumaKeywords,
  ...refundGuaranteeKeywords,
  ...rankingKeywords, // ← 必須！
];
```

**復元時の確認事項**:
- [ ] `rankingKeywords` が定義されている
- [ ] `conditionalNGKeywords` に `...rankingKeywords` が含まれている
- [ ] 全てのキーワードが `severity: 'high'` または `'medium'` を持つ

### 2. 重複フィルター（重要）

**ファイル**: `app/api/v2/evaluate-batch/route.ts`

**行356-389**: 重複フィルターコード

**現在の状態**: **有効化されている**（デバッグ用無効化は解除済み）

```typescript
// 0. Filter out Gemini violations that are duplicates of NG keyword validator detections
if (ngResult && ngResult.hasViolations && ngResult.matches.length > 0) {
  const detectedKeywords = ngResult.matches.map(m => m.keyword);
  const beforeFilterCount = mergedViolations.length;

  mergedViolations = mergedViolations.filter(violation => {
    const isDuplicate = detectedKeywords.some(keyword => {
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const quotedExpressionPattern = new RegExp(`^[「『].*${escapedKeyword}.*[」』]という表現`);
      const explicitExpressionPattern = new RegExp(`^「.*${escapedKeyword}.*」`);

      const matches = quotedExpressionPattern.test(violation.description) ||
                     explicitExpressionPattern.test(violation.description);

      if (matches) {
        console.log(`[Duplicate Filter] 🎯 Matched keyword "${keyword}" in description: "${violation.description.substring(0, 60)}..."`);
      }

      return matches;
    });

    if (isDuplicate) {
      console.log(`[Duplicate Filter] 🗑️  Removed duplicate violation about NG keyword expression: "${violation.description.substring(0, 80)}..."`);
      return false;
    }

    return true;
  });

  const filteredCount = beforeFilterCount - mergedViolations.length;
  if (filteredCount > 0) {
    console.log(`[Duplicate Filter] ✅ Filtered out ${filteredCount} duplicate violations for segment ${index + 1}`);
  }
}
```

**復元時の確認事項**:
- [ ] コードが有効化されている（コメントアウトされていない）
- [ ] デバッグログが残っている
- [ ] フィルターロジックが上記と一致

### 3. NGキーワードバリデーター

**ファイル**: `lib/ng-keyword-validator.ts`

**重要な実装**:
- Line 63-72: `checkAllNGKeywords()` を呼び出し
- Line 95: `const filteredMatches = result.matches;` - 注釈分析の冗長フィルターを削除済み

**復元時の確認事項**:
- [ ] 冗長な注釈フィルターがコメントアウトされている
- [ ] `keyword-matcher.ts` に完全に委任している

### 4. プロンプト設定

**ファイル**: `lib/prompts/evaluation-prompt-command-stack.ts`

**現在の状態**:
- [C2.5]: エビデンス必須表現の検証セクションが存在
- [C7.5]: 削除済み（C2.5に統合）
- [C8]: 知識ベース優先ルールに例外条項あり

**復元時の確認事項**:
- [ ] [C2.5]セクションが存在する
- [ ] ランキング表現の例が含まれている

---

## 🧪 完全なテストケース

### テストケース1: ランキング表現（Issue #36）

**入力ファイル**: `/tmp/test_issue36_fixed.json`
```json
{
  "segments": [
    {
      "id": "segment-1",
      "text": "Amazon・楽天で1位を獲得した人気商品です。",
      "type": "explanation",
      "position": {
        "start": 0,
        "end": 28,
        "line": 1
      }
    }
  ],
  "productId": "SH",
  "apiKey": "test",
  "fullText": "Amazon・楽天で1位を獲得した人気商品です。"
}
```

**期待される出力**:
```json
{
  "results": [
    {
      "segmentId": "segment-1",
      "compliance": false,
      "violations": [
        {
          "type": "景表法違反",
          "severity": "high",
          "description": "条件付きNGキーワード「1位」を検出（必須注釈なし）",
          "correctionSuggestion": "Amazon・楽天で1位※を獲得 ※2024年1月Amazon・楽天ランキング調査"
        }
      ]
    }
  ]
}
```

### テストケース2: 殺菌表現（既存機能）

**入力**:
```json
{
  "segments": [
    {
      "id": "segment-1",
      "text": "汚い爪をキレイにする殺菌ジェル",
      "type": "claim",
      "position": { "start": 0, "end": 18, "line": 1 }
    }
  ],
  "productId": "SH",
  "apiKey": "test",
  "fullText": "汚い爪をキレイにする殺菌ジェル"
}
```

**期待**: 「殺菌」キーワードが1回だけ検知される（重複なし）

### テストケース3: 浸透表現（既存機能）

**入力**:
```json
{
  "segments": [
    {
      "id": "segment-1",
      "text": "爪に浸透して原因菌を殺菌",
      "type": "claim",
      "position": { "start": 0, "end": 14, "line": 1 }
    }
  ],
  "productId": "SH",
  "apiKey": "test",
  "fullText": "爪に浸透して原因菌を殺菌"
}
```

**期待**: 「浸透」と「殺菌」の両方が検知される

---

## 🔧 完全復元手順

### 前提条件
- Git リポジトリ: `ryu220/Testproject`
- ブランチ: `master`
- Commit: `6a61334` (CRITICAL FIX Issue #36)

### 手順1: コードの復元

```bash
# リポジトリをクローン（またはpull）
cd /path/to/Testproject
git checkout master
git pull origin master

# 特定のコミットに戻す場合
git checkout 6a61334
```

### 手順2: 重要ファイルの検証

```bash
# NGキーワード定義の確認
cat lib/ng-keywords/conditional-ng.ts | grep "rankingKeywords"
# 出力: export const rankingKeywords: ConditionalNGKeyword[] = [

# 重複フィルターの確認
cat app/api/v2/evaluate-batch/route.ts | grep -A 5 "Duplicate Filter"
# 出力: // 0. Filter out Gemini violations...

# conditionalNGKeywordsの確認
cat lib/ng-keywords/conditional-ng.ts | grep -A 7 "export const conditionalNGKeywords"
# 出力に "...rankingKeywords," が含まれることを確認
```

### 手順3: ビルドとテスト

```bash
# 依存関係のインストール
npm install

# TypeScriptコンパイル確認
npm run build

# テスト実行
npm test
```

### 手順4: Railwayへのデプロイ

```bash
# GitHubにプッシュ（Railwayが自動デプロイ）
git push origin master

# デプロイ完了まで待機（5-10分）
```

### 手順5: 動作確認

```bash
# Issue #36のテストケースで確認
curl -X POST https://your-railway-app.up.railway.app/api/v2/evaluate-batch \
  -H "Content-Type: application/json" \
  -d @/tmp/test_issue36_fixed.json

# 期待される出力に "1位" の違反が含まれることを確認
```

---

## 📊 現在の設定値

### NGキーワードカテゴリ

| カテゴリ | キーワード数 | Severity | 商品制限 |
|---------|-------------|----------|---------|
| penetration | 4 | high | HA/SH |
| ingredient | 5 | medium | 全商品 |
| medical-effect | 3 | high | HA/SH |
| kuma | 4 | medium | 全商品 |
| guarantee | 1 | medium | 全商品 |
| **ranking** | **3** | **high** | **全商品** |

### 重要な正規表現パターン

**ランキング必須注釈**:
```regex
/※.{0,100}(調査|ランキング|集計|Amazon|楽天|Yahoo|売上|販売)/
```

**浸透必須注釈（HA）**:
```regex
/※.{0,20}角質層/
```

**浸透必須注釈（SH）**:
```regex
/※.{0,20}(背爪表面|表面に|トッププレート表面)/
```

**殺菌必須注釈（SH）**:
```regex
/※.{0,50}(消毒の作用機序|作用機序として)/
```

---

## 🚨 トラブルシューティング

### 問題1: 「1位」が検知されない

**確認項目**:
1. `lib/ng-keywords/conditional-ng.ts` の `rankingKeywords` が存在するか
2. `conditionalNGKeywords` に `...rankingKeywords` が含まれているか
3. Railwayにデプロイされているか（ローカルでの変更は反映されない）

**解決方法**:
```bash
# conditional-ng.tsの確認
grep -n "rankingKeywords" lib/ng-keywords/conditional-ng.ts

# 出力例:
# 349:export const rankingKeywords: ConditionalNGKeyword[] = [
# 411:  ...rankingKeywords, // Issue #36: ランキング表現を追加
```

### 問題2: 重複検知が発生する

**症状**: 「殺菌」などが2回検知される

**原因**: 重複フィルターが無効化されている

**解決方法**:
```bash
# 重複フィルターの確認
grep -A 3 "// 0. Filter out Gemini violations" app/api/v2/evaluate-batch/route.ts

# コメントアウトされている場合は、このドキュメントの「手順2」を参照して復元
```

### 問題3: 全く検知されない

**確認項目**:
1. Railwayのログを確認
2. `[NG Keyword] Detected` というログがあるか確認
3. APIエンドポイントが正しいか確認

**デバッグコマンド**:
```bash
# Railwayログの確認（Railway CLI必要）
railway logs

# または Railway Dashboardから確認
open https://railway.app
```

---

## 📝 変更履歴

| 日付 | Commit | 変更内容 |
|------|--------|----------|
| 2025-10-30 | `6a61334` | ランキングキーワードを追加（Issue #36修正） |
| 2025-10-30 | `14d267a` | 重複フィルター復元 + conditional-rules.json更新（効果なし） |
| 2025-10-30 | `c2dd323` | デバッグ用重複フィルター無効化（後に復元） |

---

## 🔗 関連ドキュメント

- Issue #36: https://github.com/ryu220/Testproject/issues/36
- Railway Dashboard: https://railway.app
- 知識ベース: `/knowledge/common/37_エビデンス表記について.txt`

---

## ✅ 復元チェックリスト

システムが正常に復元されたことを確認するためのチェックリスト:

- [ ] `lib/ng-keywords/conditional-ng.ts` に `rankingKeywords` が存在
- [ ] `conditionalNGKeywords` に `...rankingKeywords` が含まれる
- [ ] `app/api/v2/evaluate-batch/route.ts` の重複フィルターが有効
- [ ] `npm run build` が成功
- [ ] テストケース1（ランキング表現）が検知される
- [ ] テストケース2（殺菌表現）が1回だけ検知される
- [ ] テストケース3（浸透+殺菌）が両方検知される
- [ ] Railwayにデプロイ済み
- [ ] 本番環境でテスト実行し、期待通り動作

---

**作成日**: 2025-10-30
**最終更新**: 2025-10-30
**バージョン**: 1.0
**保証期間**: このコミット（6a61334）から変更がない限り有効
