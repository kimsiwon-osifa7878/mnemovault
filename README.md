# MnemoVault — LLM Wiki IDE

니모볼트 - 지능형 기억 금고. Andrej Karpathy의 LLM Wiki 패턴을 웹 기반 IDE로 구현한 프로젝트.

RAG의 "매번 재검색" 한계를 넘어, LLM이 지식을 **증분 컴파일(Incremental Compile)**하여 영구적으로 축적하는 마크다운 위키 시스템.

## 주요 기능

- **랜딩 페이지** — `/`에서 프로젝트 소개, **Start Building** 클릭으로 IDE(`/app`)로 진입
- **3-Pane IDE 레이아웃** — 사이드바(파일 트리 + 검색) · 에디터(Edit/Preview/Split) · 우측 패널(Graph/Chat)
- **4대 오퍼레이션** — Ingest(소스 컴파일), Query(위키 기반 질의), Lint(헬스체크), Compile
- **`[[위키링크]]` 지원** — 파싱, 렌더링, 존재 여부에 따른 색상 구분 (파랑/빨강)
- **그래프 시각화** — Force-directed 그래프로 위키 페이지 간 관계를 시각화
- **Context-Aware 채팅** — 현재 열린 문서 + 이웃 노드를 자동으로 컨텍스트에 포함
- **다중 LLM 지원** — Claude API와 로컬 Ollama 중 선택 가능 (UI에서 전환)
- **브라우저 기반 스토리지** — File System Access API로 로컬 폴더에 직접 읽기/쓰기 (서버 의존 없음)
- **다크 테마** — 에디토리얼 스타일의 다크 모드 기본 적용

## 시작하기

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어주세요.

> **브라우저 요구사항:** File System Access API를 사용하므로 **Chrome 또는 Edge 86+**가 필요합니다.

### 첫 실행 시 폴더 선택

IDE(`/app`)에 처음 진입하면 **StorageGuard**가 위키 데이터를 저장할 로컬 폴더를 선택하라고 안내합니다.

1. **"폴더 선택"** 버튼 클릭
2. 위키 데이터를 저장할 폴더 선택 (빈 폴더 권장)
3. 브라우저 권한 허용 팝업에서 **허용** 클릭
4. 선택한 폴더 안에 `content/wiki/`, `content/raw/`, `content/meta/` 구조가 자동 생성됩니다

선택한 폴더는 IndexedDB에 저장되어 다음 방문 시 자동 복원됩니다.

## LLM 설정

MnemoVault는 두 가지 LLM 프로바이더를 지원합니다. UI 좌측 사이드바 하단 또는 우측 패널의 ⚙ 버튼에서 전환할 수 있습니다.

### Claude (Anthropic API)

```env
ANTHROPIC_API_KEY=your-api-key-here
```

환경 변수에 API 키를 설정하면 됩니다.

**지원 모델:**
- Claude Sonnet 4.6 (`claude-sonnet-4-6`) — 기본값
- Claude Opus 4.6 (`claude-opus-4-6`)
- Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)

### Ollama (로컬)

```bash
# Ollama 설치 후 실행
ollama serve

# 원하는 모델 다운로드
ollama pull gemma4:e4b
```

API 키가 필요 없습니다. UI에서 Ollama를 선택하면 로컬 인스턴스(`http://localhost:11434`)에 자동 연결되며, 사용 가능한 모델 목록을 자동으로 감지합니다.

## 아키텍처

MnemoVault는 **서버는 LLM 호출만, 파일 I/O는 모두 브라우저에서** 처리하는 구조입니다.

```
┌─────────────────────────────────────────────────┐
│  브라우저 (Client)                                │
│  ├── File System Access API → 로컬 폴더 읽기/쓰기  │
│  ├── IndexedDB → 폴더 핸들 영속화                  │
│  ├── Zustand → 위키/그래프/채팅 상태 관리           │
│  └── UI 렌더링 (React, Next.js)                   │
├─────────────────────────────────────────────────┤
│  서버 (API Routes)                                │
│  └── /api/llm/* → LLM 호출만 처리                  │
│      ├── /api/llm/ingest → 소스 분석               │
│      ├── /api/llm/query  → 질의 응답               │
│      └── /api/llm/lint   → 모순 감지               │
└─────────────────────────────────────────────────┘
```

이 구조 덕분에 Vercel 같은 서버리스 환경에서도 파일 영속성 문제 없이 동작합니다.

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프레임워크 | Next.js 16 (App Router) |
| 스타일링 | Tailwind CSS |
| 마크다운 | react-markdown + remark-gfm + rehype |
| 에디터 | @uiw/react-md-editor |
| 그래프 | react-force-graph-2d |
| LLM | Anthropic Claude API / Ollama |
| 스토리지 | File System Access API + IndexedDB |
| 상태관리 | Zustand (localStorage 영속화) |
| 아이콘 | lucide-react |

## 프로젝트 구조

```
mnemovault/
├── src/
│   ├── app/
│   │   ├── (landing)/page.tsx    # 랜딩 페이지 (/)
│   │   ├── app/page.tsx          # IDE 메인 (/app)
│   │   ├── wiki/[slug]/page.tsx  # 개별 위키 문서 뷰
│   │   └── api/llm/              # LLM 전용 API 라우트
│   │       ├── ingest/route.ts   # 소스 → LLM 분석
│   │       ├── query/route.ts    # 질의 → LLM 응답
│   │       └── lint/route.ts     # 페이지 → 모순 감지
│   ├── components/
│   │   ├── layout/               # Sidebar, EditorPane, ChatPane
│   │   ├── graph/                # GraphView
│   │   ├── markdown/             # WikiRenderer, Backlinks
│   │   ├── ingest/               # DropZone, IngestStatus
│   │   ├── StorageGuard.tsx      # 폴더 선택 가드
│   │   ├── StorageSettings.tsx   # 스토리지 설정 모달
│   │   ├── LLMSettings.tsx       # LLM 프로바이더 설정
│   │   └── LintPanel.tsx         # 위키 헬스체크 패널
│   ├── lib/
│   │   ├── llm/                  # LLM 클라이언트 (Claude + Ollama)
│   │   ├── wiki/                 # 파서, 인덱스/로그 매니저
│   │   └── storage/
│   │       └── client-fs.ts      # File System Access API 래퍼
│   ├── stores/                   # Zustand 스토어
│   │   ├── wiki-store.ts         # 위키 페이지 (client-fs 사용)
│   │   ├── graph-store.ts        # 그래프 데이터 (client-fs 사용)
│   │   ├── chat-store.ts         # 채팅 히스토리
│   │   ├── llm-store.ts          # LLM 설정
│   │   └── storage-store.ts      # 폴더 핸들 (IndexedDB)
│   └── types/                    # TypeScript 타입 정의
└── CLAUDE.md                     # 프로젝트 스키마 (상세 설계 문서)
```

## Vercel 배포

```bash
vercel deploy
```

`ANTHROPIC_API_KEY` 환경 변수를 Vercel 프로젝트 설정에 추가하세요. 서버는 LLM API 호출만 처리하므로 파일 시스템 관련 이슈 없이 배포됩니다. Ollama는 로컬 전용이므로 배포 환경에서는 Claude를 사용합니다.

## 라이선스

MIT
