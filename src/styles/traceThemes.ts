export type ThemeName = 'dark' | 'light';
export type StagePaletteName = 'linxcore_default' | 'classic' | 'high_contrast';

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

export type StagePalette = Record<string, string>;

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
    selectedRowFill: '#2E3A55',
    hoverBg: '#121620',
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
    selectedRowFill: '#DCE8FF',
    hoverBg: '#FFFFFF',
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

export const STAGE_PALETTES: Record<StagePaletteName, StagePalette> = {
  linxcore_default: {
    F0: '#5BC0EB', F1: '#5BC0EB', F2: '#5BC0EB', F3: '#5BC0EB', F4: '#5BC0EB', IB: '#4CC9F0',
    D1: '#A78BFA', D2: '#A78BFA', D3: '#A78BFA', IQ: '#8B5CF6', S1: '#8B5CF6', S2: '#8B5CF6',
    P1: '#34D399', I1: '#34D399', I2: '#34D399', E1: '#10B981', E2: '#10B981', E3: '#10B981', E4: '#10B981',
    W1: '#22C55E', W2: '#22C55E',
    LIQ: '#FBBF24', LHQ: '#FBBF24', STQ: '#F59E0B', SCB: '#F59E0B', MDB: '#D97706', L1D: '#B45309',
    BISQ: '#60A5FA', BCTRL: '#3B82F6', TMU: '#818CF8', TMA: '#6366F1', CUBE: '#4F46E5', VEC: '#4338CA', TAU: '#3730A3',
    BROB: '#F97316', ROB: '#FB923C', CMT: '#16A34A', FLS: '#EF4444', XCHK: '#DC2626',
  },
  classic: {
    F0: '#6EC6FF', F1: '#6EC6FF', F2: '#6EC6FF', F3: '#6EC6FF', F4: '#6EC6FF', IB: '#53B7FF',
    D1: '#B39DDB', D2: '#B39DDB', D3: '#B39DDB', IQ: '#9575CD', S1: '#9575CD', S2: '#9575CD',
    P1: '#80CBC4', I1: '#80CBC4', I2: '#80CBC4', E1: '#4DB6AC', E2: '#4DB6AC', E3: '#4DB6AC', E4: '#4DB6AC',
    W1: '#81C784', W2: '#81C784',
    LIQ: '#FFD54F', LHQ: '#FFD54F', STQ: '#FFCA28', SCB: '#FFB300', MDB: '#FFA000', L1D: '#FF8F00',
    BISQ: '#90CAF9', BCTRL: '#64B5F6', TMU: '#7986CB', TMA: '#5C6BC0', CUBE: '#3F51B5', VEC: '#3949AB', TAU: '#303F9F',
    BROB: '#FF8A65', ROB: '#FF7043', CMT: '#66BB6A', FLS: '#E53935', XCHK: '#C62828',
  },
  high_contrast: {
    F0: '#00E5FF', F1: '#00E5FF', F2: '#00E5FF', F3: '#00E5FF', F4: '#00E5FF', IB: '#00B8D4',
    D1: '#D500F9', D2: '#D500F9', D3: '#D500F9', IQ: '#AA00FF', S1: '#AA00FF', S2: '#AA00FF',
    P1: '#00E676', I1: '#00E676', I2: '#00E676', E1: '#00C853', E2: '#00C853', E3: '#00C853', E4: '#00C853',
    W1: '#64DD17', W2: '#64DD17',
    LIQ: '#FFD600', LHQ: '#FFD600', STQ: '#FFAB00', SCB: '#FF9100', MDB: '#FF6D00', L1D: '#FF3D00',
    BISQ: '#40C4FF', BCTRL: '#2979FF', TMU: '#7C4DFF', TMA: '#651FFF', CUBE: '#6200EA', VEC: '#4527A0', TAU: '#311B92',
    BROB: '#FF6E40', ROB: '#FF3D00', CMT: '#00E676', FLS: '#FF1744', XCHK: '#D50000',
  },
};

export function resolveStageColors(metaStageColors: Record<string, string>, palette: StagePalette): Record<string, string> {
  // Deterministic precedence: trace metadata overrides selected palette.
  return { ...palette, ...(metaStageColors || {}) };
}

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
