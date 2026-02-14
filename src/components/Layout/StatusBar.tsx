import React from 'react';
import { useIDEStore } from '../../store/ideStore';
import { 
  Circle, 
  Bug, 
  Play, 
  Square, 
  Loader2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import clsx from 'clsx';

export function StatusBar() {
  const { 
    cursorPosition, 
    tabs, 
    activeTabId,
    emulatorStatus,
    compileStatus,
    settings 
  } = useIDEStore();

  const activeTab = tabs.find(t => t.id === activeTabId);

  const getCompileStatusIcon = () => {
    switch (compileStatus) {
      case 'compiling':
        return <Loader2 className="w-3 h-3 animate-spin text-janus-accent-yellow" />;
      case 'success':
        return <CheckCircle2 className="w-3 h-3 text-janus-accent-green" />;
      case 'error':
        return <AlertCircle className="w-3 h-3 text-janus-accent-red" />;
      default:
        return <Circle className="w-3 h-3 text-janus-text-muted" />;
    }
  };

  const getCompileStatusText = () => {
    switch (compileStatus) {
      case 'compiling':
        return 'Compiling...';
      case 'success':
        return 'Compiled';
      case 'error':
        return 'Compile Error';
      default:
        return 'Ready';
    }
  };

  const getEmulatorStatusIcon = () => {
    switch (emulatorStatus) {
      case 'running':
        return <Play className="w-3 h-3 text-janus-accent-green" />;
      case 'paused':
        return <Bug className="w-3 h-3 text-janus-accent-yellow" />;
      case 'error':
        return <AlertCircle className="w-3 h-3 text-janus-accent-red" />;
      default:
        return <Square className="w-3 h-3 text-janus-text-muted" />;
    }
  };

  const getEmulatorStatusText = () => {
    switch (emulatorStatus) {
      case 'running':
        return 'Running';
      case 'paused':
        return 'Paused';
      case 'error':
        return 'Error';
      default:
        return 'Stopped';
    }
  };

  return (
    <div className="h-6 flex items-center justify-between px-3 bg-janus-bg-tertiary border-t border-janus-border text-xs">
      {/* Left side */}
      <div className="flex items-center gap-4">
        {/* Branding */}
        <div className="flex items-center gap-1.5 text-janus-accent-cyan">
          <img 
            src="/linxcoresight-icon.svg" 
            alt="LinxCoreSight" 
            className="w-4 h-4"
          />
          <span className="font-medium">LinxCoreSight</span>
        </div>

        {/* Compile status */}
        <div className="flex items-center gap-1.5 text-janus-text-secondary">
          {getCompileStatusIcon()}
          <span>{getCompileStatusText()}</span>
        </div>

        {/* Emulator status */}
        <div className="flex items-center gap-1.5 text-janus-text-secondary">
          {getEmulatorStatusIcon()}
          <span>QEMU: {getEmulatorStatusText()}</span>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Language */}
        {activeTab && (
          <span className="text-janus-text-secondary uppercase">
            {activeTab.language}
          </span>
        )}

        {/* Cursor position */}
        <span className="text-janus-text-secondary">
          Ln {cursorPosition.line}, Col {cursorPosition.column}
        </span>

        {/* Encoding */}
        <span className="text-janus-text-muted">
          UTF-8
        </span>

        {/* Architecture */}
        <span className="text-janus-text-muted">
          LinxISA
        </span>

        {/* Version */}
        <span className="text-janus-text-muted">
          v1.0.0
        </span>
      </div>
    </div>
  );
}
