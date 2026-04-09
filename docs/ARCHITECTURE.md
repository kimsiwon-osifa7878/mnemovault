# Architecture — 모듈 설계 & 데이터 포맷

> CLAUDE.md의 철학을 구현하기 위한 상세 기술 설계 문서.

---

## 1. 폴더 구조

```
mnemovault/
├── CLAUDE.md                    # 헌법 (프로젝트 철학·원칙)
├── content/                     # 위키 데이터 (git 추적)
│   ├── raw/                     # Raw Sources (불변)
│   │   ├── articles/
│   │   ├── papers/
│   │   └── assets/
│   ├── wiki/                    # LLM이 관리하는 위키 페이지
│   │   ├── index.md
│   │   ├── log.md
│   │   ├── overview.md
│   │   ├── entities/
│   │   ├── concepts/
│   │   ├── sources/
│   │   ├── analyses/
│   │   └── comparisons/
│   └── meta/
│       └── processed_files.json
│
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── api/llm/             # LLM 중계 전용 API
│   │   ├── app/                 # 메인 IDE 페이지
│   │   └── wiki/[slug]/
│   ├── components/
│   │   ├── layout/              # Sidebar, EditorPane, ChatPane
│   │   ├── graph/               # GraphView
│   │   ├── markdown/            # WikiRenderer, Backlinks
│   │   ├── ingest/              # DropZone, IngestStatus
│   │   └── compile/             # CompileModal
│   ├── lib/
│   │   ├── llm/                 # LLM 클라이언트, Ingest/Query/Lint 로직
│   │   ├── wiki/                # 파서, 그래프, index/log 관리
│   │   ├── compile/             # 컴파일 파이프라인
│   │   ├── storage/             # File System Access API 래퍼
│   │   └── utils/
│   ├── stores/                  # Zustand stores
│   └── types/
└── docs/                        # 상세 문서
```

### 설계 원칙

- 이 웹앱은 **옵시디언 스타일 IDE/뷰어**다. 파일 트리, 위키링크, 백링크, 그래프 탐색 경험을 웹에서 제공한다.
- 그러나 시스템의 canonical data는 앱 내부 DB가 아니라 `content/` 아래의 **markdown + frontmatter 파일 집합**이다.
- 앱 상태(Zustand, 캐시, 그래프 데이터)는 모두 파생물이어야 하며, 가능하면 위키 파일만으로 재구성 가능해야 한다.
- 위키 산출물은 특정 UI 없이도 Git, Obsidian, 일반 에디터에서 읽고 버전관리할 수 있어야 한다.

---

## 2. 위키 문서 포맷

### Frontmatter + 마크다운

```markdown
---
title: "트랜스포머 아키텍처"
type: concept
created: 2026-04-06
updated: 2026-04-06
sources:
  - raw/papers/attention-is-all-you-need.pdf
tags: [deep-learning, attention, NLP]
confidence: high
---

# 트랜스포머 아키텍처

셀프 어텐션 메커니즘을 기반으로 한 신경망 구조...

## 핵심 구성요소

- [[셀프 어텐션]] 메커니즘
- [[포지셔널 인코딩]]

## 출처

- [[attention-is-all-you-need-summary]]
```

### index.md 포맷

```markdown
# Wiki Index

## Concepts
- [[트랜스포머 아키텍처]] — 셀프 어텐션 기반 신경망 (sources: 3, updated: 2026-04-06)

## Entities
- [[Andrej Karpathy]] — AI 연구자 (sources: 5)

## Sources
- [[attention-is-all-you-need-summary]] — Vaswani et al. 2017 논문 요약

## Analyses
- [[트랜스포머 vs RNN 비교]] — Query에서 파생된 비교 분석

## Comparisons
- [[트랜스포머 vs CNN]] — 여러 소스를 종합한 비교 페이지

## Overview
- [[overview]] — 현재 주제 전반에 대한 상위 수준 synthesis
```

### log.md 포맷

```markdown
# Wiki Log

## [2026-04-06T14:30] ingest | attention-is-all-you-need.pdf
- Created: [[attention-is-all-you-need-summary]]
- Updated: [[트랜스포머 아키텍처]], [[셀프 어텐션]]
- New page: [[멀티헤드 어텐션]]
- Index updated: +3 entries

## [2026-04-06T17:10] query | 트랜스포머와 RNN 비교
- Pages read: [[트랜스포머 아키텍처]], [[RNN]], [[attention-is-all-you-need-summary]]
- Filed as: [[트랜스포머 vs RNN 비교]]
- Index updated: +1 entry
```

---

## 3. Wikilink 파서

```typescript
// [[target]] 또는 [[target|alias]] 형식
const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

interface WikiLink {
  raw: string;        // "[[트랜스포머 아키텍처]]"
  target: string;     // "트랜스포머 아키텍처"
  alias?: string;     // "[[target|alias]]" 의 alias
  exists: boolean;    // wiki에 해당 페이지 존재 여부
}
```

그래프 데이터는 모든 페이지의 wikilink를 파싱하여 `nodes` + `edges` 구조로 빌드한다.

---

## 4. Ingest / Query 파이프라인

```
[파일 업로드] → [raw/{type}s/ 에 저장]
    ↓
[Compile 버튼] → [processed_files.json 확인] → 이미 처리? → 스킵
    ↓ (미처리)
[POST /api/llm/ingest] → LLM이 JSON 응답
    ↓
[응답 파싱]
    ├── summary → wiki/sources/{slug}.md 생성
    ├── concepts → wiki/concepts/ 병합 or 신규
    ├── entities → wiki/entities/ 병합 or 신규
    ├── index.md 갱신
    └── log.md 기록 append
    ↓
[processed_files.json에 타임스탬프 저장]
```

### Query + Filing 루프

```
[질문 입력] → [index.md + 현재 문서 + 이웃 문서들로 컨텍스트 구성]
    ↓
[POST /api/llm/query] → 답변 생성
    ↓
[사용자가 가치 있다고 판단] → [analysis/comparison/overview 페이지로 filing]
    ↓
[index.md 갱신] + [log.md에 query 기록]
```

### LLM 응답 스키마 (IngestLLMResult)

```typescript
{
  summary: { title: string; content: string; key_takeaways: string[] };
  concepts: { name: string; content: string }[];
  entities: { name: string; content: string }[];
  tags: string[];
}
```

### Ingest 프롬프트 핵심 규칙

- 모든 교차참조는 `[[위키링크]]` 문법 사용
- 기존 wiki 페이지 목록을 참조하여 중복 생성 방지
- 출처를 반드시 명시 (어떤 raw 파일에서 왔는지)
- confidence 레벨 표기

---

## 5. Context-Aware Chat

Query 시 자동으로 포함되는 컨텍스트 우선순위:

1. `index.md` 항상 포함 (LLM이 위키 구조를 먼저 파악)
2. 현재 열린 문서
3. 현재 문서의 1-hop 이웃 노드 (최대 5개)
4. 상위 20개 페이지 (연결 수 기준)

좋은 답변은 `wiki/analyses/`, `wiki/comparisons/`, `wiki/overview.md` 등에 재수록하여 위키를 성장시킨다.

---

## 6. 스토리지 아키텍처

### 클라이언트 File System Access API

- 브라우저에서 로컬 폴더를 직접 읽기/쓰기
- `FileSystemDirectoryHandle`을 IndexedDB에 저장하여 세션 간 유지
- 서버는 파일에 접근하지 않음 (LLM 중계만 담당)
- File System Access API는 웹앱 구현 수단일 뿐이며, 저장 포맷 자체는 옵시디언 호환 가능한 파일 구조를 유지한다

### 어댑터 패턴

```typescript
interface StorageAdapter {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  delete(path: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
}
```

프로덕션 확장 시 Vercel Blob, Supabase, GitHub API 등으로 교체 가능하더라도, 외부 스토리지는 markdown 파일 구조를 투명하게 보존하는 어댑터여야 한다.

---

## 7. Lint 파이프라인

### 정적 검사 (클라이언트)

- `orphan` — 다른 페이지에서 참조되지 않는 고아 페이지
- `missing_page` — `[[위키링크]]`가 존재하지 않는 페이지를 가리킴

### LLM 검사 (서버)

- `contradiction` — 페이지 간 모순 감지
- `stale` — 오래되어 갱신이 필요한 내용
- `missing_crossref` — 누락된 교차참조
