# LinxCoreSight

LinxCoreSight is a renderer-only desktop viewer for **LinxTrace v1**.

## Scope

- Opens `*.linxtrace.jsonl` with required sidecar `*.linxtrace.meta.json`.
- Renders pipeline occupancy strictly from explicit `OCC` events.
- Performs strict schema/contract checks before drawing.
- Fails fast on malformed traces (no silent blank pipeline pane).
- Supports multi-file tabbed viewing (lazy active-tab loading).
- Uses streaming trace sessions for large traces with viewport-based rendering.
- Includes Konata-style interaction controls (zoom-anchor, drag-pan, keyboard navigation, hover details).

## Trace Contract

- Format: `linxtrace.v1`
- Event stream: JSONL (`OP_DEF`, `LABEL`, `OCC`, `RETIRE`, `BLOCK_EVT`, `XCHECK`)
- Sidecar metadata: stage/lane/row catalogs + `contract_id`

## Run

```bash
cd /Users/zhoubot/LinxCoreSight
npm install
npm run dev
```

## Build

```bash
cd /Users/zhoubot/LinxCoreSight
npm run build
```

## Open from LinxCore

```bash
bash /Users/zhoubot/LinxCore/tools/linxcoresight/run_linxtrace.sh <program.memh> [max_commits]
bash /Users/zhoubot/LinxCore/tools/linxcoresight/open_linxcoresight.sh <trace.linxtrace.jsonl>
```

## CLI Diagnostics

```bash
cd /Users/zhoubot/LinxCoreSight
node scripts/linxtrace_cli.js lint /path/to/trace.linxtrace.jsonl
node scripts/linxtrace_cli.js stats /path/to/trace.linxtrace.jsonl
node scripts/linxtrace_cli.js schema-check /path/to/trace.linxtrace.jsonl
node scripts/linxtrace_cli.js first-failure /path/to/trace.linxtrace.jsonl
node scripts/linxtrace_cli.js render-check /path/to/trace.linxtrace.jsonl
node scripts/trace_lint.js /path/to/trace.linxtrace.jsonl
node scripts/trace_perf_check.js /path/to/trace.linxtrace.jsonl --max-ms 5000
```

`render-check` is a renderer diagnostics command; it flags issues like legacy canvas-height overflow risk and lifecycle anomalies.

## UI/Perf Docs

- Shortcuts: `/Users/zhoubot/LinxCoreSight/docs/ui/shortcuts.md`
- Large trace targets: `/Users/zhoubot/LinxCoreSight/docs/perf/large_trace_targets.md`
- Debug workflow: `/Users/zhoubot/LinxCoreSight/docs/trace/linxcoresight_debug_workflow.md`

## Skills

Canonical skill for this IDE:
- `/Users/zhoubot/.codex/skills/linxcoresight-ide/SKILL.md`

Backward-compatible alias:
- `/Users/zhoubot/.codex/skills/linx-konata-pipeview/SKILL.md`
