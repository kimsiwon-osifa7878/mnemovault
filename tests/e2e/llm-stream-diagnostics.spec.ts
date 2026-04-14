import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { installMockMnemoVaultWorkspace } from "./fixtures/mock-file-system";

type StreamRunResult = {
  model: string;
  statusText: string;
  previewText: string;
  noStreamOutput: boolean;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installMockMnemoVaultWorkspace);
});

test("runs live stream test from LLM settings for gemma4:26b and gemma4:latest", async ({
  page,
}) => {
  test.setTimeout(240_000);

  const targetUrl = "http://180.66.176.14:11434";
  const models = ["gemma4:26b", "gemma4:latest"];
  const results: StreamRunResult[] = [];

  await page.goto("/app");
  await page.getByTitle("LLM Settings").click();
  await expect(page.getByText("LLM Settings")).toBeVisible();

  await page.getByRole("button", { name: "Ollama" }).click();

  const ollamaPanel = page.locator("div").filter({ hasText: "Ollama URL" }).first();
  const urlInput = ollamaPanel.locator(`input[type="text"]`).first();
  await urlInput.fill(targetUrl);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 20_000 });

  const modelSelect = ollamaPanel.locator("select").first();
  const modelOptions = await modelSelect.locator("option").allTextContents();
  const statusValue = page.locator("xpath=//div[normalize-space()='Status']/following-sibling::div[1]").last();
  const previewNode = page.locator("pre").last();
  const runButton = page.getByRole("button", { name: "Run Live Stream Test" });

  for (const model of models) {
    if (!modelOptions.includes(model)) {
      results.push({
        model,
        statusText: "MODEL_NOT_FOUND_IN_SELECT",
        previewText: "",
        noStreamOutput: true,
      });
      continue;
    }

    await modelSelect.selectOption(model);
    await runButton.click();
    await expect(runButton).toBeDisabled({ timeout: 10_000 });
    await expect(runButton).toBeEnabled({ timeout: 120_000 });
    await expect
      .poll(async () => (await statusValue.innerText()).trim(), { timeout: 90_000 })
      .not.toBe("Streaming...");

    const statusText = (await statusValue.innerText().catch(() => "")) as string;
    const previewText = (await previewNode.innerText().catch(() => "")) as string;

    results.push({
      model,
      statusText,
      previewText,
      noStreamOutput: previewText.includes("No stream output yet."),
    });
  }

  const availableResults = results.filter(
    (result) => result.statusText !== "MODEL_NOT_FOUND_IN_SELECT"
  );
  expect(availableResults.length).toBeGreaterThan(0);
  for (const result of availableResults) {
    expect(result.noStreamOutput).toBe(false);
  }

  await writeFile("test-results/llm-stream-results.json", JSON.stringify(results, null, 2), "utf8");
});
