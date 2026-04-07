import crypto from "crypto";

export function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}
