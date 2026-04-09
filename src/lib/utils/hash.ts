import crypto from "crypto";

export function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export async function sha256Browser(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
