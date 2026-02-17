export type ThemeName = 'dark' | 'light';

export type ThemeSpec = {
  baseBg: string;
  toolbarBg: string;
  toolbarBorder: string;
  leftPaneBg: string;
  leftPaneText: string;
  pipelineBg: string;
  stripeOverlay: string;
  borderColor: string;
  errorColor: string;
  blockBoxColor: string;
  blockBoxFill: string;
  selectedRowFill: string;
  hoverBg: string;
  syntax: {
    default: string;
    address: string;
    mnemonic: string;
    bstart: string;
    register: string;
    immediate: string;
    symbol: string;
    punct: string;
  };
};

export type LabelToken = {
  text: string;
  color: string;
};

export const THEMES: Record<ThemeName, ThemeSpec> = {
  dark: {
    baseBg: '#262930',
    toolbarBg: '#252938',
    toolbarBorder: '#31374A',
    leftPaneBg: '#252938',
    leftPaneText: '#e8ecff',
    pipelineBg: '#262930',
    stripeOverlay: '#ffffff08',
    borderColor: '#f0f0f0',
    errorColor: '#ff4f4f',
    blockBoxColor: '#FFD54F',
    blockBoxFill: 'rgba(255,213,79,0.0)',
    selectedRowFill: 'rgba(117,200,255,0.16)',
    hoverBg: '#121620EE',
    syntax: {
      default: '#e8ecff',
      address: '#9aa6c8',
      mnemonic: '#75c8ff',
      bstart: '#FF3B30',
      register: '#ffd18a',
      immediate: '#9df0a7',
      symbol: '#dfb2ff',
      punct: '#bcc6e0',
    },
  },
  light: {
    baseBg: '#ffffff',
    toolbarBg: '#f8f9fc',
    toolbarBorder: '#D9DFEA',
    leftPaneBg: '#f8f9fc',
    leftPaneText: '#1b2230',
    pipelineBg: '#ffffff',
    stripeOverlay: '#00000010',
    borderColor: '#444444',
    errorColor: '#C40000',
    blockBoxColor: '#9C6A00',
    blockBoxFill: 'rgba(255,224,130,0.0)',
    selectedRowFill: 'rgba(26,88,203,0.14)',
    hoverBg: '#FFFFFFF2',
    syntax: {
      default: '#1b2230',
      address: '#6c768e',
      mnemonic: '#1a58cb',
      bstart: '#C40000',
      register: '#9a4c00',
      immediate: '#18733a',
      symbol: '#5d2aa6',
      punct: '#33415c',
    },
  },
};

export function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function dirnameOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx <= 0 ? '/' : path.slice(0, idx);
}

export function formatHexCompact(input: string): string {
  if (!input || input === '0x0') return input || '';
  const lower = input.toLowerCase();
  if (!lower.startsWith('0x')) return input;
  const body = lower.slice(2).replace(/^0+/, '') || '0';
  return `0x${body.toUpperCase()}`;
}

export function scrubDetail(detail: string): string {
  if (!detail) return '';
  const out: string[] = [];
  for (const line of detail.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (/[:=]\s*-1$/i.test(t)) continue;
    if (/\b0x-1\b/i.test(t)) continue;
    out.push(t);
  }
  return out.join('\n');
}

function isRegisterToken(tok: string): boolean {
  return /^(r\d+|sp|ra|fp|pc|s\d+|t\d+|u\d+|barg\d*|v\d+|x\d+)$/i.test(tok);
}

function isImmediateToken(tok: string): boolean {
  return /^-?(0x[0-9a-f]+|\d+)$/i.test(tok);
}

export function tokenizeLabel(label: string, rowKind: string, theme: ThemeSpec): LabelToken[] {
  if (!label) return [{ text: rowKind === 'block' ? 'BLOCK' : 'row', color: theme.syntax.default }];

  const src = label;
  const parts: LabelToken[] = [];
  const colon = src.indexOf(':');
  let asm = src;
  if (colon > 0 && /^0x[0-9a-f]+$/i.test(src.slice(0, colon).trim())) {
    parts.push({ text: src.slice(0, colon), color: theme.syntax.address });
    parts.push({ text: ':', color: theme.syntax.punct });
    parts.push({ text: ' ', color: theme.syntax.default });
    asm = src.slice(colon + 1).trimStart();
  }

  const tokens = asm.split(/(\s+|,|\(|\)|\[|\]|\{|\}|\+|\-|=|:|->)/g).filter((x) => x.length > 0);
  let mnemonicPainted = false;
  for (const tok of tokens) {
    if (/^\s+$/.test(tok)) {
      parts.push({ text: tok, color: theme.syntax.default });
      continue;
    }
    if (/^(,|\(|\)|\[|\]|\{|\}|\+|\-|=|:|->)$/.test(tok)) {
      parts.push({ text: tok, color: theme.syntax.punct });
      continue;
    }
    if (!mnemonicPainted && /^[A-Za-z_.][A-Za-z0-9_.]*$/.test(tok)) {
      mnemonicPainted = true;
      const up = tok.toUpperCase();
      const c = up.includes('BSTART') ? theme.syntax.bstart : theme.syntax.mnemonic;
      parts.push({ text: tok, color: c });
      continue;
    }
    if (isRegisterToken(tok)) {
      parts.push({ text: tok, color: theme.syntax.register });
      continue;
    }
    if (isImmediateToken(tok)) {
      parts.push({ text: tok, color: theme.syntax.immediate });
      continue;
    }
    if (tok.includes('<') || tok.includes('>') || tok.startsWith('.L') || tok.startsWith('sym_')) {
      parts.push({ text: tok, color: theme.syntax.symbol });
      continue;
    }
    if (/^0x[0-9a-f]+$/i.test(tok)) {
      parts.push({ text: tok, color: theme.syntax.address });
      continue;
    }
    parts.push({ text: tok, color: theme.syntax.default });
  }
  return parts.length > 0 ? parts : [{ text: src, color: theme.syntax.default }];
}

