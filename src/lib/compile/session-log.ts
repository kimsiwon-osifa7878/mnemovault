import { appendFile } from "@/lib/storage/client-fs";
import type {
  CompileLogEntry,
  CompileSessionEvent,
} from "./types";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function buildSessionId(date: Date): string {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

export function createCompileSessionPaths(startedAt: number): {
  sessionId: string;
  jsonlPath: string;
} {
  const sessionId = buildSessionId(new Date(startedAt));

  return {
    sessionId,
    jsonlPath: `meta/compile-logs/${sessionId}-compile.jsonl`,
  };
}

export async function appendCompileSessionEvent(
  root: FileSystemDirectoryHandle,
  path: string,
  event: CompileSessionEvent
): Promise<void> {
  await appendFile(root, path, `${JSON.stringify(event)}\n`);
}

export function buildLogEntryEvent(entry: CompileLogEntry): CompileSessionEvent {
  return {
    kind: entry.scope === "llm_stream" ? "llm_chunk" : "log",
    timestamp: new Date(entry.timestamp).toISOString(),
    filePath: entry.filePath,
    payload: {
      type: entry.type,
      scope: entry.scope,
      stage: entry.stage,
      label: entry.label,
      detail: entry.detail,
    },
  };
}
