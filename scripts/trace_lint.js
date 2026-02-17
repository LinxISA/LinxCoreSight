#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

function run(args) {
  const cli = path.resolve(__dirname, 'linxtrace_cli.js');
  const out = spawnSync('node', [cli, ...args], { stdio: 'inherit' });
  if (out.status !== 0) {
    process.exit(out.status || 1);
  }
}

if (process.argv.length < 3) {
  console.error('usage: node scripts/trace_lint.js <trace.linxtrace.jsonl> [--meta <meta.json>]');
  process.exit(2);
}

const args = process.argv.slice(2);
run(['schema-check', ...args]);
run(['lint', ...args]);

