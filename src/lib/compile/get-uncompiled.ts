import { listAllFiles, readFileAsBuffer, readJsonFile } from "@/lib/storage/client-fs";
import { sha256BrowserBuffer } from "@/lib/utils/hash";
import type { UncompiledFile } from "./types";
import {
  COMPILE_PIPELINE_VERSION,
  getCompileReason,
  normalizeProcessedFilesRecord,
} from "./processed-files";

function extractFileType(path: string): string {
  // "raw/articles/foo.txt" → "article" (strip trailing 's')
  const parts = path.replace(/\\/g, "/").split("/");
  if (parts.length >= 2) {
    const folder = parts[1]; // e.g., "articles", "papers"
    return folder.replace(/s$/, "");
  }
  return "note";
}

function extractFileName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

export async function getUncompiledFiles(
  root: FileSystemDirectoryHandle
): Promise<UncompiledFile[]> {
  const allRawFiles = await listAllFiles(root, "raw");
  const processedRaw = await readJsonFile(root, "meta/processed_files.json");
  const processed = normalizeProcessedFilesRecord(processedRaw);

  const uncompiled: UncompiledFile[] = [];

  for (const filePath of allRawFiles) {
    // Skip assets folder
    if (filePath.includes("raw/assets/")) continue;

    const hash = await sha256BrowserBuffer(await readFileAsBuffer(root, filePath));
    const reason = getCompileReason(
      filePath,
      hash,
      processed,
      COMPILE_PIPELINE_VERSION
    );

    if (reason) {
      uncompiled.push({
        path: filePath,
        fileName: extractFileName(filePath),
        fileType: extractFileType(filePath),
        reason,
      });
    }
  }

  return uncompiled;
}

export async function getUncompiledCount(
  root: FileSystemDirectoryHandle
): Promise<number> {
  const files = await getUncompiledFiles(root);
  return files.length;
}
