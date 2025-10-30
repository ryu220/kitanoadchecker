# Text Segmentation API (v2)

広告文を自然な意味単位でセグメントに分割するAPIエンドポイントです。

## Endpoint

```
POST /api/v2/segment
GET  /api/v2/segment (documentation)
```

## Request

### POST /api/v2/segment

広告文をセグメント化します。

**Request Body:**

```typescript
{
  text: string;        // 広告文全体（1-50,000文字）
  productId: 'HA' | 'SH';  // 商品ID
  apiKey: string;      // Gemini APIキー
}
```

**Example:**

```json
{
  "text": "【美白効果】この美容液は、メラニン生成を抑制し、シミやそばかすを防ぎます。臨床試験において、被験者の85%が4週間で効果を実感しました。",
  "productId": "HA",
  "apiKey": "your-gemini-api-key"
}
```

## Response

### Success Response (200 OK)

```typescript
{
  success: true;
  data: {
    segments: Segment[];    // セグメントの配列
    totalSegments: number;  // セグメント数
    productId: string;      // 商品ID
    textLength: number;     // 元のテキスト長
  }
}
```

**Segment Structure:**

```typescript
{
  id: string;              // セグメントID (例: "seg_001")
  original_text: string;   // 元のテキスト（変更なし）
  type?: 'claim' | 'explanation' | 'evidence';  // セグメントタイプ
  position?: {
    start: number;         // 開始位置（0始まり）
    end: number;          // 終了位置
  }
}
```

**Segment Types:**

- `claim`: 主張（商品の効果や特徴を断定的に述べている部分）
- `explanation`: 説明（主張を補足する説明や詳細）
- `evidence`: 根拠（統計データや調査結果など）

**Example Response:**

```json
{
  "success": true,
  "data": {
    "segments": [
      {
        "id": "seg_001",
        "original_text": "【美白効果】",
        "type": "claim",
        "position": { "start": 0, "end": 7 }
      },
      {
        "id": "seg_002",
        "original_text": "この美容液は、メラニン生成を抑制し、シミやそばかすを防ぎます。",
        "type": "explanation",
        "position": { "start": 7, "end": 42 }
      },
      {
        "id": "seg_003",
        "original_text": "臨床試験において、被験者の85%が4週間で効果を実感しました。",
        "type": "evidence",
        "position": { "start": 42, "end": 76 }
      }
    ],
    "totalSegments": 3,
    "productId": "HA",
    "textLength": 76
  }
}
```

### Error Responses

#### 400 Bad Request (Validation Error)

```json
{
  "success": false,
  "error": "バリデーションエラー",
  "details": [
    {
      "message": "テキストを入力してください",
      "path": ["text"]
    }
  ]
}
```

#### 401 Unauthorized (Invalid API Key)

```json
{
  "success": false,
  "error": "Gemini APIキーが無効です。正しいAPIキーを指定してください。",
  "details": "API key not valid..."
}
```

#### 429 Too Many Requests (Rate Limit)

```json
{
  "success": false,
  "error": "APIレート制限に達しました。しばらく待ってから再試行してください。",
  "details": "Rate limit exceeded"
}
```

#### 500 Internal Server Error

```json
{
  "success": false,
  "error": "セグメント化処理中にエラーが発生しました。",
  "details": "Error details..."
}
```

## Usage Examples

### cURL

```bash
curl -X POST http://localhost:3000/api/v2/segment \
  -H "Content-Type: application/json" \
  -d '{
    "text": "【美白効果】この美容液は、メラニン生成を抑制します。",
    "productId": "HA",
    "apiKey": "your-gemini-api-key"
  }'
```

### JavaScript/TypeScript

```typescript
const response = await fetch('/api/v2/segment', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: '【美白効果】この美容液は、メラニン生成を抑制します。',
    productId: 'HA',
    apiKey: 'your-gemini-api-key'
  })
});

const result = await response.json();
if (result.success) {
  console.log('Segments:', result.data.segments);
}
```

### Python

```python
import requests

response = requests.post(
    'http://localhost:3000/api/v2/segment',
    json={
        'text': '【美白効果】この美容液は、メラニン生成を抑制します。',
        'productId': 'HA',
        'apiKey': 'your-gemini-api-key'
    }
)

result = response.json()
if result['success']:
    print('Segments:', result['data']['segments'])
```

## Validation Rules

### Text Field
- **Required**: Yes
- **Min Length**: 1 character
- **Max Length**: 50,000 characters
- **Type**: string

### ProductId Field
- **Required**: Yes
- **Allowed Values**: 'HA', 'SH'
- **Type**: enum

### ApiKey Field
- **Required**: Yes
- **Min Length**: 1 character
- **Format**: alphanumeric with hyphens/underscores
- **Type**: string

## Error Handling

The API provides detailed error messages for different failure scenarios:

1. **Validation Errors**: Input data doesn't meet schema requirements
2. **Authentication Errors**: Invalid or missing API key
3. **Rate Limit Errors**: Too many requests to Gemini API
4. **Processing Errors**: Failures during segmentation
5. **Unknown Errors**: Unexpected system errors

All errors follow a consistent format with `success: false` and descriptive error messages.

## Implementation Details

### Segmentation Logic

The API uses Google's Gemini API (gemini-2.0-flash-exp model) to intelligently segment text:

1. **Structural Delimiters**: Prioritizes markers like 【】
2. **Line Breaks**: Separates independent claims by newlines
3. **Semantic Units**: Identifies distinct features/benefits
4. **Original Text Preservation**: Never modifies the original text

### Performance

- **Typical Response Time**: 2-5 seconds (depends on text length)
- **Max Text Length**: 50,000 characters
- **Rate Limiting**: Subject to Gemini API quotas

### Security

- User-provided API keys are never stored
- API keys are validated before processing
- All requests are validated against strict schemas

## Testing

Run the test suite:

```bash
# Unit tests
npm test tests/segment-api.test.ts

# Manual shell test
./tests/test-segment-api.sh YOUR_API_KEY
```

## Support

For issues or questions about this API, please refer to the main project documentation or create an issue in the repository.
