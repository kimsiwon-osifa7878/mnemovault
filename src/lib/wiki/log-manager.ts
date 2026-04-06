export function appendLogEntry(
  existingLog: string,
  operation: "ingest" | "query" | "lint",
  summary: string,
  details: string[]
): string {
  const timestamp = new Date().toISOString().slice(0, 16);
  const detailLines = details.map((d) => `- ${d}`).join("\n");
  const entry = `\n## [${timestamp}] ${operation} | ${summary}\n${detailLines}\n`;

  const logEndMarker = "_작업 기록이 아직 없습니다._";
  if (existingLog.includes(logEndMarker)) {
    return existingLog.replace(logEndMarker, entry.trim());
  }

  return existingLog + entry;
}
