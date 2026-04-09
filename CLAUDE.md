# CLAUDE.md — MnemoVault 헌법

> Andrej Karpathy의 LLM Wiki 패턴을 웹 기반 IDE로 구현하는 프로젝트.
> RAG의 "매번 재검색" 한계를 넘어, LLM이 지식을 **증분 컴파일(Incremental Compile)**하여
> 영구적으로 축적하는 마크다운 위키 시스템.

---

## 1. 프로젝트 철학

### 핵심 원칙: LLM as a Knowledge Compiler

- 기존 RAG는 매 질문마다 raw 문서에서 지식을 처음부터 재발견한다. **축적이 없다.**
- LLM Wiki는 raw 소스를 **한 번 컴파일**하여 구조화된 마크다운 위키로 변환한다.
- 위키는 **복리로 성장하는 영구 아티팩트**다. 교차 참조, 모순 플래깅, 종합 분석이 누적된다.
- 사람은 소스 큐레이션과 질문에 집중하고, LLM이 요약·교차참조·정리·유지보수를 전담한다.

### 3-Layer Architecture

```
┌─────────────────────────────────────────────┐
│  Raw Sources (불변)                          │
│  → LLM이 읽기만 함, 수정 불가                  │
├─────────────────────────────────────────────┤
│  Wiki (LLM 소유)                             │
│  → LLM이 생성·갱신, 사람은 읽기·리뷰           │
├─────────────────────────────────────────────┤
│  Schema (이 파일 = CLAUDE.md)                 │
│  → 사람과 LLM이 공동 진화                      │
└─────────────────────────────────────────────┘
```

### 4대 오퍼레이션

1. **Ingest** — raw 소스 투입 → 요약, 인덱스 갱신, 엔티티/개념 페이지 업데이트, 로그 기록
2. **Query** — 위키에 질문 → index.md를 먼저 읽고 관련 페이지를 드릴다운하여 답변 합성
3. **Lint** — 주기적 헬스체크 → 모순 감지, 고아 페이지 발견, 누락된 교차참조 추가
4. **Compile** — raw에서 wiki로의 변환. 단순 인덱싱이 아닌 구조화·요약·백링크 생성

---

## 2. 기술 선택 원칙

| 레이어 | 기술 | 이유 |
|--------|------|------|
| Framework | Next.js (App Router) | SSR/SSG, API Routes, Vercel 네이티브 배포 |
| 스타일링 | Tailwind CSS | 유틸리티 기반, 빠른 프로토타이핑 |
| 마크다운 | react-markdown + remark/rehype | GFM 렌더링, `[[wikilink]]` 커스텀 파싱 |
| 에디터 | @uiw/react-md-editor 또는 CodeMirror | 실시간 마크다운 편집 |
| 그래프 | react-force-graph-2d | `[[Link]]` 관계 시각화 |
| 스토리지 | 클라이언트 File System Access API | 브라우저에서 직접 로컬 파일 관리 |
| LLM | OpenRouter + Ollama (확장 가능) | 다중 프로바이더, 무료 모델 지원 |
| 상태관리 | Zustand | 경량, 문서·그래프·채팅 상태 관리 |

---

## 3. UI/UX 비전

### 레이아웃: 3-Pane IDE

```
┌──────────┬──────────────────┬──────────┐
│ Sidebar  │  Editor/Preview  │  Chat +  │
│          │                  │  Graph   │
│ 파일트리  │  마크다운 편집/보기 │  그래프뷰 │
│ 검색     │  [[위키링크]]     │  채팅    │
│ Ingest   │  Backlinks       │  Lint    │
└──────────┴──────────────────┴──────────┘
```

### 디자인 방향

- **톤**: 에디토리얼/매거진 스타일 — 깔끔하되 차가운 IDE가 아닌, 읽고 싶은 느낌
- **컬러**: 다크 모드 기본, 위키링크 블루, 미존재 링크 레드, 액센트 그린
- **그래프**: 노드 타입별 색상 — entity(보라), concept(파랑), source(녹색), analysis(주황)

---

## 4. 위키 원칙

### 문서 구조

- 모든 위키 페이지는 **YAML frontmatter + 마크다운 본문**
- 페이지 타입: `concept` | `entity` | `source` | `analysis`
- 교차 참조는 `[[위키링크]]` 문법 사용
- 출처 추적: 모든 주장에 어떤 raw 소스에서 왔는지 기록
- Confidence 태깅: high (다수 소스) | medium (단일 소스) | low (LLM 추론)

### 핵심 파일

- `index.md` — 전체 카탈로그 (카테고리별 정리, LLM이 Query 시 첫 진입점)
- `log.md` — 시간순 작업 기록 (append-only)

### 콘텐츠 디렉토리

```
content/
├── raw/          # 불변 원본 소스
├── wiki/         # LLM이 관리하는 위키
│   ├── concepts/ │ entities/ │ sources/ │ analyses/
│   ├── index.md  │ log.md
└── meta/         # 처리 상태 추적
```

---

## 5. 핵심 컨벤션

- TypeScript strict mode
- 컴포넌트: 함수형 + hooks
- 서버에서 파일 접근 불가 — 모든 위키 IO는 클라이언트(File System Access API)
- 서버 API는 LLM 중계 전용
- 모든 LLM 응답은 JSON으로 구조화 요청, 파싱 실패 시 재시도
- 한국어 UI

---

## 6. 상세 문서 안내

| 문서 | 내용 |
|------|------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 모듈 설계, 데이터 포맷, 파이프라인 상세, 스토리지 전략 |
| [docs/API.md](docs/API.md) | API 엔드포인트 명세 (Request/Response 스키마) |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 구현 단계별 계획, 의존성 |
| [docs/CONTEXT.md](docs/CONTEXT.md) | 현재 실제 구현 상태, 파일별 역할, 알려진 이슈 |
| [docs/QUICKSTART.md](docs/QUICKSTART.md) | 사용자 가이드 |

---

## 7. 참고 자료

- [Karpathy LLM Wiki Gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — 원본 아이디어
- [Karpathy 트윗 (2026-04-02)](https://x.com/karpathy) — LLM Knowledge Bases 소개
- [Obsidian](https://obsidian.md) — 마크다운 기반 지식 관리 도구 (참조 UX)
- Vannevar Bush "As We May Think" (1945) — Memex 개념, LLM Wiki의 정신적 조상
