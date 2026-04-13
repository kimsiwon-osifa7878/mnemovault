# Graphify 비교 기반 LLM Wiki 업그레이드 계획

## 0) 목적

`safishamsi/graphify`의 방법론을 기준점으로 삼아, 현재 mnemovault의 LLM wiki 파이프라인에서 **철학적/기술적 갭**을 식별하고 단계적으로 개선한다.

이번 문서는 첫 구현 스프린트를 `Phase 1 + Phase 3`로 고정한다.

- `Phase 1`: claim/edge 단위 근거 등급화
- `Phase 3`: hash 기반 증분 컴파일

- 비교 대상(외부): graphify v4 README/코드 구조
- 개선 대상(내부): mnemovault의 ingest/query/wiki graph/compile 파이프라인

이번 스프린트의 범위에서 제외하는 항목:

- 멀티모달 ingest: 이미지, 오디오, 비디오 전사
- AST 기반 코드 추출 pass의 실제 구현

---

## 1) 현재 mnemovault 추출 파이프라인

현재 mnemovault는 대체로 다음과 같은 `single-pass LLM integration pipeline` 구조를 갖고 있다.

1. raw 파일을 읽는다.
2. PDF면 텍스트를 추출한다.
3. 기존 wiki 일부를 context로 붙인다.
4. LLM을 한 번 호출해 `summary / concepts / entities / updates` JSON을 받는다.
5. source/concept/entity 페이지를 만들거나 기존 페이지에 merge한다.
6. `processed_files.json`에 처리 시점을 기록한다.

이 구조는 단순하고 빠르게 실험하기 좋지만, 추출 정확도와 provenance 관리, 증분 처리 정밀도는 부족하다.

---

## 2) Graphify 대비 주요 차이점 (로컬 LLM 기준)

### A. 추출 파이프라인 구조

- **mnemovault**: ingest의 핵심 지식 추출을 거의 LLM 단일 단계에 의존.
- **graphify**: 3-pass 분리(결정적 AST 추출 → 멀티모달 전처리/전사 → 병렬 에이전트 추출).

로컬 LLM 관점:
- mnemovault 장점: 구현과 디버깅이 단순하고 orchestration 비용이 낮다.
- mnemovault 약점: 작은 모델이 구조 파악, 개체 추출, 관계 추론, merge 판단을 한 번에 떠안는다.
- graphify 장점: 추출 책임을 분리해 작은 모델의 부담을 줄인다.
- graphify 약점: 파이프라인과 상태 관리가 복잡해진다.

### B. 증거 등급/신뢰도 표현

- **mnemovault**: 페이지 frontmatter `confidence`는 있으나, 엣지/클레임 단위 provenance가 약함.
- **graphify**: 관계 단위로 `EXTRACTED | INFERRED | AMBIGUOUS` 및 confidence, source location을 명시.

로컬 LLM 관점:
- mnemovault는 결과가 단순하지만, 근거와 추론을 구조적으로 분리하기 어렵다.
- graphify는 evidence grading으로 로컬 모델의 불안정성을 시스템 차원에서 흡수할 수 있다.

### C. 증분 처리와 캐시 전략

- **mnemovault**: `processed_files.json` 중심의 처리 여부 추적.
- **graphify**: SHA256 캐시 기반으로 변경 파일만 재처리.

로컬 LLM 관점:
- mnemovault는 구현이 단순하지만 재컴파일 낭비가 크다.
- graphify는 hash 기반 증분 처리로 반복 실행 비용을 줄인다.

### D. 그래프 분석 심화

- **mnemovault**: wikilink 기반 기본 노드/엣지 및 이웃 탐색.
- **graphify**: 커뮤니티 탐지(Leiden), 중심 노드(god nodes), surprising connections 등 분석 리포트.

갭:
- 위키 그래프를 "보는 것"은 가능하지만 "진단/탐사" 기능이 약함.

### E. 멀티모달 범위

- **mnemovault**: 텍스트/PDF 중심.
- **graphify**: 이미지/다이어그램/오디오/비디오(전사 포함)까지 통합.

이번 스프린트 판단:
- 멀티모달은 분명 유용하지만, 로컬 LLM에서는 전사/캡션 비용이 너무 크다.
- 이번 단계에서는 provenance와 증분 처리 개선이 우선순위가 더 높다.

### F. 운영 안전장치

- **mnemovault**: 프롬프트 규칙으로 JSON/근거/링크 준수를 요구.
- **graphify**: 추출/검증/리포팅 단계 분리 + 결과 등급화.

갭:
- 실패/품질 저하 시 원인 분리가 어렵고, 품질 감사 포인트가 적음.

---

## 3) 업그레이드 설계 원칙 (LLM wiki 철학과의 정합)

1. **LLM 대체가 아니라 LLM 부담 분산**: 결정 가능한 것은 deterministic extractor로 선처리.
2. **근거 우선**: 페이지 단위가 아니라 claim/edge 단위 provenance를 남긴다.
3. **누적 자산 최적화**: 캐시와 증분 업데이트를 통해 “재컴파일 비용”을 최소화한다.
4. **탐색에서 진단으로**: graph view + graph report(허브/고립/누락 링크)를 함께 제공한다.
5. **보수적 확장**: 멀티모달은 이번 스프린트에서 제외하고, ingest 실패 격리를 먼저 설계한다.

---

## 4) 구현 우선순위

이번 구현 순서는 다음으로 고정한다.

1. schema
2. compile pipeline
3. graph/query consumption
4. migration/test

---

## 5) 구현 로드맵

## Phase 1 — Provenance & Evidence 타입 고도화 (이번 스프린트)

### 목표
- 위키 문장/관계가 `EXTRACTED/INFERRED/AMBIGUOUS` 중 무엇인지 추적 가능하게 만들기.

### 구현
1. `IngestLLMResult` 스키마 확장
   - `claims[]`
     - `text`
     - `page_name`
     - `evidence_type`
     - `confidence`
     - `source_ref`
   - `edges[]`
     - `source_page`
     - `target_page`
     - `relation`
     - `evidence_type`
     - `confidence`
     - `source_ref`
2. source/concept/entity 페이지 생성 시 `Evidence` 섹션 자동 추가.
3. 기존 페이지 update merge 시에도 evidence를 함께 append.
4. GraphView edge 스타일 차등화
   - EXTRACTED: 실선
   - INFERRED: 점선
   - AMBIGUOUS: 경고색
5. query API와 응답 포맷은 유지하고, evidence가 page content를 통해 자연스럽게 컨텍스트에 들어가게 한다.

### 완료 조건
- 답변에서 근거 등급이 표면화되고, 추론/근거 혼합 오류가 감소.

## Phase 2 — 결정적 코드 추출기(AST Pass) 도입

### 목표
- 코드 파일에 대해 LLM 전처리 이전에 구조적 사실(클래스/함수/import/call)을 자동 추출.

이번 스프린트에서는 구현하지 않고, 다음 단계 후보로 남긴다.

### 구현
1. `src/lib/extract/ast/` 모듈 신설
   - 우선 TS/JS 1차 지원 (현재 프로젝트 스택 우선)
2. ingest 파이프라인 분기
   - 코드 파일: AST 추출 결과를 wikiContext와 함께 LLM에 전달
   - 문서/PDF: 기존 경로 유지
3. LLM 프롬프트에서 "AST facts are ground truth" 명시.
4. 결과 병합
   - AST로 얻은 관계는 기본 `EXTRACTED`
   - LLM이 추가한 관계는 `INFERRED/AMBIGUOUS` 가능

### 완료 조건
- 코드베이스 ingest 시 토큰 사용량과 처리시간 감소, 구조 정확도 향상.

## Phase 3 — 콘텐츠 해시 기반 증분 컴파일 (이번 스프린트)

### 목표
- `processed_files.json`를 확장해 파일 내용 변화 기반 재처리를 구현.

### 구현
1. 메타 스키마 확장
   - `path`, `sha256`, `compiled_at`, `pipeline_version`
2. compile 전 단계에서 해시 비교
   - hash 동일: 스킵
   - hash 변경: 해당 파일 + 영향 페이지만 재컴파일
3. `getUncompiledFiles()`는 다음 reason을 반환
   - `new`
   - `content_changed`
   - `pipeline_changed`
4. 로그 개선
   - "왜 재처리 되었는지"(hash changed / prompt version changed) 명시

### 완료 조건
- 변경 없는 대형 corpus 재실행이 빠르게 완료.

## Phase 4 — Graph Report(진단 리포트) 추가

### 목표
- 단순 시각화에서 한 단계 나아가 유지보수 액션을 자동 제안.

### 구현
1. `wiki/GRAPH_REPORT.md` 생성 루틴
2. 리포트 항목
   - 중심 노드(top centrality)
   - orphan pages
   - missing crossrefs 후보
   - high-ambiguity edges
   - ingest 이후 새로 생긴 핵심 군집 변화
3. lint와 연결
   - lint 결과를 리포트에 병합
   - "다음 유지보수 액션 Top N" 제안

### 완료 조건
- 사용자 질문 없이도 위키 정비 우선순위를 확인 가능.

## Phase 5 — 멀티모달 ingest 확장 (후순위 / out-of-scope)

이번 스프린트에서는 구현하지 않는다.

### 구현
1. 파일 타입별 preprocessor 추상화 (`src/lib/ingest/preprocessors/`)
2. 오디오/비디오 전사(로컬/선택형) + 캐시
3. 이미지 OCR/diagram caption을 intermediate text로 변환 후 기존 ingest 재사용
4. 실패 격리
   - 전처리 실패 시 해당 파일만 스킵하고 전체 컴파일은 계속 진행

### 완료 조건
- 텍스트 외 자료도 wiki 그래프에 자연스럽게 연결.

---

## 6) 실제 수정 대상 파일 제안

### 1차(Phase 1 + Phase 3 중심)
- `src/lib/llm/ingest.ts` (응답 스키마 확장)
- `src/lib/llm/prompts.v2.json` (근거 등급 출력 강제)
- `src/lib/compile/compile-file.ts` (evidence 섹션 생성 및 저장)
- `src/lib/compile/processed-files.ts` (hash/pipeline version/migration 유틸)
- `src/lib/compile/get-uncompiled.ts` (reason 판정)
- `src/lib/compile/run-compile.ts` (processed meta 기록)
- `src/lib/wiki/parser.ts` / `src/types/graph.ts` (edge 메타 확장)
- `src/components/graph/GraphView.tsx` (edge 스타일 반영)

### 2차(Phase 2+)
- `src/lib/extract/ast/*` (신규)
- `src/lib/wiki/log-manager.ts` (재처리 사유 기록)
- `src/lib/llm/lint.ts` + 신규 report 모듈

---

## 7) 리스크와 대응

1. **스키마 복잡도 증가**
   - 대응: 기존 스키마 backward-compatible 파싱 유지.
2. **UI 복잡도 증가**
   - 대응: 기본은 단순 표시, 상세 evidence는 접기/펼치기.
3. **멀티모달 비용 증가**
   - 대응: 이번 스프린트에서는 out-of-scope로 제외.
4. **잘못된 신뢰도 표기 위험**
   - 대응: EXTRACTED만 자동 high, 나머지는 보수적 기본값.

---

## 8) 제안하는 실행 순서

1. **Phase 1 + Phase 3** 구현
2. evidence/증분 데이터로 품질 측정(정확도/재사용성/반복 속도)
3. 효과 확인 후 **Phase 2(AST pass)** 착수
4. 운영 안정화 뒤 Phase 4, 필요 시 Phase 5

---

## 9) 이번 문서의 결론

- mnemovault의 철학(누적 위키 자산)은 graphify와 정렬되어 있다.
- 다만 graphify가 강한 지점은 **결정적 추출, 관계 근거 등급화, 증분 캐시, 진단 리포트**다.
- 따라서 당장 효과가 큰 업그레이드는 **Phase 1(근거 등급화)**와 **Phase 3(해시 기반 증분 컴파일)**이며, 이후 **Phase 2(AST pass)**를 붙이면 LLM wiki 품질/비용/재현성이 함께 개선된다.
