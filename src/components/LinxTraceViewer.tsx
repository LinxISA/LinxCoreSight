import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LinxTraceSession } from '../lib/linxtrace';
import { TraceTabsBar } from './trace/TraceTabsBar';
import { TraceCanvasView } from './trace/TraceCanvasView';
import { TraceHoverCard, type HoverInfo } from './trace/TraceHoverCard';
import { DEFAULT_TRACE_VIEW_STATE, makeTraceTabId, makeTraceTabTitle, type TraceTabState } from '../store/traceTabsStore';
import type { ObjdumpAssemblyMap } from '../lib/linxtraceAssembly';
import { parseObjdumpAssembly } from '../lib/linxtraceAssembly';
import {
  THEMES,
  STAGE_PALETTES,
  resolveStageColors,
  type ThemeName,
  type StagePaletteName,
  clamp,
  dirnameOf,
} from '../styles/traceThemes';
import type { ViewportRow } from '../lib/traceProtocol';

type ActiveHover = {
  hover: HoverInfo | null;
  row: ViewportRow | null;
};

function loadInitialTheme(): ThemeName {
  const saved = localStorage.getItem('linxcoresight.theme');
  return saved === 'light' ? 'light' : 'dark';
}

function loadInitialStagePalette(): StagePaletteName {
  const saved = localStorage.getItem('linxcoresight.stagePalette');
  if (saved === 'classic' || saved === 'high_contrast' || saved === 'linxcore_default') {
    return saved;
  }
  return 'classic';
}

function autoReadableZoom(cycleSpan: number): number {
  const span = Math.max(1, cycleSpan);
  if (span > 2_000_000) return 1.2;
  if (span > 500_000) return 1.35;
  if (span > 100_000) return 1.6;
  if (span > 20_000) return 1.9;
  return 2.2;
}

function finiteOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeViewState(state: Partial<TraceTabState['viewState']> | TraceTabState['viewState']): TraceTabState['viewState'] {
  return {
    scrollY: Math.max(0, finiteOr(state.scrollY, 0)),
    offsetX: Math.max(0, finiteOr(state.offsetX, 0)),
    zoom: clamp(finiteOr(state.zoom, 1), 0.4, 6.0),
    leftPaneWidth: clamp(finiteOr(state.leftPaneWidth, 460), 280, 860),
    leftPaneFolded: Boolean(state.leftPaneFolded),
    hideFlushed: Boolean(state.hideFlushed),
  };
}

function loadTabViewState(path: string) {
  try {
    const raw = localStorage.getItem(`linxcoresight.tabstate.${path}`);
    if (!raw) return DEFAULT_TRACE_VIEW_STATE;
    const parsed = JSON.parse(raw) as Partial<typeof DEFAULT_TRACE_VIEW_STATE>;
    return sanitizeViewState(parsed);
  } catch {
    return DEFAULT_TRACE_VIEW_STATE;
  }
}

type ObjdumpCandidate = {
  source: string;
};

type ObjdumpLoadResult = {
  source: string;
  map: ObjdumpAssemblyMap;
};

function normalizeTracePath(path: string): string {
  return String(path || '').replace(/\\/g, '/').replace(/\/+/g, '/');
}

function stripExtension(p: string): string {
  return p.replace(/\.[^.\/]+$/, '');
}

function pathDir(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx <= 0 ? '/' : path.slice(0, idx);
}

function pathBase(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}

function resolveRelativePath(baseDir: string, target: string): string | null {
  if (!target) {
    return null;
  }
  if (/^\/|^[A-Za-z]:\//.test(target)) {
    return normalizeTracePath(target);
  }
  const sanitized = target.replace(/^\.\/+/, '');
  return sanitizeJoinPath(baseDir, sanitized);
}

function sanitizeJoinPath(baseDir: string, child: string): string {
  if (!baseDir || !child) return normalizeTracePath(baseDir || child);
  if (baseDir.endsWith('/')) {
    return normalizeTracePath(baseDir + child);
  }
  return normalizeTracePath(`${baseDir}/${child}`);
}

async function existsPath(filePath: string): Promise<boolean> {
  try {
    return await window.electronAPI.exists(filePath);
  } catch {
    return false;
  }
}

async function findObjdumpInParents(tracePath: string): Promise<ObjdumpCandidate | null> {
  const normalized = normalizeTracePath(tracePath);
  const traceDir = pathDir(normalized);
  const traceName = pathBase(normalized);
  const baseName = traceName.replace(/\.[^.\/]+$/, '');
  const candidateCandidates = new Set<string>();

  candidateCandidates.add(`${normalized}.objdump.txt`);
  candidateCandidates.add(`${normalized}.objdump`);
  candidateCandidates.add(`${stripExtension(normalized)}.objdump.txt`);
  candidateCandidates.add(`${stripExtension(normalized)}.objdump`);
  candidateCandidates.add(`${traceDir}/${baseName}.objdump.txt`);
  candidateCandidates.add(`${traceDir}/${baseName}.objdump`);

  let cursor = traceDir;
  const maxConfigLookups = 8;
  for (let depth = 0; depth < maxConfigLookups; depth += 1) {
    const cfgPath = `${cursor}/linxcoresight.json`;
    if (await existsPath(cfgPath)) {
      try {
        const cfgResp = await window.electronAPI.readFile(cfgPath);
        if (cfgResp.success && cfgResp.content) {
          const parsed = JSON.parse(cfgResp.content) as { artifacts?: { objdump?: string } };
          const configured = resolveRelativePath(cursor, parsed?.artifacts?.objdump || '');
          if (configured) candidateCandidates.add(configured);
        }
      } catch {
      }
    }

    const next = pathDir(cursor);
    if (next === cursor || cursor === '/') {
      break;
    }
    cursor = next;
  }

  const traceParts = normalized.split('/').filter(Boolean);
  const linxtraceIdx = traceParts.lastIndexOf('linxtrace');
  const benchmark = linxtraceIdx >= 0 && traceParts.length > linxtraceIdx + 1 ? traceParts[linxtraceIdx + 1] : baseName.split('_')[0];
  if (benchmark) {
    let probe = pathDir(normalized);
    let guard = 0;
    while (probe !== '/' && guard < 6) {
      candidateCandidates.add(`${probe}/workloads/generated/objdump/${benchmark}.objdump.txt`);
      candidateCandidates.add(`${probe}/workloads/generated/elf/${benchmark}.elf`);
      candidateCandidates.add(`${probe}/workloads/objdump/${benchmark}.objdump.txt`);
      const parent = pathDir(probe);
      if (parent === probe) break;
      probe = parent;
      guard += 1;
    }
    const linxIsaRoot = pathDir(traceDir);
    if (linxIsaRoot && linxIsaRoot !== '/') {
      candidateCandidates.add(`${linxIsaRoot}/linx-isa/workloads/generated/objdump/${benchmark}.objdump.txt`);
      candidateCandidates.add(`${linxIsaRoot}/linx-isa/workloads/generated/elf/${benchmark}.elf`);
    }
  }

  const ordered = Array.from(candidateCandidates);
  for (const candidate of ordered) {
    if (await existsPath(candidate)) {
      const resolved = normalizeTracePath(candidate);
      if (resolved.toLowerCase().endsWith('.elf')) {
        return { source: `${resolved}` };
      }
      return { source: resolved };
    }
  }
  return null;
}

async function loadObjdumpMap(tabPath: string): Promise<ObjdumpLoadResult | null> {
  const candidate = await findObjdumpInParents(tabPath);
  if (!candidate) return null;
  if (candidate.source.toLowerCase().endsWith('.elf')) {
    const objdump = await window.electronAPI.compile({
      command: 'objdump',
      args: ['-d', candidate.source],
      cwd: pathDir(candidate.source),
    });
    if (!objdump.success || !objdump.stdout) {
      return null;
    }
    return { source: `${candidate.source}.objdump.txt`, map: parseObjdumpAssembly(objdump.stdout) };
  }
  const dumpResp = await window.electronAPI.readFile(candidate.source);
  if (!dumpResp.success || !dumpResp.content) {
    return null;
  }
  return { source: candidate.source, map: parseObjdumpAssembly(dumpResp.content) };
}

function saveTabViewState(path: string, state: TraceTabState['viewState']): void {
  localStorage.setItem(`linxcoresight.tabstate.${path}`, JSON.stringify(sanitizeViewState(state)));
}

function sameViewState(a: TraceTabState['viewState'], b: TraceTabState['viewState']): boolean {
  return a.scrollY === b.scrollY
    && a.offsetX === b.offsetX
    && a.zoom === b.zoom
    && a.leftPaneWidth === b.leftPaneWidth
    && a.leftPaneFolded === b.leftPaneFolded
    && a.hideFlushed === b.hideFlushed;
}

export function LinxTraceViewer(): JSX.Element {
  const [tabs, setTabs] = useState<TraceTabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [themeName, setThemeName] = useState<ThemeName>(loadInitialTheme);
  const [stagePaletteName, setStagePaletteName] = useState<StagePaletteName>(loadInitialStagePalette);
  const [spacePan, setSpacePan] = useState<boolean>(false);
  const [activeHover, setActiveHover] = useState<ActiveHover>({ hover: null, row: null });
  const [busy, setBusy] = useState<boolean>(false);

  const theme = THEMES[themeName];
  const tabsRef = useRef<TraceTabState[]>([]);
  const activeTabIdRef = useRef<string | null>(null);
  const openingTabsRef = useRef<Set<string>>(new Set());
  const openingPathsRef = useRef<Set<string>>(new Set());
  const assemblyLoadInflightRef = useRef<Set<string>>(new Set());
  const perfStateRef = useRef<Map<string, { openStartMs: number; sessionReadyMs?: number; firstOccPaintLogged: boolean; tracePath: string }>>(new Map());

  const logPerf = useCallback((event: string, payload: Record<string, unknown>) => {
    const rec = { kind: 'linxtrace_perf', event, t_ms: Number(performance.now().toFixed(3)), ...payload };
    console.log(`[LCS_PERF] ${JSON.stringify(rec)}`);
  }, []);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) || null, [tabs, activeTabId]);

  const patchTab = useCallback((tabId: string, patch: Partial<TraceTabState>) => {
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)));
  }, []);

  const closeWorker = useCallback(async (tab: TraceTabState | null) => {
    if (!tab?.workerHandle) return;
    try {
      await tab.workerHandle.close();
    } catch {
    }
  }, []);

  const ensureTabSession = useCallback(async (tabId: string) => {
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.workerHandle && tab.status === 'ready') return;
    if (openingTabsRef.current.has(tabId)) return;
    openingTabsRef.current.add(tabId);
    patchTab(tabId, { status: 'loading', error: undefined });
    try {
      const session = await LinxTraceSession.open(tab.path, window.electronAPI);
      const tabStillExists = tabsRef.current.some((t) => t.id === tabId);
      const isStillActive = activeTabIdRef.current === tabId;
      if (!tabStillExists || !isStillActive) {
        await session.close();
        if (tabStillExists) {
          patchTab(tabId, { status: 'idle', workerHandle: undefined, error: undefined });
        }
        return;
      }

      const staleTabs = tabsRef.current.filter((t) => t.id !== tabId && t.workerHandle);
      if (staleTabs.length > 0) {
        await Promise.all(staleTabs.map((t) => closeWorker(t)));
      }
      setTabs((prev) => prev.map((t) => {
        if (t.id === tabId) {
          const currentVs = sanitizeViewState(t.viewState);
          const cycleSpan = Math.max(1, session.summary.maxCycle - session.summary.minCycle + 1);
          const shouldAutoZoom = currentVs.zoom <= 1.01 && currentVs.scrollY === 0 && currentVs.offsetX === 0;
          const nextVs = shouldAutoZoom
            ? { ...currentVs, zoom: autoReadableZoom(cycleSpan) }
            : currentVs;
          if (shouldAutoZoom) {
            saveTabViewState(t.path, nextVs);
          }
          return { ...t, status: 'ready', summary: session.summary, workerHandle: session, error: undefined, viewState: nextVs };
        }
        if (t.workerHandle) {
          return { ...t, workerHandle: undefined, status: t.status === 'error' ? 'error' : 'idle' };
        }
        return t;
      }));
      const perf = perfStateRef.current.get(tabId);
      if (perf && perf.sessionReadyMs === undefined) {
        perf.sessionReadyMs = performance.now();
        logPerf('trace_session_ready', {
          tab_id: tabId,
          trace_path: perf.tracePath,
          open_to_ready_ms: Number((perf.sessionReadyMs - perf.openStartMs).toFixed(3)),
        });
      }
    } catch (err) {
      const msg = String(err);
      console.error(`[LinxTraceViewer] ensureTabSession failed tabId=${tabId} path=${tab.path} error=${msg}`);
      patchTab(tabId, { status: 'error', error: msg, workerHandle: undefined });
    } finally {
      openingTabsRef.current.delete(tabId);
    }
  }, [closeWorker, patchTab, logPerf]);

  const ensureTabAssembly = useCallback(async (tabId: string) => {
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.assemblyMap || tab.assemblyLoading || tab.assemblyError) return;
    if (assemblyLoadInflightRef.current.has(tabId)) return;

    assemblyLoadInflightRef.current.add(tabId);
    patchTab(tabId, { assemblyLoading: true, assemblyError: undefined });
    try {
      const result = await loadObjdumpMap(tab.path);
      if (!tabsRef.current.some((t) => t.id === tabId)) {
        return;
      }
      if (!result) {
        patchTab(tabId, {
          assemblyLoading: false,
          assemblyMap: undefined,
          assemblySource: undefined,
          assemblyError: 'No matching objdump output found for this trace.',
        });
        return;
      }
      if (Object.keys(result.map).length === 0) {
        patchTab(tabId, {
          assemblyLoading: false,
          assemblyMap: result.map,
          assemblySource: result.source,
          assemblyError: 'Objdump output loaded but no instruction rows were parsed.',
        });
        return;
      }
      patchTab(tabId, {
        assemblyLoading: false,
        assemblyMap: result.map,
        assemblySource: result.source,
        assemblyError: undefined,
      });
    } catch (err) {
      patchTab(tabId, {
        assemblyLoading: false,
        assemblyMap: undefined,
        assemblySource: undefined,
        assemblyError: String(err),
      });
    } finally {
      assemblyLoadInflightRef.current.delete(tabId);
    }
  }, [patchTab]);

  const switchActiveTab = useCallback(async (tabId: string) => {
    if (tabId === activeTabIdRef.current) return;
    const staleTabs = tabsRef.current.filter((t) => t.id !== tabId && t.workerHandle);
    if (staleTabs.length > 0) {
      await Promise.all(staleTabs.map((t) => closeWorker(t)));
      setTabs((prev) => prev.map((t) => {
        if (t.id !== tabId && t.workerHandle) {
          return { ...t, workerHandle: undefined, status: t.status === 'error' ? 'error' : 'idle' };
        }
        return t;
      }));
    }
    setActiveTabId(tabId);
  }, [closeWorker]);

  const openTracePath = useCallback(async (tracePath: string) => {
    if (openingPathsRef.current.has(tracePath)) {
      return;
    }
    openingPathsRef.current.add(tracePath);
    try {
      const tabId = makeTraceTabId(tracePath);
      const existing = tabsRef.current.find((t) => t.id === tabId);
      if (existing) {
        await switchActiveTab(tabId);
        return;
      }
      const tab: TraceTabState = {
        id: tabId,
        path: tracePath,
        title: makeTraceTabTitle(tracePath),
        status: 'idle',
        viewState: loadTabViewState(tracePath),
      };
      const startMs = performance.now();
      perfStateRef.current.set(tabId, { openStartMs: startMs, firstOccPaintLogged: false, tracePath });
      logPerf('trace_open_start', { tab_id: tabId, trace_path: tracePath, open_start_ms: Number(startMs.toFixed(3)) });
      setTabs((prev) => [...prev, tab]);
      await switchActiveTab(tabId);
    } finally {
      openingPathsRef.current.delete(tracePath);
    }
  }, [switchActiveTab, logPerf]);

  const openTraceDialog = useCallback(async () => {
    const lastDir = localStorage.getItem('linxcoresight.lastOpenDir') || '/Users/zhoubot/LinxCore/generated/linxtrace';
    const dlg = await window.electronAPI.openFileDialog({
      defaultPath: lastDir,
      filters: [
        { name: 'LinxTrace', extensions: ['linxtrace'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (dlg.canceled || dlg.filePaths.length === 0) return;
    const p = dlg.filePaths[0];
    localStorage.setItem('linxcoresight.lastOpenDir', dirnameOf(p));
    await openTracePath(p);
  }, [openTracePath]);

  const closeTab = useCallback(async (tabId: string) => {
    const curTabs = tabsRef.current;
    const tab = curTabs.find((t) => t.id === tabId) || null;
    await closeWorker(tab);
    perfStateRef.current.delete(tabId);
    const next = curTabs.filter((t) => t.id !== tabId);
    setTabs(next);
    if (activeTabId === tabId) {
      setActiveTabId(next.length > 0 ? next[next.length - 1].id : null);
    }
  }, [closeWorker, activeTabId]);

  useEffect(() => {
    localStorage.setItem('linxcoresight.theme', themeName);
  }, [themeName]);

  useEffect(() => {
    localStorage.setItem('linxcoresight.stagePalette', stagePaletteName);
  }, [stagePaletteName]);

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.code === 'Space') setSpacePan(true);
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'tab' && tabs.length > 0) {
        ev.preventDefault();
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        const dir = ev.shiftKey ? -1 : 1;
        const nextIdx = (idx + dir + tabs.length) % tabs.length;
        void switchActiveTab(tabs[nextIdx].id);
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'w' && activeTabId) {
        ev.preventDefault();
        void closeTab(activeTabId);
      }
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      if (ev.code === 'Space') setSpacePan(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [tabs, activeTabId, switchActiveTab, closeTab]);

  useEffect(() => {
    const unsub = window.electronAPI.onOpenTrace?.((p: string) => {
      if (p) void openTracePath(p);
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [openTracePath]);

  useEffect(() => {
    const last = localStorage.getItem('linxcoresight.lastTracePath') || '';
    if (last && (window.electronAPI.exists ? typeof window.electronAPI.exists === 'function' : true)) {
      void openTracePath(last);
    }
  }, [openTracePath]);

  useEffect(() => {
    if (!activeTab) return;
    localStorage.setItem('linxcoresight.lastTracePath', activeTab.path);
    if (!activeTab.workerHandle && activeTab.status === 'idle') {
      void ensureTabSession(activeTab.id);
    }
    if (!activeTab.assemblyMap && !activeTab.assemblyLoading && !activeTab.assemblyError) {
      void ensureTabAssembly(activeTab.id);
    }
  }, [activeTab, ensureTabSession, ensureTabAssembly]);

  useEffect(() => {
    setActiveHover({ hover: null, row: null });
  }, [activeTabId]);

  useEffect(() => () => {
    void Promise.all(tabsRef.current.map((tab) => closeWorker(tab)));
  }, [closeWorker]);

  const onViewStateChange = useCallback((patch: Partial<TraceTabState['viewState']>) => {
    if (!activeTab) return;
    const next = sanitizeViewState({ ...activeTab.viewState, ...patch });
    if (sameViewState(next, activeTab.viewState)) {
      return;
    }
    patchTab(activeTab.id, { viewState: next });
    saveTabViewState(activeTab.path, next);
  }, [activeTab, patchTab]);

  const queryViewport = useCallback(async (req: {
    rowStart: number;
    rowEnd: number;
    cycleStart: number;
    cycleEnd: number;
    hideFlushed: boolean;
    maxEvents: number;
  }) => {
    if (!activeTab?.workerHandle) {
      throw new Error('active trace session is not ready');
    }
    return activeTab.workerHandle.queryViewport(req);
  }, [activeTab]);

  const reloadActive = useCallback(async () => {
    if (!activeTab) return;
    setBusy(true);
    try {
      await closeWorker(activeTab);
      patchTab(activeTab.id, {
        workerHandle: undefined,
        status: 'loading',
        error: undefined,
        assemblyMap: undefined,
        assemblyLoading: undefined,
        assemblyError: undefined,
        assemblySource: undefined,
      });
      await ensureTabSession(activeTab.id);
    } finally {
      setBusy(false);
    }
  }, [activeTab, closeWorker, patchTab, ensureTabSession]);

  const resetView = useCallback(() => {
    if (!activeTab) return;
    const cycleSpan = activeTab.summary ? Math.max(1, activeTab.summary.maxCycle - activeTab.summary.minCycle + 1) : 1;
    const next = { ...DEFAULT_TRACE_VIEW_STATE, zoom: autoReadableZoom(cycleSpan) };
    patchTab(activeTab.id, { viewState: next });
    saveTabViewState(activeTab.path, next);
  }, [activeTab, patchTab]);

  const activeStageColors = useMemo(() => {
    const base = STAGE_PALETTES[stagePaletteName];
    return resolveStageColors(activeTab?.summary?.stageColors || {}, base);
  }, [activeTab?.summary?.stageColors, stagePaletteName]);

  const detailHover = activeHover.hover;
  const detailRow = activeHover.row;

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: theme.baseBg,
        color: theme.leftPaneText,
        fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace",
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderBottom: `1px solid ${theme.toolbarBorder}`, background: theme.toolbarBg }}>
        <button type="button" onClick={() => void openTraceDialog()} style={{ padding: '6px 10px', border: `1px solid ${theme.toolbarBorder}`, background: theme.leftPaneBg, color: theme.leftPaneText, cursor: 'pointer' }}>
          Open
        </button>
        <button type="button" onClick={() => void reloadActive()} disabled={!activeTab || busy} style={{ padding: '6px 10px', border: `1px solid ${theme.toolbarBorder}`, background: theme.leftPaneBg, color: theme.leftPaneText, cursor: 'pointer' }}>
          Reload
        </button>
        <button type="button" onClick={resetView} disabled={!activeTab} style={{ padding: '6px 10px', border: `1px solid ${theme.toolbarBorder}`, background: theme.leftPaneBg, color: theme.leftPaneText, cursor: 'pointer' }}>
          Reset View
        </button>
        <div style={{ width: 1, height: 20, background: theme.toolbarBorder, margin: '0 4px' }} />
        <button
          type="button"
          onClick={() => { if (activeTab) onViewStateChange({ zoom: Math.min(6.0, (activeTab.viewState.zoom || 1) + 0.25) }); }}
          disabled={!activeTab}
          title="Zoom In (+)"
          style={{ padding: '6px 10px', border: `1px solid ${theme.toolbarBorder}`, background: theme.leftPaneBg, color: theme.leftPaneText, cursor: 'pointer', fontSize: 14 }}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => { if (activeTab) onViewStateChange({ zoom: Math.max(0.4, (activeTab.viewState.zoom || 1) - 0.25) }); }}
          disabled={!activeTab}
          title="Zoom Out (-)"
          style={{ padding: '6px 10px', border: `1px solid ${theme.toolbarBorder}`, background: theme.leftPaneBg, color: theme.leftPaneText, cursor: 'pointer', fontSize: 14 }}
        >
          −
        </button>
        <span style={{ fontSize: 11, color: theme.syntax.address, minWidth: 40 }}>
          {activeTab ? `${Math.round((activeTab.viewState.zoom || 1) * 100)}%` : ''}
        </span>
        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
          Stage Palette
          <select
            value={stagePaletteName}
            onChange={(e) => setStagePaletteName(e.target.value as StagePaletteName)}
            style={{ border: `1px solid ${theme.toolbarBorder}`, background: theme.leftPaneBg, color: theme.leftPaneText, padding: '4px 6px' }}
          >
            <option value="linxcore_default">linxcore_default</option>
            <option value="classic">classic</option>
            <option value="high_contrast">high_contrast</option>
          </select>
        </label>
        <div style={{ width: 1, height: 20, background: theme.toolbarBorder, margin: '0 4px' }} />
        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, cursor: activeTab ? 'pointer' : 'not-allowed', opacity: activeTab ? 1 : 0.5 }}>
          <input
            type="checkbox"
            checked={activeTab?.viewState.hideFlushed || false}
            onChange={(e) => { if (activeTab) onViewStateChange({ hideFlushed: e.target.checked }); }}
            disabled={!activeTab}
            style={{ cursor: activeTab ? 'pointer' : 'not-allowed' }}
          />
          Hide Flushed
        </label>
        <button
          type="button"
          onClick={() => {
            if (!activeTab) return;
            onViewStateChange({ leftPaneFolded: !activeTab.viewState.leftPaneFolded });
          }}
          disabled={!activeTab}
          style={{
            padding: '6px 10px',
            border: `1px solid ${theme.toolbarBorder}`,
            background: theme.leftPaneBg,
            color: theme.leftPaneText,
            cursor: activeTab ? 'pointer' : 'not-allowed',
            opacity: activeTab ? 1 : 0.5,
          }}
          title="Fold or unfold left row labels pane"
        >
          {activeTab?.viewState.leftPaneFolded ? 'Unfold Left' : 'Fold Left'}
        </button>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: theme.syntax.address, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '30%' }}>
          {activeTab ? activeTab.path : 'No trace loaded'}
        </div>
      </div>

      <TraceTabsBar
        tabs={tabs}
        activeTabId={activeTabId}
        theme={theme}
        onSelectTab={(id) => { void switchActiveTab(id); }}
        onCloseTab={(id) => { void closeTab(id); }}
        onOpenTrace={() => { void openTraceDialog(); }}
      />

      {activeTab && activeTab.summary && activeTab.workerHandle ? (
        <div style={{ flex: 1, position: 'relative', minHeight: 0, display: 'flex', flexDirection: 'column', background: theme.baseBg }}>
          <div style={{ flex: 1, minHeight: 0, position: 'relative', background: theme.pipelineBg }}>
            <TraceCanvasView
              key={activeTab.id}
              tabId={activeTab.id}
              summary={activeTab.summary}
              theme={theme}
              stageColorsOverride={activeStageColors}
              leftPaneFolded={activeTab.viewState.leftPaneFolded}
              viewState={activeTab.viewState}
              onViewStateChange={onViewStateChange}
              queryViewport={queryViewport}
              assemblyMap={activeTab.assemblyMap}
              onHoverChange={(hover, row) => setActiveHover({ hover, row })}
              onSelectionChange={() => {}}
              onFirstOccPaint={({ tabId, occInViewport, rowsInViewport }) => {
                const perf = perfStateRef.current.get(tabId);
                if (!perf || perf.firstOccPaintLogged) return;
                perf.firstOccPaintLogged = true;
                const now = performance.now();
                logPerf('trace_first_occ_paint', {
                  tab_id: tabId,
                  trace_path: perf.tracePath,
                  occ_in_viewport: occInViewport,
                  rows_in_viewport: rowsInViewport,
                  open_to_first_paint_ms: Number((now - perf.openStartMs).toFixed(3)),
                  ready_to_first_paint_ms: perf.sessionReadyMs !== undefined
                    ? Number((now - perf.sessionReadyMs).toFixed(3))
                    : null,
                });
              }}
              spacePan={spacePan}
            />
          </div>
          <div style={{ height: 56, minHeight: 52, borderTop: `1px solid ${theme.toolbarBorder}`, background: theme.leftPaneBg }}>
            <TraceHoverCard
              hover={detailHover}
              row={detailRow}
              theme={theme}
            />
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: activeTab?.status === 'error' ? theme.errorColor : theme.leftPaneText }}>
          <div style={{ textAlign: 'center' }}>
            {activeTab?.status === 'loading' ? 'Loading trace...' : activeTab?.error || 'Open a .linxtrace file'}
          </div>
        </div>
      )}
    </div>
  );
}
