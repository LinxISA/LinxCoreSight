#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

function nowNs() {
  return process.hrtime.bigint();
}

function runCli(args) {
  const cli = path.resolve(__dirname, 'linxtrace_cli.js');
  const start = nowNs();
  const out = spawnSync('node', [cli, ...args], { encoding: 'utf8' });
  const elapsedMs = Number(nowNs() - start) / 1e6;
  return { out, elapsedMs };
}

if (process.argv.length < 3) {
  console.error('usage: node scripts/trace_perf_check.js <trace.linxtrace.jsonl> [--meta <meta.json>] [--max-ms <n>]');
  process.exit(2);
}

const rawArgs = process.argv.slice(2);
let maxMs = Number.POSITIVE_INFINITY;
const args = [];
for (let i = 0; i < rawArgs.length; i += 1) {
  if (rawArgs[i] === '--max-ms' && i + 1 < rawArgs.length) {
    maxMs = Number(rawArgs[i + 1]);
    i += 1;
  } else {
    args.push(rawArgs[i]);
  }
}

const schema = runCli(['schema-check', ...args]);
if (schema.out.status !== 0) {
  process.stdout.write(schema.out.stdout || '');
  process.stderr.write(schema.out.stderr || '');
  process.exit(schema.out.status || 1);
}

const stats = runCli(['stats', ...args]);
if (stats.out.status !== 0) {
  process.stdout.write(stats.out.stdout || '');
  process.stderr.write(stats.out.stderr || '');
  process.exit(stats.out.status || 1);
}

const lint = runCli(['lint', ...args]);
if (lint.out.status !== 0) {
  process.stdout.write(lint.out.stdout || '');
  process.stderr.write(lint.out.stderr || '');
  process.exit(lint.out.status || 1);
}

const totalMs = schema.elapsedMs + stats.elapsedMs + lint.elapsedMs;
console.log(`perf-ok schema_ms=${schema.elapsedMs.toFixed(1)} stats_ms=${stats.elapsedMs.toFixed(1)} lint_ms=${lint.elapsedMs.toFixed(1)} total_ms=${totalMs.toFixed(1)}`);
if (Number.isFinite(maxMs) && totalMs > maxMs) {
  console.error(`perf gate failed: total_ms=${totalMs.toFixed(1)} > max_ms=${maxMs}`);
  process.exit(1);
}

