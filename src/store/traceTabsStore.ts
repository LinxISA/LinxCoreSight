import type { LinxTraceSession, LinxTraceSessionSummary } from '../lib/linxtrace';

export type TraceTabStatus = 'idle' | 'loading' | 'ready' | 'error';

export type TraceViewState = {
  scrollY: number;
  offsetX: number;
  zoom: number;
  leftPaneWidth: number;
  hideFlushed: boolean;
};

export type TraceTabState = {
  id: string;
  path: string;
  title: string;
  status: TraceTabStatus;
  error?: string;
  summary?: LinxTraceSessionSummary;
  viewState: TraceViewState;
  workerHandle?: LinxTraceSession;
};

export const DEFAULT_TRACE_VIEW_STATE: TraceViewState = {
  scrollY: 0,
  offsetX: 0,
  zoom: 1.0,
  leftPaneWidth: 460,
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
