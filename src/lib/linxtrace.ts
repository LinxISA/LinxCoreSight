import type { ViewportEvent, ViewportQueryRequest, ViewportQueryResponse, ViewportRow } from './traceProtocol';

export const LINXTRACE_FORMAT = 'linxtrace.v1';

export interface LinxTraceStage {
  stage_id: string;
  label: string;
  color: string;
  group: string;
}

export interface LinxTraceLane {
  lane_id: string;
  label: string;
}

export interface LinxTraceRowCatalog {
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
}

export interface LinxTraceMeta {
  format: string;
  contract_id: string;
  pipeline_schema_id: string;
  stage_order_csv: string;
  stage_catalog: LinxTraceStage[];
  lane_catalog: LinxTraceLane[];
  row_catalog: LinxTraceRowCatalog[];
  render_prefs?: Record<string, unknown>;
}

export interface LinxTraceSessionSummary {
  tracePath: string;
  metaPath: string;
  meta: LinxTraceMeta;
  totalRows: number;
  minCycle: number;
  maxCycle: number;
  occCount: number;
  stageColors: Record<string, string>;
}

export interface LinxTraceViewportModel {
  totalRows: number;
  rows: ViewportRow[];
  events: ViewportEvent[];
  truncated: boolean;
}

type QueryResolver = {
  resolve: (resp: LinxTraceViewportModel) => void;
  reject: (err: Error) => void;
};

type ElectronTraceAPI = {
  readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  traceReadMeta?: (tracePath: string) => Promise<{
    ok: boolean;
    metaPath?: string;
    meta?: LinxTraceMeta | Record<string, unknown>;
    metaJson?: string;
    error?: string;
  }>;
  traceOpenSession?: (tracePath: string) => Promise<{ ok: boolean; sessionId?: number; sizeBytes?: number; mtimeMs?: number; error?: string }>;
  traceReadChunk?: (sessionId: number, offset: number, bytes: number) => Promise<{ ok: boolean; chunk?: string; nextOffset?: number; eof?: boolean; error?: string }>;
  traceCloseSession?: (sessionId: number) => Promise<{ ok: boolean }>;
};

type WorkerReadyMessage = {
  type: 'ready';
  ok: boolean;
  totalRows: number;
  occCount: number;
  minCycle: number;
  maxCycle: number;
  error?: string;
};

type WorkerQueryMessage = {
  type: 'queryResult';
  requestId: number;
  ok: boolean;
  totalRows: number;
  rows: ViewportRow[];
  events: ViewportEvent[];
  truncated: boolean;
  error?: string;
};

type WorkerErrorMessage = {
  type: 'error';
  error: string;
};

type WorkerProgressMessage = {
  type: 'progress';
  lineNo: number;
  occCount: number;
};

type WorkerChunkAckMessage = {
  type: 'chunkAck';
  ok: boolean;
  eof: boolean;
  lineNo: number;
  occCount: number;
  error?: string;
};

type WorkerAnyMessage =
  | WorkerReadyMessage
  | WorkerQueryMessage
  | WorkerErrorMessage
  | WorkerProgressMessage
  | WorkerChunkAckMessage
  | Record<string, unknown>;

function parseJsonOrThrow<T>(content: string, where: string): T {
  try {
    return JSON.parse(content) as T;
  } catch (err) {
    throw new Error(`${where}: invalid JSON (${String(err)})`);
  }
}

function stableContractId(stageIds: string[], laneIds: string[], rowSchema: Array<[number, string]>, schemaId: string): string {
  const seed = `${schemaId}|${stageIds.join(',')}|${laneIds.join(',')}|${rowSchema.map(([rid, kind]) => `${rid}:${kind}`).join(';')}|${LINXTRACE_FORMAT}`;
  let hash = BigInt('1469598103934665603');
  const prime = BigInt('0x100000001b3');
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= BigInt(seed.charCodeAt(i) & 0xff);
    hash = (hash * prime) & BigInt('0xffffffffffffffff');
  }
  const hex = hash.toString(16).toUpperCase().padStart(16, '0');
  return `${schemaId}-${hex}`;
}

function validateMeta(meta: LinxTraceMeta): void {
  if (meta.format !== LINXTRACE_FORMAT) {
    throw new Error(`unsupported trace format: ${String(meta.format)} (expected ${LINXTRACE_FORMAT})`);
  }
  if (!Array.isArray(meta.stage_catalog) || meta.stage_catalog.length === 0) {
    throw new Error('meta.stage_catalog must be a non-empty array');
  }
  if (!Array.isArray(meta.lane_catalog)) {
    throw new Error('meta.lane_catalog must be an array');
  }
  if (!Array.isArray(meta.row_catalog) || meta.row_catalog.length === 0) {
    throw new Error('meta.row_catalog must be a non-empty array');
  }
  if (!meta.pipeline_schema_id || !meta.contract_id) {
    throw new Error('meta missing pipeline_schema_id/contract_id');
  }
  for (const row of meta.row_catalog) {
    if (!row || typeof row !== 'object') {
      throw new Error('meta.row_catalog contains invalid row object');
    }
    // Support both row_sid (legacy) and uop_uid (new format)
    const hasRowSid = String(row.row_sid || '').trim();
    const hasUopUid = String(row.uop_uid || '').trim();
    if (!hasRowSid && !hasUopUid) {
      throw new Error(`meta.row_catalog row_id=${String(row.row_id)} missing row_sid/uop_uid`);
    }
    if (!String(row.row_kind || '').trim()) {
      throw new Error(`meta.row_catalog row_id=${String(row.row_id)} missing row_kind`);
    }
    if (row.order_key !== undefined && !String(row.order_key).trim() && row.order_key !== '0') {
      throw new Error(`meta.row_catalog row_id=${String(row.row_id)} invalid order_key`);
    }
  }
  const stageIds = meta.stage_catalog.map((s) => String(s.stage_id));
  const laneIds = meta.lane_catalog.map((l) => String(l.lane_id));
  const rowSchema: Array<[number, string]> = meta.row_catalog.map((r) => [Number(r.row_id), String(r.row_kind)]);
  const expectedContract = stableContractId(stageIds, laneIds, rowSchema, meta.pipeline_schema_id);
  if (expectedContract !== meta.contract_id) {
    throw new Error(
      `contract mismatch: meta=${meta.contract_id} expected=${expectedContract}. `
      + 'Refresh LinxCore emitter and LinxCoreSight parser together.',
    );
  }
}

async function readMeta(tracePath: string, api: ElectronTraceAPI): Promise<{ metaPath: string; meta: LinxTraceMeta }> {
  if (api.traceReadMeta) {
    const res = await api.traceReadMeta(tracePath);
    if (!res.ok) {
      throw new Error(`failed to read meta for ${tracePath}: ${res.error || 'unknown error'}`);
    }
    if (res.meta) {
      const meta = res.meta as unknown as LinxTraceMeta;
      validateMeta(meta);
      return { metaPath: res.metaPath || tracePath, meta };
    }
    if (res.metaJson) {
      const parsed = parseJsonOrThrow<LinxTraceMeta>(res.metaJson, 'traceReadMeta');
      validateMeta(parsed);
      return { metaPath: res.metaPath || tracePath, meta: parsed };
    }
    throw new Error(`traceReadMeta returned no metadata for ${tracePath}`);
  }

  const fallback = await api.readFile(tracePath);
  if (!fallback.success || !fallback.content) {
    throw new Error(`failed to read trace file: ${tracePath}${fallback.error ? ` (${fallback.error})` : ''}`);
  }
  const firstRecord = fallback.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstRecord) {
    throw new Error(`empty trace file: ${tracePath}`);
  }
  const raw = parseJsonOrThrow<Record<string, unknown>>(firstRecord, tracePath);
  if (raw.type !== 'META') {
    throw new Error(`missing META record in trace: ${tracePath}`);
  }
  const { type: _dropType, ...metaRec } = raw;
  const meta = metaRec as unknown as LinxTraceMeta;
  validateMeta(meta);
  return { metaPath: tracePath, meta };
}

export class LinxTraceSession {
  readonly summary: LinxTraceSessionSummary;

  private readonly api: ElectronTraceAPI;

  private readonly worker: Worker;

  private queryId = 1;

  private queryResolvers = new Map<number, QueryResolver>();

  private openSessionId: number | null = null;

  private constructor(summary: LinxTraceSessionSummary, api: ElectronTraceAPI, worker: Worker) {
    this.summary = summary;
    this.api = api;
    this.worker = worker;
  }

  static async open(tracePath: string, api: ElectronTraceAPI, chunkBytes = 8 * 1024 * 1024): Promise<LinxTraceSession> {
    const { metaPath, meta } = await readMeta(tracePath, api);
    const worker = new Worker(new URL('../workers/traceIndex.worker.ts', import.meta.url), { type: 'module' });
    const loadTimeoutMs = 180000;

    let readyResolve: ((msg: WorkerReadyMessage) => void) | null = null;
    let readyReject: ((error: Error) => void) | null = null;
    const readyPromise = new Promise<WorkerReadyMessage>((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    const failReady = (error: Error): void => {
      readyReject?.(error);
      readyReject = null;
      readyResolve = null;
    };

    const pendingQueries = new Map<number, QueryResolver>();
    let chunkAckResolve: ((ack: WorkerChunkAckMessage) => void) | null = null;
    let chunkAckReject: ((error: Error) => void) | null = null;
    worker.onmessage = (evt: MessageEvent<WorkerAnyMessage>) => {
      const msg = evt.data;
      if (!msg || typeof msg !== 'object') {
        return;
      }
      if (msg.type === 'ready') {
        if (!msg.ok) {
          const errMsg = typeof (msg as { error?: unknown }).error === 'string'
            ? (msg as { error?: string }).error
            : 'worker failed preparing trace';
          failReady(new Error(errMsg));
        } else {
          readyResolve?.(msg as WorkerReadyMessage);
        }
        return;
      }
      if (msg.type === 'chunkAck') {
        const ack = msg as WorkerChunkAckMessage;
        if (!ack.ok) {
          const err = new Error(ack.error || 'chunk parse failed');
          chunkAckReject?.(err);
          failReady(err);
        } else {
          chunkAckResolve?.(ack);
        }
        chunkAckResolve = null;
        chunkAckReject = null;
        return;
      }
      if (msg.type === 'queryResult') {
        const rec = msg as WorkerQueryMessage;
        const wait = pendingQueries.get(rec.requestId);
        if (!wait) return;
        pendingQueries.delete(rec.requestId);
        if (!rec.ok) {
          wait.reject(new Error(rec.error || `query ${rec.requestId} failed`));
        } else {
          wait.resolve({
            totalRows: rec.totalRows,
            rows: rec.rows || [],
            events: rec.events || [],
            truncated: Boolean(rec.truncated),
          });
        }
        return;
      }
      if (msg.type === 'error') {
        console.error('[LinxTraceSession] Worker error:', msg);
        const err = new Error((msg as WorkerErrorMessage).error || 'worker parse error');
        chunkAckReject?.(err);
        chunkAckReject = null;
        chunkAckResolve = null;
        failReady(err);
        for (const wait of pendingQueries.values()) {
          wait.reject(err);
        }
        pendingQueries.clear();
      }
    };
    worker.onerror = (evt: ErrorEvent) => {
      const err = new Error(evt.message || 'worker crashed');
      chunkAckReject?.(err);
      chunkAckReject = null;
      chunkAckResolve = null;
      failReady(err);
      for (const wait of pendingQueries.values()) {
        wait.reject(err);
      }
      pendingQueries.clear();
    };
    worker.onmessageerror = () => {
      const err = new Error('worker message deserialization failed');
      chunkAckReject?.(err);
      chunkAckReject = null;
      chunkAckResolve = null;
      failReady(err);
      for (const wait of pendingQueries.values()) {
        wait.reject(err);
      }
      pendingQueries.clear();
    };

    worker.postMessage({ type: 'init', meta });
    const sendChunkAndWait = async (chunk: string, eof: boolean): Promise<void> => {
      await new Promise<void>((resolve, reject) => {
        chunkAckResolve = () => resolve();
        chunkAckReject = reject;
        worker.postMessage({ type: 'chunk', chunk, eof });
      });
    };

    let openedSessionId: number | null = null;
    const timeoutHandle = setTimeout(() => {
      const err = new Error(`trace load timeout after ${loadTimeoutMs}ms`);
      chunkAckReject?.(err);
      chunkAckReject = null;
      chunkAckResolve = null;
      failReady(err);
    }, loadTimeoutMs);
    try {
      if (api.traceOpenSession && api.traceReadChunk && api.traceCloseSession) {
        const opened = await api.traceOpenSession(tracePath);
        if (!opened.ok || !opened.sessionId) {
          throw new Error(`failed to open trace stream: ${opened.error || 'unknown error'}`);
        }
        openedSessionId = opened.sessionId;
        let offset = 0;
        let eof = false;
        while (!eof) {
          const res = await api.traceReadChunk(opened.sessionId, offset, chunkBytes);
          if (!res.ok) {
            throw new Error(`failed to read trace chunk: ${res.error || 'unknown error'}`);
          }
          const nextOffset = Number(res.nextOffset ?? offset);
          if (!Boolean(res.eof) && nextOffset <= offset) {
            throw new Error(`trace chunk reader stalled at offset=${offset}`);
          }
          await sendChunkAndWait(res.chunk || '', Boolean(res.eof));
          offset = nextOffset;
          eof = Boolean(res.eof);
        }
      } else {
        const fallback = await api.readFile(tracePath);
        if (!fallback.success || !fallback.content) {
          throw new Error(`failed to read trace file: ${tracePath}${fallback.error ? ` (${fallback.error})` : ''}`);
        }
        await sendChunkAndWait(fallback.content, true);
      }

      const ready = await readyPromise;
      const stageColors: Record<string, string> = {};
      for (const stage of meta.stage_catalog) {
        stageColors[String(stage.stage_id)] = String(stage.color || '#9CA3AF');
      }

      const summary: LinxTraceSessionSummary = {
        tracePath,
        metaPath,
        meta,
        totalRows: Number(ready.totalRows || meta.row_catalog.length),
        minCycle: Number(ready.minCycle || 0),
        maxCycle: Number(ready.maxCycle || 0),
        occCount: Number(ready.occCount || 0),
        stageColors,
      };

      const session = new LinxTraceSession(summary, api, worker);
      session.openSessionId = openedSessionId;
      session.queryResolvers = pendingQueries;
      return session;
    } catch (error) {
      worker.terminate();
      if (openedSessionId !== null && api.traceCloseSession) {
        try {
          await api.traceCloseSession(openedSessionId);
        } catch {
          // ignore close error
        }
      }
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async queryViewport(req: Omit<ViewportQueryRequest, 'requestId'>): Promise<LinxTraceViewportModel> {
    const requestId = this.queryId++;
    const promise = new Promise<LinxTraceViewportModel>((resolve, reject) => {
      this.queryResolvers.set(requestId, { resolve, reject });
    });
    this.worker.postMessage({
      type: 'query',
      requestId,
      rowStart: req.rowStart,
      rowEnd: req.rowEnd,
      cycleStart: req.cycleStart,
      cycleEnd: req.cycleEnd,
      hideFlushed: req.hideFlushed,
      maxEvents: req.maxEvents,
    });
    return promise;
  }

  async close(): Promise<void> {
    this.worker.terminate();
    if (this.openSessionId !== null && this.api.traceCloseSession) {
      await this.api.traceCloseSession(this.openSessionId);
      this.openSessionId = null;
    }
    for (const wait of this.queryResolvers.values()) {
      wait.reject(new Error('trace session closed'));
    }
    this.queryResolvers.clear();
  }
}
