// File System Access API wrapper
// Provides the same interface as the old fs.ts but works in the browser

async function getNestedDirHandle(
  root: FileSystemDirectoryHandle,
  pathParts: string[],
  create: boolean = false
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const part of pathParts) {
    current = await current.getDirectoryHandle(part, { create });
  }
  return current;
}

function splitPath(filePath: string): { dirParts: string[]; fileName: string } {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\//, "");
  const parts = normalized.split("/");
  const fileName = parts.pop()!;
  return { dirParts: parts, fileName };
}

export async function readFile(
  root: FileSystemDirectoryHandle,
  filePath: string
): Promise<string> {
  const { dirParts, fileName } = splitPath(filePath);
  const dir = dirParts.length > 0
    ? await getNestedDirHandle(root, dirParts)
    : root;
  const fileHandle = await dir.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return file.text();
}

export async function readFileAsBuffer(
  root: FileSystemDirectoryHandle,
  filePath: string
): Promise<ArrayBuffer> {
  const { dirParts, fileName } = splitPath(filePath);
  const dir = dirParts.length > 0
    ? await getNestedDirHandle(root, dirParts)
    : root;
  const fileHandle = await dir.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return file.arrayBuffer();
}

export async function writeFile(
  root: FileSystemDirectoryHandle,
  filePath: string,
  content: string | ArrayBuffer
): Promise<void> {
  const { dirParts, fileName } = splitPath(filePath);
  const dir = dirParts.length > 0
    ? await getNestedDirHandle(root, dirParts, true)
    : root;
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function deleteFile(
  root: FileSystemDirectoryHandle,
  filePath: string
): Promise<void> {
  const { dirParts, fileName } = splitPath(filePath);
  const dir = dirParts.length > 0
    ? await getNestedDirHandle(root, dirParts)
    : root;
  await dir.removeEntry(fileName);
}

export async function listFiles(
  root: FileSystemDirectoryHandle,
  prefix: string
): Promise<string[]> {
  const normalized = prefix.replace(/\\/g, "/").replace(/^\//, "").replace(/\/$/, "");
  const parts = normalized ? normalized.split("/") : [];

  let dir: FileSystemDirectoryHandle;
  try {
    dir = parts.length > 0
      ? await getNestedDirHandle(root, parts)
      : root;
  } catch {
    return [];
  }

  return collectFiles(dir, normalized);
}

async function collectFiles(
  dir: FileSystemDirectoryHandle,
  basePath: string
): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of dir.values()) {
    const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    if (entry.kind === "directory") {
      const subHandle = await dir.getDirectoryHandle(entry.name);
      const subFiles = await collectFiles(subHandle, entryPath);
      files.push(...subFiles);
    } else if (entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }
  return files;
}

async function collectAllFiles(
  dir: FileSystemDirectoryHandle,
  basePath: string
): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of dir.values()) {
    const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    if (entry.kind === "directory") {
      const subHandle = await dir.getDirectoryHandle(entry.name);
      const subFiles = await collectAllFiles(subHandle, entryPath);
      files.push(...subFiles);
    } else {
      files.push(entryPath);
    }
  }
  return files;
}

export async function listAllFiles(
  root: FileSystemDirectoryHandle,
  prefix: string
): Promise<string[]> {
  const normalized = prefix.replace(/\\/g, "/").replace(/^\//, "").replace(/\/$/, "");
  const parts = normalized ? normalized.split("/") : [];

  let dir: FileSystemDirectoryHandle;
  try {
    dir = parts.length > 0
      ? await getNestedDirHandle(root, parts)
      : root;
  } catch {
    return [];
  }

  return collectAllFiles(dir, normalized);
}

export async function fileExists(
  root: FileSystemDirectoryHandle,
  filePath: string
): Promise<boolean> {
  try {
    const { dirParts, fileName } = splitPath(filePath);
    const dir = dirParts.length > 0
      ? await getNestedDirHandle(root, dirParts)
      : root;
    await dir.getFileHandle(fileName);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile(
  root: FileSystemDirectoryHandle,
  filePath: string
): Promise<Record<string, string>> {
  try {
    const content = await readFile(root, filePath);
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export async function ensureDirectoryStructure(
  root: FileSystemDirectoryHandle
): Promise<void> {
  const dirs = [
    ["content"],
    ["content", "raw"],
    ["content", "raw", "articles"],
    ["content", "raw", "papers"],
    ["content", "raw", "assets"],
    ["content", "wiki"],
    ["content", "wiki", "entities"],
    ["content", "wiki", "concepts"],
    ["content", "wiki", "sources"],
    ["content", "wiki", "analyses"],
    ["content", "meta"],
  ];

  for (const parts of dirs) {
    await getNestedDirHandle(root, parts, true);
  }

  // Create default files if they don't exist
  const contentDir = await getNestedDirHandle(root, ["content"]);

  if (!(await fileExists(contentDir, "wiki/index.md"))) {
    await writeFile(contentDir, "wiki/index.md", `---
title: "Wiki Index"
type: index
created: ${new Date().toISOString().split("T")[0]}
updated: ${new Date().toISOString().split("T")[0]}
---

# Wiki Index

## Concepts

_아직 등록된 개념이 없습니다. Ingest를 통해 소스를 추가하세요._

## Entities

_아직 등록된 엔티티가 없습니다._

## Sources

_아직 등록된 소스 요약이 없습니다._

## Analyses

_아직 등록된 분석이 없습니다._
`);
  }

  if (!(await fileExists(contentDir, "wiki/log.md"))) {
    await writeFile(contentDir, "wiki/log.md", `---
title: "Wiki Log"
type: log
created: ${new Date().toISOString().split("T")[0]}
updated: ${new Date().toISOString().split("T")[0]}
---

# Wiki Log

_작업 기록이 아직 없습니다._
`);
  }

  if (!(await fileExists(contentDir, "meta/processed_files.json"))) {
    await writeFile(contentDir, "meta/processed_files.json", "{}");
  }
}
