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
    claudeModel,
    ollamaModel,
    ollamaUrl,
    setProvider,
    setClaudeModel,
    setOllamaModel,
    setOllamaUrl,
  } = useLLMStore();

  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<"unknown" | "connected" | "error">("unknown");
  const [tempUrl, setTempUrl] = useState(ollamaUrl);

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
    if (provider === "ollama") {
      fetchOllamaModels(ollamaUrl);
    }
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

        {/* Provider Selection */}
        <div className="mb-5">
          <label className="text-xs text-white/40 block mb-2 uppercase tracking-wider">
            Provider
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setProvider("claude")}
              className={`px-4 py-3 rounded-lg border text-sm text-left ${
                provider === "claude"
                  ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                  : "border-white/10 bg-white/[0.02] text-white/40 hover:border-white/20"
              }`}
            >
              <div className="font-medium">Claude</div>
              <div className="text-[10px] mt-0.5 opacity-60">Anthropic API</div>
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

        {/* Claude Settings */}
        {provider === "claude" && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-white/40 block mb-1">Model</label>
              <select
                value={claudeModel}
                onChange={(e) => setClaudeModel(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white/80 focus:border-blue-500/50 focus:outline-none"
              >
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                <option value="claude-opus-4-6">Claude Opus 4.6</option>
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
              </select>
            </div>
            <p className="text-[10px] text-white/30">
              API key is configured via ANTHROPIC_API_KEY environment variable.
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
              {/* Connection status */}
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
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white/80 focus:border-emerald-500/50 focus:outline-none"
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
