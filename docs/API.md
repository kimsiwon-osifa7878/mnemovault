# API 엔드포인트 명세

> 서버 API는 LLM 중계 전용. 모든 위키 파일 IO는 클라이언트에서 처리.

---

## 현재 API 라우트

모든 API는 `/api/llm/` 접두사 아래에 위치.

### `POST /api/llm/ingest`

Raw 소스를 LLM에게 보내 위키 컴파일 결과를 받는다.

```typescript
// Request
{
  fileName: string;
  content: string;
  fileType: "article" | "paper" | "note" | "data";
  llmConfig: LLMConfig;
}

// Response → IngestLLMResult
{
  summary: { title: string; content: string; key_takeaways: string[] };
  concepts: { name: string; content: string }[];
  entities: { name: string; content: string }[];
  tags: string[];
}
```

### `POST /api/llm/query`

위키 컨텍스트를 포함하여 LLM에게 질의응답.

```typescript
// Request
{
  question: string;
  context: string;
  llmConfig: LLMConfig;
}

// Response
{
  answer: string;
}
```

### `POST /api/llm/lint`

위키 요약을 보내 LLM이 모순을 감지.

```typescript
// Request
{
  pageSummaries: string;
  llmConfig: LLMConfig;
}

// Response
{
  contradictions: LLMLintResult[];
}
```

### `GET /api/llm/models`

OpenRouter 사용 가능 모델 목록 반환.

```typescript
// Response
{
  models: string[];
}
```

### `POST /api/llm/test`

OpenRouter 연결 테스트.

```typescript
// Request
{
  model: string;
}

// Response
{
  status: "ok" | "fail";
  error?: string;
}
```

---

## LLMConfig 타입

```typescript
interface LLMConfig {
  provider: "openrouter" | "ollama";
  model: string;
  ollamaUrl?: string;
}
```

---

## 환경 변수

```
OPENROUTER_API_KEY=        # OpenRouter API 키
OPENROUTER_FREE_MODELS=    # 쉼표 구분 모델 목록
```
