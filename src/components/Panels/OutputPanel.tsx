/**
 * Output Panel Component
 * Shows compilation output and emulator console output
 */

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useIDEStore } from '../../store/ideStore';
import { Terminal, AlertCircle, CheckCircle2, Loader2, Trash2, ChevronDown, X, Copy, Check } from 'lucide-react';

interface OutputPanelProps {
  onClose?: () => void;
}

// Parse compiler errors/warnings into structured format
interface ParsedMessage {
  type: 'error' | 'warning' | 'info' | 'success';
  message: string;
  file?: string;
  line?: number;
  column?: number;
  raw: string;
}

const parseCompilerOutput = (output: string): ParsedMessage[] => {
  const lines = output.split('\n');
  const messages: ParsedMessage[] = [];
  
  // Regex patterns for different compilers
  const patterns = [
    // GCC/Clang: file:line:col: error: message
    /^(.+?):(\d+):(\d+):\s*(error|warning|note):\s*(.+)$/,
    // GCC: file:line: error: message
    /^(.+?):(\d+):\s*(error|warning|note):\s*(.+)$/,
    // General: error: message (at end of line)
    /^(.+?):\s*(error|warning|note):\s*(.+)$/,
  ];
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    let parsed = false;
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const type = (match[match.length - 2] === 'error') ? 'error' : 
                     (match[match.length - 2] === 'warning') ? 'warning' : 'info';
        messages.push({
          type,
          message: match[match.length - 1],
          file: match[1] !== 'ld.lld' && match[1] !== 'clang' ? match[1] : undefined,
          line: match[2] ? parseInt(match[2]) : undefined,
          column: match[3] ? parseInt(match[3]) : undefined,
          raw: line
        });
        parsed = true;
        break;
      }
    }
    
    if (!parsed && line.includes('error:')) {
      messages.push({ type: 'error', message: line, raw: line });
    } else if (!parsed && line.includes('warning:')) {
      messages.push({ type: 'warning', message: line, raw: line });
    } else if (!parsed && (line.includes('[Compilation') || line.includes('[Linking'))) {
      const isSuccess = line.includes('Successful');
      messages.push({ 
        type: isSuccess ? 'success' : 'info', 
        message: line, 
        raw: line 
      });
    }
  }
  
  return messages;
};

export function OutputPanel({ onClose }: OutputPanelProps) {
  const store = useIDEStore();
  const { compileOutput, compileStatus, emulatorOutput, emulatorStatus } = store;
  const outputRef = useRef<HTMLDivElement>(null);
  
  const [activeTab, setActiveTab] = useState<'output' | 'console'>('output');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);

  // Parse compile output
  const parsedMessages = useMemo(() => parseCompilerOutput(compileOutput || ''), [compileOutput]);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [compileOutput, emulatorOutput]);

  const getCompileStatusIcon = () => {
    switch (compileStatus) {
      case 'compiling':
        return <Loader2 className="w-4 h-4 animate-spin text-[#fbbf24]" />;
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-[#00ff88]" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-[#ff4757]" />;
      default:
        return <Terminal className="w-4 h-4 text-[#6e7681]" />;
    }
  };

  const getEmulatorStatusColor = () => {
    switch (emulatorStatus) {
      case 'running':
        return 'text-[#00ff88]';
      case 'error':
        return 'text-[#ff4757]';
      default:
        return 'text-[#6e7681]';
    }
  };

  // Copy output to clipboard
  const handleCopy = () => {
    const text = activeTab === 'output' ? (compileOutput || '') : (emulatorOutput || '');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Get message color
  const getMessageColor = (type: ParsedMessage['type']) => {
    switch (type) {
      case 'error': return 'text-[#ff4757]';
      case 'warning': return 'text-[#fbbf24]';
      case 'success': return 'text-[#00ff88]';
      default: return 'text-[#e6edf3]';
    }
  };

  // Get message background
  const getMessageBg = (type: ParsedMessage['type']) => {
    switch (type) {
      case 'error': return 'bg-[#ff4757]/10';
      case 'warning': return 'bg-[#fbbf24]/10';
      case 'success': return 'bg-[#00ff88]/10';
      default: return '';
    }
  };

  if (isCollapsed) {
    return (
      <div className="h-8 flex items-center justify-between px-2 bg-[#111820] border-t border-[#2d3a4d]">
        <button 
          onClick={() => setIsCollapsed(false)}
          className="flex items-center gap-2 text-xs text-[#8b949e] hover:text-[#e6edf3]"
        >
          <ChevronDown className="w-3 h-3" />
          <span>Output</span>
          {compileStatus === 'compiling' && <Loader2 className="w-3 h-3 animate-spin text-[#fbbf24]" />}
          {compileStatus === 'error' && <AlertCircle className="w-3 h-3 text-[#ff4757]" />}
        </button>
        <button 
          onClick={() => setIsCollapsed(false)}
          className="p-1 text-[#8b949e] hover:text-[#e6edf3]"
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#111820] border-t border-[#2d3a4d]">
      {/* Header with tabs */}
      <div className="flex items-center justify-between border-b border-[#2d3a4d]">
        <div className="flex items-center">
          <button
            onClick={() => setActiveTab('output')}
            className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
              activeTab === 'output'
                ? 'text-[#00d9ff] border-b-2 border-[#00d9ff]'
                : 'text-[#8b949e] hover:text-[#e6edf3]'
            }`}
          >
            {getCompileStatusIcon()}
            <span>Output</span>
            {compileStatus === 'compiling' && (
              <span className="text-xs text-[#fbbf24]">Building...</span>
            )}
            {parsedMessages.filter(m => m.type === 'error').length > 0 && (
              <span className="text-xs text-[#ff4757]">
                {parsedMessages.filter(m => m.type === 'error').length} errors
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('console')}
            className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
              activeTab === 'console'
                ? 'text-[#00d9ff] border-b-2 border-[#00d9ff]'
                : 'text-[#8b949e] hover:text-[#e6edf3]'
            }`}
          >
            <span className={getEmulatorStatusColor()}>Console</span>
            {emulatorStatus === 'running' && (
              <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
            )}
          </button>
        </div>
        
        <div className="flex items-center gap-1 px-2">
          <button
            onClick={handleCopy}
            className="p-1 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a2332] rounded"
            title="Copy to Clipboard"
          >
            {copied ? <Check className="w-4 h-4 text-[#00ff88]" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={() => activeTab === 'output' ? store.clearCompileOutput() : store.clearEmulatorOutput()}
            className="p-1 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a2332] rounded"
            title="Clear Output"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a2332] rounded"
            title="Collapse"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a2332] rounded"
              title="Close Panel"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Output Content */}
      <div 
        ref={outputRef}
        className="flex-1 overflow-auto p-3 font-mono text-sm"
      >
        {activeTab === 'output' ? (
          <div className="space-y-1">
            {parsedMessages.length > 0 ? (
              parsedMessages.map((msg, idx) => (
                <div 
                  key={idx} 
                  className={`px-2 py-1 rounded ${getMessageBg(msg.type)}`}
                >
                  <span className={getMessageColor(msg.type)}>{msg.raw}</span>
                  {msg.file && (
                    <span className="text-[#00d9ff] ml-2">
                      {msg.file}
                      {msg.line && `:${msg.line}`}
                      {msg.column && `:${msg.column}`}
                    </span>
                  )}
                </div>
              ))
            ) : (
              <div className="text-[#6e7681]">
                No build output yet. Click Build to compile your code.
              </div>
            )}
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-[#00d9ff]">
            {emulatorOutput || 'No console output yet. Run your code to see results.'}
          </div>
        )}
      </div>
    </div>
  );
}
