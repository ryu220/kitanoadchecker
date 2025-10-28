# Cache Module - High-Performance Caching System

**Version**: 1.0.0
**Author**: Claude Code (Sonnet 4.5)
**Last Updated**: 2025-10-20

## 📋 概要

Ad Legal Checker V2のパフォーマンス最適化のための多層キャッシュシステムです。

### 主な機能

1. **RAG検索結果キャッシュ** - Vector DB検索結果をメモリにキャッシュ
2. **プロンプトキャッシュマネージャー** - 固定プロンプトのキャッシュ管理
3. **LRUエビクションポリシー** - メモリ効率的なキャッシュ管理
4. **自動クリーンアップ** - 期限切れエントリーの自動削除
5. **統計モニタリング** - リアルタイムキャッシュヒット率追跡

---

## 🚀 クイックスタート

### RAGキャッシュの使用

```typescript
import { getRAGCache } from '@/lib/cache';

const ragCache = getRAGCache();

// キャッシュから取得を試みる
const cachedResult = ragCache.get(query, productId);

if (cachedResult) {
  console.log('Cache hit! 🚀');
  return cachedResult;
}

// キャッシュミス - 検索を実行してキャッシュ
const result = await performExpensiveSearch(query);
ragCache.set(query, productId, result, resultCount, 1800); // 30分TTL
```

### プロンプトキャッシュの使用

```typescript
import { getPromptCache } from '@/lib/cache';

const promptCache = getPromptCache();

// キャッシュから取得
const cachedPrompt = promptCache.get(promptContent, productId);

if (cachedPrompt) {
  console.log('Prompt cache hit! 🚀');
  return cachedPrompt.content;
}

// キャッシュに保存
promptCache.set(promptContent, productId, 3600); // 1時間TTL
```

---

## 📊 パフォーマンス指標

### 期待される改善

| 指標 | Phase 1のみ | Phase 2 (キャッシュあり) | 改善率 |
|------|------------|----------------------|--------|
| 初回リクエスト | 5-6秒 | 5-6秒 | - |
| 2回目以降 | 5-6秒 | **1-3秒** | **50-70%高速化** 🚀 |
| RAG検索時間 | 3-5秒 | **<100ms** | **95%以上削減** |

### キャッシュヒット率

**目標**: 80%以上（2回目以降のリクエスト）

**確認方法**:
```typescript
const stats = ragCache.getStats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
```

---

## 🔧 設定

### RAGキャッシュ設定

**デフォルト**:
```typescript
{
  defaultTTL: 1800,     // 30分
  maxCacheSize: 200,    // 最大200エントリー
}
```

**カスタマイズ**:
```typescript
import { createRAGCache } from '@/lib/cache';

const customCache = createRAGCache({
  defaultTTL: 3600,      // 1時間
  maxCacheSize: 500,     // 500エントリー
});
```

### プロンプトキャッシュ設定

**デフォルト**:
```typescript
{
  defaultTTL: 3600,      // 1時間
  maxCacheSize: 50,      // 最大50エントリー
}
```

---

## 📈 モニタリング

### 統計の取得

```typescript
// RAGキャッシュ統計
const ragStats = ragCache.getStats();
console.log('RAG Cache Stats:', {
  hits: ragStats.hits,
  misses: ragStats.misses,
  hitRate: ragStats.hitRate,
  totalCached: ragStats.totalCached,
  cacheSizeBytes: ragStats.cacheSizeBytes,
});

// プロンプトキャッシュ統計
const promptStats = promptCache.getStats();
console.log('Prompt Cache Stats:', {
  hits: promptStats.hits,
  misses: promptStats.misses,
  hitRate: promptStats.hitRate,
  totalCached: promptStats.totalCached,
  cacheSizeBytes: promptStats.cacheSizeBytes,
});
```

### 統計のリセット

```typescript
ragCache.resetStats();
promptCache.resetStats();
```

---

## 🧪 テスト

### パフォーマンステスト実行

```bash
cd Testproject
node test-cache-performance-comprehensive.js
```

### 期待される出力

```
🚀 Phase 2 キャッシュ最適化 - 包括的パフォーマンステスト

📝 テスト1: ヒアルロン酸直注入
   [実行 1回目] ⏱️  処理時間: 6234ms
   [実行 2回目] ⏱️  処理時間: 2104ms 🚀

   ✅ キャッシュ効果あり！2回目以降は大幅に高速化されています 🎉
```

---

## 🔍 トラブルシューティング

### キャッシュヒット率が低い場合

**原因1**: クエリが毎回異なる
```typescript
// 解決策: クエリを正規化
const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ');
```

**原因2**: TTLが短すぎる
```typescript
// 解決策: TTLを延長
ragCache.set(query, productId, result, resultCount, 3600); // 1時間
```

**原因3**: キャッシュサイズが小さすぎる
```typescript
// 解決策: maxCacheSizeを増やす
const cache = createRAGCache({ maxCacheSize: 500 });
```

### メモリ使用量が多い場合

**解決策1**: maxCacheSizeを減らす
```typescript
const cache = createRAGCache({ maxCacheSize: 100 });
```

**解決策2**: TTLを短縮
```typescript
ragCache.set(query, productId, result, resultCount, 900); // 15分
```

**解決策3**: 手動クリーンアップ
```typescript
ragCache.cleanup(); // 期限切れエントリーを即座に削除
```

---

## 🚧 今後の拡張

### Phase 3: Gemini Cached Content API統合

```typescript
// Gemini公式のキャッシュAPIを使用
const cachedContent = await CachedContent.create({
  model: 'gemini-2.5-flash-lite',
  contents: [{ role: 'user', parts: [{ text: fixedPrompt }] }],
  ttl: '3600s',
});

const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash-lite',
  cachedContent: cachedContent.name,
});
```

**期待効果**: さらに20-30%の高速化

### Phase 4: Redisバックエンド

```typescript
class RedisRAGCache extends RAGSearchCache {
  private redis: Redis;

  async get(query: string, productId: string): Promise<string | null> {
    return await this.redis.get(this.generateKey(query, productId));
  }

  async set(query: string, productId: string, value: string, ttl: number): Promise<void> {
    await this.redis.setex(this.generateKey(query, productId), ttl, value);
  }
}
```

**メリット**:
- 複数インスタンス間でキャッシュ共有
- 永続化
- より大きなキャッシュサイズ

---

## 📚 API Reference

### RAGSearchCache

#### Methods

**`get(query: string, productId: string): string | null`**
- キャッシュから結果を取得
- 期限切れの場合はnullを返す

**`set(query: string, productId: string, knowledgeContext: string, resultCount: number, ttl?: number): string`**
- 検索結果をキャッシュに保存
- TTLはデフォルト30分

**`clear(): void`**
- 全キャッシュをクリア

**`cleanup(): void`**
- 期限切れエントリーを削除

**`getStats(): RAGCacheStats`**
- キャッシュ統計を取得

### PromptCacheManager

#### Methods

**`get(content: string, productId: string): CachedPrompt | null`**
- キャッシュからプロンプトを取得

**`set(content: string, productId: string, ttl?: number): string`**
- プロンプトをキャッシュに保存

**`clear(): void`**
- 全キャッシュをクリア

**`cleanup(): void`**
- 期限切れエントリーを削除

**`getStats(): CacheStats`**
- キャッシュ統計を取得

---

## 📝 変更履歴

### v1.0.0 (2025-10-20)

- ✅ RAGSearchCache実装
- ✅ PromptCacheManager実装
- ✅ LRUエビクションポリシー実装
- ✅ 自動クリーンアップ機能
- ✅ 統計モニタリング機能
- ✅ API統合完了

---

## 📧 サポート

質問や問題があれば、プロジェクトのIssueトラッカーに報告してください。

---

**🌸 Miyabi Framework** - Beauty in Autonomous Development
