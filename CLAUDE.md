# CLAUDE.md — LLM Wiki IDE

> Andrej Karpathy의 LLM Wiki 패턴을 웹 기반 IDE로 구현하는 프로젝트.
> RAG의 "매번 재검색" 한계를 넘어, LLM이 지식을 **증분 컴파일(Incremental Compile)**하여
> 영구적으로 축적하는 마크다운 위키 시스템. Vercel 배포 대상.

---

## 1. 프로젝트 철학

### 핵심 원칙: LLM as a Knowledge Compiler

Karpathy의 원문 요약:
- 기존 RAG는 매 질문마다 raw 문서에서 지식을 처음부터 재발견한다. **축적이 없다.**
- LLM Wiki는 raw 소스를 **한 번 컴파일**하여 구조화된 마크다운 위키로 변환한다.
- 위키는 **복리로 성장하는 영구 아티팩트**다. 교차 참조, 모순 플래깅, 종합 분석이 누적된다.
- 사람은 소스 큐레이션과 질문에 집중하고, LLM이 요약·교차참조·정리·유지보수를 전담한다.

### 3-Layer Architecture (Karpathy 원문 기반)

```
┌─────────────────────────────────────────────┐
│  Raw Sources (불변)                          │
│  articles, papers, images, datasets          │
│  → LLM이 읽기만 함, 수정 불가                  │
├─────────────────────────────────────────────┤
│  Wiki (LLM 소유)                             │
│  summaries, entity pages, concept pages      │
│  backlinks, index.md, log.md                 │
│  → LLM이 생성·갱신, 사람은 읽기·리뷰           │
├─────────────────────────────────────────────┤
│  Schema (이 파일 = CLAUDE.md)                 │
│  폴더 구조, 컨벤션, 워크플로우 정의              │
│  → 사람과 LLM이 공동 진화                      │
└─────────────────────────────────────────────┘
```

### 4대 오퍼레이션 (Karpathy 정의)

1. **Ingest** — raw 소스 투입 → LLM이 요약 작성, 인덱스 갱신, 관련 엔티티/개념 페이지 업데이트, 로그 기록. 단일 소스가 10~15개 위키 페이지에 영향.
2. **Query** — 위키에 질문 → LLM이 index.md를 먼저 읽고 관련 페이지를 드릴다운하여 답변 합성. 좋은 답변은 위키에 새 페이지로 재수록.
3. **Lint** — 주기적 헬스체크 → 모순 감지, 낡은 주장 갱신, 고아 페이지 발견, 누락된 교차참조 추가.
4. **Compile** — raw에서 wiki로의 변환 자체가 핵심 혁신. 단순 인덱싱이 아닌 구조화·요약·백링크 생성.

---

## 2. 기술 스택 및 폴더 구조

### 기술 스택

| 레이어 | 기술 | 이유 |
|--------|------|------|
| **Framework** | Next.js 14+ (App Router) | SSR/SSG, API Routes, Vercel 네이티브 배포 |
| **스타일링** | Tailwind CSS | 유틸리티 기반, 빠른 프로토타이핑 |
| **마크다운** | `react-markdown` + `remark-gfm` + `rehype` | GFM 렌더링, `[[wikilink]]` 커스텀 파싱 |
| **에디터** | `@uiw/react-md-editor` 또는 `CodeMirror 6` | 실시간 마크다운 편집 |
| **그래프 뷰** | `react-force-graph-2d` (D3 기반) | `[[Link]]` 관계 시각화, 노드 클릭 네비게이션 |
| **스토리지** | Vercel Blob Storage 또는 로컬 `fs` (개발용) | 마크다운 파일 영속화 |
| **LLM** | Anthropic Claude API (sonnet) | Ingest/Query/Lint 처리 |
| **상태관리** | Zustand | 경량, 문서 상태·그래프 상태 관리 |
| **검색** | 클라이언트 Fuse.js (초기) → 서버 BM25 (확장) | index.md 기반 네비게이션이 우선, 검색은 보조 |

### 폴더 구조

```
llm-wiki-ide/
├── CLAUDE.md                    # 이 파일 (스키마)
├── next.config.js
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── vercel.json
│
├── content/                     # 위키 데이터 (git 추적)
│   ├── raw/                     # Raw Sources (불변)
│   │   ├── articles/
│   │   ├── papers/
│   │   └── assets/              # 이미지 등 첨부파일
│   ├── wiki/                    # LLM이 관리하는 위키 페이지
│   │   ├── index.md             # 전체 카탈로그 (카테고리별)
│   │   ├── log.md               # 시간순 작업 기록 (append-only)
│   │   ├── entities/            # 엔티티 페이지
│   │   ├── concepts/            # 개념 페이지
│   │   ├── sources/             # 소스별 요약 페이지
│   │   └── analyses/            # Query 결과 재수록 페이지
│   └── meta/
│       └── processed_files.json # 처리된 파일 해시 트래킹
│
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── layout.tsx           # 루트 레이아웃 (3-pane IDE)
│   │   ├── page.tsx             # 메인 대시보드
│   │   ├── api/
│   │   │   ├── wiki/            # CRUD API
│   │   │   │   ├── route.ts     # GET (목록), POST (생성)
│   │   │   │   └── [slug]/
│   │   │   │       └── route.ts # GET, PUT, DELETE (개별 문서)
│   │   │   ├── ingest/
│   │   │   │   └── route.ts     # POST: raw → wiki 컴파일
│   │   │   ├── query/
│   │   │   │   └── route.ts     # POST: 위키 기반 질의응답
│   │   │   ├── lint/
│   │   │   │   └── route.ts     # POST: 헬스체크 실행
│   │   │   └── graph/
│   │   │       └── route.ts     # GET: 노드/엣지 데이터
│   │   └── wiki/
│   │       └── [slug]/
│   │           └── page.tsx     # 개별 위키 문서 뷰/편집
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx      # 파일 트리 (raw + wiki)
│   │   │   ├── EditorPane.tsx   # 마크다운 에디터 + 프리뷰
│   │   │   └── ChatPane.tsx     # 에이전트 채팅 (Context-Aware)
│   │   ├── graph/
│   │   │   └── GraphView.tsx    # Force Graph 시각화
│   │   ├── markdown/
│   │   │   ├── WikiRenderer.tsx # [[wikilink]] 커스텀 렌더러
│   │   │   └── Backlinks.tsx    # 역참조 문서 목록
│   │   └── ingest/
│   │       ├── DropZone.tsx     # 파일 드래그앤드롭
│   │       └── IngestStatus.tsx # 처리 진행상황
│   │
│   ├── lib/
│   │   ├── llm/
│   │   │   ├── client.ts        # Claude API 래퍼
│   │   │   ├── ingest.ts        # Ingest 파이프라인 로직
│   │   │   ├── query.ts         # Query 파이프라인 로직
│   │   │   └── lint.ts          # Lint 파이프라인 로직
│   │   ├── wiki/
│   │   │   ├── parser.ts        # [[wikilink]] 파싱, frontmatter 추출
│   │   │   ├── graph.ts         # 노드/엣지 빌더
│   │   │   ├── index-manager.ts # index.md 자동 갱신
│   │   │   └── log-manager.ts   # log.md append
│   │   ├── storage/
│   │   │   ├── fs.ts            # 로컬 파일시스템 어댑터
│   │   │   └── blob.ts          # Vercel Blob 어댑터
│   │   └── utils/
│   │       ├── hash.ts          # 파일 해시 (SHA-256)
│   │       └── markdown.ts      # 마크다운 유틸리티
│   │
│   ├── stores/
│   │   ├── wiki-store.ts        # 문서 목록, 현재 열린 문서
│   │   ├── graph-store.ts       # 그래프 노드/엣지 상태
│   │   └── chat-store.ts        # 채팅 히스토리, 컨텍스트
│   │
│   └── types/
│       ├── wiki.ts              # WikiPage, WikiLink, Frontmatter
│       └── graph.ts             # GraphNode, GraphEdge
│
└── public/
    └── fonts/                   # 커스텀 폰트
```

---

## 3. 핵심 모듈 상세 설계

### 3-1. Wiki 문서 포맷

모든 위키 페이지는 YAML frontmatter + 마크다운 본문:

```markdown
---
title: "트랜스포머 아키텍처"
type: concept          # entity | concept | source | analysis
created: 2026-04-06
updated: 2026-04-06
sources:
  - raw/papers/attention-is-all-you-need.pdf
  - raw/articles/transformer-explained.md
tags: [deep-learning, attention, NLP]
confidence: high       # high | medium | low
---

# 트랜스포머 아키텍처

셀프 어텐션 메커니즘을 기반으로 한 신경망 구조...

## 핵심 구성요소

- [[셀프 어텐션]] 메커니즘
- [[포지셔널 인코딩]]
- [[멀티헤드 어텐션]]

## 관련 개념

- [[BERT]]는 트랜스포머의 인코더만 사용
- [[GPT]]는 디코더만 사용

## 출처

- [[attention-is-all-you-need-summary]]
```

### 3-2. index.md 포맷

```markdown
# Wiki Index

## Concepts
- [[트랜스포머 아키텍처]] — 셀프 어텐션 기반 신경망 (sources: 3, updated: 2026-04-06)
- [[셀프 어텐션]] — 시퀀스 내 토큰 간 관계 계산 (sources: 2, updated: 2026-04-05)

## Entities
- [[Andrej Karpathy]] — AI 연구자, Eureka Labs 설립자 (sources: 5)

## Sources
- [[attention-is-all-you-need-summary]] — Vaswani et al. 2017 논문 요약

## Analyses
- [[트랜스포머 vs RNN 비교]] — Query에서 파생된 비교 분석
```

### 3-3. log.md 포맷

```markdown
# Wiki Log

## [2026-04-06T14:30] ingest | attention-is-all-you-need.pdf
- Created: [[attention-is-all-you-need-summary]]
- Updated: [[트랜스포머 아키텍처]], [[셀프 어텐션]]
- New page: [[멀티헤드 어텐션]]
- Index updated: +3 entries

## [2026-04-06T15:00] query | 트랜스포머와 RNN의 차이점?
- Answer filed as: [[트랜스포머 vs RNN 비교]]
- Referenced: [[트랜스포머 아키텍처]], [[RNN]]
```

### 3-4. Ingest 파이프라인

```
[새 파일 업로드] → [SHA-256 해시 계산]
    ↓
[processed_files.json 확인] → 이미 처리됨? → 스킵
    ↓ (새 파일)
[LLM에게 전송: 요약 + 키워드 추출 요청]
    ↓
[LLM 응답 파싱]
    ├── summary → sources/ 폴더에 요약 페이지 생성
    ├── concepts → 기존 concepts/ 페이지에 병합 or 신규 생성
    ├── entities → 기존 entities/ 페이지에 병합 or 신규 생성
    ├── wikilinks → [[링크]] 자동 삽입
    ├── index.md → 갱신
    └── log.md → 기록 append
    ↓
[processed_files.json에 해시 저장]
```

**Ingest 시 LLM 프롬프트 설계:**

```typescript
const INGEST_SYSTEM_PROMPT = `
당신은 지식 위키 컴파일러입니다. 주어진 raw 소스를 분석하여 아래 JSON 형식으로 응답하세요.

{
  "summary": {
    "title": "소스 제목",
    "content": "마크다운 형식의 상세 요약 (500자 이상)",
    "key_takeaways": ["핵심 포인트 1", "핵심 포인트 2"]
  },
  "concepts": [
    {
      "name": "개념명",
      "exists_in_wiki": true/false,
      "update_content": "기존 페이지에 추가할 내용 (exists=true)",
      "new_content": "새 페이지 전체 내용 (exists=false)"
    }
  ],
  "entities": [...],
  "wikilinks": ["[[개념A]]", "[[엔티티B]]"],
  "contradictions": ["기존 wiki의 X 주장과 이 소스의 Y가 충돌"],
  "questions_to_investigate": ["추가 조사가 필요한 질문"]
}

중요 규칙:
- 모든 교차참조는 [[위키링크]] 문법 사용
- 기존 wiki 페이지 목록을 참조하여 중복 생성 방지
- 출처를 반드시 명시 (어떤 raw 파일에서 왔는지)
- confidence 레벨 표기 (high/medium/low)
`;
```

### 3-5. [[Wikilink]] 파서

```typescript
// src/lib/wiki/parser.ts

export interface WikiLink {
  raw: string;        // "[[트랜스포머 아키텍처]]"
  target: string;     // "트랜스포머 아키텍처"
  alias?: string;     // "[[target|alias]]" 의 alias
  exists: boolean;    // wiki에 해당 페이지 존재 여부
}

const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function parseWikilinks(content: string): WikiLink[] {
  const links: WikiLink[] = [];
  let match;
  while ((match = WIKILINK_REGEX.exec(content)) !== null) {
    links.push({
      raw: match[0],
      target: match[1].trim(),
      alias: match[2]?.trim(),
      exists: false, // 나중에 실제 wiki 파일과 대조
    });
  }
  return links;
}

export function buildGraphData(pages: WikiPage[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes = pages.map(p => ({
    id: p.slug,
    label: p.frontmatter.title,
    type: p.frontmatter.type,
    linkCount: 0,
  }));

  const edges: GraphEdge[] = [];
  const slugSet = new Set(pages.map(p => p.slug));

  for (const page of pages) {
    const links = parseWikilinks(page.content);
    for (const link of links) {
      const targetSlug = toSlug(link.target);
      if (slugSet.has(targetSlug)) {
        edges.push({ source: page.slug, target: targetSlug });
      }
    }
  }

  return { nodes, edges };
}
```

### 3-6. Context-Aware Chat

채팅 시 자동으로 포함할 컨텍스트:

```typescript
async function buildChatContext(
  currentDoc: string | null,
  graphData: GraphData
): Promise<string> {
  const contextParts: string[] = [];

  // 1. index.md 항상 포함 (Karpathy 패턴: LLM이 index를 먼저 읽음)
  contextParts.push(await readWikiFile("index.md"));

  // 2. 현재 열린 문서
  if (currentDoc) {
    contextParts.push(await readWikiFile(currentDoc));

    // 3. 현재 문서의 1-hop 이웃 노드들
    const neighbors = getNeighborNodes(currentDoc, graphData);
    for (const neighbor of neighbors.slice(0, 5)) {
      contextParts.push(await readWikiFile(neighbor));
    }

    // 4. 현재 문서의 backlinks
    const backlinks = getBacklinks(currentDoc, graphData);
    for (const bl of backlinks.slice(0, 3)) {
      contextParts.push(await readWikiFile(bl));
    }
  }

  return contextParts.join("\n\n---\n\n");
}
```

---

## 4. UI/UX 설계

### 레이아웃: 3-Pane IDE

```
┌──────────────┬───────────────────────────┬──────────────┐
│              │                           │              │
│   Sidebar    │      Editor / Preview     │   Chat +     │
│              │                           │   Graph      │
│  ┌────────┐  │  ┌─────────────────────┐  │              │
│  │File    │  │  │ # 트랜스포머 아키텍처  │  │  ┌────────┐ │
│  │Tree    │  │  │                     │  │  │ Graph  │ │
│  │        │  │  │ 셀프 어텐션 기반...    │  │  │ View   │ │
│  │📁 raw  │  │  │                     │  │  │        │ │
│  │📁 wiki │  │  │ [[셀프 어텐션]]       │  │  └────────┘ │
│  │  📄 .. │  │  │ [[포지셔널 인코딩]]   │  │              │
│  │  📄 .. │  │  │                     │  │  ┌────────┐ │
│  └────────┘  │  │                     │  │  │ Chat   │ │
│              │  │ --- Backlinks ---    │  │  │        │ │
│  ┌────────┐  │  │ ← BERT             │  │  │ > 질문  │ │
│  │Search  │  │  │ ← GPT              │  │  │        │ │
│  └────────┘  │  └─────────────────────┘  │  └────────┘ │
│              │                           │              │
│  [+ Ingest]  │  [Edit] [Preview] [Split] │  [Lint] btn  │
└──────────────┴───────────────────────────┴──────────────┘
```

### 디자인 방향

- **톤**: 에디토리얼/매거진 스타일 — 깔끔하되 차가운 IDE가 아닌, 읽고 싶은 느낌
- **폰트**: 한글은 `Pretendard`, 영문 제목은 `IBM Plex Mono`, 본문은 `IBM Plex Sans`
- **컬러**: 다크 모드 기본, 배경 `#0a0a0f`, 위키링크는 `#60a5fa`(블루), 존재하지 않는 링크는 `#f87171`(레드), 액센트 `#34d399`(그린)
- **그래프**: 노드 타입별 색상 — entity(보라), concept(파랑), source(녹색), analysis(주황)

---

## 5. API 엔드포인트 명세

### `POST /api/ingest`

Raw 파일을 받아 wiki로 컴파일.

```typescript
// Request
{
  fileName: string;
  content: string;       // 파일 내용 (텍스트)
  fileType: "article" | "paper" | "note" | "data";
}

// Response
{
  success: boolean;
  created: string[];     // 새로 생성된 wiki 페이지 slugs
  updated: string[];     // 갱신된 wiki 페이지 slugs
  logEntry: string;      // log.md에 추가된 내용
}
```

### `POST /api/query`

위키 기반 Context-Aware 질의응답.

```typescript
// Request
{
  question: string;
  currentDocument?: string;  // 현재 열린 문서 slug
  fileAsPage?: boolean;      // 좋은 답변을 위키에 저장할지
}

// Response
{
  answer: string;            // 마크다운 형식 답변
  citations: string[];       // 참조한 위키 페이지
  savedAs?: string;          // fileAsPage=true일 때 저장된 slug
}
```

### `POST /api/lint`

위키 헬스체크 실행.

```typescript
// Response
{
  issues: {
    type: "contradiction" | "orphan" | "stale" | "missing_crossref" | "missing_page";
    description: string;
    pages: string[];
    suggestion: string;
  }[];
  autoFixed: number;         // 자동 수정된 이슈 수
}
```

### `GET /api/graph`

그래프 시각화용 노드/엣지 데이터.

```typescript
// Response
{
  nodes: { id: string; label: string; type: string; linkCount: number }[];
  edges: { source: string; target: string }[];
}
```

---

## 6. Vercel 배포 설정

### vercel.json

```json
{
  "buildCommand": "next build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "env": {
    "ANTHROPIC_API_KEY": "@anthropic-api-key"
  }
}
```

### 환경 변수

```
ANTHROPIC_API_KEY=       # Claude API 키 (필수)
BLOB_READ_WRITE_TOKEN=   # Vercel Blob 토큰 (프로덕션 스토리지)
NEXT_PUBLIC_APP_URL=     # 배포 URL
```

### 스토리지 전략

- **개발 환경**: 로컬 `content/` 폴더에 직접 읽기/쓰기 (`fs` 모듈)
- **프로덕션 (Vercel)**: Vercel Blob Storage 사용 (서버리스 환경에서 파일시스템 영속성 없음)
- 어댑터 패턴으로 스토리지 계층 추상화:

```typescript
// src/lib/storage/adapter.ts
export interface StorageAdapter {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  delete(path: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
}

export function createStorageAdapter(): StorageAdapter {
  if (process.env.VERCEL) {
    return new BlobStorageAdapter();
  }
  return new FileSystemAdapter();
}
```

### 대안: Vercel KV 또는 Supabase

파일 수가 많아지면 Vercel Blob 대신 다음도 고려:
- **Supabase Storage** + **Supabase DB** (frontmatter 메타데이터 쿼리용)
- **PlanetScale / Neon** (PostgreSQL에 마크다운 본문 저장)
- Git 기반: **GitHub API**로 repo에 직접 커밋 (version history 무료)

---

## 7. 구현 순서 (단계별)

### Phase 1: 기본 골격 (MVP)

```
1. Next.js 프로젝트 초기화 (App Router, Tailwind)
2. content/ 폴더 구조 생성 (raw/, wiki/, meta/)
3. 기본 3-Pane 레이아웃 구현 (Sidebar + Editor + Chat)
4. 마크다운 에디터/프리뷰 구현 (react-md-editor)
5. Wiki CRUD API 구현 (파일 읽기/쓰기/삭제)
6. [[wikilink]] 파서 + 커스텀 렌더러 구현
7. Backlinks 컴포넌트 구현
```

### Phase 2: LLM 통합

```
1. Claude API 클라이언트 래퍼 구현
2. Ingest 파이프라인 구현 (파일 업로드 → 컴파일)
3. processed_files.json 해시 트래킹
4. index.md / log.md 자동 관리자 구현
5. Context-Aware Chat 구현 (현재 문서 + 이웃 노드 컨텍스트)
6. Query 결과를 위키에 재수록하는 기능
```

### Phase 3: 그래프 뷰 + Lint

```
1. react-force-graph-2d 통합
2. 노드/엣지 데이터 API 구현
3. 노드 클릭 → 문서 열기 연동
4. 타입별 노드 색상 구분
5. Lint 파이프라인 구현
6. Lint 결과 UI (이슈 목록, 자동 수정 버튼)
```

### Phase 4: Vercel 배포 + 폴리싱

```
1. StorageAdapter 추상화 (로컬 fs ↔ Vercel Blob)
2. Vercel 환경 설정 및 배포
3. 반응형 레이아웃 (모바일 대응)
4. 다크/라이트 모드 토글
5. 파일 드래그앤드롭 업로드
6. 검색 기능 (Fuse.js)
7. 키보드 단축키 (Cmd+K 검색, Cmd+S 저장 등)
```

---

## 8. 주요 의존성 (package.json)

```json
{
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@anthropic-ai/sdk": "^0.39.0",
    "react-markdown": "^9.0.0",
    "remark-gfm": "^4.0.0",
    "rehype-raw": "^7.0.0",
    "rehype-highlight": "^7.0.0",
    "@uiw/react-md-editor": "^4.0.0",
    "react-force-graph-2d": "^1.25.0",
    "zustand": "^5.0.0",
    "fuse.js": "^7.0.0",
    "gray-matter": "^4.0.0",
    "tailwindcss": "^3.4.0",
    "@vercel/blob": "^0.26.0",
    "lucide-react": "^0.400.0"
  }
}
```

---

## 9. 핵심 컨벤션 및 규칙

### 코딩 컨벤션

- TypeScript strict mode
- 컴포넌트: 함수형 + hooks
- API Routes: Route Handlers (App Router)
- 에러 핸들링: try-catch + 사용자 친화적 에러 메시지
- 모든 LLM 응답은 JSON으로 구조화 요청, 파싱 실패 시 재시도

### Wiki 컨벤션

- 파일명: 한글 kebab-case 또는 영문 kebab-case (`트랜스포머-아키텍처.md`)
- slug: 파일명에서 `.md` 제거
- Wikilink: `[[페이지 제목]]` 또는 `[[slug|표시 텍스트]]`
- Frontmatter: 모든 위키 페이지에 필수 (title, type, created, updated, sources, tags)
- 출처 추적: 모든 주장에 어떤 raw 소스에서 왔는지 기록
- Confidence 태깅: high (다수 소스 합치), medium (단일 소스), low (LLM 추론)

### Git 컨벤션

- `content/` 폴더를 git으로 추적하여 위키 버전 히스토리 확보
- 커밋 메시지: `[ingest] 소스명`, `[query] 질문 요약`, `[lint] 이슈 수정`

---

## 10. 참고 자료

- [Karpathy LLM Wiki Gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — 원본 아이디어 파일
- [Karpathy 트윗 (2026-04-02)](https://x.com/karpathy) — LLM Knowledge Bases 소개
- [qmd](https://github.com/tobi/qmd) — 로컬 마크다운 검색 엔진 (BM25 + vector)
- [Obsidian](https://obsidian.md) — 마크다운 기반 지식 관리 도구 (참조 UX)
- [Marp](https://marp.app) — 마크다운 기반 슬라이드 생성
- Vannevar Bush "As We May Think" (1945) — Memex 개념, LLM Wiki의 정신적 조상
