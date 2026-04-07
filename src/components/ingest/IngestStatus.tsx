"use client";

import { CheckCircle, XCircle } from "lucide-react";

interface IngestStatusProps {
  result: {
    success: boolean;
    created: string[];
    updated: string[];
    logEntry: string;
  };
  onClose: () => void;
}

export default function IngestStatus({ result, onClose }: IngestStatusProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {result.success ? (
          <>
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <span className="text-sm text-emerald-400">Ingest Complete</span>
          </>
        ) : (
          <>
            <XCircle className="w-5 h-5 text-red-400" />
            <span className="text-sm text-red-400">Ingest Failed</span>
          </>
        )}
      </div>

      {result.created.length > 0 && (
        <div>
          <h4 className="text-xs text-white/40 mb-1">Created Pages</h4>
          <div className="space-y-0.5">
            {result.created.map((slug) => (
              <div
                key={slug}
                className="text-sm text-blue-400 bg-blue-500/5 px-2 py-1 rounded"
              >
                [[{slug}]]
              </div>
            ))}
          </div>
        </div>
      )}

      {result.updated.length > 0 && (
        <div>
          <h4 className="text-xs text-white/40 mb-1">Updated Pages</h4>
          <div className="space-y-0.5">
            {result.updated.map((slug) => (
              <div
                key={slug}
                className="text-sm text-orange-400 bg-orange-500/5 px-2 py-1 rounded"
              >
                [[{slug}]]
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-white/30">{result.logEntry}</div>

      <button
        onClick={onClose}
        className="w-full px-4 py-1.5 rounded text-sm bg-white/5 text-white/60 hover:bg-white/10"
      >
        Close
      </button>
    </div>
  );
}
