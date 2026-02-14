/**
 * Memory Panel Component
 * Shows memory contents at specified addresses
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useIDEStore } from '../../store/ideStore';
import { MemoryStick, RefreshCw, Search, Copy, Download, Settings, ChevronDown, ChevronRight } from 'lucide-react';

interface MemoryRegion {
  name: string;
  start: number;
  end: number;
  permissions: string;
}

interface MemoryCell {
  address: number;
  bytes: number[];
  ascii: string;
}

const DEFAULT_REGIONS: MemoryRegion[] = [
  { name: 'RAM', start: 0x80000000, end: 0x80000000 + 512 * 1024, permissions: 'rwx' },
  { name: 'VRAM', start: 0x10000000, end: 0x10000000 + 16 * 1024, permissions: 'rwx' },
  { name: 'UART', start: 0x10000000, end: 0x10000000 + 0x100, permissions: 'rw-' },
  { name: 'EXIT_CODE', start: 0x11001000, end: 0x11001008, permissions: 'rw-' },
];

export function MemoryPanel() {
  const store = useIDEStore();
  const { currentProject, binaryPath, compileStatus } = store;
  const emulatorRunning = store.emulatorStatus === 'running';
  
  const [memoryRegions] = useState<MemoryRegion[]>(DEFAULT_REGIONS);
  const [selectedRegion, setSelectedRegion] = useState<MemoryRegion>(DEFAULT_REGIONS[0]);
  const [startAddress, setStartAddress] = useState<number>(0x80000000);
  const [wordSize, setWordSize] = useState<32 | 64>(64);
  const [displayFormat, setDisplayFormat] = useState<'hex' | 'decimal' | 'binary'>('hex');
  const [rows, setRows] = useState<number>(32);
  const [memoryData, setMemoryData] = useState<MemoryCell[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Generate sample memory data
  const generateMemoryData = useCallback(() => {
    setIsLoading(true);
    setError(null);

    try {
      const cells: MemoryCell[] = [];
      const bytesPerRow = wordSize === 64 ? 8 : 4;
      
      for (let i = 0; i < rows; i++) {
        const addr = startAddress + i * bytesPerRow;
        const bytes: number[] = [];
        
        for (let j = 0; j < bytesPerRow; j++) {
          // Generate pseudo-random but deterministic data based on address
          const byte = ((addr + j) * 31 + 17) % 256;
          bytes.push(byte);
        }
        
        // Convert to ASCII (printable chars only)
        const ascii = bytes.map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
        
        cells.push({ address: addr, bytes, ascii });
      }
      
      setMemoryData(cells);
    } catch (err: any) {
      setError(`Failed to generate memory data: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [startAddress, wordSize, rows]);

  // Format value based on display format
  const formatValue = (bytes: number[]): string => {
    if (wordSize === 64) {
      const value = bytes.reduce((acc, b, i) => acc + (b << (i * 8)), 0);
      switch (displayFormat) {
        case 'hex': return '0x' + value.toString(16).padStart(16, '0');
        case 'decimal': return value.toString(10);
        case 'binary': return '0b' + bytes.reverse().map(b => b.toString(2).padStart(8, '0')).join('');
      }
    } else {
      const value = bytes.reduce((acc, b, i) => acc + (b << (i * 8)), 0);
      switch (displayFormat) {
        case 'hex': return '0x' + value.toString(16).padStart(8, '0');
        case 'decimal': return value.toString(10);
        case 'binary': return '0b' + bytes.reverse().map(b => b.toString(2).padStart(8, '0')).join('');
      }
    }
  };

  // Handle address input change
  const handleAddressChange = (value: string) => {
    // Remove 0x prefix if present
    const addrStr = value.startsWith('0x') ? value.slice(2) : value;
    const addr = parseInt(addrStr, 16);
    if (!isNaN(addr)) {
      setStartAddress(addr);
    }
  };

  // Copy memory dump to clipboard
  const handleCopy = () => {
    const text = memoryData.map(cell => {
      const offset = wordSize === 64 ? '0x' + cell.address.toString(16).padStart(16, '0') : '0x' + cell.address.toString(16).padStart(8, '0');
      const hex = cell.bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
      return `${offset}  ${hex}  |${cell.ascii}|`;
    }).join('\n');
    
    navigator.clipboard.writeText(text);
  };

  // Download memory dump
  const handleDownload = () => {
    const text = memoryData.map(cell => {
      const offset = wordSize === 64 ? '0x' + cell.address.toString(16).padStart(16, '0') : '0x' + cell.address.toString(16).padStart(8, '0');
      const hex = cell.bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
      return `${offset}  ${hex}  |${cell.ascii}|`;
    }).join('\n');
    
    const header = `Memory Dump - Start: 0x${startAddress.toString(16)}, Word Size: ${wordSize}bit\n${'='.repeat(60)}\n\n`;
    const blob = new Blob([header + text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'memory_dump.bin';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter memory data based on search
  const filteredData = searchTerm
    ? memoryData.filter(cell => 
        cell.ascii.includes(searchTerm) ||
        cell.bytes.some(b => b.toString(16).includes(searchTerm.toLowerCase()))
      )
    : memoryData;

  // Auto-generate memory when parameters change
  useEffect(() => {
    generateMemoryData();
  }, [generateMemoryData]);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2d3a4d] bg-[#111820]">
        <div className="flex items-center gap-2">
          <MemoryStick className="w-4 h-4 text-[#00d9ff]" />
          <span className="text-sm font-medium text-[#e6edf3]">Memory</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={generateMemoryData}
            disabled={isLoading}
            className="p-1.5 hover:bg-[#1a2332] rounded text-[#8b949e] hover:text-[#e6edf3]"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleCopy}
            disabled={memoryData.length === 0}
            className="p-1.5 hover:bg-[#1a2332] rounded text-[#8b949e] hover:text-[#e6edf3]"
            title="Copy"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={handleDownload}
            disabled={memoryData.length === 0}
            className="p-1.5 hover:bg-[#1a2332] rounded text-[#8b949e] hover:text-[#e6edf3]"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="px-3 py-2 border-b border-[#2d3a4d] bg-[#0d1117]">
        <div className="flex flex-wrap items-center gap-3">
          {/* Region Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8b949e]">Region:</span>
            <select
              value={selectedRegion.name}
              onChange={(e) => {
                const region = memoryRegions.find(r => r.name === e.target.value);
                if (region) {
                  setSelectedRegion(region);
                  setStartAddress(region.start);
                }
              }}
              className="px-2 py-1 text-xs bg-[#0a0e14] border border-[#2d3a4d] rounded text-[#e6edf3]"
            >
              {memoryRegions.map(region => (
                <option key={region.name} value={region.name}>
                  {region.name} (0x{region.start.toString(16)})
                </option>
              ))}
            </select>
          </div>

          {/* Address Input */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8b949e]">Address:</span>
            <input
              type="text"
              value={'0x' + startAddress.toString(16)}
              onChange={(e) => handleAddressChange(e.target.value)}
              className="w-28 px-2 py-1 text-xs bg-[#0a0e14] border border-[#2d3a4d] rounded text-[#e6edf3] font-mono"
            />
          </div>

          {/* Word Size */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8b949e]">Size:</span>
            <select
              value={wordSize}
              onChange={(e) => setWordSize(parseInt(e.target.value) as 32 | 64)}
              className="px-2 py-1 text-xs bg-[#0a0e14] border border-[#2d3a4d] rounded text-[#e6edf3]"
            >
              <option value={32}>32-bit</option>
              <option value={64}>64-bit</option>
            </select>
          </div>

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

          {/* Rows */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8b949e]">Rows:</span>
            <input
              type="number"
              value={rows}
              onChange={(e) => setRows(Math.max(1, Math.min(256, parseInt(e.target.value) || 32)))}
              min={1}
              max={256}
              className="w-16 px-2 py-1 text-xs bg-[#0a0e14] border border-[#2d3a4d] rounded text-[#e6edf3]"
            />
          </div>

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

      {/* Memory Content */}
      <div className="flex-1 overflow-auto p-2 font-mono text-xs">
        {error ? (
          <div className="p-4 text-[#ff4757]">
            {error}
          </div>
        ) : isLoading ? (
          <div className="p-4 text-[#8b949e] flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading memory...
          </div>
        ) : filteredData.length > 0 ? (
          <div className="space-y-0">
            {/* Header */}
            <div className="flex px-2 py-1 text-[#8b949e] border-b border-[#2d3a4d]">
              <span className="w-20">Offset</span>
              <span className="flex-1">
                {wordSize === 64 ? '00 01 02 03 04 05 06 07' : '00 01 02 03'}
              </span>
              <span className="w-8 text-center">ASCII</span>
            </div>
            
            {/* Data Rows */}
            {filteredData.map((cell, idx) => (
              <div
                key={idx}
                className="flex px-2 py-0.5 hover:bg-[#1a2332] text-[#e6edf3]"
              >
                <span className="w-20 text-[#a855f7]">
                  {wordSize === 64 
                    ? '0x' + cell.address.toString(16).padStart(16, '0').slice(0, 8)
                    : '0x' + cell.address.toString(16).padStart(8, '0')
                  }
                </span>
                <span className="flex-1 text-[#00d9ff] tracking-widest">
                  {cell.bytes.map(b => b.toString(16).padStart(2, '0')).join(' ')}
                </span>
                <span className="w-8 text-center text-[#22c55e]">
                  {cell.ascii}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 text-[#6e7681] text-center">
            <MemoryStick className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No memory data available</p>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="px-3 py-1 border-t border-[#2d3a4d] bg-[#111820] text-xs text-[#6e7681] flex justify-between">
        <span>
          {selectedRegion.name}: 0x{selectedRegion.start.toString(16)} - 0x{selectedRegion.end.toString(16)}
        </span>
        <span>
          {filteredData.length} rows | {wordSize}-bit | {displayFormat.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
