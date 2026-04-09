# Roadmap — 구현 단계별 계획

> 각 Phase는 독립적으로 동작 가능한 단위. 이전 Phase가 완료되어야 다음으로 진행.

---

## Phase 1: 기본 골격 (MVP) ✅

- Next.js 프로젝트 초기화 (App Router, Tailwind)
- content/ 폴더 구조 생성 (raw/, wiki/, meta/)
- 3-Pane 레이아웃 (Sidebar + Editor + Chat)
- 마크다운 에디터/프리뷰
- Wiki CRUD (클라이언트 File System Access API)
- `[[wikilink]]` 파서 + 커스텀 렌더러
- Backlinks 컴포넌트

## Phase 2: LLM 통합 ✅

- LLM 클라이언트 래퍼 (OpenRouter + Ollama)
- Ingest 파이프라인 (파일 업로드 → Compile)
- processed_files.json 해시 트래킹
- index.md / log.md 자동 관리
- Context-Aware Chat (현재 문서 + 이웃 노드 컨텍스트)
- Query 결과를 위키에 재수록

## Phase 3: 그래프 뷰 + Lint ✅

- react-force-graph-2d 통합
- 노드/엣지 데이터 빌드
- 노드 클릭 → 문서 열기 연동
- 타입별 노드 색상 구분
- 정적 Lint (orphan, missing_page)
- LLM 모순 감지

## Phase 4: 폴리싱 & 배포

- [ ] 반응형 레이아웃 (모바일 대응)
- [ ] 다크/라이트 모드 토글
- [ ] Fuse.js 검색 고도화
- [ ] 키보드 단축키 (Cmd+K 검색, Cmd+S 저장 등)
- [ ] Vercel 배포 + StorageAdapter 추상화
- [ ] 파일 변경 감지 (change detection)

---

## 알려진 이슈

현재 구현 상태와 알려진 버그는 [docs/CONTEXT.md](CONTEXT.md) 참조.
