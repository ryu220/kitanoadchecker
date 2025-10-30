/**
 * Basic tests for GeminiClient
 *
 * Note: These are integration tests that require a valid GEMINI_API_KEY
 * Run with: npm test lib/gemini-client.test.ts
 */

import { describe, it, expect } from 'vitest';
import { GeminiClient, createGeminiClient } from './gemini-client';

describe('GeminiClient', () => {
  // Skip tests if no API key is available
  const skipIfNoKey = !process.env.GEMINI_API_KEY;

  it('should create client with API key', () => {
    const client = new GeminiClient({ apiKey: 'test-key' });
    expect(client).toBeDefined();
  });

  it('should throw error if no API key provided', () => {
    expect(() => new GeminiClient({ apiKey: '' })).toThrow('Gemini API key is required');
  });

  it.skipIf(skipIfNoKey)('should analyze text structure', async () => {
    const client = createGeminiClient();
    const text = '【新商品】美肌効果が期待できるサプリメント。臨床試験で効果を確認済み。';

    const structure = await client.analyzeStructure(text);

    expect(structure).toBeDefined();
    expect(structure.overview).toBeTruthy();
    expect(Array.isArray(structure.mainClaims)).toBe(true);
    expect(Array.isArray(structure.supportingStatements)).toBe(true);
  }, 30000);

  it.skipIf(skipIfNoKey)('should segment text', async () => {
    const client = createGeminiClient();
    const text = '【新商品】美肌効果が期待できるサプリメント。\n臨床試験で効果を確認済み。';

    const segments = await client.segmentText(text);

    expect(segments).toBeDefined();
    expect(Array.isArray(segments)).toBe(true);
    expect(segments.length).toBeGreaterThan(0);

    // Check segment structure
    segments.forEach(segment => {
      expect(segment.id).toBeTruthy();
      expect(segment.text).toBeTruthy();
      expect(segment.type).toBeTruthy();
      expect(segment.position).toBeDefined();
    });
  }, 30000);

  it.skipIf(skipIfNoKey)('should evaluate segment', async () => {
    const client = createGeminiClient();

    const segment = {
      id: 'seg_1',
      text: '飲むだけで痩せる効果があります',
      type: 'claim' as const,
      position: { start: 0, end: 15 },
    };

    const knowledgeContext = `
薬機法第68条: 医薬品的な効能効果の標ぼうは禁止されています。
「痩せる」などの直接的な効果表現は違反となります。
`;

    const evaluation = await client.evaluateSegment(segment, 'HA', knowledgeContext);

    expect(evaluation).toBeDefined();
    expect(evaluation.segmentId).toBe('seg_1');
    expect(evaluation.compliance).toBeDefined();
    expect(Array.isArray(evaluation.violations)).toBe(true);
    expect(evaluation.evaluatedAt).toBeTruthy();
  }, 30000);

  it('should handle retry logic on errors', async () => {
    // Create client with invalid API key
    const client = new GeminiClient({
      apiKey: 'invalid-key',
      retryConfig: {
        maxRetries: 2,
        initialDelayMs: 100,
        backoffMultiplier: 2,
        maxDelayMs: 500,
      },
      timeoutMs: 5000,
    });

    await expect(client.analyzeStructure('test')).rejects.toThrow();
  }, 15000);
});

describe('createGeminiClient', () => {
  it('should create client with provided API key', () => {
    const client = createGeminiClient('test-key');
    expect(client).toBeDefined();
  });

  it('should throw error if no API key available', () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    expect(() => createGeminiClient()).toThrow('GEMINI_API_KEY is required');

    // Restore
    if (originalKey) {
      process.env.GEMINI_API_KEY = originalKey;
    }
  });
});
