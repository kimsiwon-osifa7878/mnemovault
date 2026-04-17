import type { ProcessedFileMeta, UncompiledFile } from "./types";

export const COMPILE_PIPELINE_VERSION = "compile-pipeline-v1";

export type ProcessedFilesRecord = Record<string, ProcessedFileMeta>;
export type LegacyProcessedFilesRecord = Record<string, string | ProcessedFileMeta>;

export function normalizeProcessedFilesRecord(
  input: unknown
): ProcessedFilesRecord {
  if (!input || typeof input !== "object") {
    return {};
  }

  const normalized: ProcessedFilesRecord = {};

  for (const [path, value] of Object.entries(input as Record<string, unknown>)) {
    if (!path) continue;

    if (typeof value === "string") {
      normalized[path] = {
        path,
        sha256: "",
        compiled_at: value,
        pipeline_version: "",
      };
      continue;
    }

    if (!value || typeof value !== "object") {
      continue;
    }

    const candidate = value as Partial<ProcessedFileMeta>;
    normalized[path] = {
      path,
      sha256: typeof candidate.sha256 === "string" ? candidate.sha256 : "",
      compiled_at:
        typeof candidate.compiled_at === "string" ? candidate.compiled_at : "",
      pipeline_version:
        typeof candidate.pipeline_version === "string"
          ? candidate.pipeline_version
          : "",
    };
  }

  return normalized;
}

export function getCompileReason(
  path: string,
  sha256: string,
  processed: ProcessedFilesRecord,
  pipelineVersion: string = COMPILE_PIPELINE_VERSION
): UncompiledFile["reason"] | null {
  const existing = processed[path];
  if (!existing) {
    return "new";
  }

  if (!existing.sha256 || existing.sha256 !== sha256) {
    return "content_changed";
  }

  if (existing.pipeline_version !== pipelineVersion) {
    return "pipeline_changed";
  }

  return null;
}
