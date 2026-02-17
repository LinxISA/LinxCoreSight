type LinxTraceStage = {
  stage_id: string;
  label: string;
  color: string;
  group: string;
};

type LinxTraceLane = {
  lane_id: string;
  label: string;
};

type LinxTraceRowCatalog = {
  row_id: number;
  row_kind: string;
  core_id: number;
  block_uid: string;
  uop_uid: string;
  left_label: string;
  detail_defaults: string;
};

type LinxTraceMeta = {
  format: string;
  contract_id: string;
  pipeline_schema_id: string;
  stage_order_csv: string;
  stage_catalog: LinxTraceStage[];
  lane_catalog: LinxTraceLane[];
  row_catalog: LinxTraceRowCatalog[];
  render_prefs?: Record<string, unknown>;
};

type WorkerInitMessage = {
  type: 'init';
  meta: LinxTraceMeta;
};

type WorkerChunkMessage = {
  type: 'chunk';
  chunk: string;
  eof: boolean;
};

type WorkerQueryMessage = {
  type: 'query';
  requestId: number;
  rowStart: number;
  rowEnd: number;
  cycleStart: number;
  cycleEnd: number;
  hideFlushed: boolean;
  maxEvents: number;
};

type WorkerMessage = WorkerInitMessage | WorkerChunkMessage | WorkerQueryMessage;

type RetireRecord = {
  cycle: number;
  status: string;
};

type RowMutable = {
  rowId: number;
  rowKind: string;
  coreId: number;
  blockUid: string;
  uopUid: string;
  leftLabel: string;
  detailLabel: string;
  retire?: RetireRecord;
  occCycle: number[];
  occStage: number[];
  occLane: number[];
  occStall: number[];
  occCause: number[];
  nonMonotonic: boolean;
  lastOccCycle: number;
  occCycleArr?: Int32Array;
  occStageArr?: Uint16Array;
  occLaneArr?: Uint16Array;
  occStallArr?: Uint8Array;
  occCauseArr?: Uint32Array;
};

const workerScope: any = self as any;

let metaState: LinxTraceMeta | null = null;
let rows: RowMutable[] = [];
let rowById = new Map<number, RowMutable>();
let stageIds: string[] = [];
let laneIds: string[] = [];
let stageIndex = new Map<string, number>();
let laneIndex = new Map<string, number>();
let causeDict: string[] = ['0'];
let causeIndex = new Map<string, number>([['0', 0]]);
let parseCarry = '';
let parseLineNo = 0;
let occCount = 0;
let minCycle = Number.POSITIVE_INFINITY;
let maxCycle = Number.NEGATIVE_INFINITY;
let ready = false;
let allOrder: number[] = [];
let noFlushOrder: number[] = [];

function postError(error: string): void {
  workerScope.postMessage({ type: 'error', error });
}

function ensureCauseId(cause: string): number {
  const normalized = cause && cause.length > 0 ? cause : '0';
  const found = causeIndex.get(normalized);
  if (found !== undefined) {
    return found;
  }
  const id = causeDict.length;
  causeDict.push(normalized);
  causeIndex.set(normalized, id);
  return id;
}

function rowVisibleInNoFlush(row: RowMutable): boolean {
  return !(row.retire && row.retire.status === 'flush' && row.rowKind !== 'block');
}

function lowerBound(arr: Int32Array, target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBound(arr: Int32Array, target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (arr[mid] <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function resetState(): void {
  metaState = null;
  rows = [];
  rowById = new Map<number, RowMutable>();
  stageIds = [];
  laneIds = [];
  stageIndex = new Map<string, number>();
  laneIndex = new Map<string, number>();
  causeDict = ['0'];
  causeIndex = new Map<string, number>([['0', 0]]);
  parseCarry = '';
  parseLineNo = 0;
  occCount = 0;
  minCycle = Number.POSITIVE_INFINITY;
  maxCycle = Number.NEGATIVE_INFINITY;
  ready = false;
  allOrder = [];
  noFlushOrder = [];
}

function initState(meta: LinxTraceMeta): void {
  resetState();
  metaState = meta;
  stageIds = meta.stage_catalog.map((s) => String(s.stage_id));
  laneIds = meta.lane_catalog.map((l) => String(l.lane_id));
  stageIds.forEach((id, idx) => stageIndex.set(id, idx));
  laneIds.forEach((id, idx) => laneIndex.set(id, idx));

  rows = meta.row_catalog.map((row) => {
    const obj: RowMutable = {
      rowId: Number(row.row_id),
      rowKind: String(row.row_kind || 'uop'),
      coreId: Number(row.core_id || 0),
      blockUid: String(row.block_uid || '0x0'),
      uopUid: String(row.uop_uid || '0x0'),
      leftLabel: String(row.left_label || ''),
      detailLabel: String(row.detail_defaults || ''),
      occCycle: [],
      occStage: [],
      occLane: [],
      occStall: [],
      occCause: [],
      nonMonotonic: false,
      lastOccCycle: Number.NEGATIVE_INFINITY,
    };
    rowById.set(obj.rowId, obj);
    return obj;
  });
}

function parseRecord(rec: Record<string, unknown>, where: string): void {
  const typ = String(rec.type || '');
  if (!typ) {
    throw new Error(`${where}: missing record type`);
  }
  if (typ === 'BLOCK_EVT' || typ === 'DEP') {
    return;
  }
  const rowId = Number(rec.row_id);
  if (!Number.isFinite(rowId)) {
    throw new Error(`${where}: missing row_id`);
  }
  const row = rowById.get(rowId);
  if (!row) {
    throw new Error(`${where}: unknown row_id=${rowId}`);
  }

  if (typ === 'LABEL') {
    const labelType = String(rec.label_type || '');
    const text = String(rec.text || '');
    if (labelType === 'left') {
      row.leftLabel = text;
    } else if (labelType === 'detail') {
      row.detailLabel = text;
    } else {
      throw new Error(`${where}: invalid LABEL label_type=${labelType}`);
    }
    return;
  }

  if (typ === 'RETIRE') {
    const cycle = Number(rec.cycle);
    if (!Number.isFinite(cycle)) {
      throw new Error(`${where}: RETIRE missing cycle`);
    }
    const status = String(rec.status || 'ok');
    row.retire = { cycle, status };
    minCycle = Math.min(minCycle, cycle);
    maxCycle = Math.max(maxCycle, cycle);
    return;
  }

  if (typ === 'OCC') {
    const cycle = Number(rec.cycle);
    const stageId = String(rec.stage_id || '');
    const laneId = String(rec.lane_id || '');
    if (!Number.isFinite(cycle)) {
      throw new Error(`${where}: OCC missing cycle`);
    }
    const sIdx = stageIndex.get(stageId);
    if (sIdx === undefined) {
      throw new Error(`${where}: unknown stage_id=${stageId}`);
    }
    const lIdx = laneIndex.get(laneId);
    if (lIdx === undefined) {
      throw new Error(`${where}: unknown lane_id=${laneId}`);
    }
    const stall = Number(rec.stall || 0) ? 1 : 0;
    const causeId = ensureCauseId(String(rec.cause || '0'));
    row.occCycle.push(cycle);
    row.occStage.push(sIdx);
    row.occLane.push(lIdx);
    row.occStall.push(stall);
    row.occCause.push(causeId);
    if (cycle < row.lastOccCycle) {
      row.nonMonotonic = true;
    }
    row.lastOccCycle = cycle;

    occCount += 1;
    minCycle = Math.min(minCycle, cycle);
    maxCycle = Math.max(maxCycle, cycle);
    return;
  }

  if (typ === 'OP_DEF' || typ === 'XCHECK') {
    return;
  }

  throw new Error(`${where}: unknown event type ${typ}`);
}

function parseChunk(chunk: string, eof: boolean): void {
  if (!chunk && !eof) return;
  const text = parseCarry + (chunk || '');
  const lines = text.split('\n');
  parseCarry = eof ? '' : lines.pop() || '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    parseLineNo += 1;
    if (!line) continue;
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(line) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`trace:${parseLineNo}: invalid JSON (${String(error)})`);
    }
    parseRecord(rec, `trace:${parseLineNo}`);
  }

  if (eof && parseCarry.trim().length > 0) {
    parseLineNo += 1;
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(parseCarry.trim()) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`trace:${parseLineNo}: invalid JSON (${String(error)})`);
    }
    parseRecord(rec, `trace:${parseLineNo}`);
    parseCarry = '';
  }
}

function finalizeIndexes(): void {
  for (const row of rows) {
    if (row.nonMonotonic && row.occCycle.length > 1) {
      const idx = row.occCycle.map((_, i) => i);
      idx.sort((a, b) => row.occCycle[a] - row.occCycle[b]);
      row.occCycle = idx.map((i) => row.occCycle[i]);
      row.occStage = idx.map((i) => row.occStage[i]);
      row.occLane = idx.map((i) => row.occLane[i]);
      row.occStall = idx.map((i) => row.occStall[i]);
      row.occCause = idx.map((i) => row.occCause[i]);
    }
    row.occCycleArr = Int32Array.from(row.occCycle);
    row.occStageArr = Uint16Array.from(row.occStage);
    row.occLaneArr = Uint16Array.from(row.occLane);
    row.occStallArr = Uint8Array.from(row.occStall);
    row.occCauseArr = Uint32Array.from(row.occCause);
    row.occCycle = [];
    row.occStage = [];
    row.occLane = [];
    row.occStall = [];
    row.occCause = [];
  }
  allOrder = rows.map((_, idx) => idx);
  noFlushOrder = rows.flatMap((row, idx) => (rowVisibleInNoFlush(row) ? [idx] : []));
}

function onQuery(msg: WorkerQueryMessage): void {
  if (!ready) {
    workerScope.postMessage({
      type: 'queryResult',
      requestId: msg.requestId,
      ok: false,
      error: 'trace index is not ready',
      totalRows: 0,
      rows: [],
      events: [],
      truncated: false,
    });
    return;
  }

  const order = msg.hideFlushed ? noFlushOrder : allOrder;
  const totalRows = order.length;
  const rowStart = Math.max(0, Math.min(totalRows, Number(msg.rowStart || 0)));
  const rowEnd = Math.max(rowStart, Math.min(totalRows, Number(msg.rowEnd || rowStart)));
  const cycleStart = Number(msg.cycleStart || 0);
  const cycleEnd = Number(msg.cycleEnd || cycleStart);
  const maxEvents = Math.max(1, Number(msg.maxEvents || 200000));

  const viewportRows = [];
  const events = [];
  let truncated = false;

  for (let vis = rowStart; vis < rowEnd; vis += 1) {
    const actual = order[vis];
    const row = rows[actual];
    viewportRows.push({
      rowId: row.rowId,
      rowKind: row.rowKind,
      coreId: row.coreId,
      blockUid: row.blockUid,
      uopUid: row.uopUid,
      leftLabel: row.leftLabel,
      detailLabel: row.detailLabel,
      retireCycle: row.retire ? row.retire.cycle : -1,
      retireStatus: row.retire ? row.retire.status : '',
    });

    const cycleArr = row.occCycleArr;
    const stageArr = row.occStageArr;
    const laneArr = row.occLaneArr;
    const stallArr = row.occStallArr;
    const causeArr = row.occCauseArr;
    if (!cycleArr || !stageArr || !laneArr || !stallArr || !causeArr || cycleArr.length === 0) {
      continue;
    }

    const beg = lowerBound(cycleArr, cycleStart);
    const end = upperBound(cycleArr, cycleEnd);
    for (let i = beg; i < end; i += 1) {
      events.push({
        rowId: row.rowId,
        cycle: cycleArr[i],
        stageId: stageIds[stageArr[i]] || 'UNK',
        laneId: laneIds[laneArr[i]] || 'UNK',
        stall: stallArr[i],
        cause: causeDict[causeArr[i]] || '0',
      });
      if (events.length >= maxEvents) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }

  events.sort((a, b) => (a.cycle - b.cycle) || (a.rowId - b.rowId));

  workerScope.postMessage({
    type: 'queryResult',
    requestId: msg.requestId,
    ok: true,
    totalRows,
    rows: viewportRows,
    events,
    truncated,
  });
}

workerScope.onmessage = (event: MessageEvent<WorkerMessage>) => {
  try {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') {
      return;
    }
    if (msg.type === 'init') {
      initState(msg.meta);
      workerScope.postMessage({ type: 'initAck', ok: true });
      return;
    }
    if (msg.type === 'chunk') {
      parseChunk(msg.chunk || '', msg.eof === true);
      if (msg.eof === true) {
        finalizeIndexes();
        ready = true;
        workerScope.postMessage({
          type: 'ready',
          ok: true,
          totalRows: rows.length,
          occCount,
          minCycle: Number.isFinite(minCycle) ? minCycle : 0,
          maxCycle: Number.isFinite(maxCycle) ? maxCycle : 0,
        });
      } else {
        workerScope.postMessage({ type: 'progress', lineNo: parseLineNo, occCount });
      }
      return;
    }
    if (msg.type === 'query') {
      onQuery(msg);
    }
  } catch (error) {
    postError(String(error));
  }
};

export {};
