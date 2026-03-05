import React, { useMemo } from 'react';
import type { ThemeSpec } from '../../styles/traceThemes';
import { formatHexCompact, scrubDetail } from '../../styles/traceThemes';
import type { ViewportRow } from '../../lib/traceProtocol';

export type HoverInfo = {
  rowIdx: number;
  cycle: number;
  stage?: string;
  lane?: string;
  cause?: string;
  hits?: Array<{ stage: string; lane: string; cause?: string; stall?: number }>;
};

type TraceHoverCardProps = {
  hover: HoverInfo | null;
  row: ViewportRow | null;
  theme: ThemeSpec;
};

type FieldToken = { key: string; value: string };

function pushField(out: FieldToken[], key: string, value: unknown): void {
  if (value === null || value === undefined) return;
  const text = String(value).trim();
  if (!text || text === '-1' || text === '0x-1' || text === '0x0') return;
  out.push({ key, value: text });
}

function parseDetailFields(detail: string): FieldToken[] {
  if (!detail) return [];
  const out: FieldToken[] = [];
  const parts = detail
    .split('\n')
    .flatMap((line) => line.split('|'))
    .flatMap((line) => line.split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  for (const token of parts) {
    const eq = token.indexOf('=');
    const cln = token.indexOf(':');
    const sep = eq >= 0 ? eq : cln;
    if (sep > 0) {
      pushField(out, token.slice(0, sep).trim(), token.slice(sep + 1).trim());
    } else {
      pushField(out, 'info', token);
    }
    if (out.length >= 24) break;
  }
  return out;
}

function Pill(props: { theme: ThemeSpec; keyName: string; value: string; accent?: string }): JSX.Element {
  const { theme, keyName, value, accent } = props;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        border: `1px solid ${theme.toolbarBorder}`,
        borderRadius: 4,
        padding: '1px 5px',
        background: accent || theme.baseBg,
        color: theme.leftPaneText,
        fontSize: 9,
        lineHeight: 1.25,
      }}
    >
      <span style={{ color: theme.syntax.address }}>{keyName}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export function TraceHoverCard(props: TraceHoverCardProps): JSX.Element | null {
  const { hover, row, theme } = props;
  const detail = scrubDetail(row?.detailLabel || '');
  const summaryFields = useMemo(() => {
    const out: FieldToken[] = [];
    if (!row) return out;
    pushField(out, 'row', `${row.rowId}`);
    pushField(out, 'kind', row.rowKind);
    pushField(out, 'entity', row.entityKind);
    pushField(out, 'cycle', hover?.cycle);
    pushField(out, 'stage', hover?.stage);
    pushField(out, 'lane', hover?.lane);
    pushField(out, 'hits', hover?.hits?.length || '');
    pushField(out, 'cause', hover?.cause && hover.cause !== '0' ? hover.cause : '');
    pushField(out, 'seq', typeof row.seq === 'number' && row.seq >= 0 ? row.seq : '');
    pushField(out, 'uop', row.uopUid ? formatHexCompact(row.uopUid) : '');
    pushField(out, 'block', row.blockUid ? formatHexCompact(row.blockUid) : '');
    pushField(out, 'bid', row.blockBid ? formatHexCompact(row.blockBid) : '');
    pushField(out, 'retire', row.retireCycle >= 0 ? row.retireCycle : '');
    pushField(out, 'status', row.retireStatus);
    return out;
  }, [row, hover]);
  const hitFields = useMemo(() => {
    if (!hover?.hits || hover.hits.length === 0) return [] as FieldToken[];
    const out: FieldToken[] = [];
    for (const h of hover.hits) {
      const c = h.cause && h.cause !== '0' ? ` cause=${h.cause}` : '';
      const st = h.stall ? ' stall=1' : '';
      out.push({ key: 'hit', value: `${h.stage}@${h.lane}${c}${st}` });
      if (out.length >= 24) break;
    }
    return out;
  }, [hover?.hits]);
  const detailFields = useMemo(() => parseDetailFields(detail), [detail]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        borderTop: `1px solid ${theme.toolbarBorder}`,
        background: theme.leftPaneBg,
        padding: 1,
        fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace",
        fontSize: 9,
        color: theme.leftPaneText,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignContent: 'flex-start',
          gap: 4,
          height: '100%',
          overflow: 'auto',
          background: theme.baseBg,
          border: `1px solid ${theme.toolbarBorder}`,
          padding: 2,
        }}
      >
        {!row ? (
          <div style={{ color: theme.syntax.address }}>Hover a pipeline stage to view details.</div>
        ) : (
          <>
            {summaryFields.map((f, idx) => (
              <Pill key={`s-${idx}-${f.key}`} theme={theme} keyName={f.key} value={f.value} />
            ))}
            {hitFields.map((f, idx) => (
              <Pill key={`h-${idx}-${f.key}`} theme={theme} keyName={f.key} value={f.value} accent={'#7c3aed22'} />
            ))}
            {detailFields.length > 0 ? detailFields.map((f, idx) => (
              <Pill key={`d-${idx}-${f.key}`} theme={theme} keyName={f.key} value={f.value} accent={'#ffffff11'} />
            )) : (
              <span style={{ color: theme.syntax.address }}>No extra detail fields.</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
