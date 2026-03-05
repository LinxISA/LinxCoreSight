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
  row_sid?: string;  // Optional - new format uses uop_uid instead
  uop_uid?: string; // New format uses this instead of row_sid
  row_kind: string;
  entity_kind?: string;
  lifecycle_flags?: string[];
  order_key?: string;
  id_refs?: {
    seq?: number | null;
    uop_uid: string;
    block_uid: string;
    block_bid: string;
  };
  core_id?: number;
  block_uid?: string;
  left_label?: string;
  detail_defaults?: string;
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

type ChunkAckMessage = {
  type: 'chunkAck';
  ok: boolean;
  eof: boolean;
  lineNo: number;
  occCount: number;
  error?: string;
};

type RetireRecord = {
  cycle: number;
  status: string;
};

type RowMutable = {
  rowId: number;
  rowSid: string;
  rowKind: string;
  entityKind: string;
  lifecycleFlags: string[];
  orderKey: string;
  coreId: number;
  blockUid: string;
  uopUid: string;
  blockBid: string;
  seq: number | null;
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
  minCycle?: number;
  maxCycle?: number;
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
let chunkQueue: WorkerChunkMessage[] = [];
let chunkProcessing = false;
let sawEof = false;

function postError(error: string): void {
  console.error('[TraceWorker] Error:', error);
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
  chunkQueue = [];
  chunkProcessing = false;
  sawEof = false;
}

function initState(meta: LinxTraceMeta): void {
  resetState();
  metaState = meta;
  stageIds = meta.stage_catalog.map((s) => String(s.stage_id));
  laneIds = meta.lane_catalog.map((l) => String(l.lane_id));
  stageIds.forEach((id, idx) => stageIndex.set(id, idx));
  laneIds.forEach((id, idx) => laneIndex.set(id, idx));

  rows = meta.row_catalog.map((row) => {
    // Support both row_sid (legacy) and uop_uid (new format)
    const rowSid = String(row.row_sid || row.uop_uid || '');
    const obj: RowMutable = {
      rowId: Number(row.row_id),
      rowSid,
      rowKind: String(row.row_kind || 'uop'),
      entityKind: String(row.entity_kind || row.row_kind || 'uop'),
      lifecycleFlags: Array.isArray(row.lifecycle_flags) ? row.lifecycle_flags.map((v) => String(v)) : [],
      orderKey: String(row.order_key || ''),
      coreId: Number(row.core_id || 0),
      blockUid: String(row.block_uid || '0x0'),
      uopUid: String(row.uop_uid || rowSid || '0x0'),
      blockBid: String((row.id_refs && row.id_refs.block_bid) || '0x0'),
      seq: row.id_refs && row.id_refs.seq !== undefined && row.id_refs.seq !== null ? Number(row.id_refs.seq) : null,
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
  if (typ === 'META') {
    return;
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
  // Support both row_sid (legacy) and derive from uop_uid in OP_DEF (new format)
  // The new format uses uop_uid in OP_DEF instead of row_sid
  const recRowSid = String(rec.row_sid || '');
  if (recRowSid && recRowSid !== row.rowSid && row.rowSid) {
    throw new Error(`${where}: row_sid mismatch for row_id=${rowId}: got=${recRowSid} exp=${row.rowSid}`);
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
    
    // Track per-row min/max cycles for spatial queries
    if (row.minCycle === undefined || cycle < row.minCycle) {
      row.minCycle = cycle;
    }
    if (row.maxCycle === undefined || cycle > row.maxCycle) {
      row.maxCycle = cycle;
    }

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

function parseChunk(chunk: string, eof: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!chunk && !eof) {
      resolve();
      return;
    }
    const text = parseCarry + (chunk || '');
    const lines = text.split('\n');
    parseCarry = eof ? '' : lines.pop() || '';

    // Process in batches to avoid blocking the thread
    const BATCH_SIZE = 5000;
    let lineIndex = 0;

    const processBatch = () => {
      const batchEnd = Math.min(lineIndex + BATCH_SIZE, lines.length);

      try {
        for (; lineIndex < batchEnd; lineIndex++) {
          const rawLine = lines[lineIndex];
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

        // If not done, schedule next batch
        if (lineIndex < lines.length) {
          workerScope.postMessage({ type: 'progress', lineNo: parseLineNo, occCount });
          setTimeout(processBatch, 0);
          return;
        }

        // Handle remaining carry
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
        resolve();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };

    processBatch();
  });
}

function finalizeIndexes(): Promise<void> {
  return new Promise((resolve, reject) => {
    const BATCH_SIZE = 1000;
    let rowIndex = 0;

    const processBatch = () => {
      try {
        const batchEnd = Math.min(rowIndex + BATCH_SIZE, rows.length);

        for (; rowIndex < batchEnd; rowIndex++) {
          const row = rows[rowIndex];
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

        if (rowIndex < rows.length) {
          workerScope.postMessage({ type: 'progress', lineNo: parseLineNo, occCount });
          setTimeout(processBatch, 0);
          return;
        }

        allOrder = rows.flatMap((row, idx) =>
          row.occCycleArr && row.occCycleArr.length > 0 ? [idx] : [],
        );
        noFlushOrder = rows.flatMap((row, idx) =>
          rowVisibleInNoFlush(row) && row.occCycleArr && row.occCycleArr.length > 0 ? [idx] : [],
        );
        resolve();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };

    processBatch();
  });
}

async function processChunkQueue(): Promise<void> {
  if (chunkProcessing) return;
  chunkProcessing = true;
  try {
    while (chunkQueue.length > 0) {
      const msg = chunkQueue.shift()!;
      if (sawEof) {
        const ack: ChunkAckMessage = {
          type: 'chunkAck',
          ok: false,
          eof: msg.eof,
          lineNo: parseLineNo,
          occCount,
          error: 'received chunk after EOF',
        };
        workerScope.postMessage(ack);
        continue;
      }
      await parseChunk(msg.chunk || '', msg.eof === true);
      if (msg.eof === true) {
        sawEof = true;
        await finalizeIndexes();
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
      const ack: ChunkAckMessage = {
        type: 'chunkAck',
        ok: true,
        eof: msg.eof,
        lineNo: parseLineNo,
        occCount,
      };
      workerScope.postMessage(ack);
    }
  } catch (error) {
    const errMsg = String(error);
    postError(errMsg);
    const ack: ChunkAckMessage = {
      type: 'chunkAck',
      ok: false,
      eof: false,
      lineNo: parseLineNo,
      occCount,
      error: errMsg,
    };
    workerScope.postMessage(ack);
  } finally {
    chunkProcessing = false;
  }
}

function onQuery(msg: WorkerQueryMessage): void {
  // console.log('[TraceWorker] Query:', { rowStart: msg.rowStart, rowEnd: msg.rowEnd, cycleStart: msg.cycleStart, cycleEnd: msg.cycleEnd, hideFlushed: msg.hideFlushed });
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
  const events: {
    rowId: number;
    cycle: number;
    stageId: string;
    laneId: string;
    stall: number;
    cause: string;
    virtualSlot?: number;
    virtualSlotCount?: number;
  }[] = [];
  let truncated = false;

  // Pre-compute bounds check outside loop
  const cycleStartNum = cycleStart;
  const cycleEndNum = cycleEnd;

  for (let vis = rowStart; vis < rowEnd; vis += 1) {
    const actual = order[vis];
    const row = rows[actual];
    
    // Skip rows that have no events in the visible cycle range
    if (row.minCycle !== undefined && row.maxCycle !== undefined) {
      if (row.maxCycle < cycleStartNum || row.minCycle > cycleEndNum) {
        // Still add row metadata for empty rows in viewport
        viewportRows.push({
          rowId: row.rowId,
          rowSid: row.rowSid,
          rowKind: row.rowKind,
          entityKind: row.entityKind,
          lifecycleFlags: row.lifecycleFlags,
          orderKey: row.orderKey,
          coreId: row.coreId,
          blockUid: row.blockUid,
          uopUid: row.uopUid,
          blockBid: row.blockBid,
          seq: row.seq,
          leftLabel: row.leftLabel,
          detailLabel: row.detailLabel,
          retireCycle: row.retire ? row.retire.cycle : -1,
          retireStatus: row.retire ? row.retire.status : '',
        });
        continue;
      }
    }

    viewportRows.push({
      rowId: row.rowId,
      rowSid: row.rowSid,
      rowKind: row.rowKind,
      entityKind: row.entityKind,
      lifecycleFlags: row.lifecycleFlags,
      orderKey: row.orderKey,
      coreId: row.coreId,
      blockUid: row.blockUid,
      uopUid: row.uopUid,
      blockBid: row.blockBid,
      seq: row.seq,
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

    const beg = lowerBound(cycleArr, cycleStartNum);
    const end = upperBound(cycleArr, cycleEndNum);
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

  // Sort only once at the end
  events.sort((a, b) => (a.cycle - b.cycle) || (a.rowId - b.rowId));

  // Same-cycle multi-stage collisions are expanded with deterministic virtual slots.
  const bucket = new Map<string, number[]>();
  for (let i = 0; i < events.length; i += 1) {
    const evt = events[i];
    const key = `${evt.rowId}:${evt.cycle}`;
    let arr = bucket.get(key);
    if (!arr) {
      arr = [];
      bucket.set(key, arr);
    }
    arr.push(i);
  }
  const rowVirtualCount = new Map<number, number>();
  for (const idxs of bucket.values()) {
    idxs.sort((ia, ib) => {
      const a = events[ia];
      const b = events[ib];
      const sa = stageIndex.get(a.stageId) ?? 0;
      const sb = stageIndex.get(b.stageId) ?? 0;
      if (sa !== sb) return sa - sb;
      const la = laneIndex.get(a.laneId) ?? 0;
      const lb = laneIndex.get(b.laneId) ?? 0;
      if (la !== lb) return la - lb;
      if (a.stall !== b.stall) return a.stall - b.stall;
      return a.cause.localeCompare(b.cause);
    });
    const n = idxs.length;
    for (let slot = 0; slot < n; slot += 1) {
      const e = events[idxs[slot]];
      e.virtualSlot = slot;
      e.virtualSlotCount = n;
      const prev = rowVirtualCount.get(e.rowId) || 1;
      if (n > prev) {
        rowVirtualCount.set(e.rowId, n);
      }
    }
  }
  for (const row of viewportRows) {
    row.virtualRowCount = rowVirtualCount.get(row.rowId) || 1;
  }

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
      chunkQueue.push(msg);
      void processChunkQueue();
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
