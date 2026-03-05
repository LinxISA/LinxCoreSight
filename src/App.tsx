import React from 'react';
import { LinxTraceViewer } from './components/LinxTraceViewer';

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
  stack: string;
};

class ViewerErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, message: '', stack: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || String(error),
      stack: error?.stack || '',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Keep this visible in app logs to debug open/load failures quickly.
    console.error('LinxCoreSight: Viewer crashed', { error, componentStack: info.componentStack });
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: '100vw',
            height: '100vh',
            background: '#0a0e14',
            color: '#E6EDF3',
            fontFamily: "SFMono-Regular, Consolas, Menlo, monospace",
            padding: 20,
            overflow: 'auto',
          }}
        >
          <h2 style={{ margin: '0 0 12px 0', fontSize: 18 }}>LinxCoreSight runtime error</h2>
          <div style={{ marginBottom: 10, color: '#8B949E' }}>
            The viewer failed while rendering. Use Reload, or reopen the trace.
          </div>
          <div
            style={{
              border: '1px solid #2d3a4d',
              borderRadius: 6,
              padding: 10,
              whiteSpace: 'pre-wrap',
              background: '#111820',
            }}
          >
            <div style={{ color: '#FF6B35', marginBottom: 8 }}>{this.state.message}</div>
            {this.state.stack ? <div style={{ color: '#AAB4BF', fontSize: 12 }}>{this.state.stack}</div> : null}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App(): JSX.Element {
  return (
    <ViewerErrorBoundary>
      <LinxTraceViewer />
    </ViewerErrorBoundary>
  );
}
