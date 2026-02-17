/**
 * Toolbar Component
 * Quick access buttons for file operations and build actions
 */

import React from 'react';
import { useIDEStore } from '../../store/ideStore';
import { 
  FilePlus, 
  FolderOpen, 
  Save, 
  Play, 
  Square, 
  Bug, 
  Hammer,
  Loader2,
  Terminal
} from 'lucide-react';
import clsx from 'clsx';

// ============================================
// Toolbar Button Component
// ============================================
interface ToolbarButtonProps {
  onClick?: () => void;
  children: React.ReactNode;
  variant?: 'default' | 'compile' | 'run' | 'debug' | 'stop';
  disabled?: boolean;
  tooltip?: string;
  className?: string;
}

export function ToolbarButton({ 
  onClick, 
  children, 
  variant = 'default',
  disabled = false,
  tooltip,
  className
}: ToolbarButtonProps) {
  const variantStyles: Record<string, string> = {
    default: 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a2332]',
    compile: 'bg-[#ff6b35]/20 text-[#ff6b35] hover:bg-[#ff6b35]/30',
    run: 'bg-[#00ff88]/20 text-[#00ff88] hover:bg-[#00ff88]/30',
    debug: 'bg-[#00d9ff]/20 text-[#00d9ff] hover:bg-[#00d9ff]/30',
    stop: 'bg-[#ff4757]/20 text-[#ff4757] hover:bg-[#ff4757]/30',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className={clsx(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm transition-colors',
        variantStyles[variant],
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {children}
    </button>
  );
}

// ============================================
// Toolbar Divider Component
// ============================================
export function ToolbarDivider() {
  return <div className="w-px h-6 bg-[#2d3a4d] mx-1" />;
}

// ============================================
// Main Toolbar Component
// ============================================
interface ToolbarProps {
  onCompile?: () => void;
  onRun?: () => void;
  onStop?: () => void;
  onDebug?: () => void;
  onNewFile?: () => void;
  onSave?: () => void;
  onOpenFile?: () => void;
}

export function Toolbar({
  onCompile,
  onRun,
  onStop,
  onDebug,
  onNewFile,
  onSave,
  onOpenFile
}: ToolbarProps) {
  const store = useIDEStore();
  
  const { 
    tabs, 
    activeTabId, 
    currentProject,
    compileStatus,
    emulatorStatus,
    binaryPath
  } = store;

  const activeTab = tabs.find(t => t.id === activeTabId);
  const isCompiling = compileStatus === 'compiling';
  const isRunning = emulatorStatus === 'running';
  const hasBinary = !!binaryPath;

  // Handle new file
  const handleNewFile = () => {
    if (onNewFile) {
      onNewFile();
    } else {
      // Default behavior
      store.createNewFile('untitled.c', 'c');
    }
  };

  // Handle open file
  const handleOpenFile = async () => {
    if (onOpenFile) {
      onOpenFile();
      return;
    }
    
    // Default: show open dialog
    const result = await window.electronAPI.openFileDialog();
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const fileResult = await window.electronAPI.readFile(filePath);
      if (fileResult.success && fileResult.content !== undefined) {
        store.openFile(filePath, fileResult.content);
      }
    }
  };

  // Handle save
  const handleSave = () => {
    if (onSave) {
      onSave();
      return;
    }
    
    // Default: save active tab
    if (activeTabId) {
      store.saveTab(activeTabId);
    }
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-[#111820] border-b border-[#2d3a4d]">
      {/* File operations */}
      <ToolbarButton onClick={handleNewFile} tooltip="New File (Ctrl+N)">
        <FilePlus className="w-4 h-4" />
        <span className="text-xs">New</span>
      </ToolbarButton>
      
      <ToolbarButton onClick={handleOpenFile} tooltip="Open File (Ctrl+O)">
        <FolderOpen className="w-4 h-4" />
        <span className="text-xs">Open</span>
      </ToolbarButton>
      
      <ToolbarButton onClick={handleSave} disabled={!activeTab} tooltip="Save (Ctrl+S)">
        <Save className="w-4 h-4" />
        <span className="text-xs">Save</span>
      </ToolbarButton>

      <ToolbarDivider />

      {/* Build operations */}
      <ToolbarButton 
        onClick={onCompile} 
        disabled={(!activeTab && !currentProject) || isCompiling || isRunning}
        variant="compile"
        tooltip="Compile (Ctrl+B)"
      >
        {isCompiling ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Hammer className="w-4 h-4" />
        )}
        <span className="text-xs">{isCompiling ? 'Building...' : 'Build'}</span>
      </ToolbarButton>

      <ToolbarButton 
        onClick={onRun} 
        disabled={isCompiling || isRunning}
        variant="run"
        tooltip="Run (F5)"
      >
        <Play className="w-4 h-4" />
        <span className="text-xs">{isRunning ? 'Running...' : 'Run'}</span>
      </ToolbarButton>

      <ToolbarButton 
        onClick={onDebug} 
        disabled={isCompiling || isRunning}
        variant="debug"
        tooltip="Debug (F5)"
      >
        <Bug className="w-4 h-4" />
        <span className="text-xs">Debug</span>
      </ToolbarButton>

      <ToolbarButton 
        onClick={onStop} 
        disabled={!isRunning}
        variant="stop"
        tooltip="Stop (Shift+F5)"
      >
        <Square className="w-4 h-4" />
        <span className="text-xs">Stop</span>
      </ToolbarButton>

      <ToolbarDivider />

      {/* Status indicator */}
      <div className="flex items-center gap-2 text-xs text-[#8b949e]">
        {compileStatus === 'success' && (
          <span className="text-[#00ff88]">Build OK</span>
        )}
        {compileStatus === 'error' && (
          <span className="text-[#ff4757]">Build Failed</span>
        )}
        {emulatorStatus === 'running' && (
          <span className="text-[#00ff88] flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
            Running
          </span>
        )}
      </div>
    </div>
  );
}
