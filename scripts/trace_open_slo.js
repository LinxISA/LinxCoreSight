#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function nowNs() {
  return process.hrtime.bigint();
}

function parseArgs(argv) {
  if (argv.length < 3) {
    fail('usage: node scripts/trace_open_slo.js <trace.linxtrace> [--open-ms 8000] [--first-paint-ms 2000] [--perf-log <path>]', 2);
  }
  const trace = path.resolve(argv[2]);
  let openMs = 8000;
  let firstPaintMs = 2000;
  let perfLog = process.env.LCS_PERF_LOG || '';
  for (let i = 3; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--open-ms' && i + 1 < argv.length) {
      openMs = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (a === '--first-paint-ms' && i + 1 < argv.length) {
      firstPaintMs = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (a === '--perf-log' && i + 1 < argv.length) {
      perfLog = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
  }
  return { trace, openMs, firstPaintMs, perfLog };
}

function runCliTimed(args) {
  const cli = path.resolve(__dirname, 'linxtrace_cli.js');
  const start = nowNs();
  const out = spawnSync('node', [cli, ...args], { encoding: 'utf8' });
  const elapsedMs = Number(nowNs() - start) / 1e6;
  if (out.status !== 0) {
    process.stdout.write(out.stdout || '');
    process.stderr.write(out.stderr || '');
    fail(`linxtrace_cli failed args=${args.join(' ')} status=${out.status || 1}`);
  }
  return { elapsedMs, stdout: out.stdout || '' };
}

function parsePerfLog(perfLogPath, tracePath) {
  if (!perfLogPath || !fs.existsSync(perfLogPath)) {
    return null;
  }
  const lines = fs.readFileSync(perfLogPath, 'utf8').split('\n');
  let bestOpen = null;
  let bestPaint = null;
  for (const raw of lines) {
    const idx = raw.indexOf('[LCS_PERF]');
    if (idx < 0) continue;
    const jsonPart = raw.slice(idx + '[LCS_PERF]'.length).trim();
    if (!jsonPart) continue;
    let rec = null;
    try {
      rec = JSON.parse(jsonPart);
    } catch {
      continue;
    }
    if (!rec || String(rec.kind || '') !== 'linxtrace_perf') continue;
    if (path.resolve(String(rec.trace_path || '')) !== tracePath) continue;
    if (String(rec.event || '') === 'trace_session_ready' && Number.isFinite(Number(rec.open_to_ready_ms))) {
      bestOpen = Number(rec.open_to_ready_ms);
    }
    if (String(rec.event || '') === 'trace_first_occ_paint' && Number.isFinite(Number(rec.open_to_first_paint_ms))) {
      bestPaint = Number(rec.open_to_first_paint_ms);
    }
  }
  if (bestOpen === null || bestPaint === null) {
    return null;
  }
  return { openMs: bestOpen, firstPaintMs: bestPaint, source: `perf-log:${perfLogPath}` };
}

function main() {
  const { trace, openMs: openSlo, firstPaintMs: paintSlo, perfLog } = parseArgs(process.argv);
  if (!fs.existsSync(trace)) {
    fail(`missing trace: ${trace}`, 2);
  }

  let measured = parsePerfLog(perfLog, trace);
  if (!measured) {
    // CLI timing fallback when app perf log isn't provided.
    const openStep = runCliTimed(['lint', trace]);
    const paintStep = runCliTimed(['render-check', trace]);
    measured = { openMs: openStep.elapsedMs, firstPaintMs: paintStep.elapsedMs, source: 'cli-fallback' };
  }

  const result = {
    trace,
    source: measured.source,
    open_ms: Number(measured.openMs.toFixed(3)),
    first_paint_ms: Number(measured.firstPaintMs.toFixed(3)),
    thresholds: { open_ms: openSlo, first_paint_ms: paintSlo },
    ok: measured.openMs < openSlo && measured.firstPaintMs < paintSlo,
  };
  console.log(JSON.stringify(result));
  if (!result.ok) {
    fail(
      `trace_open_slo failed: open_ms=${result.open_ms} (limit=${openSlo}), `
      + `first_paint_ms=${result.first_paint_ms} (limit=${paintSlo})`,
    );
  }
}

main();
