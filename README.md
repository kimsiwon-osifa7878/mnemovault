# MnemoVault — LLM Wiki IDE

니모볼트 - 지능형 기억 금고. Andrej Karpathy의 LLM Wiki 패턴을 웹 기반 IDE로 구현한 프로젝트.

RAG의 "매번 재검색" 한계를 넘어, LLM이 지식을 **증분 컴파일(Incremental Compile)**하여 영구적으로 축적하는 마크다운 위키 시스템.

## 주요 기능

- **3-Pane IDE 레이아웃** — 사이드바(파일 트리 + 검색) · 에디터(Edit/Preview/Split) · 우측 패널(Graph/Chat)
- **4대 오퍼레이션** — Ingest(소스 컴파일), Query(위키 기반 질의), Lint(헬스체크), Compile
- **`[[위키링크]]` 지원** — 파싱, 렌더링, 존재 여부에 따른 색상 구분 (파랑/빨강)
- **그래프 시각화** — Force-directed 그래프로 위키 페이지 간 관계를 시각화
- **Context-Aware 채팅** — 현재 열린 문서 + 이웃 노드를 자동으로 컨텍스트에 포함
- **다중 LLM 지원** — Claude API와 로컬 Ollama 중 선택 가능 (UI에서 전환)
- **다크 테마** — 에디토리얼 스타일의 다크 모드 기본 적용

## 시작하기

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어주세요.

## LLM 설정

MnemoVault는 두 가지 LLM 프로바이더를 지원합니다. UI 좌측 사이드바 하단 또는 우측 패널의 ⚙ 버튼에서 전환할 수 있습니다.

### Claude (Anthropic API)

```env
ANTHROPIC_API_KEY=your-api-key-here
```

환경 변수에 API 키를 설정하면 됩니다.

### Ollama (로컬)

```bash
# Ollama 설치 후 실행
ollama serve

# 원하는 모델 다운로드
ollama pull llama3
```

API 키가 필요 없습니다. UI에서 Ollama를 선택하면 로컬 인스턴스(`http://localhost:11434`)에 자동 연결되며, 사용 가능한 모델 목록을 자동으로 감지합니다.

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프레임워크 | Next.js 16 (App Router) |
| 스타일링 | Tailwind CSS |
| 마크다운 | react-markdown + remark-gfm + rehype |
| 에디터 | @uiw/react-md-editor |
| 그래프 | react-force-graph-2d |
| LLM | Anthropic Claude API / Ollama |
| 상태관리 | Zustand (localStorage 영속화) |
| 아이콘 | lucide-react |

## 프로젝트 구조

```
mnemovault/
├── content/                  # 위키 데이터
│   ├── raw/                  # Raw 소스 (불변)
│   ├── wiki/                 # LLM이 관리하는 위키 페이지
│   └── meta/                 # 처리 메타데이터
├── src/
│   ├── app/                  # Next.js App Router
│   │   └── api/              # API 라우트 (wiki, ingest, query, lint, graph)
│   ├── components/           # UI 컴포넌트
│   │   ├── layout/           # Sidebar, EditorPane, ChatPane
│   │   ├── graph/            # GraphView
│   │   ├── markdown/         # WikiRenderer, Backlinks
│   │   └── ingest/           # DropZone, IngestStatus
│   ├── lib/                  # 핵심 로직
│   │   ├── llm/              # LLM 클라이언트 (Claude + Ollama)
│   │   ├── wiki/             # 파서, 인덱스/로그 매니저
│   │   └── storage/          # 파일시스템 어댑터
│   ├── stores/               # Zustand 스토어 (wiki, graph, chat, llm)
│   └── types/                # TypeScript 타입 정의
└── CLAUDE.md                 # 프로젝트 스키마 (상세 설계 문서)
```

## Vercel 배포

```bash
vercel deploy
```

`ANTHROPIC_API_KEY` 환경 변수를 Vercel 프로젝트 설정에 추가하세요. Ollama는 로컬 전용이므로 배포 환경에서는 Claude를 사용합니다.

## 라이선스

MIT
