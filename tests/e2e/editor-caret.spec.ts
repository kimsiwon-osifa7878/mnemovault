import { expect, test } from "@playwright/test";
import { installMockMnemoVaultWorkspace } from "./fixtures/mock-file-system";

const SAMPLE_MARKDOWN = `---
title: "AI 개발의 민주화"
type: "concept"
created: "2026-04-13"
updated: "2026-04-13"
---

aaaaaaa

# AI 개발의 민주화
모든 개인과 기업이 AI의 잠재력을 실현할 수 있도록 지원합니다.
`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installMockMnemoVaultWorkspace);
});

test("keeps textarea and mirror metrics aligned in edit mode", async ({ page }) => {
  await page.goto("/app");

  await page.getByText("Source").first().click();
  await page.getByTitle("Edit").click();

  const host = page.getByTestId("md-editor-host");
  await expect(host).toBeVisible();

  const textarea = host.locator("textarea.w-md-editor-text-input");
  await expect(textarea).toBeVisible();
  await textarea.fill(SAMPLE_MARKDOWN);

  const diagnostics = await host.evaluate((node) => {
    const textLayerEl = node.querySelector<HTMLElement>(".w-md-editor-text");
    const textareaEl = node.querySelector<HTMLTextAreaElement>(".w-md-editor-text-input");
    const preEl = node.querySelector<HTMLElement>(".w-md-editor-text-pre");
    const codeEl = node.querySelector<HTMLElement>(".w-md-editor-text-pre > code");
    if (!textLayerEl || !textareaEl || !preEl || !codeEl) {
      return { ready: false };
    }

    const textareaStyle = window.getComputedStyle(textareaEl);
    const textStyle = window.getComputedStyle(textLayerEl);
    const codeStyle = window.getComputedStyle(codeEl);

    const pairs = [
      ["fontFamily", textareaStyle.fontFamily, textStyle.fontFamily],
      ["fontSize", textareaStyle.fontSize, textStyle.fontSize],
      ["lineHeight", textareaStyle.lineHeight, textStyle.lineHeight],
      ["letterSpacing", textareaStyle.letterSpacing, textStyle.letterSpacing],
      ["paddingTop", textareaStyle.paddingTop, textStyle.paddingTop],
      ["paddingRight", textareaStyle.paddingRight, textStyle.paddingRight],
      ["paddingBottom", textareaStyle.paddingBottom, textStyle.paddingBottom],
      ["paddingLeft", textareaStyle.paddingLeft, textStyle.paddingLeft],
      ["codeFontSize", textareaStyle.fontSize, codeStyle.fontSize],
      ["codeLineHeight", textareaStyle.lineHeight, codeStyle.lineHeight],
    ] as const;

    const normalize = (value: string) =>
      value.trim().toLowerCase().replace(/["']/g, "").replace(/\s*,\s*/g, ",").replace(/\s+/g, " ");

    const mismatches = pairs
      .filter(([, left, right]) => normalize(left) !== normalize(right))
      .map(([key, left, right]) => ({ key, left, right }));

    return {
      ready: true,
      mismatches,
      scrollDiff: Math.abs(textareaEl.scrollHeight - preEl.scrollHeight),
      lineHeight: Number.parseFloat(textareaStyle.lineHeight) || 20,
      highlightMode: node.getAttribute("data-highlight-mode"),
    };
  });

  expect(diagnostics.ready).toBe(true);
  if (!diagnostics.ready) return;

  expect(diagnostics.highlightMode).toBe("on");
  expect(diagnostics.mismatches).toEqual([]);
  expect(diagnostics.scrollDiff).toBeLessThanOrEqual(diagnostics.lineHeight * 1.5);
});

test("falls back to page-level highlight off when a persistent mismatch is detected", async ({ page }) => {
  await page.goto("/app");
  await page.addStyleTag({
    content: ".md-editor-scope .w-md-editor-text-input { line-height: 64px !important; }",
  });

  await page.getByText("Source").first().click();
  await page.getByTitle("Edit").click();

  const host = page.getByTestId("md-editor-host");
  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute("data-highlight-mode", "off", { timeout: 3000 });
  await expect(host.locator(".w-md-editor-text-pre")).toHaveCount(0);
});
