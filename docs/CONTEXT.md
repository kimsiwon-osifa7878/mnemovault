# MnemoVault — 코딩 컨텍스트 문서

> 이 파일은 CLAUDE.md(설계 의도)와 달리, **현재 실제 구현 상태**를 기준으로 작성된 작업 컨텍스트입니다.
> 새로운 기능을 추가하거나 버그를 수정할 때 이 문서를 먼저 읽으세요.

---

## 1. 프로젝트 현황 요약

| 항목 | 상태 |
|------|------|
| Next.js App Router | ✅ 사용 중 (v16.2.2, React 19) |
| 스토리지 | ✅ **클라이언트 File System Access API** (서버 fs 제거됨) |
| LLM 프로바이더 | ✅ **OpenRouter** + **Ollama** (Anthropic SDK 제거됨) |
| Ingest 흐름 | ⚠️ DropZone은 raw 저장만, **Compile 버튼으로 별도 LLM 처리** |
| 위키 CRUD | ✅ 클라이언트에서 직접 파일 읽기/쓰기 |
| 그래프 뷰 | ✅ react-force-graph-2d |
| Chat | ✅ Context-Aware 질의응답 |
| Lint | ✅ 정적 검사 + LLM 모순 감지 |
| 서버 역할 | LLM API 중계만 (`/api/llm/*`) |

---

## 2. 핵심 아키텍처 변경 이력

### v1 → v2: 스토리지 아키텍처 전환 (커밋 `9182b73`)

**변경 이유:** Vercel 서버리스 환경에서 `fs` 모듈 사용 불가.

**이전:** 서버 API(`/api/wiki`, `/api/graph`, `/api/ingest` 등)에서 `fs`로 파일 읽기/쓰기  
**현재:** 브라우저의 **File System Access API**로 클라이언트가 직접 로컬 파일 관리

**제거된 API 라우트:**
- `/api/wiki`, `/api/wiki/[slug]`
- `/api/graph`
- (구) `/api/ingest`, `/api/query`, `/api/lint`

**현재 남은 API 라우트 (LLM 중계 전용):**
- `POST /api/llm/ingest` — LLM 호출 후 IngestLLMResult 반환
- `POST /api/llm/query` — LLM 호출 후 답변 문자열 반환
- `POST /api/llm/lint` — LLM 호출 후 모순 목록 반환
- `GET /api/llm/models` — OpenRouter 모델 목록 반환
- `POST /api/llm/test` — OpenRouter 연결 테스트

### v2 → v3: LLM 프로바이더 전환 (커밋 `0d788ab`)

**변경 이유:** Anthropic SDK 의존성 제거, OpenRouter 무료 모델 지원.

**이전:** `@anthropic-ai/sdk` 사용, Claude provider  
**현재:** 순수 HTTP fetch, OpenRouter + Ollama

**llm-store 마이그레이션:** localStorage에 저장된 구 `provider: "claude"` → `"openrouter"` 자동 변환 (v0→v1 migration).

### Ingest 흐름 분리 (커밋 `0d788ab`, `fd43b3d`)

**현재 DropZone 동작:**  
- 파일을 `raw/{fileType}s/{filename}`에 저장만 함
- LLM 처리 **없음** (이전에는 ingest API 호출했으나 제거됨)
- `result = { created: [], updated: [], message: "raw 폴더에 저장됨" }`

**LLM 처리는 별도 Compile 버튼으로 진행:**  
- 사이드바 "Compile" 버튼 → `CompileModal` 열림
- 미처리 파일 목록 표시 → "Start Compile" 클릭
- `runCompile()` → `compileFile()` → `POST /api/llm/ingest`

---

## 3. 파일 구조 및 각 파일 역할

### `src/lib/llm/`

```
client.ts       — LLM 통합 진입점. callLLM(system, user, maxTokens, config) 함수.
                  provider에 따라 callOpenRouter() 또는 callOllama() 라우팅.
                  OpenRouter: POST https://openrouter.ai/api/v1/chat/completions
                  Ollama: POST {ollamaUrl}/api/chat

ingest.ts       — 서버사이드 전용. processIngestWithLLM() 호출 시 JSON 파싱 후 IngestLLMResult 반환.
                  LLM 응답에서 /\{[\s\S]*\}/ 정규식으로 JSON 추출.

query.ts        — 서버사이드 전용. answerWithLLM() → 마크다운 문자열 반환.

lint.ts         — 서버사이드 전용. detectContradictions() → LLMLintResult[] 반환.
                  LLM 응답에서 /\[[\s\S]*\]/ 정규식으로 JSON 배열 추출.
```

### `src/lib/compile/`

```
types.ts        — UncompiledFile, CompileLogEntry, CompileFileResult, CompileProgress 인터페이스.

get-uncompiled.ts — raw/ 디렉토리 스캔, meta/processed_files.json과 비교.
                    raw/assets/ 폴더 제외. 폴더명에서 fileType 추출 (예: articles → article).

compile-file.ts — 단일 파일 컴파일 워크플로우.
                  1. 파일 읽기 → POST /api/llm/ingest → IngestLLMResult 파싱
                  2. wiki/sources/{slug}.md 생성 (Key Takeaways 포함)
                  3. concepts/entities 페이지 생성 or 병합
                  4. slug 리스트와 CompileLogEntry 배열 반환

run-compile.ts  — 여러 파일 일괄 컴파일 오케스트레이션.
                  progress 콜백으로 UI 업데이트. 완료 후 index.md, log.md 갱신 (non-fatal).
                  processed_files.json에 타임스탬프 저장.
```

### `src/lib/wiki/`

```
parser.ts       — parseWikilinks(): /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g 정규식.
                  parseWikiPage(): gray-matter로 frontmatter 파싱.
                  buildGraphData(): 페이지 → nodes + edges.
                  getBacklinks(): targetSlug를 링크한 페이지 목록.

graph.ts        — getNeighborNodes(): 양방향 이웃 노드.
                  getBacklinksFromGraph(): GraphData에서 역참조 조회.

index-manager.ts — generateIndexContent(): 전체 페이지 목록으로 index.md 자동 생성.
                   섹션: Concepts, Entities, Sources, Analyses.

log-manager.ts  — appendLogEntry(): log.md에 타임스탬프 + 작업 기록 append.
                  operations: "ingest" | "query" | "lint" | "compile"
```

### `src/lib/storage/`

```
client-fs.ts    — File System Access API 래퍼.
                  readFile / writeFile / deleteFile / listFiles (*.md만) / listAllFiles (전체).
                  readJsonFile: 파싱 실패 시 {} 반환.
                  ensureDirectoryStructure: 기본 디렉토리 + 파일 생성.
```

### `src/stores/`

```
storage-store.ts — FileSystemDirectoryHandle 관리.
                   IndexedDB (DB: "mnemovault-storage", key: "dirHandle")에 폴더 핸들 저장.
                   pickFolder() / restoreFolder() / clearFolder().
                   contentHandle: root 아래 content/ 폴더의 핸들.

wiki-store.ts    — WikiPage[] 상태. fetchPages, fetchPage, savePage, deletePage.
                   모든 파일 IO는 useStorageStore().contentHandle 경유.
                   slug = filename에서 .md 제거.

llm-store.ts     — LLM 설정 (localStorage 영속화, key: "mnemovault-llm-settings" v1).
                   provider: "openrouter" | "ollama"
                   openrouterModel: default "openrouter/free"
                   ollamaModel: default "gemma4:e4b"
                   ollamaUrl: default "http://localhost:11434"
                   getConfig(): 현재 provider에 맞는 LLMConfig 반환.

chat-store.ts    — 채팅 히스토리 + sendQuery().
                   buildQueryContext(): index.md + 현재문서 + 1-hop 이웃(5개) + 상위 20개 페이지.
                   fileAsPage=true 시 wiki/analyses/{slug}.md에 저장 후 log.md 갱신.

graph-store.ts   — (별도 탐색 불필요) wiki-store의 pages로 buildGraphData() 호출.
```

### `src/components/`

```
StorageGuard.tsx  — 브라우저 File System Access API 지원 여부 체크.
                    미지원 시 에러 메시지. 폴더 미선택 시 선택 UI. 준비 완료 시 children 렌더링.

LLMSettings.tsx   — OpenRouter/Ollama 프로바이더 선택 + 모델 설정 모달.
                    OpenRouter: /api/llm/models, /api/llm/test 사용.
                    Ollama: {url}/api/tags로 직접 모델 목록 조회.

compile/CompileModal.tsx — 미처리 파일 목록 + 컴파일 진행 상황 모달.
                           phases: loading → ready → compiling → done.
                           로그 타입별 색상: info(흰), request(보라), response(에메랄드), error(빨강), write(주황).

ingest/DropZone.tsx      — raw 파일 저장 전용 (LLM 처리 없음).
                           ⚠️ 디버그용 fetch(http://127.0.0.1:7941/...) 코드 포함 — 제거 필요.

layout/Sidebar.tsx       — 좌측 네비게이션. 검색, 파일 트리, 하단 버튼들.
                           미처리 파일 수를 Compile 버튼에 배지로 표시 (getUncompiledCount() 사용).

layout/EditorPane.tsx    — Edit/Preview/Split 모드. Ctrl+S 저장. 삭제 확인.
layout/ChatPane.tsx      — Context-Aware 채팅. WikiRenderer로 답변 렌더링. Citations 클릭 → 페이지 이동.

graph/GraphView.tsx      — react-force-graph-2d. 노드 색상: concept(파랑), entity(보라), source(초록), analysis(주황).
markdown/WikiRenderer.tsx — [[wikilink]] 커스텀 렌더러. 존재하면 파란색, 없으면 빨간색.
markdown/Backlinks.tsx   — 역참조 목록.

LintPanel.tsx            — 정적 검사(orphan, missing_page) + LLM 모순 감지.
NewPageModal.tsx         — 새 페이지 생성 (title, type 입력).
StorageSettings.tsx      — 폴더 변경/해제 설정.
```

### `src/app/`

```
layout.tsx              — 루트 레이아웃 (HTML, body, globals.css).
(landing)/page.tsx      — 랜딩 페이지. "Start Building" → /app으로 이동.
app/layout.tsx          — /app 레이아웃.
app/page.tsx            — 메인 IDE 페이지.
                          StorageGuard → 3-pane 레이아웃.
                          모달 상태: ingest, compile, newPage, lint, llmSettings, storageSettings.
                          초기 마운트: index 페이지 로드.
                          백링크 계산: 선택된 페이지를 링크하는 모든 페이지 스캔.

wiki/[slug]/page.tsx    — 개별 위키 문서 라우트 (현재 앱은 /app에서 직접 관리하므로 보조적).
```

---

## 4. 데이터 타입 레퍼런스

### `src/types/wiki.ts`

```typescript
interface Frontmatter {
  title: string;
  type: "concept" | "entity" | "source" | "analysis" | "index" | "log";
  created: string;         // YYYY-MM-DD
  updated: string;         // YYYY-MM-DD
  sources?: string[];
  tags?: string[];
  confidence?: "high" | "medium" | "low";
}

interface WikiPage {
  slug: string;            // filename without .md
  filename: string;        // e.g. "wiki/concepts/foo.md"
  frontmatter: Frontmatter;
  content: string;         // body without frontmatter
  rawContent: string;      // full file content
}

interface WikiLink {
  raw: string;             // "[[target|alias]]"
  target: string;
  alias?: string;
  exists: boolean;         // 항상 false로 파싱됨 (나중에 검증)
}
```

### `src/lib/llm/ingest.ts`

```typescript
interface IngestLLMResult {
  summary: { title: string; content: string; key_takeaways: string[] };
  concepts: { name: string; content: string }[];
  entities: { name: string; content: string }[];
  tags: string[];
}
```

### `src/lib/compile/types.ts`

```typescript
interface UncompiledFile {
  path: string;       // e.g. "raw/articles/foo.txt"
  fileName: string;
  fileType: string;   // "article" | "paper" | "note" | "data"
  reason: "new" | "changed";
}

interface CompileLogEntry {
  timestamp: number;
  type: "info" | "request" | "response" | "error" | "write";
  label: string;
  detail?: string;
}

interface CompileFileResult {
  file: UncompiledFile;
  sourceSlug: string;
  createdSlugs: string[];
  updatedSlugs: string[];
  error?: string;
  logs: CompileLogEntry[];
}

interface CompileProgress {
  total: number;
  completed: number;
  currentFile: string | null;
  results: CompileFileResult[];
  status: "idle" | "running" | "done" | "error";
  startedAt: number;
}
```

### `src/stores/llm-store.ts`

```typescript
interface LLMSettings {
  provider: "openrouter" | "ollama";
  openrouterModel: string;   // default: "openrouter/free"
  ollamaModel: string;       // default: "gemma4:e4b"
  ollamaUrl: string;         // default: "http://localhost:11434"
}

interface LLMConfig {
  provider: "openrouter" | "ollama";
  model: string;
  ollamaUrl?: string;        // Ollama일 때만 포함
}
```

---

## 5. API 엔드포인트 현황

| 메서드 | 경로 | 요청 | 응답 |
|--------|------|------|------|
| POST | `/api/llm/ingest` | `{ fileName, content, fileType, llmConfig }` | `IngestLLMResult` |
| POST | `/api/llm/query` | `{ question, context, llmConfig }` | `{ answer: string }` |
| POST | `/api/llm/lint` | `{ pageSummaries, llmConfig }` | `{ contradictions: LLMLintResult[] }` |
| GET | `/api/llm/models` | — | `{ models: string[] }` |
| POST | `/api/llm/test` | `{ model: string }` | `{ status: "ok"\|"fail", error? }` |

**환경 변수:**
```
OPENROUTER_API_KEY=        # OpenRouter API 키
OPENROUTER_FREE_MODELS=    # 쉼표 구분 모델 목록 (e.g. google/gemma-4-26b-a4b-it,...)
OLLAMA_URL=                # 서버에서 Ollama 접근 시 (현재 미사용, 클라이언트가 직접 호출)
```

---

## 6. 위키 파일 컨벤션

### 디렉토리 구조 (content/ 폴더 기준)

```
content/
├── raw/
│   ├── articles/    # .md, .txt, .pdf, .json 등 원본
│   ├── papers/
│   ├── assets/      # 이미지 등 (컴파일 제외)
├── wiki/
│   ├── index.md     # 자동 생성, type: "index"
│   ├── log.md       # append-only, type: "log"
│   ├── concepts/    # type: "concept"
│   ├── entities/    # type: "entity"
│   ├── sources/     # type: "source" (컴파일 결과)
│   └── analyses/    # type: "analysis" (Query 저장 결과)
└── meta/
    └── processed_files.json   # { "raw/articles/foo.txt": 1712345678000 }
```

### Frontmatter 필수 필드

```yaml
---
title: "페이지 제목"
type: concept       # concept | entity | source | analysis
created: 2026-04-09
updated: 2026-04-09
sources:
  - raw/articles/foo.txt
tags: [태그1, 태그2]
confidence: high    # high | medium | low
---
```

### Slug 규칙
- `filename` 경로에서 `.md` 제거
- 예: `wiki/concepts/트랜스포머-아키텍처.md` → slug `wiki/concepts/트랜스포머-아키텍처`
- **주의:** wiki-store는 `filename.replace(".md", "")` 비교로 파일 찾음

---

## 7. 알려진 문제 및 TODO

### 즉시 수정이 필요한 것
1. **`src/components/ingest/DropZone.tsx`** — 디버그 fetch 코드 (`http://127.0.0.1:7941/...`) 제거 필요
2. **WikiLink `exists` 필드** — parser.ts에서 항상 `false`로 설정됨. 실제 wiki 파일과 대조하는 로직 없음.

### 구조적 한계
3. **Ingest 흐름 분리** — DropZone(raw 저장)과 CompileModal(LLM 처리)이 분리되어 있음. 사용자가 두 단계를 따로 실행해야 함. 원하면 통합 가능.
4. **change detection 없음** — `get-uncompiled.ts`는 processed_files.json 존재 여부만 확인. 파일 내용 변경은 감지 안 함. (reason="changed"는 정의되어 있으나 미구현)
5. **slug 충돌** — 동일 slug 파일이 여러 개일 때 첫 번째 파일만 사용됨 (wiki-store 문제).
6. **Ollama CORS** — 클라이언트에서 직접 Ollama 모델 목록 조회 시 CORS 설정 필요할 수 있음.

### 미완성 기능
7. **Fuse.js 검색** — 사이드바에 검색 인풋이 있으나 Zustand store의 pages 배열을 직접 필터링. Fuse.js import만 되어 있을 수 있음 (확인 필요).
8. **반응형/모바일** — 아직 미적용. 3-pane 레이아웃은 데스크탑 전용.

---

## 8. 주요 의존성 (현재 설치된 버전)

| 패키지 | 버전 | 용도 |
|--------|------|------|
| next | 16.2.2 | 프레임워크 |
| react | 19.2.4 | UI |
| zustand | 5.0.12 | 상태 관리 |
| gray-matter | 4.0.3 | YAML frontmatter 파싱 |
| react-markdown | 10.1.0 | 마크다운 렌더링 |
| @uiw/react-md-editor | 4.1.0 | 마크다운 에디터 |
| react-force-graph-2d | 1.29.1 | 그래프 시각화 |
| fuse.js | 7.3.0 | 퍼지 검색 |
| lucide-react | 1.7.0 | 아이콘 |
| rehype-highlight | — | 코드 하이라이팅 |
| rehype-raw | — | HTML in markdown |
| remark-gfm | — | GFM 확장 |
| @vercel/blob | 2.3.3 | 설치되어 있으나 현재 미사용 |

**`@anthropic-ai/sdk`는 삭제됨 (마지막 커밋에서 제거).**

---

## 9. 로컬 개발 환경 설정

```bash
npm install
# .env.local 생성:
# OPENROUTER_API_KEY=sk-or-xxx
# OPENROUTER_FREE_MODELS=google/gemma-4-26b-a4b-it,nvidia/nemotron-3-super-120b-a12b

npm run dev
# → http://localhost:3000 (랜딩)
# → http://localhost:3000/app (IDE)
```

**브라우저:** Chrome 86+ 또는 Edge 86+ 필수 (File System Access API)

---

## 10. 코딩 시 주의사항

1. **서버에서 파일 접근 불가** — 모든 위키 파일 IO는 클라이언트(`client-fs.ts`, store들)에서 처리. 서버 API 라우트에서는 `fs` 사용 금지.
2. **LLMConfig 항상 전달** — API 라우트는 `llmConfig`를 req body에서 받아 `callLLM()`에 전달해야 함. 서버 환경변수로 고정 설정하지 않음.
3. **gray-matter 사용** — frontmatter 파싱/생성에 항상 gray-matter 사용. 직접 문자열 조작 금지.
4. **Wikilink 문법** — `[[target]]` 또는 `[[target|alias]]`. 공백은 그대로 허용 (슬러그 변환 없이 비교).
5. **ContentHandle** — `useStorageStore().contentHandle`이 null이면 파일 작업 불가. `StorageGuard`가 null이 아님을 보장함.
6. **한국어 UI** — 사용자에게 표시되는 메시지는 한국어로 작성.
7. **로그 작성** — 중요한 파일 쓰기 작업 후에는 `appendLogEntry()`로 log.md에 기록.
