import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LinxTraceSession } from '../lib/linxtrace';
import { TraceTabsBar } from './trace/TraceTabsBar';
import { TraceCanvasView } from './trace/TraceCanvasView';
import { TraceHoverCard, type HoverInfo } from './trace/TraceHoverCard';
import { DEFAULT_TRACE_VIEW_STATE, makeTraceTabId, makeTraceTabTitle, type TraceTabState } from '../store/traceTabsStore';
import { THEMES, type ThemeName, clamp, dirnameOf } from '../styles/traceThemes';
import type { ViewportRow } from '../lib/traceProtocol';

type ActiveHover = {
  hover: HoverInfo | null;
  row: ViewportRow | null;
};

function loadInitialTheme(): ThemeName {
  const saved = localStorage.getItem('linxcoresight.theme');
  return saved === 'light' ? 'light' : 'dark';
}

function loadTabViewState(path: string) {
  try {
    const raw = localStorage.getItem(`linxcoresight.tabstate.${path}`);
    if (!raw) return DEFAULT_TRACE_VIEW_STATE;
    const parsed = JSON.parse(raw) as Partial<typeof DEFAULT_TRACE_VIEW_STATE>;
    return {
      scrollY: Number(parsed.scrollY || 0),
      offsetX: Number(parsed.offsetX || 0),
      zoom: clamp(Number(parsed.zoom || 1), 0.4, 6.0),
      leftPaneWidth: clamp(Number(parsed.leftPaneWidth || 460), 280, 860),
      hideFlushed: Boolean(parsed.hideFlushed),
    };
  } catch {
    return DEFAULT_TRACE_VIEW_STATE;
  }
}

function saveTabViewState(path: string, state: TraceTabState['viewState']): void {
  localStorage.setItem(`linxcoresight.tabstate.${path}`, JSON.stringify(state));
}

export function LinxTraceViewer(): JSX.Element {
  const [tabs, setTabs] = useState<TraceTabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [themeName, setThemeName] = useState<ThemeName>(loadInitialTheme);
  const [spacePan, setSpacePan] = useState<boolean>(false);
  const [activeHover, setActiveHover] = useState<ActiveHover>({ hover: null, row: null });
  const [busy, setBusy] = useState<boolean>(false);

  const theme = THEMES[themeName];
  const tabsRef = useRef<TraceTabState[]>([]);
  const openingTabsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) || null, [tabs, activeTabId]);

  const patchTab = useCallback((tabId: string, patch: Partial<TraceTabState>) => {
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)));
  }, []);

  const closeWorker = useCallback(async (tab: TraceTabState | null) => {
    if (!tab?.workerHandle) return;
    try {
      await tab.workerHandle.close();
    } catch {
      // ignore close failure
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
      patchTab(tabId, { status: 'ready', summary: session.summary, workerHandle: session, error: undefined });
    } catch (err) {
      patchTab(tabId, { status: 'error', error: String(err), workerHandle: undefined });
    } finally {
      openingTabsRef.current.delete(tabId);
    }
  }, [patchTab]);

  const switchActiveTab = useCallback(async (tabId: string) => {
    if (tabId === activeTabId) return;
    const prev = tabsRef.current.find((t) => t.id === activeTabId) || null;
    if (prev?.workerHandle) {
      await closeWorker(prev);
      patchTab(prev.id, { workerHandle: undefined });
    }
    setActiveTabId(tabId);
  }, [activeTabId, closeWorker, patchTab]);

  const openTracePath = useCallback(async (tracePath: string) => {
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
    setTabs((prev) => [...prev, tab]);
    await switchActiveTab(tabId);
  }, [switchActiveTab]);

  const openTraceDialog = useCallback(async () => {
    const lastDir = localStorage.getItem('linxcoresight.lastOpenDir') || '/Users/zhoubot/LinxCore/generated/linxtrace';
    const dlg = await window.electronAPI.openFileDialog({
      defaultPath: lastDir,
      filters: [
        { name: 'LinxTrace', extensions: ['jsonl'] },
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
    if (last) {
      void openTracePath(last);
    }
  }, [openTracePath]);

  useEffect(() => {
    if (!activeTab) return;
    localStorage.setItem('linxcoresight.lastTracePath', activeTab.path);
    if (!activeTab.workerHandle && activeTab.status !== 'loading') {
      void ensureTabSession(activeTab.id);
    }
  }, [activeTab, ensureTabSession]);

  useEffect(() => {
    setActiveHover({ hover: null, row: null });
  }, [activeTabId]);

  useEffect(() => () => {
    void Promise.all(tabsRef.current.map((tab) => closeWorker(tab)));
  }, [closeWorker]);

  const onViewStateChange = useCallback((patch: Partial<TraceTabState['viewState']>) => {
    if (!activeTab) return;
    const next = { ...activeTab.viewState, ...patch };
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
      patchTab(activeTab.id, { workerHandle: undefined, status: 'loading', error: undefined });
      await ensureTabSession(activeTab.id);
    } finally {
      setBusy(false);
    }
  }, [activeTab, closeWorker, patchTab, ensureTabSession]);

  const resetView = useCallback(() => {
    if (!activeTab) return;
    const next = { ...DEFAULT_TRACE_VIEW_STATE };
    patchTab(activeTab.id, { viewState: next });
    saveTabViewState(activeTab.path, next);
  }, [activeTab, patchTab]);

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: `1px solid ${theme.toolbarBorder}`, background: theme.toolbarBg }}>
        <button type="button" onClick={() => void openTraceDialog()} style={{ padding: '6px 10px', border: `1px solid ${theme.toolbarBorder}`, background: theme.leftPaneBg, color: theme.leftPaneText, cursor: 'pointer' }}>
          Open
        </button>
        <button type="button" onClick={() => void reloadActive()} disabled={!activeTab || busy} style={{ padding: '6px 10px', border: `1px solid ${theme.toolbarBorder}`, background: theme.leftPaneBg, color: theme.leftPaneText, cursor: 'pointer' }}>
          Reload
        </button>
        <button type="button" onClick={resetView} disabled={!activeTab} style={{ padding: '6px 10px', border: `1px solid ${theme.toolbarBorder}`, background: theme.leftPaneBg, color: theme.leftPaneText, cursor: 'pointer' }}>
          Reset View
        </button>
        <label style={{ fontSize: 12 }}>
          Theme
          <select value={themeName} onChange={(e) => setThemeName(e.target.value === 'light' ? 'light' : 'dark')} style={{ marginLeft: 6, background: theme.leftPaneBg, color: theme.leftPaneText, border: `1px solid ${theme.toolbarBorder}` }}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: theme.syntax.address, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '45%' }}>
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
        <div style={{ flex: 1, position: 'relative' }}>
          <TraceCanvasView
            key={activeTab.id}
            tabId={activeTab.id}
            summary={activeTab.summary}
            theme={theme}
            viewState={activeTab.viewState}
            onViewStateChange={onViewStateChange}
            queryViewport={queryViewport}
            onHoverChange={(hover, row) => setActiveHover({ hover, row })}
            spacePan={spacePan}
          />
          <TraceHoverCard hover={activeHover.hover} row={activeHover.row} theme={theme} />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: activeTab?.status === 'error' ? theme.errorColor : theme.leftPaneText }}>
          <div style={{ textAlign: 'center' }}>
            {activeTab?.status === 'loading' ? 'Loading trace...' : activeTab?.error || 'Open a .linxtrace.jsonl file'}
          </div>
        </div>
      )}
    </div>
  );
}
