import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LinxTraceSessionSummary, LinxTraceViewportModel } from '../../lib/linxtrace';
import type { ViewportEvent, ViewportRow } from '../../lib/traceProtocol';
import type { TraceViewState } from '../../store/traceTabsStore';
import type { ThemeSpec } from '../../styles/traceThemes';
import { clamp, tokenizeLabel } from '../../styles/traceThemes';
import type { ObjdumpAssemblyMap } from '../../lib/linxtraceAssembly';
import { resolveAssemblyLabel } from '../../lib/linxtraceAssembly';
import type { HoverInfo } from './TraceHoverCard';

export const ROW_H = 22;
export const HEADER_H = 24;
export const MIN_LEFT_W = 280;
export const MAX_LEFT_W = 860;
const MAX_VIRTUAL_SCROLL_PX = 4_000_000;
const MAX_QUERY_EVENTS = 80_000;
const DENSE_MODE_EVENTS = 60_000;

type TraceCanvasViewProps = {
  tabId: string;
  summary: LinxTraceSessionSummary;
  theme: ThemeSpec;
  stageColorsOverride: Record<string, string>;
  assemblyMap?: ObjdumpAssemblyMap;
  leftPaneFolded: boolean;
  viewState: TraceViewState;
  onViewStateChange: (patch: Partial<TraceViewState>) => void;
  queryViewport: (req: {
    rowStart: number;
    rowEnd: number;
    cycleStart: number;
    cycleEnd: number;
    hideFlushed: boolean;
    maxEvents: number;
  }) => Promise<LinxTraceViewportModel>;
  onHoverChange: (hover: HoverInfo | null, row: ViewportRow | null) => void;
  onSelectionChange: (hover: HoverInfo | null, row: ViewportRow | null) => void;
  onFirstOccPaint?: (payload: { tabId: string; occInViewport: number; rowsInViewport: number }) => void;
  spacePan: boolean;
};

type SelectedCell = {
  rowId: number;
  cycle: number;
  stageId?: string;
  laneId?: string;
};

function eventCellKey(rowId: number, cycle: number): string {
  return `${rowId}:${cycle}`;
}

function logicalToVirtual(logical: number, logicalMax: number, virtualMax: number): number {
  if (logicalMax <= 0 || virtualMax <= 0) return 0;
  return clamp((logical / logicalMax) * virtualMax, 0, virtualMax);
}

function virtualToLogical(virtual: number, logicalMax: number, virtualMax: number): number {
  if (logicalMax <= 0 || virtualMax <= 0) return 0;
  return clamp((virtual / virtualMax) * logicalMax, 0, logicalMax);
}

export function TraceCanvasView(props: TraceCanvasViewProps): JSX.Element {
  const {
    tabId,
    summary,
    theme,
    stageColorsOverride,
    assemblyMap,
    leftPaneFolded,
    viewState,
    onViewStateChange,
    queryViewport,
    onHoverChange,
    onSelectionChange,
    onFirstOccPaint,
    spacePan,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tokenCacheRef = useRef<Map<string, ReturnType<typeof tokenizeLabel>>>(new Map());
  const dragRef = useRef<{ active: boolean; x: number; y: number; offsetX: number; scrollTopVirtual: number }>({
    active: false,
    x: 0,
    y: 0,
    offsetX: 0,
    scrollTopVirtual: 0,
  });
  const splitterDragRef = useRef<{ active: boolean; x: number; w: number }>({ active: false, x: 0, w: viewState.leftPaneWidth });
  const reqSeqRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const firstOccPaintSentRef = useRef<boolean>(false);
  const keyThrottleRef = useRef<number>(0);
  const queryDebounceRef = useRef<number | null>(null);
  const queryViewportRef = useRef(queryViewport);
  
  // Cache for query results - avoids re-querying when viewport hasn't meaningfully changed
  const queryCacheRef = useRef<{
    key: string;
    rows: ViewportRow[];
    events: ViewportEvent[];
    totalRows: number;
    truncated: boolean;
  } | null>(null);

  const [zoom, setZoom] = useState<number>(viewState.zoom);
  const [offsetX, setOffsetX] = useState<number>(viewState.offsetX);
  const [leftPaneWidth, setLeftPaneWidth] = useState<number>(viewState.leftPaneWidth);
  const [hideFlushed, setHideFlushed] = useState<boolean>(viewState.hideFlushed);
  const [scrollYLogical, setScrollYLogical] = useState<number>(viewState.scrollY);
  const [scrollYVirtual, setScrollYVirtual] = useState<number>(0);
  const [viewportWidth, setViewportWidth] = useState<number>(1280);
  const [viewportHeight, setViewportHeight] = useState<number>(800);
  const [selectedRowId, setSelectedRowId] = useState<number>(-1);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);

  const [queryLoading, setQueryLoading] = useState<boolean>(false);
  const [queryError, setQueryError] = useState<string>('');
  const [drawableError, setDrawableError] = useState<string>('');
  const [emptyQueryStreak, setEmptyQueryStreak] = useState<number>(0);
  const emptyQueryStreakRef = useRef<number>(0);
  const [rowWindowStart, setRowWindowStart] = useState<number>(0);
  const [visibleRows, setVisibleRows] = useState<ViewportRow[]>([]);
  const [visibleEvents, setVisibleEvents] = useState<ViewportEvent[]>([]);
  const [totalRows, setTotalRows] = useState<number>(summary.totalRows);
  const [truncatedEvents, setTruncatedEvents] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const rulerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const effectiveLeftPaneWidth = leftPaneFolded ? 56 : leftPaneWidth;

  const applyEmptyViewportFlag = useCallback((emptyNow: boolean) => {
    const next = emptyNow ? (emptyQueryStreakRef.current + 1) : 0;
    emptyQueryStreakRef.current = next;
    setEmptyQueryStreak(next);
    if (!emptyNow) {
      setDrawableError('');
      return;
    }
    setDrawableError(
      next >= 2
        ? 'no drawable OCC events for 2 consecutive viewport queries; run trace:lint/render-check'
        : 'no drawable OCC events in current viewport (strict guard)',
    );
  }, []);

  useEffect(() => {
    queryViewportRef.current = queryViewport;
  }, [queryViewport]);

  const cycleWidth = Math.max(3, Math.floor(8 * zoom));
  const tickStepCycle = useMemo(() => {
    // Keep ruler readable while preserving exact cycle-box alignment.
    // At high zoom, one tick per cycle (box).
    const targetPx = 12;
    const raw = Math.max(1, Math.round(targetPx / Math.max(1, cycleWidth)));
    const allowed = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
    for (const s of allowed) {
      if (s >= raw) return s;
    }
    return 500;
  }, [cycleWidth]);
  const majorTickStepCycle = useMemo(() => {
    if (tickStepCycle <= 1) return 5;
    if (tickStepCycle <= 2) return 10;
    if (tickStepCycle <= 5) return 25;
    if (tickStepCycle <= 10) return 50;
    if (tickStepCycle <= 20) return 100;
    if (tickStepCycle <= 25) return 125;
    if (tickStepCycle <= 50) return 250;
    return 500;
  }, [tickStepCycle]);
  const cycleRange = useMemo(
    () => ({
      start: summary.minCycle,
      end: summary.maxCycle + 1,
    }),
    [summary.maxCycle, summary.minCycle],
  );

  const logicalContentHeight = useMemo(
    () => Math.max(HEADER_H + totalRows * ROW_H + 1, viewportHeight + 1),
    [totalRows, viewportHeight],
  );
  const virtualContentHeight = useMemo(
    () => clamp(logicalContentHeight, viewportHeight + 1, MAX_VIRTUAL_SCROLL_PX),
    [logicalContentHeight, viewportHeight],
  );
  const logicalMaxScroll = useMemo(
    () => Math.max(0, logicalContentHeight - viewportHeight),
    [logicalContentHeight, viewportHeight],
  );
  const virtualMaxScroll = useMemo(
    () => Math.max(0, virtualContentHeight - viewportHeight),
    [virtualContentHeight, viewportHeight],
  );

  const maxOffsetX = useMemo(() => {
    const logicalW = Math.max(0, (cycleRange.end - cycleRange.start) * cycleWidth);
    const viewportPipelineW = Math.max(0, viewportWidth - effectiveLeftPaneWidth - 2);
    return Math.max(0, logicalW - viewportPipelineW);
  }, [cycleRange.end, cycleRange.start, cycleWidth, viewportWidth, effectiveLeftPaneWidth]);

  const rulerWidth = useMemo(
    () => Math.max(1, Math.floor(viewportWidth - effectiveLeftPaneWidth)),
    [viewportWidth, effectiveLeftPaneWidth],
  );

  // Memoize stage colors to avoid repeated lookups
  const stageColors = useMemo(() => stageColorsOverride || {}, [stageColorsOverride]);

  useEffect(() => {
    setZoom(viewState.zoom);
    setOffsetX(viewState.offsetX);
    setLeftPaneWidth(viewState.leftPaneWidth);
    setHideFlushed(viewState.hideFlushed);
    setScrollYLogical(viewState.scrollY);
    setSelectedRowId(-1);
    setSelectedCell(null);
    tokenCacheRef.current.clear();
    firstOccPaintSentRef.current = false;
  }, [tabId, viewState.zoom, viewState.offsetX, viewState.leftPaneWidth, viewState.hideFlushed, viewState.scrollY]);

  useEffect(() => {
    tokenCacheRef.current.clear();
  }, [assemblyMap, theme]);

  useEffect(() => {
    if (offsetX > maxOffsetX) setOffsetX(maxOffsetX);
  }, [offsetX, maxOffsetX]);

  useEffect(() => {
    if (scrollYLogical > logicalMaxScroll) {
      setScrollYLogical(logicalMaxScroll);
    }
  }, [scrollYLogical, logicalMaxScroll]);

  // Update container cursor based on spacePan and drag state
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (dragRef.current.active) {
      el.style.cursor = 'grabbing';
    } else if (spacePan) {
      el.style.cursor = 'grab';
    } else {
      el.style.cursor = 'default';
    }
  }, [spacePan]);

  // Auto-focus container when clicked to enable keyboard navigation
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Ensure active tab captures keyboard navigation immediately.
    const t = window.setTimeout(() => {
      el.focus();
    }, 0);
    const handleClick = () => {
      el.focus();
    };
    el.addEventListener('click', handleClick);
    return () => {
      window.clearTimeout(t);
      el.removeEventListener('click', handleClick);
    };
  }, [tabId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      onViewStateChange({ zoom, offsetX, leftPaneWidth, hideFlushed, scrollY: scrollYLogical });
    }, 90);
    return () => {
      window.clearTimeout(t);
    };
  }, [zoom, offsetX, leftPaneWidth, hideFlushed, scrollYLogical, onViewStateChange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const targetVirtual = logicalToVirtual(scrollYLogical, logicalMaxScroll, virtualMaxScroll);
    const delta = Math.abs(el.scrollTop - targetVirtual);
    if (delta > 0.5) {
      el.scrollTop = targetVirtual;
    }
  }, [tabId, scrollYLogical, logicalMaxScroll, virtualMaxScroll]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let ticking = false;
    const update = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        setViewportWidth(el.clientWidth);
        setViewportHeight(el.clientHeight);
        const v = el.scrollTop;
        setScrollYVirtual(v);
        setScrollYLogical(virtualToLogical(v, logicalMaxScroll, virtualMaxScroll));
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, [tabId, logicalMaxScroll, virtualMaxScroll]);

  const rowWindow = useMemo(() => {
    const start = Math.max(0, Math.floor((scrollYLogical - HEADER_H) / ROW_H) - 6);
    const rowsVisible = Math.ceil((viewportHeight + 2 * ROW_H) / ROW_H) + 12;
    const end = Math.max(start + 1, start + rowsVisible);
    return { start, end };
  }, [scrollYLogical, viewportHeight]);

  const cycleWindow = useMemo(() => {
    const span = Math.max(1, viewportWidth - effectiveLeftPaneWidth);
    const cycleStart = cycleRange.start + Math.floor(offsetX / cycleWidth) - 2;
    const cycleEnd = cycleRange.start + Math.ceil((offsetX + span) / cycleWidth) + 2;
    return { start: Math.max(cycleRange.start, cycleStart), end: Math.min(cycleRange.end, cycleEnd) };
  }, [viewportWidth, effectiveLeftPaneWidth, cycleRange.start, cycleRange.end, offsetX, cycleWidth]);

  // Cache key for viewport query - only changes when viewport actually changes
  const viewportCacheKey = useMemo(() =>
    `${rowWindow.start}-${rowWindow.end}-${cycleWindow.start}-${cycleWindow.end}-${hideFlushed}`,
    [rowWindow.start, rowWindow.end, cycleWindow.start, cycleWindow.end, hideFlushed]
  );

  useEffect(() => {
    // Check cache first - if viewport hasn't changed, skip query
    if (queryCacheRef.current && queryCacheRef.current.key === viewportCacheKey) {
      // Use cached data - no need to re-query
      setTotalRows(queryCacheRef.current.totalRows);
      setRowWindowStart(rowWindow.start);
      setVisibleRows(queryCacheRef.current.rows);
      setVisibleEvents(queryCacheRef.current.events);
      setTruncatedEvents(queryCacheRef.current.truncated);
      const emptyNow = queryCacheRef.current.rows.length > 0 && queryCacheRef.current.events.length === 0;
      applyEmptyViewportFlag(emptyNow);
      return;
    }
    
    // Debounce query to avoid overwhelming worker during rapid scrolling
    if (queryDebounceRef.current) {
      clearTimeout(queryDebounceRef.current);
    }
    const debounceMs = visibleRows.length === 0 ? 0 : 20;
    queryDebounceRef.current = window.setTimeout(() => {
      queryDebounceRef.current = null;
      let canceled = false;
      // Always increment seq to cancel any pending query - this ensures latest scroll position is queried
      const seq = ++reqSeqRef.current;
      setQueryLoading(true);
      setQueryError('');
      queryViewportRef.current({
      rowStart: rowWindow.start,
      rowEnd: rowWindow.end,
      cycleStart: cycleWindow.start,
      cycleEnd: cycleWindow.end,
      hideFlushed,
      maxEvents: MAX_QUERY_EVENTS,
    })
      .then(async (resp) => {
        if (canceled || seq !== reqSeqRef.current) return;

        let finalResp = resp;
        // Fallback query: if current cycle-window yields no OCC for visible rows,
        // fetch the full cycle range once to avoid false "blank pipeline" windows.
        if (resp.rows.length > 0 && resp.events.length === 0) {
          try {
            const fb = await queryViewportRef.current({
              rowStart: rowWindow.start,
              rowEnd: rowWindow.end,
              cycleStart: summary.minCycle,
              cycleEnd: summary.maxCycle + 1,
              hideFlushed,
              maxEvents: MAX_QUERY_EVENTS,
            });
            if (!canceled && seq === reqSeqRef.current && fb.events.length > 0) {
              finalResp = fb;
            }
          } catch {
            // keep original response on fallback failure
          }
        }

        // Cache the result
        queryCacheRef.current = {
          key: viewportCacheKey,
          rows: finalResp.rows,
          events: finalResp.events,
          totalRows: finalResp.totalRows,
          truncated: finalResp.truncated,
        };

        setTotalRows(finalResp.totalRows);
        setRowWindowStart(rowWindow.start);
        setVisibleRows(finalResp.rows);
        setVisibleEvents(finalResp.events);
        setTruncatedEvents(finalResp.truncated);
        const emptyNow = finalResp.rows.length > 0 && finalResp.events.length === 0;
        applyEmptyViewportFlag(emptyNow);
      })
      .catch((err) => {
        if (canceled || seq !== reqSeqRef.current) return;
        setQueryError(String(err));
      })
      .finally(() => {
        if (canceled || seq !== reqSeqRef.current) return;
        setQueryLoading(false);
      });
    }, debounceMs); // keep viewport fetch responsive during scroll
    return () => {
      if (queryDebounceRef.current) {
        clearTimeout(queryDebounceRef.current);
      }
    };
  }, [rowWindow.start, rowWindow.end, cycleWindow.start, cycleWindow.end, hideFlushed, viewportCacheKey, applyEmptyViewportFlag]);

  useEffect(() => {
    const el = rulerCanvasRef.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;

    const w = rulerWidth;
    const h = HEADER_H;
    if (!Number.isFinite(w) || w <= 0) return;

    if (el.width !== w) el.width = w;
    if (el.height !== h) el.height = h;

    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, theme.toolbarBg);
    grad.addColorStop(1, theme.leftPaneBg);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = theme.toolbarBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - 0.5);
    ctx.lineTo(w, h - 0.5);
    ctx.stroke();
    ctx.fillStyle = theme.syntax.address;
    ctx.font = '10px SFMono-Regular, Consolas, Menlo, monospace';

    const cycleLo = Math.max(cycleRange.start, cycleRange.start + Math.floor(offsetX / cycleWidth) - majorTickStepCycle);
    const cycleHi = Math.min(cycleRange.end, cycleRange.start + Math.ceil((offsetX + w) / cycleWidth) + majorTickStepCycle);
    const firstTick = Math.floor(cycleLo / tickStepCycle) * tickStepCycle;
    let lastLabelX = -1_000_000;
    for (let c = firstTick; c <= cycleHi; c += tickStepCycle) {
      const x = Math.floor((c - cycleRange.start) * cycleWidth - offsetX);
      if (x < 0 || x > w) continue;
      const isMajor = c % majorTickStepCycle === 0;
      const isMid = !isMajor && c % Math.max(10, tickStepCycle * 2) === 0;
      const tickTop = isMajor ? 3 : (isMid ? 8 : 13);
      ctx.strokeStyle = isMajor ? theme.syntax.address : (isMid ? `${theme.syntax.address}AA` : `${theme.syntax.address}55`);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, tickTop);
      ctx.lineTo(x + 0.5, HEADER_H);
      ctx.stroke();
      if (isMajor && (x - lastLabelX) >= 40) {
        ctx.fillText(String(c), x + 2, 10);
        lastLabelX = x;
      }
    }

    if (selectedCell && selectedCell.cycle >= cycleRange.start && selectedCell.cycle <= cycleRange.end) {
      const sx = Math.floor((selectedCell.cycle - cycleRange.start) * cycleWidth - offsetX);
      if (sx >= 0 && sx <= w) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx + 0.5, 0);
        ctx.lineTo(sx + 0.5, HEADER_H);
        ctx.stroke();
        const label = `${selectedCell.cycle}`;
        const tw = Math.ceil(ctx.measureText(label).width) + 8;
        const tx = clamp(sx - Math.floor(tw / 2), 0, Math.max(0, w - tw));
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(tx, 12, tw, 11);
        ctx.strokeStyle = theme.toolbarBorder;
        ctx.strokeRect(tx + 0.5, 12.5, tw - 1, 10);
        ctx.fillStyle = '#0B1220';
        ctx.fillText(label, tx + 4, 21);
      }
    }
  }, [rulerWidth, theme, cycleRange.start, cycleRange.end, cycleWidth, offsetX, tickStepCycle, majorTickStepCycle, selectedCell]);

  const rowByGlobalIndex = useMemo(() => {
    const map = new Map<number, ViewportRow>();
    visibleRows.forEach((row, i) => map.set(rowWindowStart + i, row));
    return map;
  }, [visibleRows, rowWindowStart]);

  const rowIndexByRowId = useMemo(() => {
    const map = new Map<number, number>();
    visibleRows.forEach((row, i) => map.set(row.rowId, rowWindowStart + i));
    return map;
  }, [visibleRows, rowWindowStart]);

  const hoverMap = useMemo(() => {
    if (visibleEvents.length > DENSE_MODE_EVENTS) {
      return new Map<string, ViewportEvent[]>();
    }
    const map = new Map<string, ViewportEvent[]>();
    for (const evt of visibleEvents) {
      const key = eventCellKey(evt.rowId, evt.cycle);
      const arr = map.get(key);
      if (arr) {
        arr.push(evt);
      } else {
        map.set(key, [evt]);
      }
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.virtualSlot || 0) - (b.virtualSlot || 0));
    }
    return map;
  }, [visibleEvents]);

  const findEventsAt = useCallback((rowId: number, cycle: number): ViewportEvent[] => {
    const quick = hoverMap.get(eventCellKey(rowId, cycle));
    if (quick && quick.length > 0) return quick;
    const out: ViewportEvent[] = [];
    for (const evt of visibleEvents) {
      if (evt.rowId === rowId && evt.cycle === cycle) out.push(evt);
    }
    out.sort((a, b) => (a.virtualSlot || 0) - (b.virtualSlot || 0));
    return out;
  }, [hoverMap, visibleEvents]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = containerRef.current;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setDrawableError('canvas 2d context unavailable');
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(parent.getBoundingClientRect().width));
    const drawHeight = Math.max(32, Math.floor(parent.getBoundingClientRect().height));

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(drawHeight * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${drawHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = theme.baseBg;
    ctx.fillRect(0, 0, width, drawHeight);

    ctx.fillStyle = theme.leftPaneBg;
    ctx.fillRect(0, 0, effectiveLeftPaneWidth, drawHeight);
    ctx.fillStyle = theme.pipelineBg;
    ctx.fillRect(effectiveLeftPaneWidth + 1, 0, width - effectiveLeftPaneWidth - 1, drawHeight);

    const stripeW = cycleWidth * 4;
    if (stripeW > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(effectiveLeftPaneWidth + 1, HEADER_H, Math.max(0, width - effectiveLeftPaneWidth - 1), Math.max(0, drawHeight - HEADER_H));
      ctx.clip();
      ctx.fillStyle = theme.stripeOverlay;
      const logicalW = Math.max(0, width - effectiveLeftPaneWidth - 2);
      const base = (offsetX % (stripeW * 2));
      for (let x = effectiveLeftPaneWidth + 1 - base; x < effectiveLeftPaneWidth + logicalW; x += stripeW * 2) {
        ctx.fillRect(x, HEADER_H, stripeW, drawHeight - HEADER_H);
      }
      ctx.restore();
    }

    ctx.strokeStyle = theme.toolbarBorder;
    ctx.beginPath();
    ctx.moveTo(effectiveLeftPaneWidth + 0.5, 0);
    ctx.lineTo(effectiveLeftPaneWidth + 0.5, drawHeight);
    ctx.stroke();

    const denseMode = truncatedEvents || visibleEvents.length > DENSE_MODE_EVENTS;
    const denseSeen = denseMode ? new Set<string>() : null;

    // Pre-compute viewport bounds
    const rowEnd = Math.min(totalRows - 1, rowWindow.end);
    const visibleHeight = drawHeight;
    const headerY = HEADER_H;
    const scrollY = scrollYLogical;

    for (let globalIdx = rowWindow.start; globalIdx <= rowEnd; globalIdx += 1) {
      const row = rowByGlobalIndex.get(globalIdx);
      if (!row) continue;

      const y = Math.floor((headerY + globalIdx * ROW_H) - scrollY);
      if (y + ROW_H < headerY || y > visibleHeight) continue;

      const isBlock = row.rowKind === 'block';
      const isSelected = row.rowId === selectedRowId;

      if (globalIdx % 2 === 1) {
        ctx.fillStyle = theme.stripeOverlay;
        ctx.fillRect(effectiveLeftPaneWidth + 1, y, width - effectiveLeftPaneWidth - 1, ROW_H);
      }
      if (isSelected) {
        ctx.fillStyle = theme.selectedRowFill;
        ctx.fillRect(0, y, width, ROW_H);
      }
      if (isBlock) {
        ctx.strokeStyle = theme.blockBoxColor;
        ctx.lineWidth = 1.4;
        ctx.strokeRect(2.5, y + 1.5, effectiveLeftPaneWidth - 6, ROW_H - 3);
      }

      ctx.font = isBlock
        ? "12px SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace"
        : "11px SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace";
      const displayLabel = resolveAssemblyLabel(row.leftLabel, assemblyMap);
      const cacheKey = `${row.rowKind}|${displayLabel}`;
      let tokens = tokenCacheRef.current.get(cacheKey);
      if (!tokens) {
        tokens = tokenizeLabel(displayLabel, row.rowKind, theme);
        tokenCacheRef.current.set(cacheKey, tokens);
      }
      let curX = 8;
      if (!leftPaneFolded) {
        for (const tok of tokens) {
          ctx.fillStyle = tok.color;
          ctx.fillText(tok.text, curX, y + 15);
          curX += ctx.measureText(tok.text).width;
          if (curX > effectiveLeftPaneWidth - 8) break;
        }
      }
    }

    // Pre-compute values for event rendering
    const cycleStart = cycleRange.start;
    const laneStart = effectiveLeftPaneWidth + 1;
    const laneWidth = width;
    const minW = Math.max(1, cycleWidth - 1);
    const canShowLabel = cycleWidth >= 18 && !denseMode;
    const rowH = ROW_H;
    const header = HEADER_H;

    ctx.save();
    ctx.beginPath();
    ctx.rect(effectiveLeftPaneWidth + 1, HEADER_H, Math.max(0, width - effectiveLeftPaneWidth - 1), Math.max(0, drawHeight - HEADER_H));
    ctx.clip();
    for (const occ of visibleEvents) {
      const rowIdx = rowIndexByRowId.get(occ.rowId);
      if (rowIdx === undefined) continue;
      const y = Math.floor((header + rowIdx * rowH) - scrollY);
      if (y + rowH < header || y > visibleHeight) continue;

      const x = effectiveLeftPaneWidth + Math.floor((occ.cycle - cycleStart) * cycleWidth) - offsetX;
      if (x + minW < laneStart || x > laneWidth) continue;

      if (denseSeen) {
        const denseKey = `${occ.rowId}:${Math.floor((x - effectiveLeftPaneWidth) / 2)}:${occ.virtualSlot || 0}`;
        if (denseSeen.has(denseKey)) continue;
        denseSeen.add(denseKey);
      }

      const slotCount = Math.max(1, occ.virtualSlotCount || 1);
      const slot = Math.max(0, Math.min(slotCount - 1, occ.virtualSlot || 0));
      const innerTop = y + 2;
      const innerHeight = Math.max(2, rowH - 4);
      const slotHeight = Math.max(2, Math.floor(innerHeight / slotCount));
      const ySlot = innerTop + slot * slotHeight;
      const hSlot = slot === slotCount - 1
        ? Math.max(2, innerTop + innerHeight - ySlot)
        : Math.max(2, slotHeight - 1);

      const base = stageColors[occ.stageId] || '#9CA3AF';
      ctx.fillStyle = `${base}${occ.stall ? '88' : 'CC'}`;
      ctx.fillRect(x, ySlot, minW, hSlot);
      const cellSelected = selectedCell
        && occ.rowId === selectedCell.rowId
        && occ.cycle === selectedCell.cycle
        && (!selectedCell.stageId || occ.stageId === selectedCell.stageId)
        && (!selectedCell.laneId || occ.laneId === selectedCell.laneId);
      if (cellSelected) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(x - 0.5, ySlot - 0.5, minW + 1, hSlot + 1);
      }

      if (occ.stall && minW >= 4) {
        ctx.strokeStyle = '#7f1d1d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, ySlot + hSlot);
        ctx.lineTo(x + minW, ySlot);
        ctx.stroke();
      }
      if (canShowLabel && slotCount === 1 && hSlot >= 10) {
        ctx.fillStyle = '#0B1220';
        ctx.font = "10px SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace";
        ctx.fillText(occ.stageId, x + 2, ySlot + Math.min(12, hSlot));
      }
    }

    if (selectedCell && selectedCell.cycle >= cycleStart && selectedCell.cycle <= cycleRange.end) {
      const sx = effectiveLeftPaneWidth + Math.floor((selectedCell.cycle - cycleStart) * cycleWidth) - offsetX;
      if (sx >= (effectiveLeftPaneWidth + 1) && sx <= width) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx + 0.5, HEADER_H);
        ctx.lineTo(sx + 0.5, drawHeight);
        ctx.stroke();
      }
    }
    ctx.restore();

    if (queryError || drawableError) {
      ctx.fillStyle = theme.errorColor;
      ctx.font = "13px SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace";
      ctx.fillText(`ERROR: ${queryError || drawableError}`, 8, drawHeight - 8);
    }

    if (!firstOccPaintSentRef.current && visibleEvents.length > 0) {
      firstOccPaintSentRef.current = true;
      onFirstOccPaint?.({ tabId, occInViewport: visibleEvents.length, rowsInViewport: visibleRows.length });
    }
  }, [
    summary,
    theme,
    effectiveLeftPaneWidth,
    leftPaneFolded,
    cycleWidth,
    offsetX,
    totalRows,
    rowWindow.start,
    rowWindow.end,
    visibleRows,
    visibleEvents,
    rowByGlobalIndex,
    rowIndexByRowId,
    cycleRange.start,
    cycleRange.end,
    selectedRowId,
    selectedCell,
    zoom,
    truncatedEvents,
    queryError,
    drawableError,
    scrollYLogical,
    onFirstOccPaint,
    tabId,
  ]);

  const updateHover = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      onHoverChange(null, null);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const yViewport = clientY - rect.top;
    if (yViewport < HEADER_H) {
      onHoverChange(null, null);
      return;
    }
    const logicalY = yViewport + scrollYLogical;
    const rowIdxGlobal = Math.floor((logicalY - HEADER_H) / ROW_H);
    const row = rowByGlobalIndex.get(rowIdxGlobal) || null;
    if (!row) {
      onHoverChange(null, null);
      return;
    }
    if (x < effectiveLeftPaneWidth) {
      onHoverChange({ rowIdx: rowIdxGlobal, cycle: -1 }, row);
      return;
    }
    const cycle = cycleRange.start + Math.floor((x - effectiveLeftPaneWidth + offsetX) / cycleWidth);
    const hits = findEventsAt(row.rowId, cycle);
    const evt = hits.length > 0 ? hits[0] : undefined;
    onHoverChange(
      {
        rowIdx: rowIdxGlobal,
        cycle,
        stage: evt?.stageId,
        lane: evt?.laneId,
        cause: evt?.cause,
        hits: hits.map((h) => ({ stage: h.stageId, lane: h.laneId, cause: h.cause, stall: h.stall })),
      },
      row,
    );
  }, [onHoverChange, scrollYLogical, rowByGlobalIndex, effectiveLeftPaneWidth, cycleRange.start, offsetX, cycleWidth, findEventsAt]);

  const onMouseMove = useCallback((ev: React.MouseEvent<HTMLCanvasElement>) => {
    // Use requestAnimationFrame for smooth dragging
    if (dragRef.current.active && containerRef.current) {
      // Cancel any pending animation frame
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      
      // Schedule the state update on the next animation frame
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const dx = ev.clientX - dragRef.current.x;
        const dy = ev.clientY - dragRef.current.y;
        setOffsetX(clamp(dragRef.current.offsetX - dx, 0, maxOffsetX));
        containerRef.current!.scrollTop = clamp(dragRef.current.scrollTopVirtual - dy, 0, virtualMaxScroll);
      });
      return;
    }
    if (splitterDragRef.current.active) {
      const dx = ev.clientX - splitterDragRef.current.x;
      setLeftPaneWidth(clamp(splitterDragRef.current.w + dx, MIN_LEFT_W, MAX_LEFT_W));
      return;
    }
    updateHover(ev.clientX, ev.clientY);
  }, [maxOffsetX, virtualMaxScroll, updateHover]);

  const onMouseDown = useCallback((ev: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const yViewport = ev.clientY - rect.top;

    // Splitter drag
    if (!leftPaneFolded && Math.abs(x - effectiveLeftPaneWidth) <= 5) {
      splitterDragRef.current = { active: true, x: ev.clientX, w: leftPaneWidth };
      ev.preventDefault();
      return;
    }
    // Pan: middle mouse button OR space+left click
    if (ev.button === 1 || (ev.button === 0 && spacePan)) {
      if (containerRef.current) {
        dragRef.current = {
          active: true,
          x: ev.clientX,
          y: ev.clientY,
          offsetX,
          scrollTopVirtual: containerRef.current.scrollTop,
        };
        // Change cursor to grabbing
        if (containerRef.current) {
          containerRef.current.style.cursor = 'grabbing';
        }
      }
      ev.preventDefault();
      return;
    }
    // Left click selects row/stage.
    if (ev.button === 0 && yViewport >= HEADER_H) {
      const logicalY = yViewport + scrollYLogical;
      const rowIdxGlobal = Math.floor((logicalY - HEADER_H) / ROW_H);
      const row = rowByGlobalIndex.get(rowIdxGlobal);
      if (row) {
        setSelectedRowId(row.rowId);
        if (x >= effectiveLeftPaneWidth) {
          const cycle = cycleRange.start + Math.floor((x - effectiveLeftPaneWidth + offsetX) / cycleWidth);
          const hits = findEventsAt(row.rowId, cycle);
          const evt = hits.length > 0 ? hits[0] : undefined;
          if (evt) {
            setSelectedCell({ rowId: evt.rowId, cycle: evt.cycle, stageId: evt.stageId, laneId: evt.laneId });
            onSelectionChange(
              {
                rowIdx: rowIdxGlobal,
                cycle: evt.cycle,
                stage: evt.stageId,
                lane: evt.laneId,
                cause: evt.cause,
                hits: hits.map((h) => ({ stage: h.stageId, lane: h.laneId, cause: h.cause, stall: h.stall })),
              },
              row,
            );
          } else {
            setSelectedCell({ rowId: row.rowId, cycle });
            onSelectionChange({ rowIdx: rowIdxGlobal, cycle }, row);
          }
        } else {
          setSelectedCell(null);
          onSelectionChange({ rowIdx: rowIdxGlobal, cycle: -1 }, row);
        }
      }
      ev.preventDefault();
    }
  }, [
    leftPaneWidth,
    effectiveLeftPaneWidth,
    leftPaneFolded,
    spacePan,
    offsetX,
    scrollYLogical,
    rowByGlobalIndex,
    cycleRange.start,
    cycleWidth,
    findEventsAt,
    onSelectionChange,
  ]);

  const onMouseUp = useCallback(() => {
    // Cancel any pending animation frame
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    dragRef.current.active = false;
    splitterDragRef.current.active = false;
    // Reset cursor
    if (containerRef.current) {
      containerRef.current.style.cursor = spacePan ? 'grab' : 'default';
    }
  }, [spacePan]);

  useEffect(() => {
    const onWindowMouseUp = () => onMouseUp();
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => {
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, [onMouseUp]);

  const logicalDeltaToVirtual = useCallback((dLogical: number) => {
    if (logicalMaxScroll <= 0 || virtualMaxScroll <= 0) return dLogical;
    return dLogical * (virtualMaxScroll / logicalMaxScroll);
  }, [logicalMaxScroll, virtualMaxScroll]);

  const onWheel = useCallback((ev: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const absX = Math.abs(ev.deltaX);
    const absY = Math.abs(ev.deltaY);
    const isPinchZoom = ev.ctrlKey || ev.metaKey;

    // Ctrl/Cmd+wheel (trackpad pinch on macOS/electron) => cursor-anchored zoom.
    if (isPinchZoom) {
      ev.preventDefault();
      const delta = ev.deltaY < 0 ? 0.15 : -0.15;
      const nextZoom = clamp(zoom + delta, 0.4, 6.0);
      const oldW = Math.max(3, Math.floor(8 * zoom));
      const newW = Math.max(3, Math.floor(8 * nextZoom));
      if (x > effectiveLeftPaneWidth) {
        const anchor = x - effectiveLeftPaneWidth;
        const logical = offsetX + anchor;
        const scaled = Math.round((logical * newW) / oldW);
        const nextOffset = clamp(scaled - anchor, 0, maxOffsetX);
        setOffsetX(nextOffset);
      }
      setZoom(nextZoom);
      return;
    }

    // Shift+wheel fallback => horizontal pan.
    if (ev.shiftKey) {
      ev.preventDefault();
      setOffsetX((v) => clamp(v + ev.deltaY * 2, 0, maxOffsetX));
      return;
    }

    // Native trackpad gesture support:
    // - deltaY => vertical pan
    // - deltaX => horizontal pan
    // Apply both in one event for diagonal gesture fluidity.
    if (absX > 0.001 || absY > 0.001) {
      ev.preventDefault();
      if (absX > 0.001) {
        // Positive deltaX means finger motion left->right; keep direct mapping.
        setOffsetX((v) => clamp(v + ev.deltaX, 0, maxOffsetX));
      }
      if (absY > 0.001 && containerRef.current) {
        const deltaVirtual = logicalDeltaToVirtual(ev.deltaY);
        containerRef.current.scrollTop = clamp(containerRef.current.scrollTop + deltaVirtual, 0, virtualMaxScroll);
      }
      return;
    }
  }, [zoom, effectiveLeftPaneWidth, offsetX, maxOffsetX, logicalDeltaToVirtual, virtualMaxScroll]);

  const onKeyDown = useCallback((ev: React.KeyboardEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const c = containerRef.current;
    const k = ev.key;
    if (k === 'F8') {
      void window.electronAPI.requestUiSnapshot?.(`trace-canvas-${tabId}`);
      ev.preventDefault();
      return;
    }
    // Prevent default browser shortcuts that could interfere
    if (k === 's' || k === 'S' || k === 'a' || k === 'A' || k === 'd' || k === 'D' || 
        k === 'w' || k === 'W' || k === 'f' || k === 'F' || k === 'p' || k === 'P' ||
        k === 'b' || k === 'B' || k === 'h' || k === 'H' || k === 'j' || k === 'J' || 
        k === 'k' || k === 'K' || k === 'l' || k === 'L') {
      ev.preventDefault();
    }
    // Throttle keyboard scroll updates to ~60fps
    const now = Date.now();
    if (now - keyThrottleRef.current < 16) {
      return;
    }
    keyThrottleRef.current = now;
    // Navigation: j/k/h/l (vim-style) or WASD
    if (k === 'ArrowUp' || k.toLowerCase() === 'k' || k.toLowerCase() === 'w') {
      queryCacheRef.current = null;
      c.scrollTop = clamp(c.scrollTop - logicalDeltaToVirtual(ROW_H * 3), 0, virtualMaxScroll);
      ev.preventDefault();
    } else if (k === 'ArrowDown' || k.toLowerCase() === 'j' || k.toLowerCase() === 's') {
      queryCacheRef.current = null;
      c.scrollTop = clamp(c.scrollTop + logicalDeltaToVirtual(ROW_H * 3), 0, virtualMaxScroll);
      ev.preventDefault();
    } else if (k === 'ArrowLeft' || k.toLowerCase() === 'h' || k.toLowerCase() === 'a') {
      setOffsetX((v) => clamp(v - cycleWidth * 4, 0, maxOffsetX));
      ev.preventDefault();
    } else if (k === 'ArrowRight' || k.toLowerCase() === 'l' || k.toLowerCase() === 'd') {
      setOffsetX((v) => clamp(v + cycleWidth * 4, 0, maxOffsetX));
      ev.preventDefault();
    } else if (k === '+' || k === '=' || k === 'NumpadAdd') {
      setZoom((v) => clamp(v + 0.1, 0.4, 6.0));
      ev.preventDefault();
    } else if (k === '-' || k === '_' || k === 'NumpadSubtract') {
      setZoom((v) => clamp(v - 0.1, 0.4, 6.0));
      ev.preventDefault();
    } else if (k === '0' || k === 'Numpad0') {
      setZoom(1.0);
      setOffsetX(0);
      c.scrollTop = 0;
      ev.preventDefault();
    } else if (k === 'Home') {
      c.scrollTop = 0;
      setOffsetX(0);
      ev.preventDefault();
    } else if (k === 'End') {
      c.scrollTop = virtualMaxScroll;
      ev.preventDefault();
    } else if (k === 'PageDown' || k.toLowerCase() === 'p') {
      c.scrollTop = clamp(c.scrollTop + c.clientHeight * 0.85, 0, virtualMaxScroll);
      ev.preventDefault();
    } else if (k === 'PageUp' || k.toLowerCase() === 'b') {
      c.scrollTop = clamp(c.scrollTop - c.clientHeight * 0.85, 0, virtualMaxScroll);
      ev.preventDefault();
    }
  }, [cycleWidth, maxOffsetX, logicalDeltaToVirtual, virtualMaxScroll, tabId]);

  const onContextMenu = useCallback((ev: React.MouseEvent<HTMLCanvasElement>) => {
    ev.preventDefault();
    setContextMenu({ x: ev.clientX, y: ev.clientY, visible: true });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  useEffect(() => {
    const handleClick = () => closeContextMenu();
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [closeContextMenu]);

  const handleContextMenuAction = useCallback((action: string) => {
    closeContextMenu();
    switch (action) {
      case 'zoomIn':
        setZoom((v) => clamp(v + 0.25, 0.4, 6.0));
        break;
      case 'zoomOut':
        setZoom((v) => clamp(v - 0.25, 0.4, 6.0));
        break;
      case 'resetZoom':
        setZoom(1.0);
        setOffsetX(0);
        if (containerRef.current) containerRef.current.scrollTop = 0;
        break;
      case 'toggleHideFlushed':
        setHideFlushed((v) => !v);
        break;
      case 'goToTop':
        setOffsetX(0);
        if (containerRef.current) containerRef.current.scrollTop = 0;
        break;
      case 'goToBottom':
        if (containerRef.current) containerRef.current.scrollTop = virtualMaxScroll;
        break;
    }
  }, [closeContextMenu, virtualMaxScroll]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        height: '100%',
        position: 'relative',
        overflow: 'auto',
        background: theme.pipelineBg,
        overscrollBehavior: 'contain',
      }}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => {
        if (containerRef.current) containerRef.current.focus();
      }}
      onMouseMove={(ev) => {
        // Handle drag when mouse moves on container (not just canvas)
        if (dragRef.current.active && containerRef.current) {
          const dx = ev.clientX - dragRef.current.x;
          const dy = ev.clientY - dragRef.current.y;
          setOffsetX(clamp(dragRef.current.offsetX - dx, 0, maxOffsetX));
          containerRef.current.scrollTop = clamp(dragRef.current.scrollTopVirtual - dy, 0, virtualMaxScroll);
        }
      }}
    >
      {/* Cycle ruler */}
      <div style={{
        position: 'sticky',
        top: 0,
        left: 0,
        width: '100%',
        height: HEADER_H,
        background: theme.leftPaneBg,
        borderBottom: `1px solid ${theme.toolbarBorder}`,
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        zIndex: 3,
        pointerEvents: 'none',
      }}>
        <div style={{ width: effectiveLeftPaneWidth, height: HEADER_H, background: theme.leftPaneBg, borderRight: `1px solid ${theme.toolbarBorder}` }} />
        <canvas ref={rulerCanvasRef} style={{ width: `calc(100% - ${effectiveLeftPaneWidth}px)`, height: HEADER_H }} />
      </div>
      <canvas
        ref={canvasRef}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onContextMenu={onContextMenu}
        onMouseLeave={() => {
          onHoverChange(null, null);
        }}
        onWheel={onWheel}
        style={{ position: 'sticky', top: 0, left: 0, width: '100%', height: viewportHeight, display: 'block', zIndex: 1 }}
      />
      <div style={{ height: virtualContentHeight, minHeight: '100%', width: '100%' }} />
      {/* Zoom controls overlay */}
      <div style={{
        position: 'sticky',
        top: 12,
        float: 'right',
        marginRight: 12,
        display: 'flex',
        gap: 4,
        zIndex: 4,
      }}>
        <button
          onClick={() => setZoom(z => clamp(z - 0.2, 0.4, 6.0))}
          style={{
            padding: '4px 8px',
            background: theme.hoverBg,
            border: `1px solid ${theme.toolbarBorder}`,
            borderRadius: 4,
            color: theme.leftPaneText,
            cursor: 'pointer',
            fontSize: 12,
          }}
          title="Zoom Out (-)"
        >
          -
        </button>
        <span style={{
          padding: '4px 8px',
          background: theme.hoverBg,
          border: `1px solid ${theme.toolbarBorder}`,
          borderRadius: 4,
          color: theme.syntax.address,
          fontSize: 11,
          fontFamily: 'monospace',
          minWidth: 50,
          textAlign: 'center',
        }}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(z => clamp(z + 0.2, 0.4, 6.0))}
          style={{
            padding: '4px 8px',
            background: theme.hoverBg,
            border: `1px solid ${theme.toolbarBorder}`,
            borderRadius: 4,
            color: theme.leftPaneText,
            cursor: 'pointer',
            fontSize: 12,
          }}
          title="Zoom In (+)"
        >
          +
        </button>
      </div>
      {queryLoading && (
        <div style={{ position: 'sticky', top: 12, left: 12, width: 'fit-content', padding: '6px 10px', background: theme.hoverBg, border: `1px solid ${theme.toolbarBorder}`, zIndex: 4 }}>
          Loading viewport...
        </div>
      )}
      {(queryError || drawableError) && (
        <div style={{ position: 'sticky', left: 12, bottom: 12, width: 'fit-content', padding: '6px 10px', color: theme.errorColor, border: `1px solid ${theme.errorColor}`, background: theme.hoverBg, zIndex: 4 }}>
          {queryError || drawableError}
        </div>
      )}
      <div style={{ position: 'sticky', float: 'right', right: 12, bottom: 12, color: theme.syntax.address, fontSize: 10, background: theme.hoverBg, border: `1px solid ${theme.toolbarBorder}`, padding: '4px 8px', fontFamily: 'monospace', zIndex: 4 }}>
        <div>CYCLES: {summary.minCycle.toLocaleString()} - {summary.maxCycle.toLocaleString()}</div>
        <div>ROWS: {totalRows.toLocaleString()} | ROW_H: {ROW_H}px</div>
        <div>SCROLL: {Math.round(scrollYLogical)} / {Math.round(logicalMaxScroll)}</div>
      </div>
      {contextMenu.visible && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: theme.leftPaneBg,
            border: `1px solid ${theme.toolbarBorder}`,
            borderRadius: 4,
            padding: '4px 0',
            minWidth: 160,
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            { label: 'Zoom In', action: 'zoomIn', shortcut: '+' },
            { label: 'Zoom Out', action: 'zoomOut', shortcut: '-' },
            { label: 'Reset View', action: 'resetZoom', shortcut: '0' },
            { label: 'divider' },
            { label: hideFlushed ? 'Show Flushed' : 'Hide Flushed', action: 'toggleHideFlushed' },
            { label: 'divider' },
            { label: 'Go to Top', action: 'goToTop', shortcut: 'Home' },
            { label: 'Go to Bottom', action: 'goToBottom', shortcut: 'End' },
          ].map((item, idx) =>
            item.label === 'divider' ? (
              <div key={idx} style={{ height: 1, background: theme.toolbarBorder, margin: '4px 0' }} />
            ) : (
              <div
                key={idx}
                onClick={() => handleContextMenuAction(item.action)}
                style={{
                  padding: '6px 16px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: theme.leftPaneText,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = theme.stripeOverlay)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span>{item.label}</span>
                {item.shortcut && <span style={{ color: theme.syntax.address }}>{item.shortcut}</span>}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
