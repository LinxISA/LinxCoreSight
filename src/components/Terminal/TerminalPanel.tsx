/**
 * Terminal Panel Component
 * Integrated terminal using xterm.js
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useIDEStore } from '../../store/ideStore';
import { Terminal as TerminalIcon, Plus, Trash2, X, Settings, Copy, Download } from 'lucide-react';
import 'xterm/css/xterm.css';

interface TerminalInstance {
  id: string;
  name: string;
  terminal: Terminal;
  fitAddon: FitAddon;
}

export function TerminalPanel() {
  const store = useIDEStore();
  const { currentProject, settings } = store;
  
  const terminalRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [terminals, setTerminals] = useState<TerminalInstance[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Create a new terminal instance
  const createTerminal = useCallback(() => {
    const id = `terminal-${Date.now()}`;
    const name = `Terminal ${terminals.length + 1}`;
    
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
      theme: {
        background: '#0a0e14',
        foreground: '#e6edf3',
        cursor: '#00d9ff',
        cursorAccent: '#0a0e14',
        selectionBackground: '#264f78',
        black: '#0a0e14',
        red: '#ff4757',
        green: '#2ed573',
        yellow: '#ffa502',
        blue: '#3742fa',
        magenta: '#ff6b81',
        cyan: '#00d9ff',
        white: '#dfe4ea',
        brightBlack: '#57606f',
        brightRed: '#ff4757',
        brightGreen: '#2ed573',
        brightYellow: '#ffa502',
        brightBlue: '#3742fa',
        brightMagenta: '#ff6b81',
        brightCyan: '#00d9ff',
        brightWhite: '#f1f2f6',
      },
      scrollback: 10000,
    });
    
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    
    const newTerminal: TerminalInstance = { id, name, terminal, fitAddon };
    setTerminals(prev => [...prev, newTerminal]);
    setActiveTerminalId(id);
    
    return newTerminal;
  }, [terminals.length]);

  // Initialize first terminal
  useEffect(() => {
    if (!isInitialized && terminalRefs.current.size === 0) {
      createTerminal();
      setIsInitialized(true);
    }
  }, [createTerminal, isInitialized]);

  // Mount terminals to DOM
  useEffect(() => {
    terminals.forEach(term => {
      const container = terminalRefs.current.get(term.id);
      if (container && term.terminal.element === null) {
        term.terminal.open(container);
        term.fitAddon.fit();
        
        // Set up PTY-like behavior - just echo for now
        term.terminal.onData(data => {
          // In a real implementation, this would send to a backend PTY
          // For now, we'll just echo the input
          term.terminal.write(data);
        });
      }
    });
  }, [terminals]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      terminals.forEach(term => {
        term.fitAddon.fit();
      });
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [terminals]);

  // Fit terminal when tab changes
  useEffect(() => {
    if (activeTerminalId) {
      const activeTerm = terminals.find(t => t.id === activeTerminalId);
      if (activeTerm) {
        setTimeout(() => activeTerm.fitAddon.fit(), 10);
      }
    }
  }, [activeTerminalId, terminals]);

  // Close a terminal
  const closeTerminal = (id: string) => {
    const term = terminals.find(t => t.id === id);
    if (term) {
      term.terminal.dispose();
      setTerminals(prev => prev.filter(t => t.id !== id));
      
      if (activeTerminalId === id) {
        setActiveTerminalId(terminals.length > 1 ? terminals[0].id : null);
      }
    }
  };

  // Clear terminal
  const clearTerminal = () => {
    const activeTerm = terminals.find(t => t.id === activeTerminalId);
    if (activeTerm) {
      activeTerm.terminal.clear();
    }
  };

  // Copy terminal content
  const copyTerminal = () => {
    const activeTerm = terminals.find(t => t.id === activeTerminalId);
    if (activeTerm) {
      const selection = activeTerm.terminal.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection);
      }
    }
  };

  // Get current working directory
  const cwd = currentProject?.path || settings.workspacePath || process.cwd();

  return (
    <div className="h-full flex flex-col bg-[#0a0e14]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2d3a4d] bg-[#111820]">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-[#00d9ff]" />
          <span className="text-sm font-medium text-[#e6edf3]">Terminal</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => createTerminal()}
            className="p-1.5 hover:bg-[#1a2332] rounded text-[#8b949e] hover:text-[#e6edf3]"
            title="New Terminal"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={clearTerminal}
            className="p-1.5 hover:bg-[#1a2332] rounded text-[#8b949e] hover:text-[#e6edf3]"
            title="Clear"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={copyTerminal}
            className="p-1.5 hover:bg-[#1a2332] rounded text-[#8b949e] hover:text-[#e6edf3]"
            title="Copy"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Tabs */}
      <div className="flex items-center px-2 py-1 border-b border-[#2d3a4d] bg-[#0d1117] overflow-x-auto">
        {terminals.map(term => (
          <div
            key={term.id}
            className={`flex items-center gap-2 px-3 py-1 rounded-t text-xs cursor-pointer ${
              activeTerminalId === term.id
                ? 'bg-[#0a0e14] text-[#e6edf3] border-t border-l border-r border-[#2d3a4d]'
                : 'text-[#8b949e] hover:bg-[#1a2332] hover:text-[#e6edf3]'
            }`}
            onClick={() => setActiveTerminalId(term.id)}
          >
            <span>{term.name}</span>
            {terminals.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTerminal(term.id);
                }}
                className="p-0.5 hover:bg-[#ff4757]/20 rounded hover:text-[#ff4757]"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Terminal Content */}
      <div className="flex-1 relative">
        {terminals.map(term => (
          <div
            key={term.id}
            ref={(el) => {
              if (el) terminalRefs.current.set(term.id, el);
            }}
            className={`absolute inset-0 p-2 ${
              activeTerminalId === term.id ? 'block' : 'hidden'
            }`}
            style={{ backgroundColor: '#0a0e14' }}
          />
        ))}
        
        {terminals.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-[#6e7681]">
            <div className="text-center">
              <TerminalIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No terminal open</p>
              <button
                onClick={() => createTerminal()}
                className="mt-2 px-3 py-1 text-xs bg-[#00d9ff] text-[#0a0e14] rounded hover:bg-[#00d9ff]/80"
              >
                New Terminal
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="px-3 py-1 border-t border-[#2d3a4d] bg-[#111820] text-xs text-[#6e7681] flex justify-between">
        <span>{cwd}</span>
        <span>bash</span>
      </div>
    </div>
  );
}

export default TerminalPanel;
