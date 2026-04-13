# MnemoVault — LLM Wiki IDE

MnemoVault는 Andrej Karpathy의 **LLM Wiki** 패턴을 웹 기반 IDE로 구현한 프로젝트입니다.
기존 RAG처럼 질문할 때마다 원문을 다시 검색하는 방식이 아니라, LLM을 **지식 컴파일러(Knowledge Compiler)**로 사용해 원천 자료를 점진적으로 마크다운 위키에 축적합니다.

## 왜 MnemoVault인가 (LLM Wiki 철학)

- **RAG는 질의마다 재탐색**: 매번 비슷한 컨텍스트를 다시 찾습니다.
- **LLM Wiki는 축적형 시스템**: 한 번 컴파일한 지식이 교차참조와 정제로 계속 성장합니다.
- **정답은 DB가 아니라 Markdown 아티팩트**: 앱은 편집기/뷰어이고, 본체는 파일시스템 위의 git-friendly 위키입니다.
- **사람과 LLM의 역할 분리**:
  - 사람: 소스 큐레이션, 질문, 리뷰
  - LLM: 요약, 구조화, 링크 생성, 모순 점검, 유지보수

## 핵심 오퍼레이션

1. **Ingest** — raw 소스를 위키 페이지로 컴파일 (요약/링크/출처 반영)
2. **Query** — `index.md` 중심으로 관련 페이지를 탐색해 답변 합성
3. **Lint** — 모순, stale claim, 고아 페이지, 누락 링크 점검
4. **Compile** — raw → wiki 변환을 지속적으로 수행해 지식 구조를 개선

## 주요 기능

- **랜딩 + IDE 진입 흐름** (`/` → `/app`)
- **3-Pane 레이아웃**: 사이드바(트리/검색) · 에디터(편집/미리보기/분할) · 우측 패널(그래프/채팅/린트)
- **`[[위키링크]]` 지원** 및 존재 여부 기반 렌더링
- **그래프 시각화**로 문서 관계 탐색
- **컨텍스트 인지형 채팅** (현재 문서 + 인접 노드)
- **다중 LLM**: Anthropic Claude / 로컬 Ollama
- **로컬 우선 스토리지**: File System Access API + IndexedDB
- **다크 에디토리얼 UI**

## 아키텍처 요약

MnemoVault는 다음 원칙을 지킵니다.

- **클라이언트(브라우저)**: 파일 I/O와 위키 상태 관리
- **서버(API Routes)**: LLM 호출 중계만 담당

즉, 위키는 항상 사용자의 로컬 폴더에 남고 앱/서버에 종속되지 않습니다.

```text
Browser
 ├─ File System Access API (로컬 폴더 읽기/쓰기)
 ├─ IndexedDB (폴더 핸들 영속화)
 ├─ Zustand (wiki/graph/chat/llm 상태)
 └─ React UI

Server (/api/llm/*)
 ├─ ingest
 ├─ query
 └─ lint
```

## 시작하기

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속.

> **브라우저 요구사항:** File System Access API를 위해 Chrome/Edge 86+ 권장.

## 첫 실행: 워크스페이스 폴더 선택

`/app` 최초 진입 시:

1. **폴더 선택** 클릭
2. 로컬 폴더 선택 (빈 폴더 권장)
3. 브라우저 권한 허용
4. 자동 초기화:
   - `content/wiki/`
   - `content/raw/`
   - `content/meta/`

선택한 핸들은 IndexedDB에 저장되어 다음 실행 시 복원됩니다.

## LLM 설정

### Claude (Anthropic API)

```env
ANTHROPIC_API_KEY=your-api-key-here
```

설정 화면에서 모델/프로바이더를 전환할 수 있습니다.

### Ollama (로컬)

```bash
ollama serve
ollama pull gemma4:e4b
```

API 키 없이 `http://localhost:11434` 로컬 인스턴스에 연결합니다.

## 기술 스택

- **Framework**: Next.js (App Router)
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS
- **Markdown**: react-markdown + remark-gfm + rehype
- **Editor**: `@uiw/react-md-editor`
- **Graph**: `react-force-graph-2d`
- **State**: Zustand
- **Storage**: File System Access API + IndexedDB
- **LLM**: Anthropic Claude / Ollama

## 배포 (Vercel)

```bash
vercel deploy
```

`ANTHROPIC_API_KEY`를 환경 변수에 등록하세요. 서버는 LLM 호출만 담당하므로 파일 영속성은 클라이언트에서 유지됩니다.

## English README

영문 문서는 [README.md](./README.md)에서 확인할 수 있습니다.

## 라이선스

MIT
