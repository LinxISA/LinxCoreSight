/**
 * Assembly Panel Component
 * Shows disassembly of compiled binary
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useIDEStore } from '../../store/ideStore';
import { FileCode, Copy, Download, Search, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

interface AssemblyFunction {
  name: string;
  address: number;
  instructions: AssemblyInstruction[];
}

interface AssemblyInstruction {
  address: number;
  bytes: string;
  mnemonic: string;
  operands: string;
}

export function AssemblyPanel() {
  const store = useIDEStore();
  const { currentProject, binaryPath, compileStatus } = store;
  const [assembly, setAssembly] = useState<string>('');
  const [functions, setFunctions] = useState<AssemblyFunction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedFunctions, setExpandedFunctions] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Generate assembly from binary
  const generateAssembly = useCallback(async () => {
    if (!binaryPath || !currentProject) {
      setError('No binary file available. Please compile a program first.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use llvm-objdump to disassemble the binary
      const compilerC = store.settings.compilerPath || 'clang';
      const compilerDir = compilerC.includes('/') ? compilerC.slice(0, compilerC.lastIndexOf('/')) : '';
      const siblingTool = (name: string) => (compilerDir ? `${compilerDir}/${name}` : name);
      
      // Try different possible locations for llvm-objdump
      const possiblePaths = [
        siblingTool('llvm-objdump'),
        'llvm-objdump',
        'objdump',
        '/usr/bin/objdump',
        '/usr/local/bin/objdump'
      ];

      let objdumpCommand = 'objdump';
      for (const p of possiblePaths) {
        if (!p) continue;
        if (p.includes('/')) {
          // Only check existence for absolute paths.
          const ok = await window.electronAPI.exists(p);
          if (ok) {
            objdumpCommand = p;
            break;
          }
        } else {
          objdumpCommand = p;
          break;
        }
      }
      
      const result = await window.electronAPI.compile({
        command: objdumpCommand,
        args: ['-d', binaryPath],
        cwd: currentProject.path
      });

      if (result.success && result.stdout) {
        setAssembly(result.stdout);
        parseAssemblyFunctions(result.stdout);
      } else {
        // Fallback: show a message
        setAssembly(`; Could not disassemble binary
; Binary: ${binaryPath}
; Install llvm-objdump for assembly view
`);
      }
    } catch (err: any) {
      setError(`Failed to generate assembly: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [binaryPath, currentProject, store.settings.compilerPath]);

  // Parse assembly into functions
  const parseAssemblyFunctions = (asm: string) => {
    const lines = asm.split('\n');
    const funcs: AssemblyFunction[] = [];
    let currentFunc: AssemblyFunction | null = null;

    for (const line of lines) {
      // Match function labels (e.g., "<_start>:" or "<main>:")
      const funcMatch = line.match(/^<(.+)>:$/);
      if (funcMatch) {
        if (currentFunc) {
          funcs.push(currentFunc);
        }
        currentFunc = {
          name: funcMatch[1],
          address: 0,
          instructions: []
        };
        continue;
      }

      // Match instruction lines (e.g., "   0:   00 00 00 00    addi    a0, a0, 0")
      const instMatch = line.match(/^\s*([0-9a-f]+):\s+([0-9a-f ]+)\s+(\w+)\s+(.*)$/);
      if (instMatch && currentFunc) {
        currentFunc.instructions.push({
          address: parseInt(instMatch[1], 16),
          bytes: instMatch[2].trim(),
          mnemonic: instMatch[3],
          operands: instMatch[4]
        });
      }
    }

    if (currentFunc) {
      funcs.push(currentFunc);
    }

    setFunctions(funcs);
  };

  // Filter instructions based on search
  const filteredFunctions = searchTerm
    ? functions.map(f => ({
        ...f,
        instructions: f.instructions.filter(i => 
          i.mnemonic.toLowerCase().includes(searchTerm.toLowerCase()) ||
          i.operands.toLowerCase().includes(searchTerm.toLowerCase())
        )
      })).filter(f => f.instructions.length > 0)
    : functions;

  // Toggle function expansion
  const toggleFunction = (name: string) => {
    const newExpanded = new Set(expandedFunctions);
    if (newExpanded.has(name)) {
      newExpanded.delete(name);
    } else {
      newExpanded.add(name);
    }
    setExpandedFunctions(newExpanded);
  };

  // Copy to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(assembly);
  };

  // Download assembly
  const handleDownload = () => {
    const blob = new Blob([assembly], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'assembly.s';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Auto-generate assembly when binary changes
  useEffect(() => {
    if (compileStatus === 'success' && binaryPath) {
      generateAssembly();
    }
  }, [binaryPath, compileStatus, generateAssembly]);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2d3a4d] bg-[#111820]">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-[#00d9ff]" />
          <span className="text-sm font-medium text-[#e6edf3]">Assembly</span>
          {binaryPath && (
            <span className="text-xs text-[#6e7681]">
              ({binaryPath.split('/').pop()})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-[#6e7681]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="pl-7 pr-2 py-1 text-xs bg-[#0a0e14] border border-[#2d3a4d] rounded text-[#e6edf3] w-32"
            />
          </div>
          <button
            onClick={generateAssembly}
            disabled={isLoading}
            className="p-1.5 hover:bg-[#1a2332] rounded text-[#8b949e] hover:text-[#e6edf3]"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleCopy}
            disabled={!assembly}
            className="p-1.5 hover:bg-[#1a2332] rounded text-[#8b949e] hover:text-[#e6edf3]"
            title="Copy"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={handleDownload}
            disabled={!assembly}
            className="p-1.5 hover:bg-[#1a2332] rounded text-[#8b949e] hover:text-[#e6edf3]"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2 font-mono text-xs">
        {error ? (
          <div className="p-4 text-[#ff4757]">
            {error}
          </div>
        ) : isLoading ? (
          <div className="p-4 text-[#8b949e] flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Generating assembly...
          </div>
        ) : functions.length > 0 ? (
          <div className="space-y-1">
            {filteredFunctions.map((func) => (
              <div key={func.name} className="border border-[#2d3a4d] rounded">
                <button
                  onClick={() => toggleFunction(func.name)}
                  className="w-full flex items-center gap-2 px-2 py-1 bg-[#111820] hover:bg-[#1a2332] text-[#00d9ff] text-left"
                >
                  {expandedFunctions.has(func.name) ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  <span>{func.name}</span>
                  <span className="text-[#6e7681] text-xs">
                    ({func.instructions.length} instructions)
                  </span>
                </button>
                {expandedFunctions.has(func.name) && (
                  <div className="bg-[#0a0e14]">
                    {func.instructions.map((inst, idx) => (
                      <div
                        key={idx}
                        className="flex px-2 py-0.5 hover:bg-[#1a2332] text-[#e6edf3]"
                      >
                        <span className="w-16 text-[#6e7681]">
                          {inst.address.toString(16).padStart(8, '0')}:
                        </span>
                        <span className="w-24 text-[#a855f7]">
                          {inst.bytes}
                        </span>
                        <span className="w-16 text-[#00ff88]">
                          {inst.mnemonic}
                        </span>
                        <span className="text-[#fbbf24]">
                          {inst.operands}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : assembly ? (
          <pre className="whitespace-pre-wrap text-[#e6edf3]">
            {assembly}
          </pre>
        ) : (
          <div className="p-4 text-[#6e7681] text-center">
            <FileCode className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No assembly available</p>
            <p className="text-xs mt-1">Compile a program to see disassembly</p>
          </div>
        )}
      </div>
    </div>
  );
}
