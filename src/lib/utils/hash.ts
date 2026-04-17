import crypto from "crypto";

export function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function sha256Buffer(content: ArrayBuffer): string {
  return crypto.createHash("sha256").update(Buffer.from(content)).digest("hex");
}

export async function sha256Browser(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  return sha256BrowserBuffer(data);
}

export async function sha256BrowserBuffer(content: BufferSource): Promise<string> {
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", content);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
