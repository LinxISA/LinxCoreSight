export type ObjdumpAssemblyMap = Record<string, string>;

export function normalizeHexAddress(raw: string): string | null {
  const trimmed = String(raw || '').trim().toLowerCase().replace(/^0x/i, '');
  if (!trimmed) {
    return null;
  }
  if (!/^[0-9a-f]+$/.test(trimmed)) {
    return null;
  }
  return trimmed.replace(/^0+/, '') || '0';
}

export function extractAddressFromLabel(label: string): string | null {
  const match = /^\s*(?:0x)?([0-9a-fA-F]+)\b/.exec(String(label || ''));
  if (!match) {
    return null;
  }
  return normalizeHexAddress(match[1]);
}

export function parseObjdumpAssembly(raw: string): ObjdumpAssemblyMap {
  const out: ObjdumpAssemblyMap = {};
  if (!raw) {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([0-9a-fA-F]+):\s+([0-9a-fA-F]{2}(?:\s+[0-9a-fA-F]{2})+)\s+(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    const address = normalizeHexAddress(match[1]);
    if (!address) {
      continue;
    }
    const tail = match[3] ? String(match[3]).trim() : '';
    if (!tail) {
      continue;
    }
    out[address] = line.trim();
  }
  return out;
}

export function resolveAssemblyLabel(label: string, assemblyMap?: ObjdumpAssemblyMap | null): string {
  if (!assemblyMap) {
    return label;
  }
  const normalized = extractAddressFromLabel(label);
  if (!normalized) {
    return label;
  }
  return assemblyMap[normalized] || label;
}
