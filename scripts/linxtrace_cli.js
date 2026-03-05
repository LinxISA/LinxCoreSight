#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const LINXTRACE_FORMAT = 'linxtrace.v1';
const DEFAULT_ROW_H = 22;
const DEFAULT_HEADER_H = 24;
const DEFAULT_CANVAS_LIMIT = 4000000;
const TRACE_READ_CHUNK = 256 * 1024;

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function fnv1a64(seed) {
  let h = BigInt('1469598103934665603');
  const prime = BigInt('0x100000001b3');
  const mask = BigInt('0xffffffffffffffff');
  const buf = Buffer.from(seed, 'utf8');
  for (const b of buf) {
    h ^= BigInt(b);
    h = (h * prime) & mask;
  }
  return h.toString(16).toUpperCase().padStart(16, '0');
}

function expectedContract(meta) {
  const stageIds = (meta.stage_catalog || []).map((s) => String(s.stage_id));
  const laneIds = (meta.lane_catalog || []).map((l) => String(l.lane_id));
  const rowSchema = (meta.row_catalog || [])
    .map((r) => [Number(r.row_id), String(r.row_kind)])
    .sort((a, b) => (a[0] - b[0]) || a[1].localeCompare(b[1]));
  const schemaId = String(meta.pipeline_schema_id || '');
  const seed = `${schemaId}|${stageIds.join(',')}|${laneIds.join(',')}|${rowSchema.map(([rid, kind]) => `${rid}:${kind}`).join(';')}|${LINXTRACE_FORMAT}`;
  return `${schemaId}-${fnv1a64(seed)}`;
}

function getRowSid(row) {
  // Support both row_sid (legacy) and uop_uid (new format)
  return String(row.row_sid || row.uop_uid || '');
}

function validateTracePath(tracePath) {
  const p = String(tracePath || '');
  if (p.endsWith('.gz')) {
    fail(`unsupported trace artifact: ${tracePath} (compressed traces are disabled; regenerate as *.linxtrace)`);
  }
  if (p.endsWith('.linxtrace.jsonl') || p.endsWith('.linxtrace.meta.json') || p.endsWith('.jsonl') || p.endsWith('.meta.json')) {
    fail(`unsupported legacy trace artifact: ${tracePath} (expected single-file *.linxtrace with in-band META)`);
  }
  if (!p.endsWith('.linxtrace')) {
    fail(`unsupported trace extension: ${tracePath} (expected *.linxtrace)`);
  }
}

function readTraceLines(tracePath, onLine) {
  const fd = fs.openSync(tracePath, 'r');
  const buf = Buffer.allocUnsafe(TRACE_READ_CHUNK);
  const lineParts = [];
  let offset = 0;
  let lineNo = 0;
  let keepReading = true;

  try {
    while (keepReading) {
      const n = fs.readSync(fd, buf, 0, buf.length, offset);
      if (n <= 0) {
        break;
      }
      offset += n;
      const chunk = buf.toString('utf8', 0, n);
      let cursor = 0;

      while (cursor <= chunk.length) {
        const nl = chunk.indexOf('\n', cursor);
        if (nl < 0) {
          lineParts.push(chunk.slice(cursor));
          break;
        }

        const text = lineParts.length > 0
          ? `${lineParts.join('')}${chunk.slice(cursor, nl)}`
          : chunk.slice(cursor, nl);
        lineParts.length = 0;

        lineNo += 1;
        if (onLine(lineNo, text) === false) {
          keepReading = false;
          break;
        }

        cursor = nl + 1;
      }
    }

    if (keepReading && lineParts.length > 0) {
      lineNo += 1;
      onLine(lineNo, lineParts.join(''));
    }
  } finally {
    fs.closeSync(fd);
  }
}

function readMetaFromTrace(tracePath) {
  let parsedMeta = null;
  readTraceLines(tracePath, (lineNo, raw) => {
    const line = String(raw || '').trim();
    if (!line) {
      return true;
    }

    let rec;
    try {
      rec = JSON.parse(line);
    } catch (e) {
      fail(`invalid JSON in trace head: ${tracePath}:${lineNo} (${e.message})`);
    }
    if (rec && typeof rec === 'object' && rec.type === 'META') {
      const { type: _dropType, ...meta } = rec;
      parsedMeta = meta;
      return false;
    }

    fail(`first non-empty record is not META: ${tracePath}:${lineNo}`);
    return false;
  });
  if (parsedMeta === null) {
    fail(`missing META record in trace: ${tracePath}`);
  }
  return parsedMeta;
}

function validateMeta(meta, metaPath) {
  if (!meta || typeof meta !== 'object') {
    return `invalid meta object: ${metaPath}`;
  }
  if (meta.format !== LINXTRACE_FORMAT) {
    return `meta format mismatch: expected ${LINXTRACE_FORMAT}, got ${meta.format}`;
  }
  if (!Array.isArray(meta.stage_catalog) || meta.stage_catalog.length === 0) {
    return 'meta missing non-empty stage_catalog';
  }
  if (!Array.isArray(meta.lane_catalog)) {
    return 'meta missing lane_catalog';
  }
  if (!Array.isArray(meta.row_catalog) || meta.row_catalog.length === 0) {
    return 'meta missing non-empty row_catalog';
  }
  if (!meta.pipeline_schema_id || !meta.contract_id) {
    return 'meta missing pipeline_schema_id/contract_id';
  }
  for (const row of meta.row_catalog) {
    if (!row || typeof row !== 'object') return 'meta row_catalog contains invalid row object';
    // Support both row_sid (legacy) and uop_uid (new format)
    const hasRowSid = String(row.row_sid || '').trim();
    const hasUopUid = String(row.uop_uid || '').trim();
    if (!hasRowSid && !hasUopUid) return `meta row_catalog missing row_sid/uop_uid for row_id=${row.row_id}`;
    if (!String(row.row_kind || '').trim()) return `meta row_catalog missing row_kind for row_id=${row.row_id}`;
    if (row.order_key !== undefined && !String(row.order_key || '').trim() && row.order_key !== '0') {
      return `meta row_catalog invalid order_key for row_id=${row.row_id}`;
    }
    if (row.lifecycle_flags !== undefined && !Array.isArray(row.lifecycle_flags)) {
      return `meta row_catalog lifecycle_flags must be an array for row_id=${row.row_id}`;
    }
    if (row.id_refs !== undefined && (typeof row.id_refs !== 'object' || row.id_refs === null)) {
      return `meta row_catalog id_refs must be an object for row_id=${row.row_id}`;
    }
  }
  const want = expectedContract(meta);
  if (want !== meta.contract_id) {
    return `contract mismatch: meta=${meta.contract_id} expected=${want}`;
  }
  return null;
}

function asInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseTrace(tracePath, meta, options = {}) {
  const strict = options.strict !== false;
  const stopOnFirstFailure = options.stopOnFirstFailure === true;
  const allowed = new Set(['META', 'OP_DEF', 'LABEL', 'OCC', 'RETIRE', 'BLOCK_EVT', 'XCHECK', 'DEP']);
  const stageSet = new Set((meta.stage_catalog || []).map((s) => String(s.stage_id)));
  const laneSet = new Set((meta.lane_catalog || []).map((l) => String(l.lane_id)));
  const rowSet = new Set((meta.row_catalog || []).map((r) => Number(r.row_id)));
  const rowSidById = new Map((meta.row_catalog || []).map((r) => [Number(r.row_id), getRowSid(r)]));

  const stats = {
    total: 0,
    occ: 0,
    retire: 0,
    opDef: 0,
    label: 0,
    blockEvt: 0,
    xcheck: 0,
    dep: 0,
    firstCycle: null,
    lastCycle: null,
    stageHist: new Map(),
    laneHist: new Map(),
    typeHist: new Map(),
    rowOccHist: new Map(),
    rowRetireHist: new Map(),
    duplicateRetire: 0,
    postRetireOcc: 0,
    duplicateOcc: 0,
    nonMonotonicRowCycle: 0,
  };

  const rowState = new Map();
  let firstFailure = null;

  function bump(map, key) {
    map.set(key, (map.get(key) || 0) + 1);
  }

  function getRowState(rowId) {
    let st = rowState.get(rowId);
    if (!st) {
      st = {
        seenDef: false,
        retiredCycle: null,
        lastOccCycle: null,
        lastOccSig: '',
        occCount: 0,
      };
      rowState.set(rowId, st);
    }
    return st;
  }

  function recordFailure(lineNo, reason, rec) {
    if (!firstFailure) {
      firstFailure = { line: lineNo, reason, rec };
    }
  }

  let lastLineNo = 0;
  readTraceLines(tracePath, (lineNo, raw) => {
    lastLineNo = lineNo;
    const trimmed = String(raw || '').trim();
    if (!trimmed) {
      return true;
    }

    let rec;
    try {
      rec = JSON.parse(trimmed);
    } catch (e) {
      recordFailure(lineNo, `invalid JSON (${e.message})`, trimmed);
      return stopOnFirstFailure ? false : true;
    }

    stats.total += 1;
    const t = String(rec.type || '');
    bump(stats.typeHist, t);
    if (!allowed.has(t)) {
      recordFailure(lineNo, `unknown event type ${t}`, rec);
      return stopOnFirstFailure ? false : true;
    }
    if (t === 'META') {
      return true;
    }

    const cycle = typeof rec.cycle === 'number' ? rec.cycle : null;
    if (cycle !== null) {
      if (stats.firstCycle === null || cycle < stats.firstCycle) stats.firstCycle = cycle;
      if (stats.lastCycle === null || cycle > stats.lastCycle) stats.lastCycle = cycle;
    }

    if (t === 'BLOCK_EVT') {
      stats.blockEvt += 1;
      return true;
    }
    if (t === 'DEP') {
      stats.dep += 1;
      return true;
    }

    const rowId = asInt(rec.row_id, Number.NaN);
    if (!Number.isFinite(rowId) || !rowSet.has(rowId)) {
      recordFailure(lineNo, `unknown row_id=${rec.row_id}`, rec);
      return stopOnFirstFailure ? false : true;
    }
    const st = getRowState(rowId);
    // Support both row_sid (legacy) and uop_uid (new format) in events
    // The new format uses row_id which is sufficient - row_sid/uop_uid are optional
    const rowSid = String(rec.row_sid || rec.uop_uid || '');
    const expectedSid = rowSidById.get(rowId) || '';
    // Only validate if both are present and non-empty - new format may not have row_sid in events
    if (rowSid && expectedSid && rowSid !== expectedSid) {
      recordFailure(lineNo, `row_sid/uop_uid mismatch for row_id=${rowId}: got=${rowSid} expected=${expectedSid}`, rec);
      return stopOnFirstFailure ? false : true;
    }

    if (t !== 'OP_DEF' && strict && !st.seenDef) {
      recordFailure(lineNo, `${t} before OP_DEF for row_id=${rowId}`, rec);
      return stopOnFirstFailure ? false : true;
    }

    if (t === 'OP_DEF') {
      stats.opDef += 1;
      st.seenDef = true;
      // New format uses row_id as identifier, row_sid/uop_uid is optional
      return true;
    }

    if (t === 'LABEL') {
      stats.label += 1;
      const lt = String(rec.label_type || '');
      if (lt !== 'left' && lt !== 'detail') {
        recordFailure(lineNo, `LABEL has invalid label_type=${lt}`, rec);
        return stopOnFirstFailure ? false : true;
      }
      return true;
    }

    if (t === 'RETIRE') {
      stats.retire += 1;
      // New format uses row_id - row_sid/uop_uid is optional
      bump(stats.rowRetireHist, rowId);
      if (st.retiredCycle !== null) {
        stats.duplicateRetire += 1;
        recordFailure(lineNo, `duplicate RETIRE for row_id=${rowId}`, rec);
        if (stopOnFirstFailure) {
          return false;
        }
      } else if (typeof rec.cycle !== 'number') {
        recordFailure(lineNo, `RETIRE missing numeric cycle for row_id=${rowId}`, rec);
        if (stopOnFirstFailure) {
          return false;
        }
      } else {
        st.retiredCycle = rec.cycle;
      }
      return true;
    }

    if (t === 'XCHECK') {
      stats.xcheck += 1;
      return true;
    }

    if (t === 'OCC') {
      stats.occ += 1;
      // New format may not have row_sid in events - make optional for OCC
      st.occCount += 1;
      bump(stats.rowOccHist, rowId);

      const stage = String(rec.stage_id || '');
      const lane = String(rec.lane_id || '');
      if (!stageSet.has(stage)) {
        recordFailure(lineNo, `unknown stage_id=${stage}`, rec);
        return stopOnFirstFailure ? false : true;
      }
      if (!laneSet.has(lane)) {
        recordFailure(lineNo, `unknown lane_id=${lane}`, rec);
        return stopOnFirstFailure ? false : true;
      }
      bump(stats.stageHist, stage);
      bump(stats.laneHist, lane);

      const occCycle = asInt(rec.cycle, Number.NaN);
      if (!Number.isFinite(occCycle)) {
        recordFailure(lineNo, `OCC missing numeric cycle for row_id=${rowId}`, rec);
        return stopOnFirstFailure ? false : true;
      }

      if (st.retiredCycle !== null && Number.isFinite(occCycle) && occCycle > st.retiredCycle) {
        stats.postRetireOcc += 1;
        recordFailure(lineNo, `OCC after RETIRE for row_id=${rowId} occ_cycle=${occCycle} retire_cycle=${st.retiredCycle}`, rec);
        return stopOnFirstFailure ? false : true;
      }

      if (st.lastOccCycle !== null && Number.isFinite(occCycle) && occCycle < st.lastOccCycle) {
        stats.nonMonotonicRowCycle += 1;
        recordFailure(lineNo, `non-monotonic OCC cycle for row_id=${rowId}: prev=${st.lastOccCycle} now=${occCycle}`, rec);
        return stopOnFirstFailure ? false : true;
      }
      st.lastOccCycle = Number.isFinite(occCycle) ? occCycle : st.lastOccCycle;

      const occSig = `${rowId}|${occCycle}|${stage}|${lane}|${asInt(rec.stall, 0)}|${String(rec.cause || '0')}`;
      if (occSig === st.lastOccSig) {
        stats.duplicateOcc += 1;
      }
      st.lastOccSig = occSig;
      return true;
    }
    return true;
  });

  if (strict && stats.occ === 0) {
    recordFailure(lastLineNo, 'trace has zero OCC events', null);
  }
  if (strict && stats.retire === 0) {
    recordFailure(lastLineNo, 'trace has zero RETIRE events', null);
  }

  const rowsWithoutOcc = [];
  const rowsWithoutOpDef = [];
  for (const [rowId, st] of rowState.entries()) {
    if (!st.seenDef) rowsWithoutOpDef.push(rowId);
    if (st.occCount === 0) rowsWithoutOcc.push(rowId);
  }
  stats.rowsWithState = rowState.size;
  stats.rowsWithoutOcc = rowsWithoutOcc.length;
  stats.rowsWithoutOpDef = rowsWithoutOpDef.length;

  if (strict && rowsWithoutOpDef.length > 0) {
    recordFailure(lastLineNo, `rows without OP_DEF: count=${rowsWithoutOpDef.length}`, rowsWithoutOpDef.slice(0, 8));
  }

  return { stats, firstFailure };
}

function mapToObject(map) {
  const out = {};
  for (const [k, v] of map.entries()) out[k] = v;
  return out;
}

function renderDebug(meta, stats, options) {
  const rowH = asInt(options.rowHeight, DEFAULT_ROW_H);
  const headerH = asInt(options.headerHeight, DEFAULT_HEADER_H);
  const canvasLimit = asInt(options.canvasLimit, DEFAULT_CANVAS_LIMIT);
  const totalRows = (meta.row_catalog || []).length;
  const logicalCanvasHeight = headerH + totalRows * rowH + 8;
  const avgOccPerRow = totalRows > 0 ? (stats.occ / totalRows) : 0;
  const maxStage = [...stats.stageHist.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const maxLane = [...stats.laneHist.entries()].sort((a, b) => b[1] - a[1])[0] || null;

  const risks = [];
  if (logicalCanvasHeight > canvasLimit) {
    risks.push(`legacy-canvas-height-overflow height=${logicalCanvasHeight} limit=${canvasLimit}`);
  }
  if (stats.rowsWithoutOcc > 0) {
    risks.push(`rows-without-occ count=${stats.rowsWithoutOcc}`);
  }
  if (stats.postRetireOcc > 0) {
    risks.push(`post-retire-occ count=${stats.postRetireOcc}`);
  }
  if (stats.duplicateRetire > 0) {
    risks.push(`duplicate-retire count=${stats.duplicateRetire}`);
  }

  return {
    row_height: rowH,
    header_height: headerH,
    canvas_limit: canvasLimit,
    total_rows: totalRows,
    logical_canvas_height: logicalCanvasHeight,
    avg_occ_per_row: Number(avgOccPerRow.toFixed(4)),
    max_stage: maxStage ? { stage: maxStage[0], count: maxStage[1] } : null,
    max_lane: maxLane ? { lane: maxLane[0], count: maxLane[1] } : null,
    risks,
  };
}

function usage() {
  console.log(`Usage:
  node scripts/linxtrace_cli.js lint <trace.linxtrace>
  node scripts/linxtrace_cli.js stats <trace.linxtrace>
  node scripts/linxtrace_cli.js schema-check <trace.linxtrace>
  node scripts/linxtrace_cli.js first-failure <trace.linxtrace>
  node scripts/linxtrace_cli.js render-check <trace.linxtrace> [--row-height 22] [--header-height 24] [--canvas-limit 4000000]
  node scripts/linxtrace_cli.js control <up|down|left|right|snap> [--repeat N] [--delay-ms N] [--app LinxCoreSight]`);
}

function parseArgs(argv) {
  if (argv.length < 3) {
    usage();
    process.exit(2);
  }
  const cmd = argv[2];
  if (cmd === 'control') {
    const action = argv[3] || '';
    let repeat = 1;
    let delayMs = 35;
    let appName = 'LinxCoreSight';
    for (let i = 4; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === '--repeat' && i + 1 < argv.length) {
        repeat = Math.max(1, Number(argv[i + 1]) || 1);
        i += 1;
        continue;
      }
      if (arg === '--delay-ms' && i + 1 < argv.length) {
        delayMs = Math.max(0, Number(argv[i + 1]) || 0);
        i += 1;
        continue;
      }
      if (arg === '--app' && i + 1 < argv.length) {
        appName = String(argv[i + 1] || appName);
        i += 1;
      }
    }
    return { cmd, action, repeat, delayMs, appName };
  }
  if (argv.length < 4) {
    usage();
    process.exit(2);
  }
  const trace = argv[3];
  const options = {};
  for (let i = 4; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--meta') {
      fail('unsupported option --meta (single-file *.linxtrace includes META in-band)');
    }
    if (arg === '--row-height' && i + 1 < argv.length) {
      options.rowHeight = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--header-height' && i + 1 < argv.length) {
      options.headerHeight = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--canvas-limit' && i + 1 < argv.length) {
      options.canvasLimit = argv[i + 1];
      i += 1;
      continue;
    }
  }
  return { cmd, trace, options };
}

function runControlCommand(action, repeat, delayMs, appName) {
  if (process.platform !== 'darwin') {
    fail('control command currently supports macOS only');
  }
  const keyCodeByAction = {
    up: 126,
    down: 125,
    left: 123,
    right: 124,
    snap: 100, // F8 (wired to UI snapshot in viewer)
  };
  const keyCode = keyCodeByAction[action];
  if (typeof keyCode !== 'number') {
    fail(`unknown control action: ${action}`);
  }
  for (let i = 0; i < repeat; i += 1) {
    const script = [
      `tell application "${appName}" to activate`,
      `delay ${Math.max(0, delayMs) / 1000}`,
      'tell application "System Events"',
      `  key code ${keyCode}`,
      'end tell',
    ].join('\n');
    const res = spawnSync('osascript', ['-e', script], { encoding: 'utf8' });
    if (res.status !== 0) {
      const msg = String(res.stderr || res.stdout || '');
      if (/not allowed to send keystrokes/i.test(msg)) {
        fail(`control failed: macOS Accessibility permission is required for Terminal/Node (System Settings -> Privacy & Security -> Accessibility). raw=${msg}`);
      }
      fail(`control failed: ${msg || `key=${action}`}`);
    }
  }
  console.log(`control-ok action=${action} repeat=${repeat} delay_ms=${delayMs} app=${appName}`);
}

function main() {
  const parsedArgs = parseArgs(process.argv);
  const { cmd } = parsedArgs;
  if (cmd === 'control') {
    runControlCommand(parsedArgs.action, parsedArgs.repeat, parsedArgs.delayMs, parsedArgs.appName);
    return;
  }
  const { trace, options } = parsedArgs;
  const tracePath = path.resolve(trace);
  if (!fs.existsSync(tracePath)) fail(`missing trace: ${tracePath}`, 2);
  validateTracePath(tracePath);

  const metaObj = readMetaFromTrace(tracePath);
  const metaError = validateMeta(metaObj, `${tracePath}#META`);
  if (metaError) {
    if (cmd === 'first-failure') {
      console.log(`meta: ${metaError}`);
      process.exit(1);
    }
    fail(metaError);
  }

  if (cmd === 'schema-check') {
    console.log(`schema-ok contract=${metaObj.contract_id} stages=${metaObj.stage_catalog.length} lanes=${metaObj.lane_catalog.length} rows=${metaObj.row_catalog.length}`);
    return;
  }

  const parsed = parseTrace(tracePath, metaObj, {
    strict: cmd !== 'first-failure',
    stopOnFirstFailure: cmd === 'first-failure',
  });

  if (cmd === 'first-failure') {
    if (parsed.firstFailure) {
      const ff = parsed.firstFailure;
      console.log(`${tracePath}:${ff.line}: ${ff.reason}`);
      if (ff.rec !== null && ff.rec !== undefined) {
        console.log(typeof ff.rec === 'string' ? ff.rec : JSON.stringify(ff.rec));
      }
      process.exit(1);
    }
    console.log('no-failure');
    return;
  }

  if (parsed.firstFailure) {
    const ff = parsed.firstFailure;
    fail(`${tracePath}:${ff.line}: ${ff.reason}`);
  }

  if (cmd === 'lint') {
    console.log(`lint-ok total=${parsed.stats.total} occ=${parsed.stats.occ} retire=${parsed.stats.retire}`);
    return;
  }

  if (cmd === 'stats') {
    const out = {
      total_events: parsed.stats.total,
      occ_events: parsed.stats.occ,
      retire_events: parsed.stats.retire,
      op_def_events: parsed.stats.opDef,
      label_events: parsed.stats.label,
      first_cycle: parsed.stats.firstCycle,
      last_cycle: parsed.stats.lastCycle,
      rows_with_state: parsed.stats.rowsWithState,
      rows_without_occ: parsed.stats.rowsWithoutOcc,
      duplicate_retire: parsed.stats.duplicateRetire,
      post_retire_occ: parsed.stats.postRetireOcc,
      non_monotonic_row_cycle: parsed.stats.nonMonotonicRowCycle,
      duplicate_occ: parsed.stats.duplicateOcc,
      type_hist: mapToObject(parsed.stats.typeHist),
      stage_hist: mapToObject(parsed.stats.stageHist),
      lane_hist: mapToObject(parsed.stats.laneHist),
    };
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (cmd === 'render-check') {
    const out = renderDebug(metaObj, parsed.stats, options);
    console.log(JSON.stringify(out, null, 2));
    if (out.risks.length > 0) {
      process.exit(1);
    }
    return;
  }

  usage();
  process.exit(2);
}

main();
