import { describe, expect, it } from "vitest";

import { calculateGraphLayout } from "@/lib/graph-layout";

type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function intersects(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

describe("graph layout", () => {
  it("spaces the default graph nodes apart for a typical run", () => {
    const layout = calculateGraphLayout(6, 5);
    const boxes: Box[] = [
      { ...layout.userPosition, width: 248, height: 280 },
      { ...layout.dispatcherPosition, width: 248, height: 280 },
      ...layout.taskPositions.map((position) => ({ ...position, width: 220, height: 180 })),
      ...layout.agentPositions.map((position) => ({ ...position, width: 248, height: 280 })),
    ];

    for (let index = 0; index < boxes.length; index += 1) {
      for (let comparisonIndex = index + 1; comparisonIndex < boxes.length; comparisonIndex += 1) {
        expect(intersects(boxes[index]!, boxes[comparisonIndex]!)).toBe(false);
      }
    }
  });

  it("keeps the graph tall enough for agent rows to remain separated", () => {
    const layout = calculateGraphLayout(4, 7);
    const lastAgent = layout.agentPositions.at(-1);

    expect(lastAgent).toBeDefined();
    expect(layout.canvasHeight).toBeGreaterThan((lastAgent?.y ?? 0) + 280);
  });
});
