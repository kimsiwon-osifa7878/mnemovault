import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Database,
  MessageSquare,
  AlertTriangle,
  Layers,
  TrendingUp,
  Brain,
  Network,
  FileText,
  BookOpen,
  Zap,
  ChevronRight,
} from "lucide-react";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  if (page) {
    redirect(`/app?page=${page}`);
  }

  return (
    <>
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-blue-400" />
            <span className="font-semibold tracking-tight">MnemoVault</span>
          </div>
          <Link
            href="/app"
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm bg-white/10 text-white/80 hover:bg-white/15 transition-colors"
          >
            시작하기
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-blue-500/8 rounded-full blur-[120px]" />
          <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-[100px]" />
        </div>

        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs text-white/50 mb-8">
            <Zap className="w-3 h-3 text-blue-400" />
            Karpathy&apos;s LLM Wiki Pattern
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            지식을{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
              컴파일
            </span>
            하는 위키
          </h1>

          <p className="text-lg sm:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
            RAG의 &quot;매번 재검색&quot; 한계를 넘어,
            <br className="hidden sm:block" />
            LLM이 지식을{" "}
            <span className="text-white/70">증분 컴파일</span>하여{" "}
            <span className="text-white/70">영구적으로 축적</span>하는
            마크다운 위키 시스템
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/app"
              className="flex items-center gap-2 px-8 py-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
            >
              위키 시작하기
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#features"
              className="flex items-center gap-2 px-8 py-3 rounded-full border border-white/10 text-white/60 hover:text-white/80 hover:border-white/20 transition-colors"
            >
              자세히 보기
              <ChevronRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* 4 Operations */}
      <section id="features" className="py-28 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm text-blue-400 font-medium mb-3 tracking-wider uppercase">
              Core Operations
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              4대 오퍼레이션
            </h2>
            <p className="text-white/40 max-w-xl mx-auto">
              Karpathy가 정의한 LLM Wiki의 핵심 작업 흐름.
              소스를 넣으면 위키가 복리로 성장합니다.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Ingest */}
            <div className="group p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4">
                <Database className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Ingest</h3>
              <p className="text-sm text-white/40 leading-relaxed">
                논문, 기사, 노트를 업로드하면 LLM이 분석하여 요약, 개념 페이지,
                엔티티 페이지를 자동 생성합니다. 교차참조와 인덱스도 자동 갱신됩니다.
              </p>
            </div>

            {/* Query */}
            <div className="group p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
                <MessageSquare className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Query</h3>
              <p className="text-sm text-white/40 leading-relaxed">
                위키에 질문하면 LLM이 index.md를 먼저 읽고 관련 페이지를 드릴다운하여
                답변을 합성합니다. 좋은 답변은 위키에 재수록됩니다.
              </p>
            </div>

            {/* Lint */}
            <div className="group p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center mb-4">
                <AlertTriangle className="w-5 h-5 text-orange-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Lint</h3>
              <p className="text-sm text-white/40 leading-relaxed">
                주기적 헬스체크로 모순 감지, 낡은 주장 갱신, 고아 페이지 발견,
                누락된 교차참조를 자동으로 찾아냅니다.
              </p>
            </div>

            {/* Compile */}
            <div className="group p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mb-4">
                <Layers className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Compile</h3>
              <p className="text-sm text-white/40 leading-relaxed">
                Raw 소스에서 Wiki로의 변환 자체가 핵심 혁신. 단순 인덱싱이 아닌
                구조화, 요약, 백링크 생성을 통한 지식 컴파일.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3-Layer Architecture */}
      <section className="py-28 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-sm text-purple-400 font-medium mb-3 tracking-wider uppercase">
                Architecture
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                3-Layer 지식 구조
              </h2>
              <p className="text-white/40 leading-relaxed mb-6">
                Karpathy의 원문에 기반한 3계층 아키텍처.
                Raw 소스는 불변으로 보존하고, LLM이 Wiki 레이어를 소유하며,
                Schema가 전체 구조를 정의합니다.
              </p>
              <Link
                href="/app"
                className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                직접 체험해보기
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Architecture visual */}
            <div className="space-y-4">
              <div className="p-5 rounded-xl border border-white/10 bg-white/[0.03]">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="font-medium text-sm">Raw Sources</h4>
                    <p className="text-xs text-white/30">불변 · LLM이 읽기만 함</p>
                  </div>
                </div>
                <p className="text-xs text-white/40 ml-11">
                  articles, papers, images, datasets
                </p>
              </div>

              <div className="flex justify-center">
                <div className="w-px h-6 bg-gradient-to-b from-emerald-500/30 to-blue-500/30" />
              </div>

              <div className="p-5 rounded-xl border border-blue-500/20 bg-blue-500/[0.03] ring-1 ring-blue-500/10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-blue-300">Wiki</h4>
                    <p className="text-xs text-blue-400/50">LLM 소유 · 사람은 읽기/리뷰</p>
                  </div>
                </div>
                <p className="text-xs text-white/40 ml-11">
                  summaries, entities, concepts, backlinks, index.md, log.md
                </p>
              </div>

              <div className="flex justify-center">
                <div className="w-px h-6 bg-gradient-to-b from-blue-500/30 to-purple-500/30" />
              </div>

              <div className="p-5 rounded-xl border border-white/10 bg-white/[0.03]">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Layers className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <h4 className="font-medium text-sm">Schema</h4>
                    <p className="text-xs text-white/30">사람 + LLM 공동 진화</p>
                  </div>
                </div>
                <p className="text-xs text-white/40 ml-11">
                  폴더 구조, 컨벤션, 워크플로우 정의 (CLAUDE.md)
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* App Preview */}
      <section className="py-28 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-sm text-blue-400 font-medium mb-3 tracking-wider uppercase">
              Interface
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              3-Pane IDE 레이아웃
            </h2>
            <p className="text-white/40 max-w-xl mx-auto">
              사이드바에서 탐색하고, 에디터에서 편집하고, 채팅과 그래프로 지식을 확장합니다.
            </p>
          </div>

          {/* IDE Mockup */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden aspect-video">
            {/* Title bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
              </div>
              <span className="text-[10px] text-white/20 ml-2 font-mono">MnemoVault — IDE</span>
            </div>

            {/* 3-pane content */}
            <div className="flex h-full">
              {/* Sidebar */}
              <div className="w-1/5 border-r border-white/5 p-3 space-y-2">
                <div className="text-[10px] text-white/30 font-semibold uppercase tracking-wider mb-3">MnemoVault</div>
                <div className="h-5 rounded bg-white/5 w-full" />
                <div className="mt-3 space-y-1">
                  <div className="text-[9px] text-white/20 font-medium">CONCEPTS</div>
                  <div className="h-4 rounded bg-blue-500/10 w-4/5" />
                  <div className="h-4 rounded bg-white/[0.03] w-3/4" />
                  <div className="h-4 rounded bg-white/[0.03] w-5/6" />
                </div>
                <div className="mt-2 space-y-1">
                  <div className="text-[9px] text-white/20 font-medium">ENTITIES</div>
                  <div className="h-4 rounded bg-white/[0.03] w-3/5" />
                  <div className="h-4 rounded bg-white/[0.03] w-4/5" />
                </div>
              </div>

              {/* Editor */}
              <div className="flex-1 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-5 rounded bg-white/5 w-40" />
                  <div className="h-4 rounded bg-blue-500/10 w-16 text-[8px] text-blue-400/60 flex items-center justify-center">CONCEPT</div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 rounded bg-white/[0.04] w-full" />
                  <div className="h-3 rounded bg-white/[0.04] w-11/12" />
                  <div className="h-3 rounded bg-white/[0.04] w-4/5" />
                  <div className="h-3 rounded bg-white/[0.04] w-full" />
                  <div className="mt-3 h-3 rounded bg-white/[0.04] w-3/4" />
                  <div className="flex gap-2 mt-2">
                    <div className="h-4 rounded bg-blue-500/10 w-24" />
                    <div className="h-4 rounded bg-blue-500/10 w-20" />
                  </div>
                  <div className="h-3 rounded bg-white/[0.04] w-5/6 mt-3" />
                  <div className="h-3 rounded bg-white/[0.04] w-full" />
                  <div className="h-3 rounded bg-white/[0.04] w-2/3" />
                </div>
              </div>

              {/* Right panel */}
              <div className="w-1/4 border-l border-white/5 flex flex-col">
                <div className="flex border-b border-white/5">
                  <div className="flex-1 py-2 text-center text-[9px] text-white/40 border-b border-blue-500">Graph</div>
                  <div className="flex-1 py-2 text-center text-[9px] text-white/20">Chat</div>
                </div>
                {/* Graph mockup */}
                <div className="flex-1 flex items-center justify-center p-4">
                  <svg viewBox="0 0 120 100" className="w-full h-auto max-h-32 opacity-40">
                    <line x1="60" y1="30" x2="30" y2="60" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                    <line x1="60" y1="30" x2="90" y2="50" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                    <line x1="30" y1="60" x2="50" y2="80" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                    <line x1="90" y1="50" x2="70" y2="75" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                    <line x1="50" y1="80" x2="70" y2="75" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                    <circle cx="60" cy="30" r="5" fill="#60a5fa" />
                    <circle cx="30" cy="60" r="4" fill="#a78bfa" />
                    <circle cx="90" cy="50" r="4" fill="#34d399" />
                    <circle cx="50" cy="80" r="3.5" fill="#60a5fa" />
                    <circle cx="70" cy="75" r="3.5" fill="#fb923c" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why MnemoVault */}
      <section className="py-28 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm text-emerald-400 font-medium mb-3 tracking-wider uppercase">
              Benefits
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              왜 MnemoVault인가
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="text-center p-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="font-semibold mb-2">복리로 성장하는 지식</h3>
              <p className="text-sm text-white/40 leading-relaxed">
                소스를 추가할수록 교차참조가 자동으로 연결되고,
                기존 페이지가 보강되며, 지식 네트워크가 풍부해집니다.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
                <Brain className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="font-semibold mb-2">Context-Aware 채팅</h3>
              <p className="text-sm text-white/40 leading-relaxed">
                현재 열린 문서와 이웃 노드를 자동으로 LLM 컨텍스트에 포함하여
                더 정확한 답변을 생성합니다.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
                <Network className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="font-semibold mb-2">그래프 시각화</h3>
              <p className="text-sm text-white/40 leading-relaxed">
                [[위키링크]] 관계를 Force-directed 그래프로 시각화하여
                지식의 전체 구조를 한눈에 파악합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <footer className="py-20 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
            지식의 복리를 경험하세요
          </h2>
          <p className="text-white/40 mb-8 max-w-lg mx-auto">
            첫 번째 소스를 넣는 순간부터 위키가 성장하기 시작합니다.
            Claude API 또는 로컬 Ollama로 바로 시작할 수 있습니다.
          </p>
          <Link
            href="/app"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
          >
            위키 시작하기
            <ArrowRight className="w-4 h-4" />
          </Link>

          <div className="mt-16 pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/20">
            <div className="flex items-center gap-2">
              <Brain className="w-3.5 h-3.5" />
              <span>MnemoVault</span>
            </div>
            <p>
              Inspired by{" "}
              <span className="text-white/30">
                Andrej Karpathy&apos;s LLM Wiki Pattern
              </span>
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
