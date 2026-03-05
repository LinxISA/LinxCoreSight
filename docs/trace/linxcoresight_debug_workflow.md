# LinxCoreSight Debug Workflow

This is the canonical workflow to debug LinxCoreSight trace and rendering issues.

## 1) Validate trace contract first

```bash
cd /Users/zhoubot/LinxCoreSight
npm run trace:lint -- <trace.linxtrace>
```

If this fails, fix trace generation/schema before touching renderer code.

## 2) Locate first bad event

```bash
npm run linxtrace:first-failure -- <trace.linxtrace>
```

This prints the exact line and reason for the first structural/lifecycle failure.

## 3) Run renderer diagnostics

```bash
npm run linxtrace:render-check -- <trace.linxtrace>
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
npm run build:install
```

Install app (automatic via `build:install`) or manually copy:
- `/Users/zhoubot/LinxCoreSight/release/mac-arm64/LinxCoreSight.app` -> `/Applications/LinxCoreSight.app`

Smoke launch:
- `open -na /Applications/LinxCoreSight.app --args <trace.linxtrace>`

## 6) UI snapshot diagnostics (white-screen / blank pane)

```bash
LCS_UI_SNAPSHOT=1 /Applications/LinxCoreSight.app/Contents/MacOS/LinxCoreSight <trace.linxtrace>
# or
open -na /Applications/LinxCoreSight.app --args --ui-snapshot <trace.linxtrace>
```

Inspect:
- `$HOME/Library/Logs/linxcoresight/main.log`
- Look for `Renderer DOM snapshot` and verify non-zero canvas count and sane dimensions.

## 7) CLI control injection (keyboard + snapshot)

Use CLI actions to drive navigation and snapshot without manual typing:

```bash
cd /Users/zhoubot/LinxCoreSight
npm run linxtrace:control -- down --repeat 5 --delay-ms 40
npm run linxtrace:control -- right --repeat 3 --delay-ms 40
npm run linxtrace:control -- snap
```

Actions:
- `up`, `down`, `left`, `right`: inject arrow key events to LinxCoreSight.
- `snap`: inject `F8` (wired to `requestUiSnapshot`).

Note:
- macOS requires Accessibility permission for Terminal/Node to send keystrokes.
