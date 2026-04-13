"use client";

import { useEffect, useState } from "react";
import { useLLMStore } from "@/stores/llm-store";
import { DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL } from "@/lib/llm/defaults";
import { X, Settings, Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface LLMSettingsProps {
  onClose: () => void;
}

type ProbeStatus = "idle" | "testing" | "ok" | "fail";
type StreamRunStatus = "idle" | "streaming" | "ok" | "fail";

interface StreamBenchmarkState {
  status: StreamRunStatus;
  startedAt: number | null;
  firstChunkElapsedMs: number | null;
  elapsedMs: number;
  chunkCount: number;
  charCount: number;
  estimatedTokenCount: number;
  charsPerSecond: number;
  tokensPerSecond: number;
  preview: string;
  message: string;
}

function createEmptyBenchmarkState(): StreamBenchmarkState {
  return {
    status: "idle",
    startedAt: null,
    firstChunkElapsedMs: null,
    elapsedMs: 0,
    chunkCount: 0,
    charCount: 0,
    estimatedTokenCount: 0,
    charsPerSecond: 0,
    tokensPerSecond: 0,
    preview: "",
    message: "",
  };
}

function estimateTokenCount(charCount: number): number {
  return Math.max(0, Math.round(charCount / 4));
}

function formatRate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(value >= 10 ? 1 : 2) : "0.00";
}

function parseSseBlocks(chunk: string, carry: string): { blocks: string[]; remainder: string } {
  const combined = `${carry}${chunk}`;
  const blocks = combined.split(/\r?\n\r?\n/);
  const remainder = blocks.pop() || "";
  return { blocks, remainder };
}

function parseSseEvent(block: string): { event: string; data: string } | null {
  const lines = block.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return { event, data: dataLines.join("\n") };
}

export default function LLMSettings({ onClose }: LLMSettingsProps) {
  const {
    provider,
    openrouterModel,
    ollamaModel,
    ollamaUrl,
    language,
    compileLogsEnabled,
    setProvider,
    setOpenRouterModel,
    setOllamaModel,
    setOllamaUrl,
    setLanguage,
    setCompileLogsEnabled,
  } = useLLMStore();

  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [openrouterModels, setOpenRouterModels] = useState<string[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<"unknown" | "connected" | "error">("unknown");
  const [testStatus, setTestStatus] = useState<ProbeStatus>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [streamProbeStatus, setStreamProbeStatus] = useState<ProbeStatus>("idle");
  const [streamProbeMessage, setStreamProbeMessage] = useState("");
  const [streamPrompt, setStreamPrompt] = useState(
    "Write 12 short lines about streaming performance. Keep each line concise and natural."
  );
  const [streamBenchmark, setStreamBenchmark] = useState<StreamBenchmarkState>(
    createEmptyBenchmarkState()
  );
  const [tempUrl, setTempUrl] = useState(ollamaUrl);

  const fetchOpenRouterModels = async () => {
    try {
      const res = await fetch("/api/llm/models");
      if (!res.ok) return;
      const data = await res.json();
      setOpenRouterModels(data.models || []);
    } catch {
      setOpenRouterModels(["openrouter/free"]);
    }
  };

  const testModel = async (
    nextProvider: "openrouter" | "ollama",
    model: string,
    nextOllamaUrl?: string
  ) => {
    setTestStatus("testing");
    setTestMessage("");

    try {
      const res = await fetch("/api/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: nextProvider,
          model,
          ollamaUrl: nextOllamaUrl,
        }),
      });
      const data = await res.json();
      setTestStatus(data.status === "ok" ? "ok" : "fail");

      if (data.status === "ok") {
        setTestMessage(`Connected (${data.elapsedMs}ms)`);
      } else if (data.rateLimited) {
        setTestMessage("Rate-limited upstream");
      } else {
        setTestMessage(data.message || "Model compatibility test failed");
      }
    } catch {
      setTestStatus("fail");
      setTestMessage("Model compatibility test failed");
    }
  };

  const runStreamProbe = async (
    nextProvider: "openrouter" | "ollama",
    model: string,
    nextOllamaUrl?: string
  ) => {
    setStreamProbeStatus("testing");
    setStreamProbeMessage("");

    try {
      const res = await fetch("/api/llm/stream-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "probe",
          provider: nextProvider,
          model,
          ollamaUrl: nextOllamaUrl,
        }),
      });
      const data = await res.json();
      setStreamProbeStatus(data.status === "ok" ? "ok" : "fail");

      if (data.status === "ok") {
        setStreamProbeMessage(`First chunk OK (${data.elapsedMs}ms)`);
      } else if (data.rateLimited) {
        setStreamProbeMessage("Rate-limited upstream");
      } else {
        setStreamProbeMessage(data.message || "Stream probe failed");
      }
    } catch {
      setStreamProbeStatus("fail");
      setStreamProbeMessage("Stream probe failed");
    }
  };

  const runLiveStreamBenchmark = async (
    nextProvider: "openrouter" | "ollama",
    model: string,
    nextOllamaUrl?: string
  ) => {
    const startedAt = Date.now();
    setStreamBenchmark({
      ...createEmptyBenchmarkState(),
      status: "streaming",
      startedAt,
      message: "Streaming...",
    });

    try {
      const res = await fetch("/api/llm/stream-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "stream",
          provider: nextProvider,
          model,
          ollamaUrl: nextOllamaUrl,
          prompt: streamPrompt,
          maxTokens: 192,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Streaming response body is missing");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        const parsed = parseSseBlocks(chunkText, buffer);
        buffer = parsed.remainder;

        for (const block of parsed.blocks) {
          const message = parseSseEvent(block);
          if (!message) continue;

          if (message.event === "chunk") {
            const payload = JSON.parse(message.data) as {
              text?: string;
              chunkCount?: number;
              charCount?: number;
              elapsedMs?: number;
            };
            const charCount = payload.charCount ?? 0;
            const elapsedMs = payload.elapsedMs ?? Date.now() - startedAt;
            const estimatedTokenCount = estimateTokenCount(charCount);
            const elapsedSeconds = Math.max(elapsedMs / 1000, 0.001);

            setStreamBenchmark((current) => ({
              ...current,
              status: "streaming",
              elapsedMs,
              firstChunkElapsedMs: current.firstChunkElapsedMs ?? elapsedMs,
              chunkCount: payload.chunkCount ?? current.chunkCount,
              charCount,
              estimatedTokenCount,
              charsPerSecond: charCount / elapsedSeconds,
              tokensPerSecond: estimatedTokenCount / elapsedSeconds,
              preview: `${current.preview}${payload.text || ""}`.slice(-4000),
              message: "Streaming...",
            }));
            continue;
          }

          if (message.event === "complete") {
            const payload = JSON.parse(message.data) as {
              elapsedMs?: number;
              chunkCount?: number;
              charCount?: number;
              firstChunkElapsedMs?: number | null;
              preview?: string;
            };
            const charCount = payload.charCount ?? 0;
            const elapsedMs = payload.elapsedMs ?? Date.now() - startedAt;
            const estimatedTokenCount = estimateTokenCount(charCount);
            const elapsedSeconds = Math.max(elapsedMs / 1000, 0.001);

            setStreamBenchmark((current) => ({
              ...current,
              status: "ok",
              elapsedMs,
              firstChunkElapsedMs:
                payload.firstChunkElapsedMs ?? current.firstChunkElapsedMs,
              chunkCount: payload.chunkCount ?? current.chunkCount,
              charCount,
              estimatedTokenCount,
              charsPerSecond: charCount / elapsedSeconds,
              tokensPerSecond: estimatedTokenCount / elapsedSeconds,
              preview: payload.preview || current.preview,
              message: "Stream benchmark complete",
            }));
            continue;
          }

          if (message.event === "error") {
            const payload = JSON.parse(message.data) as { error?: string };
            setStreamBenchmark((current) => ({
              ...current,
              status: "fail",
              message: payload.error || "Stream benchmark failed",
            }));
          }
        }
      }
    } catch (error) {
      setStreamBenchmark((current) => ({
        ...current,
        status: "fail",
        message: error instanceof Error ? error.message : "Stream benchmark failed",
      }));
    }
  };

  const handleOpenRouterModelChange = (model: string) => {
    setOpenRouterModel(model);
    void testModel("openrouter", model);
  };

  const fetchOllamaModels = async (url: string) => {
    setIsFetching(true);
    setOllamaStatus("unknown");

    try {
      const res = await fetch(`${url}/api/tags`);
      if (!res.ok) throw new Error("Failed to connect");
      const data = await res.json();
      const models = (data.models || []).map((item: { name: string }) => item.name);
      setOllamaModels(models);
      setOllamaStatus("connected");

      if (models.length > 0 && !models.includes(ollamaModel)) {
        setOllamaModel(models[0]);
      }
    } catch {
      setOllamaModels([]);
      setOllamaStatus("error");
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (provider === "openrouter") {
      void fetchOpenRouterModels();
    } else {
      void fetchOllamaModels(ollamaUrl);
    }

    setTestStatus("idle");
    setTestMessage("");
    setStreamProbeStatus("idle");
    setStreamProbeMessage("");
    setStreamBenchmark(createEmptyBenchmarkState());
    // fetch helpers are intentionally stable enough for this modal lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, ollamaUrl]);

  const handleUrlApply = () => {
    setOllamaUrl(tempUrl);
    void fetchOllamaModels(tempUrl);
  };

  const selectedModel = provider === "ollama" ? ollamaModel : openrouterModel;
  const selectedUrl = provider === "ollama" ? tempUrl : undefined;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#0d0d14] border border-white/10 rounded-xl w-full max-w-2xl mx-4 p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-medium text-white/80 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            LLM Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-white/30 hover:text-white/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-5">
          <label className="text-xs text-white/40 block mb-2 uppercase tracking-wider">
            Wiki Language
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setLanguage("en")}
              className={`px-4 py-3 rounded-lg border text-sm text-left ${
                language === "en"
                  ? "border-violet-500/50 bg-violet-500/10 text-violet-400"
                  : "border-white/10 bg-white/[0.02] text-white/40 hover:border-white/20"
              }`}
            >
              <div className="font-medium">English</div>
              <div className="text-[10px] mt-0.5 opacity-60">Wiki output in English</div>
            </button>
            <button
              onClick={() => setLanguage("ko")}
              className={`px-4 py-3 rounded-lg border text-sm text-left ${
                language === "ko"
                  ? "border-violet-500/50 bg-violet-500/10 text-violet-400"
                  : "border-white/10 bg-white/[0.02] text-white/40 hover:border-white/20"
              }`}
            >
              <div className="font-medium">Korean</div>
              <div className="text-[10px] mt-0.5 opacity-60">Wiki output in Korean</div>
            </button>
          </div>
        </div>

        <div className="mb-5">
          <label className="text-xs text-white/40 block mb-2 uppercase tracking-wider">
            Provider
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setProvider("openrouter")}
              className={`px-4 py-3 rounded-lg border text-sm text-left ${
                provider === "openrouter"
                  ? "border-violet-500/50 bg-violet-500/10 text-violet-400"
                  : "border-white/10 bg-white/[0.02] text-white/40 hover:border-white/20"
              }`}
            >
              <div className="font-medium">OpenRouter</div>
              <div className="text-[10px] mt-0.5 opacity-60">Hosted models</div>
            </button>
            <button
              onClick={() => setProvider("ollama")}
              className={`px-4 py-3 rounded-lg border text-sm text-left ${
                provider === "ollama"
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                  : "border-white/10 bg-white/[0.02] text-white/40 hover:border-white/20"
              }`}
            >
              <div className="font-medium">Ollama</div>
              <div className="text-[10px] mt-0.5 opacity-60">Local models</div>
            </button>
          </div>
        </div>

        <div className="mb-5">
          <label className="text-xs text-white/40 block mb-2 uppercase tracking-wider">
            Compile Logs
          </label>
          <button
            type="button"
            onClick={() => setCompileLogsEnabled(!compileLogsEnabled)}
            className={`w-full px-4 py-3 rounded-lg border text-sm text-left ${
              compileLogsEnabled
                ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                : "border-white/10 bg-white/[0.02] text-white/45 hover:border-white/20"
            }`}
          >
            <div className="font-medium">
              {compileLogsEnabled ? "Enabled" : "Disabled"}
            </div>
            <div className="text-[10px] mt-0.5 opacity-70">
              {compileLogsEnabled
                ? "Save compile session logs and request/debug entries."
                : "Do not save compile logs. Only the response text is streamed in the UI."}
            </div>
          </button>
        </div>

        {provider === "openrouter" && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-white/40 block mb-1">Model</label>
              <div className="flex items-center gap-2">
                <select
                  value={openrouterModel}
                  onChange={(e) => handleOpenRouterModelChange(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white/80 focus:border-violet-500/50 focus:outline-none [&>option]:bg-[#1a1a2e] [&>option]:text-white/90"
                >
                  {openrouterModels.length > 0 ? (
                    openrouterModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))
                  ) : (
                    <option value="openrouter/free">openrouter/free</option>
                  )}
                </select>
                {testStatus === "testing" && (
                  <Loader2 className="w-4 h-4 text-violet-400 animate-spin shrink-0" />
                )}
                {testStatus === "ok" && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 shrink-0">
                    <CheckCircle className="w-4 h-4" />
                    ok
                  </span>
                )}
                {testStatus === "fail" && (
                  <span className="flex items-center gap-1 text-xs text-red-400 shrink-0">
                    <AlertCircle className="w-4 h-4" />
                    fail
                  </span>
                )}
              </div>
              {testMessage && (
                <p className={`text-[10px] mt-1 ${testStatus === "ok" ? "text-emerald-400/70" : "text-red-400/70"}`}>
                  {testMessage}
                </p>
              )}
            </div>
            <p className="text-[10px] text-white/30">
              API key is configured via OPENROUTER_API_KEY. Model availability comes from the configured model list.
            </p>
          </div>
        )}

        {provider === "ollama" && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-white/40 block mb-1">Ollama URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tempUrl}
                  onChange={(e) => setTempUrl(e.target.value)}
                  placeholder={DEFAULT_OLLAMA_URL}
                  className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white/80 placeholder-white/30 focus:border-emerald-500/50 focus:outline-none"
                  onKeyDown={(e) => e.key === "Enter" && handleUrlApply()}
                />
                <button
                  onClick={handleUrlApply}
                  disabled={isFetching}
                  className="px-3 py-2 rounded text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50"
                >
                  {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Connect"}
                </button>
              </div>
              {ollamaStatus === "connected" && (
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 mt-1">
                  <CheckCircle className="w-3 h-3" />
                  Connected - {ollamaModels.length} model(s) found
                </div>
              )}
              {ollamaStatus === "error" && (
                <div className="flex items-center gap-1.5 text-[10px] text-red-400 mt-1">
                  <AlertCircle className="w-3 h-3" />
                  Cannot connect to Ollama. Is it running?
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-white/40 block mb-1">Model</label>
              {ollamaModels.length > 0 ? (
                <select
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white/80 focus:border-emerald-500/50 focus:outline-none [&>option]:bg-[#1a1a2e] [&>option]:text-white/90"
                >
                  {ollamaModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  placeholder={DEFAULT_OLLAMA_MODEL}
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white/80 placeholder-white/30 focus:border-emerald-500/50 focus:outline-none"
                />
              )}
            </div>

            <p className="text-[10px] text-white/30">
              No API key required. Ollama runs locally on your machine.
            </p>
          </div>
        )}

        <div className="mt-6 border-t border-white/10 pt-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-medium text-white/80">Stream Diagnostics</h3>
              <p className="text-[11px] text-white/40 mt-1">
                Probe first-token latency or run a live benchmark that reads the SSE stream in the browser.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => runStreamProbe(provider, selectedModel, selectedUrl)}
                disabled={streamProbeStatus === "testing"}
                className="px-3 py-2 rounded text-xs bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {streamProbeStatus === "testing" && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                First Chunk Probe
              </button>
              <button
                type="button"
                onClick={() => runLiveStreamBenchmark(provider, selectedModel, selectedUrl)}
                disabled={streamBenchmark.status === "streaming"}
                className="px-3 py-2 rounded text-xs bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {streamBenchmark.status === "streaming" && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Run Live Stream Test
              </button>
            </div>
          </div>

          {streamProbeMessage && (
            <p className={`text-[10px] mb-3 ${streamProbeStatus === "ok" ? "text-emerald-400/70" : "text-red-400/70"}`}>
              {streamProbeMessage}
            </p>
          )}

          <label className="text-xs text-white/40 block mb-1">Benchmark Prompt</label>
          <textarea
            value={streamPrompt}
            onChange={(e) => setStreamPrompt(e.target.value)}
            rows={4}
            className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white/80 placeholder-white/25 focus:outline-none focus:border-amber-400/50 resize-y"
            placeholder="Enter a prompt for the stream benchmark"
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
            <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-white/35">First Chunk</div>
              <div className="text-sm text-white/80 mt-1">
                {streamBenchmark.firstChunkElapsedMs !== null
                  ? `${streamBenchmark.firstChunkElapsedMs}ms`
                  : "-"}
              </div>
            </div>
            <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-white/35">Chars / Sec</div>
              <div className="text-sm text-white/80 mt-1">{formatRate(streamBenchmark.charsPerSecond)}</div>
            </div>
            <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-white/35">Est. Tokens / Sec</div>
              <div className="text-sm text-white/80 mt-1">{formatRate(streamBenchmark.tokensPerSecond)}</div>
            </div>
            <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-white/35">Chunks</div>
              <div className="text-sm text-white/80 mt-1">{streamBenchmark.chunkCount}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
            <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-white/35">Elapsed</div>
              <div className="text-sm text-white/80 mt-1">{streamBenchmark.elapsedMs}ms</div>
            </div>
            <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-white/35">Chars</div>
              <div className="text-sm text-white/80 mt-1">{streamBenchmark.charCount}</div>
            </div>
            <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-white/35">Est. Tokens</div>
              <div className="text-sm text-white/80 mt-1">{streamBenchmark.estimatedTokenCount}</div>
            </div>
            <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-white/35">Status</div>
              <div
                className={`text-sm mt-1 ${
                  streamBenchmark.status === "fail"
                    ? "text-red-400"
                    : streamBenchmark.status === "ok"
                    ? "text-emerald-400"
                    : streamBenchmark.status === "streaming"
                    ? "text-amber-300"
                    : "text-white/60"
                }`}
              >
                {streamBenchmark.message || "Idle"}
              </div>
            </div>
          </div>

          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-white/35 mb-2">
              Live Output Preview
            </div>
            <pre className="rounded bg-black/40 border border-white/10 px-3 py-2 text-[11px] text-white/70 whitespace-pre-wrap break-words overflow-x-auto max-h-64 min-h-28">
              {streamBenchmark.preview || "No stream output yet."}
            </pre>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-sm bg-white/5 text-white/60 hover:bg-white/10"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
