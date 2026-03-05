import React from 'react';
import type { TraceTabState } from '../../store/traceTabsStore';
import type { ThemeSpec } from '../../styles/traceThemes';

type TraceTabsBarProps = {
  tabs: TraceTabState[];
  activeTabId: string | null;
  theme: ThemeSpec;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onOpenTrace: () => void;
};

export function TraceTabsBar(props: TraceTabsBarProps): JSX.Element {
  const { tabs, activeTabId, theme, onSelectTab, onCloseTab, onOpenTrace } = props;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        borderBottom: `1px solid ${theme.toolbarBorder}`,
        background: theme.toolbarBg,
        padding: '2px 4px',
        overflowX: 'auto',
      }}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        const statusColor = tab.status === 'error'
          ? theme.errorColor
          : tab.status === 'loading'
            ? '#D69E2E'
            : tab.status === 'ready'
              ? '#4CAF50'
              : '#8a94b0';
        return (
          <div
            key={tab.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              maxWidth: 360,
              border: `1px solid ${active ? theme.leftPaneText : theme.toolbarBorder}`,
              background: active ? theme.leftPaneBg : theme.toolbarBg,
              color: theme.leftPaneText,
              borderRadius: 3,
            }}
          >
            <button
              type="button"
              onClick={() => onSelectTab(tab.id)}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                padding: '4px 6px',
                cursor: 'pointer',
                textAlign: 'left',
                maxWidth: 320,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace",
                fontSize: 11,
              }}
              title={tab.path}
            >
              <span style={{ color: statusColor, marginRight: 6 }}>●</span>
              {tab.title}
            </button>
            <button
              type="button"
              onClick={() => onCloseTab(tab.id)}
              style={{
                border: 'none',
                borderLeft: `1px solid ${theme.toolbarBorder}`,
                background: 'transparent',
                color: theme.leftPaneText,
                width: 20,
                height: 20,
                cursor: 'pointer',
              }}
              title="Close tab"
            >
              ×
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={onOpenTrace}
        style={{
          marginLeft: tabs.length > 0 ? 2 : 0,
          padding: '3px 7px',
          border: `1px solid ${theme.toolbarBorder}`,
          background: theme.leftPaneBg,
          color: theme.leftPaneText,
          cursor: 'pointer',
          borderRadius: 3,
          fontSize: 12,
        }}
      >
        + Open
      </button>
    </div>
  );
}
