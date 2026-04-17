[English](./README.md) | [한국어](./README_KR.md)

# MnemoVault

MnemoVault is a local-first LLM wiki IDE built with Next.js. It follows the direction of Andrej Karpathy's LLM Wiki v2 idea and turns that workflow into something anyone can run locally: open the app, connect a folder, point it at Ollama, and start compiling raw materials into a persistent markdown knowledge base.

The goal is simple: make a free, practical LLM-wiki workflow available on your own machine instead of locking it behind hosted infrastructure or one-off chats.

## Why MnemoVault

Traditional retrieval workflows reassemble context for every question. MnemoVault leans toward a different model: compile knowledge into a wiki, refine it over time, and keep the resulting markdown as the durable artifact.

- Local-first wiki storage on your filesystem
- Browser-based IDE for editing, graph exploration, chat, and compilation
- Ollama support so anyone can run a free local LLM workflow
- OpenRouter support when you want a hosted model path
- Git-friendly markdown output instead of opaque database state

## Product Overview

### Main app

The main screen is a three-pane workspace for browsing pages, editing markdown, and moving between graph and chat views without leaving the wiki workflow.

![MnemoVault main app](public/mnemovault_app.png)

### Compile workflow

The compile flow is where raw source material gets transformed into structured wiki pages, linked notes, and evidence-aware knowledge artifacts.

![Compile wiki workflow](public/compile_wiki.png)

## Inspiration

MnemoVault is heavily influenced by Andrej Karpathy's LLM Wiki v2 direction: treat the model less like a temporary answer engine and more like a knowledge compiler that helps build and maintain a real wiki over time.

This project does not claim to be an official implementation. It is an opinionated, local-first adaptation built so that developers, researchers, and curious users can run the workflow with Next.js and local models through Ollama.

## Quick Start

### Requirements

- Node.js
- A Chromium-based browser such as Chrome or Edge
- Ollama if you want the free local setup

File System Access API is required for the local workspace flow, so Chromium-based browsers are recommended.

### Run locally

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

On first run, choose a local folder for the workspace. MnemoVault initializes the expected content directories and keeps the handle in IndexedDB for later sessions.

## LLM Setup

### Ollama

MnemoVault is designed so that anyone can use an LLM wiki locally through Ollama.

```bash
ollama serve
ollama pull gemma4:e4b
```

The default local endpoint is:

```text
http://localhost:11434
```

The repo reads this from `.env` / `.env.example` via:

```env
NEXT_PUBLIC_OLLAMA_URL=http://localhost:11434
```

### OpenRouter

Hosted usage is also available through OpenRouter.

```env
OPENROUTER_API_KEY=
OPENROUTER_MODELS=
```

If both values are configured, OpenRouter can be used as the provider in the app settings.

## Performance Notes

A GPU is strongly recommended for the best local Ollama experience. MnemoVault can still work without one, but CPU-only inference may be much slower, especially during longer compile or query runs.

If your local model is slow, increase the Ollama timeout in `.env`:

```env
OLLAMA_REQUEST_TIMEOUT_MS=900000
```

That is the main timeout knob for slow local inference. You can raise it further when needed, or use `0` to disable the timeout entirely.

## How It Fits Together

- The browser handles local file access and wiki state
- The app provides an IDE-style interface for editing and navigation
- LLM routes broker ingest, query, and lint operations
- The resulting knowledge base stays as markdown on your machine

This keeps the core artifact portable, inspectable, and easy to version with Git.

## Contributing

Contributions are welcome. If you want to improve the product, documentation, developer experience, or model workflows, issues and pull requests are appreciated.

Useful ways to contribute:

- Report bugs or rough edges
- Suggest workflow improvements for the LLM wiki experience
- Improve docs, onboarding, or screenshots
- Help test local model and browser setups

If you open an issue, context and reproduction steps are especially helpful. If you open a pull request, small focused changes are great.

## Issues and Feedback

If something feels broken, confusing, or incomplete, please open an issue. Feature ideas are welcome too, especially if they help make local LLM-wiki workflows more accessible and practical.

## License

MIT
