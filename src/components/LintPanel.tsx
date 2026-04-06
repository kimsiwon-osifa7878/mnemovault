"use client";

import { useState } from "react";
import { X, AlertTriangle, Loader2, CheckCircle } from "lucide-react";
import { LintIssue } from "@/types/wiki";

interface LintPanelProps {
  onClose: () => void;
}

export default function LintPanel({ onClose }: LintPanelProps) {
  const [issues, setIssues] = useState<LintIssue[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const runLint = async () => {
    setIsRunning(true);
    try {
      const res = await fetch("/api/lint", { method: "POST" });
      if (!res.ok) throw new Error("Lint failed");
      const data = await res.json();
      setIssues(data.issues);
      setHasRun(true);
    } catch {
      // handle error
    } finally {
      setIsRunning(false);
    }
  };

  const typeColors: Record<string, string> = {
    contradiction: "text-red-400 bg-red-500/10",
    orphan: "text-yellow-400 bg-yellow-500/10",
    stale: "text-orange-400 bg-orange-500/10",
    missing_crossref: "text-blue-400 bg-blue-500/10",
    missing_page: "text-purple-400 bg-purple-500/10",
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#0d0d14] border border-white/10 rounded-xl w-full max-w-lg mx-4 p-6 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-white/80 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            Wiki Lint
          </h2>
          <button onClick={onClose} className="p-1 rounded text-white/30 hover:text-white/60">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!hasRun ? (
          <div className="text-center py-8">
            <p className="text-sm text-white/40 mb-4">
              Run a health check on your wiki to find issues
            </p>
            <button
              onClick={runLint}
              disabled={isRunning}
              className="px-6 py-2 rounded bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 disabled:opacity-50"
            >
              {isRunning ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running...
                </span>
              ) : (
                "Run Lint"
              )}
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2">
            {issues.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-emerald-400">No issues found!</p>
              </div>
            ) : (
              issues.map((issue, i) => (
                <div
                  key={i}
                  className="border border-white/5 rounded-lg p-3 bg-white/[0.02]"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-medium ${
                        typeColors[issue.type] || "text-white/40 bg-white/5"
                      }`}
                    >
                      {issue.type}
                    </span>
                  </div>
                  <p className="text-sm text-white/70 mb-1">{issue.description}</p>
                  <p className="text-xs text-white/30">{issue.suggestion}</p>
                  {issue.pages.length > 0 && (
                    <div className="mt-1 text-xs text-blue-400">
                      {issue.pages.map((p) => `[[${p}]]`).join(", ")}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="px-4 py-1.5 rounded text-sm text-white/40 hover:text-white/60">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
