/**
 * API Key Validation Endpoint
 *
 * ユーザーが入力したGemini API Keyが有効かどうかをテストします
 */

import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const RequestSchema = z.object({
  apiKey: z.string().min(10),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey } = RequestSchema.parse(body);

    // Test the API key with a simple embedding request
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'embedding-001' });

    // Simple test embedding (very small text to minimize quota usage)
    await model.embedContent({
      content: { role: 'user', parts: [{ text: 'test' }] },
      taskType: TaskType.RETRIEVAL_QUERY,
    });

    return NextResponse.json({
      valid: true,
      message: 'API Key is valid',
    });
  } catch (error: any) {
    console.error('[API Key Validation] Error:', error);

    // Analyze error
    if (error.message?.includes('429') || error.message?.includes('quota')) {
      return NextResponse.json(
        {
          valid: false,
          error: 'quota_exceeded',
          message: 'API Keyのクォータ制限に達しています。新しいAPI Keyを作成するか、Google AI Studioで制限を確認してください。',
          details: error.message,
        },
        { status: 429 }
      );
    }

    if (error.message?.includes('401') || error.message?.includes('API key')) {
      return NextResponse.json(
        {
          valid: false,
          error: 'invalid_key',
          message: 'API Keyが無効です。正しいGemini API Keyを入力してください。',
          details: error.message,
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        valid: false,
        error: 'unknown',
        message: 'API Keyの検証中にエラーが発生しました。',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
