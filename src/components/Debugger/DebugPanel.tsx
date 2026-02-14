/**
 * Debug Panel Component
 * Shows debugger state: breakpoints, call stack, variables, registers
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useIDEStore } from '../../store/ideStore';
import { 
  Circle, 
  Play, 
  Square, 
  SkipForward, 
  ChevronDown, 
  ChevronUp,
  Trash2,
  Eye,
  EyeOff,
  Bug,
  Loader2
} from 'lucide-react';

interface DebugPanelProps {
  onClose: () => void;
}

export function DebugPanel({ onClose }: DebugPanelProps) {
  const {
    debuggerStatus,
    breakpoints,
    callStack,
    variables,
    registers,
    executionPoint,
    removeBreakpoint,
    toggleBreakpoint,
    clearAllBreakpoints,
    stepOver,
    stepInto,
    stepOut,
    continueExecution,
    stopDebugging,
    binaryPath,
    settings
  } = useIDEStore();

  const [isConnecting, setIsConnecting] = useState(false);
  const [debuggerConnected, setDebuggerConnected] = useState(false);
  const [gdbPort, setGdbPort] = useState<number>(1234);
  const [liveRegisters, setLiveRegisters] = useState<Record<string, string>>({});

  // Connect to debugger (QEMU GDB stub)
  const connectDebugger = useCallback(async () => {
    if (!binaryPath) {
      console.error('No binary to debug');
      return;
    }

    setIsConnecting(true);
    try {
      // Run QEMU with GDB stub
      const gdbPortNum = gdbPort;
      const result = await window.electronAPI.debuggerRunWithGdb({
        command: settings.qemuPath,
        args: [
          ...settings.qemuArgs,
          '-kernel', binaryPath
        ],
        cwd: binaryPath.substring(0, binaryPath.lastIndexOf('/')),
        gdbPort: gdbPortNum
      });

      if (result.success) {
        // Connect to the GDB stub
        const connectResult = await window.electronAPI.debuggerConnect({
          port: gdbPortNum
        });

        if (connectResult.success) {
          setDebuggerConnected(true);
          // Start reading registers
          refreshRegisters();
        } else {
          console.error('Failed to connect to GDB stub:', connectResult.error);
        }
      }
    } catch (err) {
      console.error('Failed to start debugger:', err);
    } finally {
      setIsConnecting(false);
    }
  }, [binaryPath, settings.qemuPath, settings.qemuArgs, gdbPort]);

  // Disconnect from debugger
  const disconnectDebugger = useCallback(async () => {
    await window.electronAPI.debuggerDisconnect();
    await window.electronAPI.stopEmulator();
    setDebuggerConnected(false);
  }, []);

  // Refresh registers from debugger
  const refreshRegisters = useCallback(async () => {
    if (!debuggerConnected) return;
    
    const result = await window.electronAPI.debuggerReadRegisters();
    if (result.success && result.registers) {
      setLiveRegisters(result.registers);
    }
  }, [debuggerConnected]);

  // Continue execution
  const handleContinue = useCallback(async () => {
    if (!debuggerConnected) {
      connectDebugger();
      return;
    }
    
    const result = await window.electronAPI.debuggerContinue();
    if (result.success) {
      await refreshRegisters();
    }
  }, [debuggerConnected, connectDebugger, refreshRegisters]);

  // Step over
  const handleStepOver = useCallback(async () => {
    if (!debuggerConnected) return;
    
    const result = await window.electronAPI.debuggerStepOver();
    if (result.success) {
      await refreshRegisters();
    }
  }, [debuggerConnected, refreshRegisters]);

  // Step into
  const handleStepInto = useCallback(async () => {
    if (!debuggerConnected) return;
    
    const result = await window.electronAPI.debuggerStep();
    if (result.success) {
      await refreshRegisters();
    }
  }, [debuggerConnected, refreshRegisters]);

  // Step out
  const handleStepOut = useCallback(async () => {
    // GDB doesn't have native step-out, so we just step
    handleStepInto();
  }, [handleStepInto]);

  // Stop debugging
  const handleStop = useCallback(async () => {
    await disconnectDebugger();
  }, [disconnectDebugger]);

  // Set breakpoint at address
  const handleSetBreakpoint = useCallback(async (address: number) => {
    if (!debuggerConnected) return;
    
    await window.electronAPI.debuggerSetBreakpoint({ address });
  }, [debuggerConnected]);

  // Remove breakpoint
  const handleRemoveBreakpoint = useCallback(async (address: number) => {
    if (!debuggerConnected) return;
    
    await window.electronAPI.debuggerRemoveBreakpoint({ address });
  }, [debuggerConnected]);

  // Auto-refresh registers when paused
  useEffect(() => {
    if (debuggerConnected && debuggerStatus === 'paused') {
      const interval = setInterval(refreshRegisters, 1000);
      return () => clearInterval(interval);
    }
  }, [debuggerConnected, debuggerStatus, refreshRegisters]);

  return (
    <div className="h-full flex flex-col bg-janus-bg-secondary border-l border-janus-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-janus-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-janus-text-primary">Debugger</span>
          <span className={`text-xs px-2 py-0.5 rounded ${
            debuggerStatus === 'running' ? 'bg-janus-accent-green/20 text-janus-accent-green' :
            debuggerStatus === 'paused' ? 'bg-janus-accent-orange/20 text-janus-accent-orange' :
            'bg-janus-bg-tertiary text-janus-text-muted'
          }`}>
            {debuggerStatus.toUpperCase()}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-janus-text-muted hover:text-janus-text-primary"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Connection Status & Controls */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2d3a4d] bg-[#111820]">
          {!debuggerConnected ? (
            <>
              <Bug className="w-4 h-4 text-[#8b949e]" />
              <input
                type="number"
                value={gdbPort}
                onChange={(e) => setGdbPort(parseInt(e.target.value) || 1234)}
                className="w-20 px-2 py-1 text-xs bg-[#0a0e14] border border-[#2d3a4d] rounded text-[#e6edf3]"
                placeholder="GDB Port"
              />
              <button
                onClick={connectDebugger}
                disabled={!binaryPath || isConnecting}
                className="flex items-center gap-1 px-3 py-1 text-xs bg-[#00d9ff] text-[#0a0e14] rounded hover:bg-[#00d9ff]/80 disabled:opacity-50"
              >
                {isConnecting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Bug className="w-3 h-3" />
                )}
                {isConnecting ? 'Connecting...' : 'Start Debug'}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1 px-2 py-1 bg-[#22c55e]/20 text-[#22c55e] rounded text-xs">
                <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
                Connected
              </div>
              <button
                onClick={refreshRegisters}
                className="p-1.5 hover:bg-[#1a2332] rounded text-[#8b949e]"
                title="Refresh Registers"
              >
                <Loader2 className="w-4 h-4" />
              </button>
              <button
                onClick={disconnectDebugger}
                className="p-1.5 hover:bg-[#ff4757]/20 rounded text-[#ff4757]"
                title="Disconnect"
              >
                <Square className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Execution Controls */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-[#2d3a4d]">
          <button
            onClick={handleContinue}
            disabled={debuggerStatus === 'running' || !debuggerConnected}
            className="p-1.5 hover:bg-[#1a2332] rounded text-[#00ff88] disabled:opacity-50"
            title="Continue (F5)"
          >
            <Play className="w-4 h-4" />
          </button>
          <button
            onClick={handleStepOver}
            disabled={!debuggerConnected || debuggerStatus !== 'paused'}
            className="p-1.5 hover:bg-[#1a2332] rounded text-[#8b949e] disabled:opacity-50"
            title="Step Over (F10)"
          >
            <SkipForward className="w-4 h-4" />
          </button>
          <button
            onClick={handleStepInto}
            disabled={!debuggerConnected || debuggerStatus !== 'paused'}
            className="p-1.5 hover:bg-[#1a2332] rounded text-[#8b949e] disabled:opacity-50"
            title="Step Into (F11)"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            onClick={handleStepOut}
            disabled={!debuggerConnected || debuggerStatus !== 'paused'}
            className="p-1.5 hover:bg-[#1a2332] rounded text-[#8b949e] disabled:opacity-50"
            title="Step Out (Shift+F11)"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={handleStop}
            disabled={!debuggerConnected}
            className="p-1.5 hover:bg-[#ff4757]/20 rounded text-[#ff4757] disabled:opacity-50"
            title="Stop"
          >
            <Square className="w-4 h-4" />
          </button>
        </div>

        {/* Execution Point */}
        {executionPoint && (
          <div className="px-3 py-2 border-b border-janus-border bg-janus-accent-cyan/10">
            <span className="text-xs text-janus-accent-cyan">
              📍 {executionPoint.file}:{executionPoint.line}
            </span>
          </div>
        )}

        {/* Breakpoints */}
        <div className="flex-1 overflow-auto">
          <div className="px-3 py-2 border-b border-janus-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-janus-text-secondary uppercase">
                Breakpoints ({breakpoints.length})
              </span>
              {breakpoints.length > 0 && (
                <button
                  onClick={clearAllBreakpoints}
                  className="text-xs text-janus-text-muted hover:text-janus-accent-red"
                >
                  Clear All
                </button>
              )}
            </div>
            {breakpoints.length === 0 ? (
              <div className="text-xs text-janus-text-muted py-2">
                No breakpoints. Click editor margin to add.
              </div>
            ) : (
              <div className="space-y-1">
                {breakpoints.map((bp) => (
                  <div
                    key={bp.id}
                    className="flex items-center gap-2 text-xs py-1 px-2 bg-janus-bg-tertiary rounded"
                  >
                    <button
                      onClick={() => toggleBreakpoint(bp.id)}
                      className="text-janus-accent-red"
                    >
                      {bp.enabled ? (
                        <Circle className="w-3 h-3" />
                      ) : (
                        <Circle className="w-3 h-3 opacity-50" />
                      )}
                    </button>
                    <span className="flex-1 text-janus-text-primary truncate">
                      {bp.filePath.split('/').pop()}:{bp.line}
                    </span>
                    {bp.condition && (
                      <span className="text-janus-text-muted truncate max-w-[100px]">
                        if {bp.condition}
                      </span>
                    )}
                    <button
                      onClick={() => removeBreakpoint(bp.id)}
                      className="text-janus-text-muted hover:text-janus-accent-red"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Call Stack */}
          <div className="px-3 py-2 border-b border-janus-border">
            <span className="text-xs font-medium text-janus-text-secondary uppercase mb-2 block">
              Call Stack
            </span>
            {callStack.length === 0 ? (
              <div className="text-xs text-janus-text-muted py-2">
                No call stack available
              </div>
            ) : (
              <div className="space-y-1">
                {callStack.map((frame, idx) => (
                  <div
                    key={frame.id}
                    className={`text-xs py-1 px-2 rounded ${
                      idx === 0 ? 'bg-janus-accent-cyan/20 text-janus-accent-cyan' : 'text-janus-text-primary'
                    }`}
                  >
                    <span className="font-mono">{frame.function}</span>
                    <span className="text-janus-text-muted ml-2">
                      {frame.file}:{frame.line}
                    </span>
                    {frame.address && (
                      <span className="text-janus-text-muted ml-2 font-mono">
                        {frame.address}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Variables */}
          <div className="px-3 py-2 border-b border-janus-border">
            <span className="text-xs font-medium text-janus-text-secondary uppercase mb-2 block">
              Variables
            </span>
            {variables.length === 0 ? (
              <div className="text-xs text-janus-text-muted py-2">
                No variables in scope
              </div>
            ) : (
              <div className="space-y-1">
                {variables.map((v, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <span className={`font-mono ${
                      v.scope === 'local' ? 'text-janus-accent-cyan' :
                      v.scope === 'global' ? 'text-janus-accent-purple' :
                      'text-janus-accent-orange'
                    }`}>
                      {v.name}
                    </span>
                    <span className="text-janus-text-muted">=</span>
                    <span className="text-janus-text-primary font-mono">{v.value}</span>
                    <span className="text-janus-text-muted text-xs">({v.type})</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Registers */}
          <div className="px-3 py-2">
            <span className="text-xs font-medium text-[#8b949e] uppercase mb-2 block">
              Registers {debuggerConnected && <span className="text-[#00d9ff]">(Live)</span>}
            </span>
            {Object.keys(liveRegisters).length === 0 ? (
              <div className="text-xs text-[#6e7681] py-2">
                {debuggerConnected ? 'No registers available' : 'Start debugging to see register values'}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(liveRegisters).map(([name, value]) => (
                  <div key={name} className="flex items-center gap-2 text-xs">
                    <span className="text-[#00d9ff] font-mono w-8">{name}</span>
                    <span className="text-[#e6edf3] font-mono">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DebugPanel;
