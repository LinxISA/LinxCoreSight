import React, { useState } from 'react';
import { useIDEStore } from '../../store/ideStore';
import { Search, Filter, Download, ChevronRight, ChevronDown } from 'lucide-react';

// Sample trace data
interface TraceEntry {
  id: number;
  cycle: number;
  pc: string;
  instruction: string;
  registers: Record<string, string>;
  memory?: string;
}

const sampleTrace: TraceEntry[] = [
  { id: 0, cycle: 0, pc: '0x1000', instruction: 'add x1, x2, x3', registers: { 'x1': '0x00000000', 'x2': '0x00000001', 'x3': '0x00000002' }},
  { id: 1, cycle: 1, pc: '0x1004', instruction: 'sub x4, x5, x6', registers: { 'x4': '0xffffffff', 'x5': '0x00000005', 'x6': '0x00000006' }},
  { id: 2, cycle: 2, pc: '0x1008', instruction: 'ld x7, 0(x8)', registers: { 'x7': '0x12345678', 'x8': '0x00002000' }},
  { id: 3, cycle: 3, pc: '0x100c', instruction: 'st x9, 0(x10)', registers: { 'x9': '0xdeadbeef', 'x10': '0x00002000' }},
  { id: 4, cycle: 4, pc: '0x1010', instruction: 'beq x1, x2, 0x20', registers: { 'x1': '0x00000000', 'x2': '0x00000001' }},
  { id: 5, cycle: 5, pc: '0x1014', instruction: 'jal x0, 0x100', registers: { 'x0': '0x00001014', 'ra': '0x00001018' }},
  { id: 6, cycle: 6, pc: '0x1100', instruction: 'jr ra', registers: { 'ra': '0x00001018' }},
  { id: 7, cycle: 7, pc: '0x1018', instruction: 'nop', registers: {}},
  { id: 8, cycle: 8, pc: '0x101c', instruction: 'li x5, 0x42', registers: { 'x5': '0x00000042' }},
  { id: 9, cycle: 9, pc: '0x1020', instruction: 'and x6, x5, x7', registers: { 'x6': '0x00000040', 'x5': '0x00000042', 'x7': '0x12345678' }},
];

export function TracePanel() {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const toggleEntry = (id: number) => {
    const newExpanded = new Set(expandedEntries);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedEntries(newExpanded);
  };

  const filteredTrace = searchTerm
    ? sampleTrace.filter(entry => 
        entry.instruction.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.pc.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : sampleTrace;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-janus-border bg-janus-bg-tertiary">
        <span className="text-sm font-medium text-janus-text-primary">Execution Trace</span>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded text-janus-text-secondary hover:text-janus-text-primary ${showFilters ? 'bg-janus-border' : 'hover:bg-janus-border'}`}
            title="Filters"
          >
            <Filter className="w-4 h-4" />
          </button>
          <button 
            className="p-1.5 hover:bg-janus-border rounded text-janus-text-secondary hover:text-janus-text-primary"
            title="Export Trace"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-3 py-2 border-b border-janus-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-janus-text-muted" />
          <input 
            type="text"
            placeholder="Search instructions or PC..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-8"
          />
        </div>
      </div>

      {/* Filter Options */}
      {showFilters && (
        <div className="px-3 py-2 border-b border-janus-border bg-janus-bg-tertiary text-xs">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-janus-text-secondary">
              <input type="checkbox" className="rounded" defaultChecked />
              Show Fetch
            </label>
            <label className="flex items-center gap-2 text-janus-text-secondary">
              <input type="checkbox" className="rounded" defaultChecked />
              Show Decode
            </label>
            <label className="flex items-center gap-2 text-janus-text-secondary">
              <input type="checkbox" className="rounded" defaultChecked />
              Show Execute
            </label>
            <label className="flex items-center gap-2 text-janus-text-secondary">
              <input type="checkbox" className="rounded" defaultChecked />
              Show Memory
            </label>
          </div>
        </div>
      )}

      {/* Trace List */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-janus-bg-tertiary sticky top-0">
            <tr className="text-left text-janus-text-secondary">
              <th className="px-3 py-2 font-medium w-16">Cycle</th>
              <th className="px-3 py-2 font-medium w-20">PC</th>
              <th className="px-3 py-2 font-medium">Instruction</th>
              <th className="px-3 py-2 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filteredTrace.map((entry) => (
              <React.Fragment key={entry.id}>
                <tr 
                  className="border-b border-janus-border hover:bg-janus-bg-tertiary cursor-pointer font-mono text-xs"
                  onClick={() => toggleEntry(entry.id)}
                >
                  <td className="px-3 py-2 text-janus-accent-cyan">{entry.cycle}</td>
                  <td className="px-3 py-2 text-janus-accent-purple">{entry.pc}</td>
                  <td className="px-3 py-2 text-janus-text-primary">{entry.instruction}</td>
                  <td className="px-3 py-2 text-janus-text-muted">
                    {expandedEntries.has(entry.id) ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </td>
                </tr>
                {expandedEntries.has(entry.id) && (
                  <tr className="border-b border-janus-border bg-janus-bg-primary">
                    <td colSpan={4} className="px-3 py-2">
                      <div className="text-xs space-y-1">
                        <div className="text-janus-text-secondary font-medium mb-1">Register State:</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
                          {Object.entries(entry.registers).map(([reg, val]) => (
                            <div key={reg} className="flex justify-between">
                              <span className="text-janus-accent-orange">{reg}:</span>
                              <span className="text-janus-text-primary">{val}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {filteredTrace.length === 0 && (
          <div className="flex items-center justify-center h-32 text-janus-text-muted">
            No trace entries found
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="px-3 py-2 border-t border-janus-border bg-janus-bg-tertiary text-xs text-janus-text-secondary">
        {filteredTrace.length} instructions traced
      </div>
    </div>
  );
}
