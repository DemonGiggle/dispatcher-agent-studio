import { expect, test } from "@playwright/test";

function boxesOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

test("runs the main studio workflow and exposes replay controls", async ({ page }, testInfo) => {
  const prompt = "規劃一個具備 graph 視覺化的多 agent 產品協作介面";

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dispatcher chat" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Chat/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Inspect/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Setup/ })).toBeVisible();

  await page.getByRole("tab", { name: /Setup/ }).click();
  await expect(
    page.getByRole("heading", { name: "Orchestration setup" }),
  ).toBeVisible();
  await expect(page.getByLabel("Filter templates")).toBeVisible();
  await page.getByRole("button", { name: "Embedded Engineer", exact: true }).click();
  await expect(page.getByText("6/10 shown")).toBeVisible();
  await page.getByLabel("Filter templates").fill("arm");
  await expect(page.getByText("1/10 shown")).toBeVisible();
  await page.getByRole("button", { name: /Arm Consultant/ }).click();
  await expect(page.getByRole("heading", { name: "Arm Consultant" })).toBeVisible();
  await page.getByRole("combobox").first().selectOption("mock");
  await expect(page.getByText("mock fallback").first()).toBeVisible();
  await expect(
    page.getByRole("banner").getByText("mock · demo-dispatcher"),
  ).toBeVisible();

  await page.getByRole("tab", { name: /Chat/ }).click();
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

  await page.getByRole("tab", { name: /Inspect/ }).click();
  await expect(page.getByRole("heading", { name: "Agent graph" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inspector" })).toBeVisible();
  await expect(page.getByText("Selection summary")).toBeVisible();
  await expect(page.getByText("Run outline")).toBeVisible();
  await expect(
    page.getByText("drag cards by the handle to refine the layout", { exact: false }),
  ).toBeVisible();

  const userNode = page.getByTestId("graph-node-user");
  const dispatcherNode = page.getByTestId("graph-node-dispatcher");
  const userBox = await userNode.boundingBox();
  const dispatcherBeforeDrag = await dispatcherNode.boundingBox();

  expect(userBox).not.toBeNull();
  expect(dispatcherBeforeDrag).not.toBeNull();
  expect(boxesOverlap(userBox!, dispatcherBeforeDrag!)).toBe(false);

  const dragHandle = page.getByTestId("graph-node-drag-dispatcher");
  const dragHandleBox = await dragHandle.boundingBox();

  expect(dragHandleBox).not.toBeNull();

  if (testInfo.project.name === "mobile-chrome") {
    return;
  }

  await page.mouse.move(
    dragHandleBox!.x + dragHandleBox!.width / 2,
    dragHandleBox!.y + dragHandleBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    dragHandleBox!.x + dragHandleBox!.width / 2 + 120,
    dragHandleBox!.y + dragHandleBox!.height / 2 + 80,
    { steps: 16 },
  );
  await page.mouse.up();

  const dispatcherAfterDrag = await dispatcherNode.boundingBox();

  expect(dispatcherAfterDrag).not.toBeNull();
  const movementDistance =
    Math.abs(dispatcherAfterDrag!.x - dispatcherBeforeDrag!.x) +
    Math.abs(dispatcherAfterDrag!.y - dispatcherBeforeDrag!.y);

  expect(movementDistance).toBeGreaterThan(50);
});

test("preserves the main workflow on mobile layouts", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dispatcher chat" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Chat/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Inspect/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Setup/ })).toBeVisible();

  await page.getByRole("link", { name: "Skip to configuration" }).focus();
  await expect(page.getByRole("link", { name: "Skip to configuration" })).toBeVisible();
  await page.getByRole("link", { name: "Skip to configuration" }).click();
  await expect(page.getByRole("heading", { name: "Orchestration setup" })).toBeVisible();

  await page.getByRole("tab", { name: /Chat/ }).click();
  await page.getByTestId("chat-draft").fill("以手機優先方式檢查多 agent studio 介面");
  await page.getByTestId("dispatch-button").click();

  await expect(page.getByText("Run replay & comparison")).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("tab", { name: /Inspect/ }).click();
  await expect(page.getByRole("heading", { name: "Agent graph" })).toBeVisible();
  await expect(page.getByText("Selection summary")).toBeVisible();
  await expect(page.getByText("Run outline")).toBeVisible();
});
