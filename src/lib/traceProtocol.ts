export type TraceOpenRequest = {
  tracePath: string;
  chunkBytes?: number;
};

export type TraceOpenResponse = {
  ok: boolean;
  tracePath: string;
  metaPath: string;
  totalRows: number;
  minCycle: number;
  maxCycle: number;
  occCount: number;
  stageColors: Record<string, string>;
  error?: string;
};

export type ViewportQueryRequest = {
  requestId: number;
  rowStart: number;
  rowEnd: number;
  cycleStart: number;
  cycleEnd: number;
  hideFlushed: boolean;
  maxEvents: number;
};

export type ViewportRow = {
  rowId: number;
  rowSid: string;
  rowKind: string;
  entityKind: string;
  lifecycleFlags: string[];
  orderKey: string;
  coreId: number;
  blockUid: string;
  uopUid: string;
  blockBid?: string;
  seq?: number | null;
  leftLabel: string;
  detailLabel: string;
  retireCycle: number;
  retireStatus: string;
  virtualRowCount?: number;
};

export type ViewportEvent = {
  rowId: number;
  cycle: number;
  stageId: string;
  laneId: string;
  stall: number;
  cause: string;
  virtualSlot?: number;
  virtualSlotCount?: number;
};

export type ViewportQueryResponse = {
  requestId: number;
  ok: boolean;
  totalRows: number;
  rows: ViewportRow[];
  events: ViewportEvent[];
  truncated: boolean;
  error?: string;
};

export type TabSuspendRequest = {
  reason: string;
};

export type TabResumeRequest = {
  reason: string;
};
