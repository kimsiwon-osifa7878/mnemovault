# MnemoVault — LLM Wiki IDE

니모볼트 - 지능형 기억 금고. Andrej Karpathy의 LLM Wiki 패턴을 웹 기반 IDE로 구현한 프로젝트.

RAG의 "매번 재검색" 한계를 넘어, LLM이 지식을 **증분 컴파일(Incremental Compile)**하여 영구적으로 축적하는 마크다운 위키 시스템.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Environment Variables

```
ANTHROPIC_API_KEY=       # Claude API 키 (LLM 기능에 필수)
```

## Tech Stack

Next.js 16 (App Router) · Tailwind CSS · react-markdown · react-force-graph-2d · Zustand · gray-matter · @anthropic-ai/sdk · lucide-react
