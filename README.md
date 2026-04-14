# MnemoVault — LLM Wiki IDE

MnemoVault is a web-based IDE for the **LLM Wiki** workflow proposed by Andrej Karpathy.
Instead of re-retrieving context on every question like traditional RAG, MnemoVault treats an LLM as a **knowledge compiler**: it incrementally compiles raw sources into a persistent Markdown wiki.

## Why MnemoVault (LLM Wiki Philosophy)

- **RAG is stateless per query**: each question starts over from chunks.
- **LLM Wiki is cumulative**: knowledge is compiled once, then refined and cross-linked over time.
- **Markdown is the canonical artifact**: the app is a powerful editor/viewer, but the real asset is a git-friendly wiki on your filesystem.
- **Human + LLM division of labor**:
  - Human: curate sources, ask questions, review output
  - LLM: summarize, link concepts, detect contradictions, maintain structure

MnemoVault keeps this philosophy intact in a browser-native workflow.

## Core Operations

1. **Ingest** — compile raw sources into structured wiki pages (with links and provenance)
2. **Query** — answer from wiki structure first (`index.md` → relevant pages), then synthesize
3. **Lint** — run health checks for contradictions, stale claims, orphan pages, missing links
4. **Compile** — continuous transformation from raw notes to curated knowledge graph in Markdown

## Key Features

- **Landing + IDE flow** (`/` → `/app`)
- **3-pane IDE layout**: Sidebar (tree/search) · Editor (edit/preview/split) · Right panel (graph/chat/lint)
- **`[[wikilink]]` support** with existence-aware rendering
- **Graph visualization** of page relationships
- **Context-aware chat** using current page + neighboring wiki nodes
- **Multi-LLM support**: Anthropic Claude or local Ollama
- **Local-first storage** via File System Access API + IndexedDB handle persistence
- **Dark editorial UI** tuned for long-form reading and thinking

## Architecture at a Glance

MnemoVault follows a strict boundary:

- **Client (browser)**: all file I/O and wiki state
- **Server (API routes)**: LLM mediation only

This keeps the wiki portable, transparent, and deployment-friendly (including serverless environments).

```text
Browser
 ├─ File System Access API (read/write local folder)
 ├─ IndexedDB (persist folder handle)
 ├─ Zustand (wiki/graph/chat/llm state)
 └─ React UI (IDE experience)

Server (/api/llm/*)
 ├─ ingest
 ├─ query
 └─ lint
```

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Browser requirement:** File System Access API requires Chromium-based browsers (Chrome / Edge 86+).

## Testing

```bash
npm run test
```

Vitest now uses a project-level `vitest.config.ts` so `@/*` imports resolve the same way in tests as they do in the app build.

In restricted Windows sandbox environments, Vitest can still fail before collection with `spawn EPERM` inside Vite's path resolution. That is an environment limitation, not a known MnemoVault alias issue.

For browser-level graph verification and screenshots, install Playwright's browser binaries once:

```bash
npx playwright install chromium
npm run test:e2e
```

The E2E suite uses a mocked File System Access workspace so it can open `/app`, switch to the Graph tab, and capture screenshots before and after toggling `Hide index/log`. Artifacts are written to `test-results/`.

## First Run: Choose a Workspace Folder

When entering `/app` for the first time:

1. Click **Choose Folder**
2. Select a local folder (empty folder recommended)
3. Approve browser permission
4. MnemoVault initializes:
   - `content/wiki/`
   - `content/raw/`
   - `content/meta/`

The folder handle is persisted in IndexedDB for future sessions.

## LLM Configuration

MnemoVault supports two providers.

### Claude (Anthropic API)

```env
ANTHROPIC_API_KEY=your-api-key-here
```

Default model is configured in-app, and you can switch models/providers from settings.

### Ollama (Local)

```bash
ollama serve
ollama pull gemma4:e4b
```

No API key required. MnemoVault auto-connects to `http://localhost:11434` and discovers available local models.

## Tech Stack

- **Framework**: Next.js (App Router)
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS
- **Markdown**: react-markdown + remark-gfm + rehype
- **Editor**: `@uiw/react-md-editor`
- **Graph**: `react-force-graph-2d`
- **State**: Zustand
- **Storage**: File System Access API + IndexedDB
- **LLM**: Anthropic Claude / Ollama

## Project Structure

```text
src/
├─ app/
│  ├─ (landing)/page.tsx
│  ├─ app/page.tsx
│  ├─ wiki/[slug]/page.tsx
│  └─ api/llm/
├─ components/
├─ lib/
│  ├─ llm/
│  ├─ wiki/
│  └─ storage/
├─ stores/
└─ types/
```

## Deployment (Vercel)

```bash
vercel deploy
```

Set `ANTHROPIC_API_KEY` in project environment variables. Since server routes only broker LLM calls, the local wiki file I/O model remains client-side.

## Korean README

For Korean documentation, see [README_KR.md](./README_KR.md).

## License

MIT
