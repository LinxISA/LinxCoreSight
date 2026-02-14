import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useIDEStore } from '../../store/ideStore';
import { 
  Wifi, 
  WifiOff, 
  Send, 
  Trash2, 
  Settings,
  Loader2,
  RefreshCw,
  Usb
} from 'lucide-react';

export function MonitorPanel() {
  const { monitor, setMonitorConnected, setMonitorPort, setMonitorBaudRate, appendMonitorOutput, clearMonitorOutput } = useIDEStore();
  const [inputValue, setInputValue] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [availablePorts, setAvailablePorts] = useState<Array<{ path: string; manufacturer?: string }>>([]);
  const [isRefreshingPorts, setIsRefreshingPorts] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch available serial ports
  const refreshPorts = useCallback(async () => {
    setIsRefreshingPorts(true);
    try {
      const result = await window.electronAPI.listSerialPorts();
      if (result.success && result.ports) {
        setAvailablePorts(result.ports);
        if (result.ports.length > 0 && !monitor.port) {
          setMonitorPort(result.ports[0].path);
        }
      }
    } catch (error) {
      console.error('Error listing ports:', error);
    } finally {
      setIsRefreshingPorts(false);
    }
  }, [monitor.port, setMonitorPort]);

  // Initial port list fetch
  useEffect(() => {
    refreshPorts();
  }, [refreshPorts]);

  // Subscribe to serial data
  useEffect(() => {
    const unsubscribeData = window.electronAPI.onMonitorData((data: string) => {
      appendMonitorOutput(data);
    });
    
    const unsubscribeError = window.electronAPI.onMonitorError((error: string) => {
      appendMonitorOutput(`[ERROR] ${error}\n`);
    });
    
    return () => {
      unsubscribeData();
      unsubscribeError();
    };
  }, [appendMonitorOutput]);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [monitor.output]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const result = await window.electronAPI.connectMonitor({
        port: monitor.port,
        baudRate: monitor.baudRate
      });
      
      if (result.success) {
        setMonitorConnected(true);
        appendMonitorOutput(`[${new Date().toISOString()}] Connected to ${monitor.port} at ${monitor.baudRate} baud\n`);
      }
    } catch (error) {
      appendMonitorOutput(`[${new Date().toISOString()}] Connection failed: ${error}\n`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await window.electronAPI.disconnectMonitor();
    setMonitorConnected(false);
    appendMonitorOutput(`[${new Date().toISOString()}] Disconnected\n`);
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !monitor.connected) return;
    
    try {
      await window.electronAPI.sendToMonitor(inputValue);
      appendMonitorOutput(`[TX] ${inputValue}\n`);
      setInputValue('');
    } catch (error) {
      appendMonitorOutput(`[ERROR] Failed to send: ${error}\n`);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const commonBaudRates = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-janus-border bg-janus-bg-tertiary">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-janus-text-primary">Serial Monitor</span>
          <div className="flex items-center gap-1">
            {monitor.connected ? (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-janus-accent-green/20 text-janus-accent-green text-xs">
                <Wifi className="w-3 h-3" />
                <span>Connected</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-janus-text-muted/20 text-janus-text-muted text-xs">
                <WifiOff className="w-3 h-3" />
                <span>Disconnected</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded text-janus-text-secondary hover:text-janus-text-primary ${showSettings ? 'bg-janus-border' : 'hover:bg-janus-border'}`}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button 
            onClick={clearMonitorOutput}
            className="p-1.5 hover:bg-janus-border rounded text-janus-text-secondary hover:text-janus-text-primary"
            title="Clear Output"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="px-3 py-3 border-b border-janus-border bg-janus-bg-primary space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-janus-text-secondary">Port</label>
              <button 
                onClick={refreshPorts}
                disabled={isRefreshingPorts || monitor.connected}
                className="text-xs text-janus-accent-cyan hover:text-janus-accent-cyan/80 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshingPorts ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            {availablePorts.length > 0 ? (
              <select 
                value={monitor.port}
                onChange={(e) => setMonitorPort(e.target.value)}
                disabled={monitor.connected}
                className="input"
              >
                {availablePorts.map((port) => (
                  <option key={port.path} value={port.path}>
                    {port.path} {port.manufacturer ? `(${port.manufacturer})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input 
                type="text" 
                value={monitor.port}
                onChange={(e) => setMonitorPort(e.target.value)}
                disabled={monitor.connected}
                className="input"
                placeholder="/dev/ttyUSB0 or COM3"
              />
            )}
          </div>
          <div>
            <label className="block text-xs text-janus-text-secondary mb-1">Baud Rate</label>
            <select 
              value={monitor.baudRate}
              onChange={(e) => setMonitorBaudRate(Number(e.target.value))}
              disabled={monitor.connected}
              className="input"
            >
              {commonBaudRates.map(rate => (
                <option key={rate} value={rate}>{rate}</option>
              ))}
            </select>
          </div>
          <div>
            <button 
              onClick={monitor.connected ? handleDisconnect : handleConnect}
              disabled={isConnecting}
              className={`btn w-full ${monitor.connected ? 'btn-danger' : 'btn-success'}`}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting...
                </>
              ) : monitor.connected ? (
                <>
                  <WifiOff className="w-4 h-4" />
                  Disconnect
                </>
              ) : (
                <>
                  <Wifi className="w-4 h-4" />
                  Connect
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Connection status bar (when settings hidden) */}
      {!showSettings && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-janus-border bg-janus-bg-tertiary text-xs">
          <div className="flex items-center gap-4">
            <span className="text-janus-text-secondary">Port: <span className="text-janus-text-primary">{monitor.port}</span></span>
            <span className="text-janus-text-secondary">Baud: <span className="text-janus-text-primary">{monitor.baudRate}</span></span>
          </div>
          {!monitor.connected && (
            <button 
              onClick={handleConnect}
              disabled={isConnecting}
              className="btn btn-secondary text-xs py-1"
            >
              {isConnecting ? 'Connecting...' : 'Connect'}
            </button>
          )}
        </div>
      )}

      {/* Output */}
      <div 
        ref={outputRef}
        className="flex-1 overflow-auto p-3 font-mono text-xs bg-janus-bg-primary"
      >
        {monitor.output ? (
          <pre className="whitespace-pre-wrap text-janus-text-primary">{monitor.output}</pre>
        ) : (
          <div className="text-janus-text-muted text-center py-8">
            No output yet. Connect to a serial port to see data.
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-janus-border bg-janus-bg-tertiary">
        <div className="flex items-center gap-2">
          <input 
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={!monitor.connected}
            placeholder={monitor.connected ? "Enter command..." : "Connect to a port first"}
            className="input flex-1"
          />
          <button 
            onClick={handleSend}
            disabled={!monitor.connected || !inputValue.trim()}
            className="btn btn-primary"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
