import { listAllFiles, readJsonFile } from "@/lib/storage/client-fs";
import type { UncompiledFile } from "./types";

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
  const processed = await readJsonFile(root, "meta/processed_files.json");

  const uncompiled: UncompiledFile[] = [];

  for (const filePath of allRawFiles) {
    // Skip assets folder
    if (filePath.includes("raw/assets/")) continue;

    if (!processed[filePath]) {
      uncompiled.push({
        path: filePath,
        fileName: extractFileName(filePath),
        fileType: extractFileType(filePath),
        reason: "new",
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
