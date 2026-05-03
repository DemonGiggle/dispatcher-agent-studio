import { expect, test } from "@playwright/test";

test("runs the main studio workflow and exposes replay controls", async ({ page }) => {
  const prompt = "規劃一個具備 graph 視覺化的多 agent 產品協作介面";

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Orchestration setup" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dispatcher chat" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Agent graph" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inspector" })).toBeVisible();

  await page.getByRole("combobox").first().selectOption("mock");
  await expect(page.getByText("mock fallback").first()).toBeVisible();
  await expect(
    page.getByRole("banner").getByText("mock · demo-dispatcher"),
  ).toBeVisible();

  await page.getByTestId("chat-draft").fill(prompt);
  await page.getByTestId("dispatch-button").click();

  await expect(page.getByText("Run replay & comparison")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(`針對「${prompt}」`, { exact: false }).first()).toBeVisible();
  await expect(page.getByText("**整合結論**：").first()).toBeVisible();

  await page.getByRole("button", { name: /^Replay$/ }).click();
  await expect(page.getByText(/Replay \d+\/\d+ · /)).toBeVisible();

  await page.getByRole("button", { name: "Exit replay" }).click();
  await expect(page.getByText("Full run")).toBeVisible();
});
