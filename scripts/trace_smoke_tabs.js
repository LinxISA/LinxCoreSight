#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

if (process.argv.length < 4) {
  console.error('usage: node scripts/trace_smoke_tabs.js <trace1> <trace2> [trace3 ...]');
  process.exit(2);
}

const cli = path.resolve(__dirname, 'trace_lint.js');
for (const tracePath of process.argv.slice(2)) {
  const out = spawnSync('node', [cli, tracePath], { stdio: 'inherit' });
  if (out.status !== 0) {
    process.exit(out.status || 1);
  }
}
console.log(`smoke-tabs-ok count=${process.argv.length - 2}`);

