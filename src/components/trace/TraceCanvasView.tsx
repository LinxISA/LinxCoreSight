import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LinxTraceSessionSummary, LinxTraceViewportModel } from '../../lib/linxtrace';
import type { ViewportEvent, ViewportRow } from '../../lib/traceProtocol';
import type { TraceViewState } from '../../store/traceTabsStore';
import type { ThemeSpec } from '../../styles/traceThemes';
import { clamp, tokenizeLabel } from '../../styles/traceThemes';
import type { HoverInfo } from './TraceHoverCard';

export const ROW_H = 22;
export const HEADER_H = 24;
export const MIN_LEFT_W = 280;
export const MAX_LEFT_W = 860;
const MAX_VIRTUAL_SCROLL_PX = 4_000_000;

type TraceCanvasViewProps = {
  tabId: string;
  summary: LinxTraceSessionSummary;
  theme: ThemeSpec;
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
  spacePan: boolean;
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
  const { tabId, summary, theme, viewState, onViewStateChange, queryViewport, onHoverChange, spacePan } = props;

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

  const [zoom, setZoom] = useState<number>(viewState.zoom);
  const [offsetX, setOffsetX] = useState<number>(viewState.offsetX);
  const [leftPaneWidth, setLeftPaneWidth] = useState<number>(viewState.leftPaneWidth);
  const [hideFlushed, setHideFlushed] = useState<boolean>(viewState.hideFlushed);
  const [scrollYLogical, setScrollYLogical] = useState<number>(viewState.scrollY);
  const [scrollYVirtual, setScrollYVirtual] = useState<number>(0);
  const [viewportWidth, setViewportWidth] = useState<number>(1280);
  const [viewportHeight, setViewportHeight] = useState<number>(800);
  const [selectedRowId, setSelectedRowId] = useState<number>(-1);

  const [queryLoading, setQueryLoading] = useState<boolean>(false);
  const [queryError, setQueryError] = useState<string>('');
  const [drawableError, setDrawableError] = useState<string>('');
  const [rowWindowStart, setRowWindowStart] = useState<number>(0);
  const [visibleRows, setVisibleRows] = useState<ViewportRow[]>([]);
  const [visibleEvents, setVisibleEvents] = useState<ViewportEvent[]>([]);
  const [totalRows, setTotalRows] = useState<number>(summary.totalRows);
  const [truncatedEvents, setTruncatedEvents] = useState<boolean>(false);

  const cycleWidth = Math.max(3, Math.floor(8 * zoom));
  const cycleRange = useMemo(
    () => ({
      start: summary.minCycle,
      end: summary.maxCycle + 1,
    }),
    [summary.maxCycle, summary.minCycle],
  );

  const logicalContentHeight = useMemo(
    () => Math.max(HEADER_H + totalRows * ROW_H + 8, viewportHeight + 1),
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
    const viewportPipelineW = Math.max(0, viewportWidth - leftPaneWidth - 12);
    return Math.max(0, logicalW - viewportPipelineW);
  }, [cycleRange.end, cycleRange.start, cycleWidth, viewportWidth, leftPaneWidth]);

  useEffect(() => {
    setZoom(viewState.zoom);
    setOffsetX(viewState.offsetX);
    setLeftPaneWidth(viewState.leftPaneWidth);
    setHideFlushed(viewState.hideFlushed);
    setScrollYLogical(viewState.scrollY);
    setSelectedRowId(-1);
    tokenCacheRef.current.clear();
  }, [tabId, viewState.zoom, viewState.offsetX, viewState.leftPaneWidth, viewState.hideFlushed, viewState.scrollY]);

  useEffect(() => {
    if (offsetX > maxOffsetX) setOffsetX(maxOffsetX);
  }, [offsetX, maxOffsetX]);

  useEffect(() => {
    if (scrollYLogical > logicalMaxScroll) {
      setScrollYLogical(logicalMaxScroll);
    }
  }, [scrollYLogical, logicalMaxScroll]);

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
    const update = () => {
      setViewportWidth(el.clientWidth);
      setViewportHeight(el.clientHeight);
      const v = el.scrollTop;
      setScrollYVirtual(v);
      setScrollYLogical(virtualToLogical(v, logicalMaxScroll, virtualMaxScroll));
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
    const span = Math.max(1, viewportWidth - leftPaneWidth);
    const cycleStart = cycleRange.start + Math.floor(offsetX / cycleWidth) - 2;
    const cycleEnd = cycleRange.start + Math.ceil((offsetX + span) / cycleWidth) + 2;
    return { start: Math.max(cycleRange.start, cycleStart), end: Math.min(cycleRange.end, cycleEnd) };
  }, [viewportWidth, leftPaneWidth, cycleRange.start, cycleRange.end, offsetX, cycleWidth]);

  useEffect(() => {
    let canceled = false;
    const seq = ++reqSeqRef.current;
    setQueryLoading(true);
    setQueryError('');
    queryViewport({
      rowStart: rowWindow.start,
      rowEnd: rowWindow.end,
      cycleStart: cycleWindow.start,
      cycleEnd: cycleWindow.end,
      hideFlushed,
      maxEvents: 280000,
    })
      .then((resp) => {
        if (canceled || seq !== reqSeqRef.current) return;
        setTotalRows(resp.totalRows);
        setRowWindowStart(rowWindow.start);
        setVisibleRows(resp.rows);
        setVisibleEvents(resp.events);
        setTruncatedEvents(resp.truncated);
        setDrawableError(resp.rows.length > 0 && resp.events.length === 0
          ? 'no drawable OCC events in current viewport (strict guard)'
          : '');
      })
      .catch((err) => {
        if (canceled || seq !== reqSeqRef.current) return;
        setQueryError(String(err));
      })
      .finally(() => {
        if (canceled || seq !== reqSeqRef.current) return;
        setQueryLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [queryViewport, rowWindow.start, rowWindow.end, cycleWindow.start, cycleWindow.end, hideFlushed]);

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
    const map = new Map<string, ViewportEvent>();
    for (const evt of visibleEvents) {
      map.set(eventCellKey(evt.rowId, evt.cycle), evt);
    }
    return map;
  }, [visibleEvents]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = containerRef.current;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = parent.clientWidth;
    const drawHeight = Math.max(parent.clientHeight, 32);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(drawHeight * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${drawHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = theme.baseBg;
    ctx.fillRect(0, 0, width, drawHeight);

    ctx.fillStyle = theme.leftPaneBg;
    ctx.fillRect(0, 0, leftPaneWidth, drawHeight);
    ctx.fillStyle = theme.pipelineBg;
    ctx.fillRect(leftPaneWidth + 1, 0, width - leftPaneWidth - 1, drawHeight);

    const stripeW = cycleWidth * 4;
    if (stripeW > 0) {
      ctx.fillStyle = theme.stripeOverlay;
      const logicalW = Math.max(0, width - leftPaneWidth - 2);
      const base = (offsetX % (stripeW * 2));
      for (let x = leftPaneWidth + 1 - base; x < leftPaneWidth + logicalW; x += stripeW * 2) {
        ctx.fillRect(x, HEADER_H, stripeW, drawHeight - HEADER_H);
      }
    }

    ctx.strokeStyle = theme.toolbarBorder;
    ctx.beginPath();
    ctx.moveTo(leftPaneWidth + 0.5, 0);
    ctx.lineTo(leftPaneWidth + 0.5, drawHeight);
    ctx.stroke();

    ctx.fillStyle = theme.leftPaneText;
    ctx.font = "12px SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace";
    ctx.fillText(
      `rows=${totalRows} visible=${visibleRows.length} cycles=${cycleRange.start}..${cycleRange.end - 1} zoom=${zoom.toFixed(2)}x${truncatedEvents ? ' dense' : ''}`,
      8,
      15,
    );

    const denseMode = truncatedEvents || visibleEvents.length > 180000;
    const denseSeen = denseMode ? new Set<string>() : null;

    for (let globalIdx = rowWindow.start; globalIdx <= Math.min(totalRows - 1, rowWindow.end); globalIdx += 1) {
      const row = rowByGlobalIndex.get(globalIdx);
      if (!row) continue;

      const y = Math.floor((HEADER_H + globalIdx * ROW_H) - scrollYLogical);
      if (y + ROW_H < HEADER_H || y > drawHeight) continue;

      const isBlock = row.rowKind === 'block';
      const isSelected = row.rowId === selectedRowId;

      if (globalIdx % 2 === 1) {
        ctx.fillStyle = theme.stripeOverlay;
        ctx.fillRect(0, y, width, ROW_H);
      }
      if (isSelected) {
        ctx.fillStyle = theme.selectedRowFill;
        ctx.fillRect(0, y, width, ROW_H);
      }
      if (isBlock) {
        ctx.strokeStyle = theme.blockBoxColor;
        ctx.lineWidth = 1.4;
        ctx.strokeRect(2.5, y + 1.5, leftPaneWidth - 6, ROW_H - 3);
      }

      ctx.font = isBlock
        ? "12px SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace"
        : "11px SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace";
      const cacheKey = `${row.rowKind}|${row.leftLabel}`;
      let tokens = tokenCacheRef.current.get(cacheKey);
      if (!tokens) {
        tokens = tokenizeLabel(row.leftLabel, row.rowKind, theme);
        tokenCacheRef.current.set(cacheKey, tokens);
      }
      let curX = 8;
      for (const tok of tokens) {
        ctx.fillStyle = tok.color;
        ctx.fillText(tok.text, curX, y + 15);
        curX += ctx.measureText(tok.text).width;
        if (curX > leftPaneWidth - 8) break;
      }
    }

    for (const occ of visibleEvents) {
      const rowIdx = rowIndexByRowId.get(occ.rowId);
      if (rowIdx === undefined) continue;
      const y = Math.floor((HEADER_H + rowIdx * ROW_H) - scrollYLogical);
      if (y + ROW_H < HEADER_H || y > drawHeight) continue;

      const x = leftPaneWidth + Math.floor((occ.cycle - cycleRange.start) * cycleWidth) - offsetX;
      const w = Math.max(1, cycleWidth - 1);
      if (x + w < leftPaneWidth + 1 || x > width) continue;

      if (denseSeen) {
        const denseKey = `${occ.rowId}:${Math.floor((x - leftPaneWidth) / 2)}`;
        if (denseSeen.has(denseKey)) continue;
        denseSeen.add(denseKey);
      }

      const base = summary.stageColors[occ.stageId] || '#9CA3AF';
      ctx.fillStyle = `${base}${occ.stall ? '88' : 'CC'}`;
      ctx.fillRect(x, y + 2, w, ROW_H - 4);

      if (occ.stall && w >= 4) {
        ctx.strokeStyle = '#7f1d1d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + ROW_H - 3);
        ctx.lineTo(x + w, y + 3);
        ctx.stroke();
      }
      if (cycleWidth >= 18 && !denseMode) {
        ctx.fillStyle = '#0B1220';
        ctx.font = "10px SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace";
        ctx.fillText(occ.stageId, x + 2, y + 14);
      }
    }

    if (queryError || drawableError) {
      ctx.fillStyle = theme.errorColor;
      ctx.font = "13px SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace";
      ctx.fillText(`ERROR: ${queryError || drawableError}`, 8, drawHeight - 8);
    }
  }, [
    summary,
    theme,
    leftPaneWidth,
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
    zoom,
    truncatedEvents,
    queryError,
    drawableError,
    scrollYLogical,
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
    if (x < leftPaneWidth) {
      onHoverChange({ rowIdx: rowIdxGlobal, cycle: -1 }, row);
      return;
    }
    const cycle = cycleRange.start + Math.floor((x - leftPaneWidth + offsetX) / cycleWidth);
    const evt = hoverMap.get(eventCellKey(row.rowId, cycle));
    onHoverChange(
      {
        rowIdx: rowIdxGlobal,
        cycle,
        stage: evt?.stageId,
        lane: evt?.laneId,
        cause: evt?.cause,
      },
      row,
    );
  }, [onHoverChange, scrollYLogical, rowByGlobalIndex, leftPaneWidth, cycleRange.start, offsetX, cycleWidth, hoverMap]);

  const onMouseMove = useCallback((ev: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.active && containerRef.current) {
      const dx = ev.clientX - dragRef.current.x;
      const dy = ev.clientY - dragRef.current.y;
      setOffsetX(clamp(dragRef.current.offsetX - dx, 0, maxOffsetX));
      containerRef.current.scrollTop = clamp(dragRef.current.scrollTopVirtual - dy, 0, virtualMaxScroll);
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

    if (Math.abs(x - leftPaneWidth) <= 5) {
      splitterDragRef.current = { active: true, x: ev.clientX, w: leftPaneWidth };
      ev.preventDefault();
      return;
    }
    if (ev.button === 1 || (ev.button === 0 && spacePan)) {
      if (containerRef.current) {
        dragRef.current = {
          active: true,
          x: ev.clientX,
          y: ev.clientY,
          offsetX,
          scrollTopVirtual: containerRef.current.scrollTop,
        };
      }
      ev.preventDefault();
      return;
    }
    if (ev.button === 0 && yViewport >= HEADER_H) {
      const logicalY = yViewport + scrollYLogical;
      const rowIdxGlobal = Math.floor((logicalY - HEADER_H) / ROW_H);
      const row = rowByGlobalIndex.get(rowIdxGlobal);
      if (row) setSelectedRowId(row.rowId);
    }
  }, [leftPaneWidth, spacePan, offsetX, scrollYLogical, rowByGlobalIndex]);

  const onMouseUp = useCallback(() => {
    dragRef.current.active = false;
    splitterDragRef.current.active = false;
  }, []);

  useEffect(() => {
    const onWindowMouseUp = () => onMouseUp();
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => {
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, [onMouseUp]);

  const onWheel = useCallback((ev: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      const nextZoom = clamp(zoom + (ev.deltaY < 0 ? 0.1 : -0.1), 0.4, 6.0);
      const oldW = Math.max(3, Math.floor(8 * zoom));
      const newW = Math.max(3, Math.floor(8 * nextZoom));
      if (x > leftPaneWidth) {
        const anchor = x - leftPaneWidth;
        const logical = offsetX + anchor;
        const scaled = Math.round((logical * newW) / oldW);
        const nextOffset = clamp(scaled - anchor, 0, maxOffsetX);
        setOffsetX(nextOffset);
      }
      setZoom(nextZoom);
      return;
    }
    if (ev.shiftKey) {
      ev.preventDefault();
      setOffsetX((v) => clamp(v + ev.deltaY, 0, maxOffsetX));
    }
  }, [zoom, leftPaneWidth, offsetX, maxOffsetX]);

  const logicalDeltaToVirtual = useCallback((dLogical: number) => {
    if (logicalMaxScroll <= 0 || virtualMaxScroll <= 0) return dLogical;
    return dLogical * (virtualMaxScroll / logicalMaxScroll);
  }, [logicalMaxScroll, virtualMaxScroll]);

  const onKeyDown = useCallback((ev: React.KeyboardEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const c = containerRef.current;
    const k = ev.key;
    if (k === 'ArrowUp' || k.toLowerCase() === 'k') {
      c.scrollTop = clamp(c.scrollTop - logicalDeltaToVirtual(ROW_H * 3), 0, virtualMaxScroll);
      ev.preventDefault();
    } else if (k === 'ArrowDown' || k.toLowerCase() === 'j') {
      c.scrollTop = clamp(c.scrollTop + logicalDeltaToVirtual(ROW_H * 3), 0, virtualMaxScroll);
      ev.preventDefault();
    } else if (k === 'ArrowLeft' || k.toLowerCase() === 'h') {
      setOffsetX((v) => clamp(v - cycleWidth * 4, 0, maxOffsetX));
      ev.preventDefault();
    } else if (k === 'ArrowRight' || k.toLowerCase() === 'l') {
      setOffsetX((v) => clamp(v + cycleWidth * 4, 0, maxOffsetX));
      ev.preventDefault();
    } else if (k === '+' || k === '=') {
      setZoom((v) => clamp(v + 0.1, 0.4, 6.0));
      ev.preventDefault();
    } else if (k === '-' || k === '_') {
      setZoom((v) => clamp(v - 0.1, 0.4, 6.0));
      ev.preventDefault();
    } else if (k === '0') {
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
    } else if (k === 'PageDown') {
      c.scrollTop = clamp(c.scrollTop + c.clientHeight * 0.85, 0, virtualMaxScroll);
      ev.preventDefault();
    } else if (k === 'PageUp') {
      c.scrollTop = clamp(c.scrollTop - c.clientHeight * 0.85, 0, virtualMaxScroll);
      ev.preventDefault();
    }
  }, [cycleWidth, maxOffsetX, logicalDeltaToVirtual, virtualMaxScroll]);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, position: 'relative', overflow: 'auto', cursor: dragRef.current.active ? 'grabbing' : (spacePan ? 'grab' : 'default') }}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div style={{ height: virtualContentHeight, minHeight: '100%', width: '100%' }} />
      <canvas
        ref={canvasRef}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          onHoverChange(null, null);
        }}
        onWheel={onWheel}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: viewportHeight, display: 'block' }}
      />
      {queryLoading && (
        <div style={{ position: 'absolute', top: 12, left: 12, padding: '6px 10px', background: theme.hoverBg, border: `1px solid ${theme.toolbarBorder}` }}>
          Loading viewport...
        </div>
      )}
      {(queryError || drawableError) && (
        <div style={{ position: 'absolute', left: 12, bottom: 12, padding: '6px 10px', color: theme.errorColor, border: `1px solid ${theme.errorColor}`, background: theme.hoverBg }}>
          {queryError || drawableError}
        </div>
      )}
      <div style={{ position: 'absolute', right: 12, bottom: 12, color: theme.syntax.address, fontSize: 10, background: theme.hoverBg, border: `1px solid ${theme.toolbarBorder}`, padding: '4px 8px' }}>
        vY={Math.round(scrollYVirtual)} lY={Math.round(scrollYLogical)} vMax={Math.round(virtualMaxScroll)} lMax={Math.round(logicalMaxScroll)}
      </div>
    </div>
  );
}
