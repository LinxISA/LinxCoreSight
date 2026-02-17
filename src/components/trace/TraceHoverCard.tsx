import React from 'react';
import type { ThemeSpec } from '../../styles/traceThemes';
import { formatHexCompact, scrubDetail } from '../../styles/traceThemes';
import type { ViewportRow } from '../../lib/traceProtocol';

export type HoverInfo = {
  rowIdx: number;
  cycle: number;
  stage?: string;
  lane?: string;
  cause?: string;
};

type TraceHoverCardProps = {
  hover: HoverInfo | null;
  row: ViewportRow | null;
  theme: ThemeSpec;
};

export function TraceHoverCard(props: TraceHoverCardProps): JSX.Element | null {
  const { hover, row, theme } = props;
  if (!hover || !row) return null;
  const detail = scrubDetail(row.detailLabel || '');

  return (
    <div
      style={{
        position: 'absolute',
        right: 10,
        top: 10,
        width: 460,
        maxHeight: '55%',
        overflow: 'auto',
        border: `1px solid ${theme.toolbarBorder}`,
        background: theme.hoverBg,
        padding: 8,
        fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace",
        fontSize: 11,
        whiteSpace: 'pre-wrap',
        color: theme.leftPaneText,
      }}
    >
      <div><b>row</b>: {row.rowId} ({row.rowKind})</div>
      {hover.cycle >= 0 && <div><b>cycle</b>: {hover.cycle}</div>}
      {hover.stage && <div><b>stage</b>: {hover.stage}</div>}
      {hover.lane && <div><b>lane</b>: {hover.lane}</div>}
      {hover.cause && hover.cause !== '0' && <div><b>cause</b>: {hover.cause}</div>}
      {row.uopUid && row.uopUid !== '0x0' && <div><b>uop_uid</b>: {formatHexCompact(row.uopUid)}</div>}
      {row.blockUid && row.blockUid !== '0x0' && <div><b>block_uid</b>: {formatHexCompact(row.blockUid)}</div>}
      {row.retireCycle >= 0 && <div><b>retire_cycle</b>: {row.retireCycle}</div>}
      {row.retireStatus && <div><b>retire_status</b>: {row.retireStatus}</div>}
      {detail && <div style={{ marginTop: 8 }}>{detail}</div>}
    </div>
  );
}

