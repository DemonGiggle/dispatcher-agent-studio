export type GraphPosition = {
  x: number;
  y: number;
};

export type GraphLayout = {
  userPosition: GraphPosition;
  dispatcherPosition: GraphPosition;
  taskPositions: GraphPosition[];
  agentPositions: GraphPosition[];
  canvasHeight: number;
};

const MAX_GRID_COLUMNS = 3;
const TASK_COLUMN_WIDTH = 360;
const TASK_ROW_HEIGHT = 250;
const TASK_START_Y = 360;
const AGENT_COLUMN_WIDTH = 390;
const AGENT_ROW_HEIGHT = 320;
const AGENT_SECTION_GAP = 120;
const MIN_CANVAS_HEIGHT = 420;

function getColumnCount(count: number): number {
  return Math.max(1, Math.min(MAX_GRID_COLUMNS, Math.ceil(Math.sqrt(count || 1))));
}

function getRowCount(count: number, columns: number): number {
  return Math.max(1, Math.ceil(count / columns));
}

function buildCenteredGridPositions(
  count: number,
  columns: number,
  centerX: number,
  startY: number,
  columnWidth: number,
  rowHeight: number,
): GraphPosition[] {
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowItemCount = Math.min(columns, count - row * columns);
    const rowStartX = centerX - ((rowItemCount - 1) * columnWidth) / 2;

    return {
      x: rowStartX + column * columnWidth,
      y: startY + row * rowHeight,
    };
  });
}

export function calculateGraphLayout(taskCount: number, agentCount: number): GraphLayout {
  const taskColumns = getColumnCount(taskCount);
  const taskRows = getRowCount(taskCount, taskColumns);
  const agentColumns = getColumnCount(agentCount);
  const agentRows = getRowCount(agentCount, agentColumns);
  const widestColumns = Math.max(2, taskColumns, agentColumns);
  const dispatcherX = 240 + (widestColumns - 1) * 220;
  const agentStartY =
    taskCount > 0
      ? TASK_START_Y + taskRows * TASK_ROW_HEIGHT + AGENT_SECTION_GAP
      : TASK_START_Y;
  const canvasHeight = Math.max(
    MIN_CANVAS_HEIGHT,
    agentStartY + Math.max(1, agentRows) * AGENT_ROW_HEIGHT,
  );

  return {
    userPosition: {
      x: Math.max(30, dispatcherX - 380),
      y: 36,
    },
    dispatcherPosition: {
      x: dispatcherX,
      y: 36,
    },
    taskPositions: buildCenteredGridPositions(
      taskCount,
      taskColumns,
      dispatcherX + 20,
      TASK_START_Y,
      TASK_COLUMN_WIDTH,
      TASK_ROW_HEIGHT,
    ),
    agentPositions: buildCenteredGridPositions(
      agentCount,
      agentColumns,
      dispatcherX,
      agentStartY,
      AGENT_COLUMN_WIDTH,
      AGENT_ROW_HEIGHT,
    ),
    canvasHeight,
  };
}
