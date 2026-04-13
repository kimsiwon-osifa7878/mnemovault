"use client";

import { useState, useEffect } from "react";
import { useLLMStore } from "@/stores/llm-store";
import { X, Settings, Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface LLMSettingsProps {
  onClose: () => void;
}

export default function LLMSettings({ onClose }: LLMSettingsProps) {
  const {
    provider,
    openrouterModel,
    ollamaModel,
    ollamaUrl,
    language,
    setProvider,
    setOpenRouterModel,
    setOllamaModel,
    setOllamaUrl,
    setLanguage,
  } = useLLMStore();

  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [openrouterModels, setOpenRouterModels] = useState<string[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<"unknown" | "connected" | "error">("unknown");
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMessage, setTestMessage] = useState<string>("");
  const [streamTestStatus, setStreamTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [streamTestMessage, setStreamTestMessage] = useState<string>("");
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
    console.info("[LLMSettings] model test started", {
      provider: nextProvider,
      model,
      ollamaUrl: nextOllamaUrl,
    });
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
      console.info("[LLMSettings] model test finished", data);
      setTestStatus(data.status === "ok" ? "ok" : "fail");
      if (data.status === "ok") {
        setTestMessage(`Connected (${data.elapsedMs}ms)`);
      } else if (data.rateLimited) {
        setTestMessage("Rate-limited upstream");
      } else {
        setTestMessage(data.message || "Model compatibility test failed");
      }
    } catch {
      console.error("[LLMSettings] model test request failed", {
        provider: nextProvider,
        model,
      });
      setTestStatus("fail");
      setTestMessage("Model compatibility test failed");
    }
  };

  const runStreamTest = async (
    nextProvider: "openrouter" | "ollama",
    model: string,
    nextOllamaUrl?: string
  ) => {
    setStreamTestStatus("testing");
    setStreamTestMessage("");
    console.info("[LLMSettings] stream test started", {
      provider: nextProvider,
      model,
      ollamaUrl: nextOllamaUrl,
    });
    try {
      const res = await fetch("/api/llm/stream-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: nextProvider,
          model,
          ollamaUrl: nextOllamaUrl,
        }),
      });
      const data = await res.json();
      console.info("[LLMSettings] stream test finished", data);
      setStreamTestStatus(data.status === "ok" ? "ok" : "fail");
      if (data.status === "ok") {
        setStreamTestMessage(`Stream OK (${data.elapsedMs}ms)`);
      } else if (data.rateLimited) {
        setStreamTestMessage("Rate-limited upstream");
      } else {
        setStreamTestMessage(data.message || "Stream test failed");
      }
    } catch {
      console.error("[LLMSettings] stream test request failed", {
        provider: nextProvider,
        model,
      });
      setStreamTestStatus("fail");
      setStreamTestMessage("Stream test failed");
    }
  };

  const handleOpenRouterModelChange = (model: string) => {
    setOpenRouterModel(model);
    testModel("openrouter", model);
  };

  const fetchOllamaModels = async (url: string) => {
    setIsFetching(true);
    setOllamaStatus("unknown");
    try {
      const res = await fetch(`${url}/api/tags`);
      if (!res.ok) throw new Error("Failed to connect");
      const data = await res.json();
      const models = (data.models || []).map((m: { name: string }) => m.name);
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
      fetchOpenRouterModels();
    } else if (provider === "ollama") {
      fetchOllamaModels(ollamaUrl);
    }
    setTestStatus("idle");
    setTestMessage("");
    setStreamTestStatus("idle");
    setStreamTestMessage("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const handleUrlApply = () => {
    setOllamaUrl(tempUrl);
    fetchOllamaModels(tempUrl);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#0d0d14] border border-white/10 rounded-xl w-full max-w-md mx-4 p-6">
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

        {/* Language Selection */}
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
              <div className="font-medium">한국어</div>
              <div className="text-[10px] mt-0.5 opacity-60">Wiki output in Korean</div>
            </button>
          </div>
        </div>

        {/* Provider Selection */}
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
              <div className="text-[10px] mt-0.5 opacity-60">Free models</div>
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
              <div className="text-[10px] mt-0.5 opacity-60">Local, no API key</div>
            </button>
          </div>
        </div>

        {/* OpenRouter Settings */}
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
                    openrouterModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
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
            <div>
              <button
                type="button"
                onClick={() => runStreamTest("openrouter", openrouterModel)}
                disabled={streamTestStatus === "testing"}
                className="px-3 py-2 rounded text-xs bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {streamTestStatus === "testing" && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Stream Test
              </button>
              {streamTestMessage && (
                <p className={`text-[10px] mt-1 ${streamTestStatus === "ok" ? "text-emerald-400/70" : "text-red-400/70"}`}>
                  {streamTestMessage}
                </p>
              )}
            </div>
            <p className="text-[10px] text-white/30">
              API key is configured via OPENROUTER_API_KEY environment variable.
              Models loaded from OPENROUTER_FREE_MODELS. The status icon runs a lightweight upstream availability check.
            </p>
          </div>
        )}

        {/* Ollama Settings */}
        {provider === "ollama" && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-white/40 block mb-1">Ollama URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tempUrl}
                  onChange={(e) => setTempUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white/80 placeholder-white/30 focus:border-emerald-500/50 focus:outline-none"
                  onKeyDown={(e) => e.key === "Enter" && handleUrlApply()}
                />
                <button
                  onClick={handleUrlApply}
                  disabled={isFetching}
                  className="px-3 py-2 rounded text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50"
                >
                  {isFetching ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    "Connect"
                  )}
                </button>
              </div>
              {ollamaStatus === "connected" && (
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 mt-1">
                  <CheckCircle className="w-3 h-3" />
                  Connected — {ollamaModels.length} model(s) found
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
                  {ollamaModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  placeholder="gemma4:e4b"
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white/80 placeholder-white/30 focus:border-emerald-500/50 focus:outline-none"
                />
              )}
            </div>

            <p className="text-[10px] text-white/30">
              No API key required. Ollama runs locally on your machine.
            </p>
            <div>
              <button
                type="button"
                onClick={() => runStreamTest("ollama", ollamaModel, tempUrl)}
                disabled={streamTestStatus === "testing"}
                className="px-3 py-2 rounded text-xs bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {streamTestStatus === "testing" && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Stream Test
              </button>
              {streamTestMessage && (
                <p className={`text-[10px] mt-1 ${streamTestStatus === "ok" ? "text-emerald-400/70" : "text-red-400/70"}`}>
                  {streamTestMessage}
                </p>
              )}
            </div>
          </div>
        )}

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
