/**
 * Register Panel Component
 * Shows CPU register values
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useIDEStore } from '../../store/ideStore';
import { Cpu, RefreshCw, Copy, Search, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';

interface RegisterGroup {
  name: string;
  registers: Register[];
  expanded: boolean;
}

interface Register {
  name: string;
  value: number;
  hexValue: string;
  binaryValue: string;
  description: string;
  changed?: boolean;
}

const REGISTER_GROUPS = [
  {
    name: 'General Purpose',
    registers: [
      { name: 'zero', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Hard-wired zero' },
      { name: 'ra', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Return address' },
      { name: 'sp', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Stack pointer' },
      { name: 'gp', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Global pointer' },
      { name: 'tp', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Thread pointer' },
      { name: 't0', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Temporary register 0' },
      { name: 't1', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Temporary register 1' },
      { name: 't2', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Temporary register 2' },
      { name: 't3', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Temporary register 3' },
      { name: 't4', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Temporary register 4' },
      { name: 't5', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Temporary register 5' },
      { name: 't6', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Temporary register 6' },
      { name: 's0', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Saved register 0 / Frame pointer' },
      { name: 's1', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Saved register 1' },
      { name: 's2', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Saved register 2' },
      { name: 's3', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Saved register 3' },
      { name: 's4', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Saved register 4' },
      { name: 's5', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Saved register 5' },
      { name: 's6', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Saved register 6' },
      { name: 's7', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Saved register 7' },
      { name: 's8', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Saved register 8' },
      { name: 's9', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Saved register 9' },
      { name: 's10', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Saved register 10' },
      { name: 's11', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Saved register 11' },
      { name: 'a0', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Function argument 0 / Return value 0' },
      { name: 'a1', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Function argument 1 / Return value 1' },
      { name: 'a2', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Function argument 2' },
      { name: 'a3', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Function argument 3' },
      { name: 'a4', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Function argument 4' },
      { name: 'a5', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Function argument 5' },
      { name: 'a6', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Function argument 6' },
      { name: 'a7', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Function argument 7' },
    ]
  },
  {
    name: 'Program Counter',
    registers: [
      { name: 'pc', value: 0x80000000, hexValue: '0x0000000080000000', binaryValue: '0b1000...0000', description: 'Program Counter' },
    ]
  },
  {
    name: 'Status',
    registers: [
      { name: 'mstatus', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Machine status register' },
      { name: 'mie', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Machine interrupt enable' },
      { name: 'mip', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Machine interrupt pending' },
      { name: 'mcause', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Machine cause register' },
      { name: 'mepc', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Machine exception PC' },
      { name: 'mtvec', value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', description: 'Machine trap vector' },
    ]
  },
];

export function RegisterPanel() {
  const store = useIDEStore();
  const emulatorRunning = store.emulatorStatus === 'running';
  const debugPC = (() => {
    const raw = store.registers?.pc;
    if (!raw) return undefined;
    const s = raw.startsWith('0x') ? raw.slice(2) : raw;
    const v = parseInt(s, 16);
    return Number.isFinite(v) ? v : undefined;
  })();
  
  const [groups, setGroups] = useState<RegisterGroup[]>(
    REGISTER_GROUPS.map(g => ({ ...g, expanded: g.name === 'General Purpose' }))
  );
  const [displayFormat, setDisplayFormat] = useState<'hex' | 'decimal' | 'binary'>('hex');
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyChanged, setShowOnlyChanged] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Generate random register values for demo
  const generateRegisterValues = useCallback(() => {
    setIsLoading(true);
    
    setTimeout(() => {
      const newGroups = groups.map(group => ({
        ...group,
        registers: group.registers.map(reg => {
          // Generate deterministic pseudo-random values based on register name
          let seed = reg.name.charCodeAt(0) * 17 + reg.name.length * 13;
          if (reg.name === 'pc') {
            return { ...reg, value: debugPC || 0x80000000, hexValue: '0x' + (debugPC || 0x80000000).toString(16).padStart(16, '0'), binaryValue: '0b' + (debugPC || 0x80000000).toString(2).padStart(64, '0').slice(0, 32) + '...' };
          }
          if (reg.name === 'sp') {
            return { ...reg, value: 0x8003fff0, hexValue: '0x000000008003fff0', binaryValue: '0b1000...', changed: Math.random() > 0.5 };
          }
          if (reg.name === 'zero') {
            return { ...reg, value: 0, hexValue: '0x0000000000000000', binaryValue: '0b0000...0000', changed: false };
          }
          const value = Math.floor(Math.random() * 0xFFFFFFFFFFFF) % 0x10000000000000000;
          const changed = Math.random() > 0.7;
          return {
            ...reg,
            value,
            hexValue: '0x' + value.toString(16).padStart(16, '0'),
            binaryValue: '0b' + value.toString(2).padStart(64, '0').slice(0, 32) + '...',
            changed
          };
        })
      }));
      
      setGroups(newGroups);
      setIsLoading(false);
    }, 100);
  }, [groups, debugPC]);

  // Toggle group expansion
  const toggleGroup = (groupName: string) => {
    setGroups(groups.map(g => 
      g.name === groupName ? { ...g, expanded: !g.expanded } : g
    ));
  };

  // Filter registers based on search
  const filteredGroups = groups.map(group => ({
    ...group,
    registers: group.registers.filter(reg => {
      const matchesSearch = !searchTerm || 
        reg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        reg.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        reg.hexValue.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesChanged = !showOnlyChanged || reg.changed;
      return matchesSearch && matchesChanged;
    })
  })).filter(group => group.registers.length > 0);

  // Format value based on display format
  const formatValue = (reg: Register): string => {
    switch (displayFormat) {
      case 'hex': return reg.hexValue;
      case 'decimal': return reg.value.toString(10);
      case 'binary': return reg.binaryValue;
    }
  };

  // Copy all registers to clipboard
  const handleCopy = () => {
    const text = filteredGroups.map(group => 
      `${group.name}:\n` + group.registers.map(r => `  ${r.name} = ${formatValue(r)}`).join('\n')
    ).join('\n\n');
    navigator.clipboard.writeText(text);
  };

  // Auto-refresh when emulator state changes
  useEffect(() => {
    if (emulatorRunning) {
      const interval = setInterval(generateRegisterValues, 500);
      return () => clearInterval(interval);
    }
  }, [emulatorRunning, generateRegisterValues]);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2d3a4d] bg-[#111820]">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#00d9ff]" />
          <span className="text-sm font-medium text-[#e6edf3]">Registers</span>
          {emulatorRunning && (
            <span className="px-2 py-0.5 text-xs bg-[#22c55e]/20 text-[#22c55e] rounded">Running</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={generateRegisterValues}
            disabled={isLoading}
            className="p-1.5 hover:bg-[#1a2332] rounded text-[#8b949e] hover:text-[#e6edf3]"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleCopy}
            className="p-1.5 hover:bg-[#1a2332] rounded text-[#8b949e] hover:text-[#e6edf3]"
            title="Copy"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="px-3 py-2 border-b border-[#2d3a4d] bg-[#0d1117]">
        <div className="flex flex-wrap items-center gap-3">
          {/* Display Format */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8b949e]">Format:</span>
            <select
              value={displayFormat}
              onChange={(e) => setDisplayFormat(e.target.value as 'hex' | 'decimal' | 'binary')}
              className="px-2 py-1 text-xs bg-[#0a0e14] border border-[#2d3a4d] rounded text-[#e6edf3]"
            >
              <option value="hex">Hex</option>
              <option value="decimal">Decimal</option>
              <option value="binary">Binary</option>
            </select>
          </div>

          {/* Show Only Changed */}
          <button
            onClick={() => setShowOnlyChanged(!showOnlyChanged)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded border ${
              showOnlyChanged 
                ? 'bg-[#22c55e]/20 border-[#22c55e] text-[#22c55e]' 
                : 'bg-[#0a0e14] border-[#2d3a4d] text-[#8b949e]'
            }`}
          >
            {showOnlyChanged ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            Changed
          </button>

          {/* Search */}
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-[#6e7681]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="pl-7 pr-2 py-1 text-xs bg-[#0a0e14] border border-[#2d3a4d] rounded text-[#e6edf3] w-24"
            />
          </div>
        </div>
      </div>

      {/* Register Content */}
      <div className="flex-1 overflow-auto">
        {filteredGroups.map((group) => (
          <div key={group.name} className="border-b border-[#2d3a4d]">
            {/* Group Header */}
            <button
              onClick={() => toggleGroup(group.name)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-[#111820] hover:bg-[#1a2332] text-[#e6edf3] text-left"
            >
              {group.expanded ? (
                <ChevronDown className="w-4 h-4 text-[#8b949e]" />
              ) : (
                <ChevronRight className="w-4 h-4 text-[#8b949e]" />
              )}
              <span className="font-medium">{group.name}</span>
              <span className="text-xs text-[#6e7681]">
                ({group.registers.length} registers)
              </span>
            </button>

            {/* Register List */}
            {group.expanded && (
              <div className="bg-[#0a0e14]">
                {group.registers.map((reg) => (
                  <div
                    key={reg.name}
                    className={`flex items-center px-3 py-1.5 hover:bg-[#1a2332] ${
                      reg.changed ? 'bg-[#22c55e]/10' : ''
                    }`}
                  >
                    {/* Register Name */}
                    <span className="w-16 text-sm font-medium text-[#00d9ff]">
                      {reg.name}
                    </span>
                    
                    {/* Register Value */}
                    <span className={`flex-1 font-mono text-sm ${
                      reg.changed ? 'text-[#22c55e]' : 'text-[#e6edf3]'
                    }`}>
                      {formatValue(reg)}
                    </span>

                    {/* Changed Indicator */}
                    {reg.changed && (
                      <span className="w-2 h-2 rounded-full bg-[#22c55e] ml-2" title="Changed" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Status Bar */}
      <div className="px-3 py-1 border-t border-[#2d3a4d] bg-[#111820] text-xs text-[#6e7681] flex justify-between">
        <span>
          {filteredGroups.reduce((acc, g) => acc + g.registers.length, 0)} registers
        </span>
        <span>
          {displayFormat.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
