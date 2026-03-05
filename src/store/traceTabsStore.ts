import type { LinxTraceSession, LinxTraceSessionSummary } from '../lib/linxtrace';

export type TraceTabStatus = 'idle' | 'loading' | 'ready' | 'error';

export type TraceViewState = {
  scrollY: number;
  offsetX: number;
  zoom: number;
  leftPaneWidth: number;
  leftPaneFolded: boolean;
  hideFlushed: boolean;
};

export type TraceTabState = {
  id: string;
  path: string;
  title: string;
  status: TraceTabStatus;
  error?: string;
  assemblyMap?: Record<string, string>;
  assemblyLoading?: boolean;
  assemblyError?: string;
  assemblySource?: string;
  summary?: LinxTraceSessionSummary;
  viewState: TraceViewState;
  workerHandle?: LinxTraceSession;
};

export const DEFAULT_TRACE_VIEW_STATE: TraceViewState = {
  scrollY: 0,
  offsetX: 0,
  zoom: 1.0,
  leftPaneWidth: 460,
  leftPaneFolded: false,
  hideFlushed: false,
};

export function makeTraceTabId(path: string): string {
  return `trace:${path}`;
}

export function makeTraceTabTitle(path: string): string {
  const norm = path.replace(/\\/g, '/');
  const parts = norm.split('/');
  return parts[parts.length - 1] || path;
}
