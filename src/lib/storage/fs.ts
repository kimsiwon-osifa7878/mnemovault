import fs from "fs/promises";
import path from "path";

const CONTENT_DIR = path.join(process.cwd(), "content");

export async function readFile(filePath: string): Promise<string> {
  const fullPath = path.join(CONTENT_DIR, filePath);
  return fs.readFile(fullPath, "utf-8");
}

export async function writeFile(
  filePath: string,
  content: string
): Promise<void> {
  const fullPath = path.join(CONTENT_DIR, filePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf-8");
}

export async function deleteFile(filePath: string): Promise<void> {
  const fullPath = path.join(CONTENT_DIR, filePath);
  await fs.unlink(fullPath);
}

export async function listFiles(prefix: string): Promise<string[]> {
  const fullPath = path.join(CONTENT_DIR, prefix);
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const entryPath = path.join(prefix, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await listFiles(entryPath);
        files.push(...subFiles);
      } else if (entry.name.endsWith(".md")) {
        files.push(entryPath);
      }
    }
    return files;
  } catch {
    return [];
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  const fullPath = path.join(CONTENT_DIR, filePath);
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}
