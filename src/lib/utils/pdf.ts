import type { TextItem } from "pdfjs-dist/types/src/display/api";

export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");

  const ver = pdfjsLib.version;
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${ver}/pdf.worker.min.mjs`;

  const doc = await pdfjsLib.getDocument({
    data: buffer,
    cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${ver}/cmaps/`,
    cMapPacked: true,
  }).promise;

  const pageTexts: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .filter((item): item is TextItem => "str" in item)
      .map((item) => item.str)
      .join(" ");
    pageTexts.push(text);
  }

  return pageTexts.join("\n\n");
}
