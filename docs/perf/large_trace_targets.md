# Large Trace Targets

## Primary Target
- Workload class: LinxTrace v1 files with up to `10M` OCC events.
- Host budget: `8GB` RAM developer workstation.
- Viewer policy: lazy tabs, only active tab is fully loaded.

## Responsiveness Gates
- Initial meta/schema load: `< 1s` on local SSD.
- Active-tab trace open (stream parse + index): bounded by file size, UI remains responsive.
- Scroll/pan redraw latency: keep interaction fluid under normal zoom windows.
- Hover lookup: O(1) cell lookup in viewport map.

## Architecture
- Streaming reader via Electron trace session IPC (`trace:openSession/readChunk/closeSession`).
- Worker-side incremental parser + row/cycle indexes.
- Viewport query rendering (rows + cycle range only), no full-scene draw.
- Adaptive dense mode when viewport event count exceeds draw threshold.

## Guardrails
- No silent blank panel:
  - if rows exist but viewport has zero drawable OCC events, render strict error overlay.
- Strict schema contract:
  - reject files with invalid stage/lane/row references.

