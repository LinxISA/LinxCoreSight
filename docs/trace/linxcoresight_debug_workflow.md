# LinxCoreSight Debug Workflow

This is the canonical workflow to debug LinxCoreSight trace and rendering issues.

## 1) Validate trace contract first

```bash
cd /Users/zhoubot/LinxCoreSight
npm run trace:lint -- <trace.linxtrace.jsonl>
```

If this fails, fix trace generation/schema before touching renderer code.

## 2) Locate first bad event

```bash
npm run linxtrace:first-failure -- <trace.linxtrace.jsonl>
```

This prints the exact line and reason for the first structural/lifecycle failure.

## 3) Run renderer diagnostics

```bash
npm run linxtrace:render-check -- <trace.linxtrace.jsonl>
```

Use this to catch renderer risk patterns (for example legacy canvas-height assumptions).

## 4) Reproduce in app and inspect handlers

Focus files:
- `/Users/zhoubot/LinxCoreSight/src/components/LinxTraceViewer.tsx`
- `/Users/zhoubot/LinxCoreSight/src/components/trace/TraceCanvasView.tsx`
- `/Users/zhoubot/LinxCoreSight/src/components/trace/TraceHoverCard.tsx`
- `/Users/zhoubot/LinxCoreSight/src/lib/linxtrace.ts`
- `/Users/zhoubot/LinxCoreSight/src/workers/traceIndex.worker.ts`

Checklist:
- tab/session state transitions are race-free
- viewport query ranges match current scroll/zoom
- hover row/cycle map uses active viewport data only
- draw loop is virtualized and does not allocate giant canvases

## 5) Verify and package

```bash
npm run typecheck
npm run build:vite
npm run build
```

Install app:
- copy `/Users/zhoubot/LinxCoreSight/release/mac-arm64/LinxCoreSight.app` to `/Applications/LinxCoreSight.app`

Smoke launch:
- `open -na /Applications/LinxCoreSight.app --args <trace.linxtrace.jsonl>`

