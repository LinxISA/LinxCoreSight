import { contextBridge, ipcRenderer } from 'electron';

// Types for the exposed API
export interface FileEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

export interface FileStats {
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  mtime: string;
}

export interface DialogResult {
  canceled: boolean;
  filePaths: string[];
}

export interface SaveDialogResult {
  canceled: boolean;
  filePath?: string;
}

export interface FSResult {
  success: boolean;
  error?: string;
}

export interface CompileResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface EmulatorResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  pid?: number;
}

export interface ProcessResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface TraceMeta {
  [key: string]: unknown;
}

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Dialog operations
  openFileDialog: (options?: { filters?: { name: string; extensions: string[] }[]; defaultPath?: string }) =>
    ipcRenderer.invoke('dialog:openFile', options) as Promise<DialogResult>,
  
  openFolderDialog: () =>
    ipcRenderer.invoke('dialog:openFolder') as Promise<DialogResult>,
  
  saveFileDialog: (options?: { filters?: { name: string; extensions: string[] }[]; defaultPath?: string }) =>
    ipcRenderer.invoke('dialog:saveFile', options) as Promise<SaveDialogResult>,

  // File system operations
  readFile: (filePath: string) =>
    ipcRenderer.invoke('fs:readFile', filePath) as Promise<{ success: boolean; content?: string; error?: string }>,

  traceReadMeta: (tracePath: string) =>
    ipcRenderer.invoke('trace:readMeta', tracePath) as Promise<{ ok: boolean; metaPath?: string; meta?: TraceMeta; metaJson?: string; error?: string }>,

  traceOpenSession: (tracePath: string) =>
    ipcRenderer.invoke('trace:openSession', tracePath) as Promise<{ ok: boolean; sessionId?: number; sizeBytes?: number; mtimeMs?: number; error?: string }>,

  traceReadChunk: (sessionId: number, offset: number, bytes: number) =>
    ipcRenderer.invoke('trace:readChunk', sessionId, offset, bytes) as Promise<{ ok: boolean; chunk?: string; nextOffset?: number; eof?: boolean; error?: string }>,

  traceCloseSession: (sessionId: number) =>
    ipcRenderer.invoke('trace:closeSession', sessionId) as Promise<{ ok: boolean }>,

  requestUiSnapshot: (reason?: string) =>
    ipcRenderer.invoke('debug:uiSnapshot', reason) as Promise<{ ok: boolean; error?: string }>,
  
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('fs:writeFile', filePath, content) as Promise<FSResult>,
  
  readDir: (dirPath: string) =>
    ipcRenderer.invoke('fs:readDir', dirPath) as Promise<{ success: boolean; files?: FileEntry[]; error?: string }>,
  
  stat: (filePath: string) =>
    ipcRenderer.invoke('fs:stat', filePath) as Promise<{ success: boolean; stats?: FileStats; error?: string }>,
  
  exists: (filePath: string) =>
    ipcRenderer.invoke('fs:exists', filePath) as Promise<boolean>,
  
  mkdir: (dirPath: string) =>
    ipcRenderer.invoke('fs:mkdir', dirPath) as Promise<FSResult>,
  
  delete: (filePath: string) =>
    ipcRenderer.invoke('fs:delete', filePath) as Promise<FSResult>,
  
  rename: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke('fs:rename', oldPath, newPath) as Promise<FSResult>,

  // Project scaffolding
  createProjectFromTemplate: (request: { name: string; location: string; template: string }) =>
    ipcRenderer.invoke('project:createFromTemplate', request) as Promise<{ success: boolean; projectPath?: string; template?: string; error?: string }>,

  // Compiler operations
  compile: (options: { command: string; args: string[]; cwd?: string }) =>
    ipcRenderer.invoke('compiler:compile', options) as Promise<CompileResult>,

  // Generic process runner for command-based build profiles
  runProcess: (options: { command: string; args: string[]; cwd?: string; env?: Record<string, string>; streamOutput?: boolean; managed?: boolean }) =>
    ipcRenderer.invoke('process:run', options) as Promise<ProcessResult>,

  // Emulator operations
  runEmulator: (options: { command: string; args: string[]; cwd?: string }) =>
    ipcRenderer.invoke('emulator:run', options) as Promise<EmulatorResult>,
  
  stopEmulator: () =>
    ipcRenderer.invoke('emulator:stop') as Promise<{ success: boolean; error?: string }>,
  
  getEmulatorStatus: () =>
    ipcRenderer.invoke('emulator:status') as Promise<{ running: boolean; pid?: number }>,

  // Serial monitor operations
  connectMonitor: (options: { port: string; baudRate: number }) =>
    ipcRenderer.invoke('monitor:connect', options) as Promise<{ success: boolean; message?: string; error?: string }>,
  
  disconnectMonitor: () =>
    ipcRenderer.invoke('monitor:disconnect') as Promise<{ success: boolean }>,
  
  sendToMonitor: (data: string) =>
    ipcRenderer.invoke('monitor:send', data) as Promise<{ success: boolean; error?: string }>,
  
  listSerialPorts: () =>
    ipcRenderer.invoke('monitor:list') as Promise<{ success: boolean; ports: Array<{ path: string; pnpId?: string; manufacturer?: string }>; error?: string }>,
  
  onMonitorData: (callback: (data: string) => void) => {
    const handler = (_event: any, data: string) => callback(data);
    ipcRenderer.on('monitor:data', handler);
    return () => ipcRenderer.removeListener('monitor:data', handler);
  },
  
  onMonitorError: (callback: (error: string) => void) => {
    const handler = (_event: any, error: string) => callback(error);
    ipcRenderer.on('monitor:error', handler);
    return () => ipcRenderer.removeListener('monitor:error', handler);
  },

  // App info
  getPath: (name: string) =>
    ipcRenderer.invoke('app:getPath', name) as Promise<string>,
  
  getVersion: () =>
    ipcRenderer.invoke('app:getVersion') as Promise<string>,

  // Toolchain info
  getToolchainInfo: () =>
    ipcRenderer.invoke('toolchain:getInfo') as Promise<{
      tools: {
        qemu: string;
        clang: string;
        clangxx: string;
        lld: string;
        pyCircuit: string;
        linxisa: string;
        workDir: string;
      };
      results: Record<string, boolean>;
    }>,

  // Event listeners
  onCompilerOutput: (callback: (data: { type: string; data: string }) => void) => {
    const handler = (_event: any, data: { type: string; data: string }) => callback(data);
    ipcRenderer.on('compiler:output', handler);
    return () => ipcRenderer.removeListener('compiler:output', handler);
  },
  
  onEmulatorOutput: (callback: (data: { type: string; data: string }) => void) => {
    const handler = (_event: any, data: { type: string; data: string }) => callback(data);
    ipcRenderer.on('emulator:output', handler);
    return () => ipcRenderer.removeListener('emulator:output', handler);
  },
  
  onEmulatorTerminated: (callback: (data: { code: number }) => void) => {
    const handler = (_event: any, data: { code: number }) => callback(data);
    ipcRenderer.on('emulator:terminated', handler);
    return () => ipcRenderer.removeListener('emulator:terminated', handler);
  },

  onProcessOutput: (callback: (data: { type: string; data: string }) => void) => {
    const handler = (_event: any, data: { type: string; data: string }) => callback(data);
    ipcRenderer.on('process:output', handler);
    return () => ipcRenderer.removeListener('process:output', handler);
  },

  // Menu event listeners
  onMenuNewFile: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:new-file', handler);
    return () => ipcRenderer.removeListener('menu:new-file', handler);
  },
  
  onMenuOpenFile: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:open-file', handler);
    return () => ipcRenderer.removeListener('menu:open-file', handler);
  },
  
  onMenuOpenFolder: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:open-folder', handler);
    return () => ipcRenderer.removeListener('menu:open-folder', handler);
  },
  
  onMenuSave: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:save', handler);
    return () => ipcRenderer.removeListener('menu:save', handler);
  },
  
  onMenuSaveAs: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:save-as', handler);
    return () => ipcRenderer.removeListener('menu:save-as', handler);
  },
  
  onMenuCompile: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:compile', handler);
    return () => ipcRenderer.removeListener('menu:compile', handler);
  },
  
  onMenuRun: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:run', handler);
    return () => ipcRenderer.removeListener('menu:run', handler);
  },
  
  onMenuDebug: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:debug', handler);
    return () => ipcRenderer.removeListener('menu:debug', handler);
  },
  
  onMenuStop: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:stop', handler);
    return () => ipcRenderer.removeListener('menu:stop', handler);
  },
  
  onMenuStepOver: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:step-over', handler);
    return () => ipcRenderer.removeListener('menu:step-over', handler);
  },
  
  onMenuStepInto: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:step-into', handler);
    return () => ipcRenderer.removeListener('menu:step-into', handler);
  },
  
  onMenuStepOut: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:step-out', handler);
    return () => ipcRenderer.removeListener('menu:step-out', handler);
  },
  
  onMenuToggleBreakpoint: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:toggle-breakpoint', handler);
    return () => ipcRenderer.removeListener('menu:toggle-breakpoint', handler);
  },

  onOpenTrace: (callback: (tracePath: string) => void) => {
    const handler = (_event: any, tracePath: string) => callback(tracePath);
    ipcRenderer.on('trace:open', handler);
    return () => ipcRenderer.removeListener('trace:open', handler);
  },
  
  onMenuAbout: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:about', handler);
    return () => ipcRenderer.removeListener('menu:about', handler);
  },

  // Debugger operations
  debuggerConnect: (options: { port: number; binary?: string }) =>
    ipcRenderer.invoke('debugger:connect', options) as Promise<{ success: boolean; message?: string; error?: string }>,
  
  debuggerDisconnect: () =>
    ipcRenderer.invoke('debugger:disconnect') as Promise<{ success: boolean }>,
  
  debuggerContinue: () =>
    ipcRenderer.invoke('debugger:continue') as Promise<{ success: boolean; data?: string; error?: string }>,
  
  debuggerStep: () =>
    ipcRenderer.invoke('debugger:step') as Promise<{ success: boolean; data?: string; error?: string }>,
  
  debuggerStepOver: () =>
    ipcRenderer.invoke('debugger:stepOver') as Promise<{ success: boolean; data?: string; error?: string }>,
  
  debuggerReadRegisters: () =>
    ipcRenderer.invoke('debugger:readRegisters') as Promise<{ success: boolean; registers?: Record<string, string>; error?: string }>,
  
  debuggerReadMemory: (options: { address: number; length: number }) =>
    ipcRenderer.invoke('debugger:readMemory', options) as Promise<{ success: boolean; data?: string; error?: string }>,
  
  debuggerSetBreakpoint: (options: { address: number; type?: number }) =>
    ipcRenderer.invoke('debugger:setBreakpoint', options) as Promise<{ success: boolean; error?: string }>,
  
  debuggerRemoveBreakpoint: (options: { address: number }) =>
    ipcRenderer.invoke('debugger:removeBreakpoint', options) as Promise<{ success: boolean; error?: string }>,
  
  debuggerGetStatus: () =>
    ipcRenderer.invoke('debugger:getStatus') as Promise<{ connected: boolean; breakpoints: Array<{ address: number; type: number }> }>,
  
  debuggerRunWithGdb: (options: { command: string; args: string[]; cwd?: string; gdbPort?: number }) =>
    ipcRenderer.invoke('debugger:runWithGdb', options) as Promise<{ success: boolean; pid?: number; gdbPort?: number; stdout?: string; stderr?: string; exitCode?: number }>
});

// Type declaration for window.electronAPI
declare global {
  interface Window {
    electronAPI: {
      openFileDialog: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<DialogResult>;
      openFolderDialog: () => Promise<DialogResult>;
      saveFileDialog: (options?: { filters?: { name: string; extensions: string[] }[]; defaultPath?: string }) => Promise<SaveDialogResult>;
      readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
      writeFile: (filePath: string, content: string) => Promise<FSResult>;
      readDir: (dirPath: string) => Promise<{ success: boolean; files?: FileEntry[]; error?: string }>;
      stat: (filePath: string) => Promise<{ success: boolean; stats?: FileStats; error?: string }>;
      exists: (filePath: string) => Promise<boolean>;
      mkdir: (dirPath: string) => Promise<FSResult>;
      delete: (filePath: string) => Promise<FSResult>;
      rename: (oldPath: string, newPath: string) => Promise<FSResult>;
      createProjectFromTemplate: (request: { name: string; location: string; template: string }) => Promise<{ success: boolean; projectPath?: string; template?: string; error?: string }>;
      compile: (options: { command: string; args: string[]; cwd?: string }) => Promise<CompileResult>;
      runProcess: (options: { command: string; args: string[]; cwd?: string; env?: Record<string, string>; streamOutput?: boolean; managed?: boolean }) => Promise<ProcessResult>;
      runEmulator: (options: { command: string; args: string[]; cwd?: string }) => Promise<EmulatorResult>;
      stopEmulator: () => Promise<{ success: boolean; error?: string }>;
      getEmulatorStatus: () => Promise<{ running: boolean; pid?: number }>;
      connectMonitor: (options: { port: string; baudRate: number }) => Promise<{ success: boolean; message?: string }>;
      disconnectMonitor: () => Promise<{ success: boolean }>;
      sendToMonitor: (data: string) => Promise<{ success: boolean }>;
      getPath: (name: string) => Promise<string>;
      getVersion: () => Promise<string>;
      getToolchainInfo: () => Promise<{
        tools: {
          qemu: string;
          clang: string;
          clangxx: string;
          pyCircuit: string;
          linxisa: string;
          workDir: string;
        };
        results: Record<string, boolean>;
      }>;
      onCompilerOutput: (callback: (data: { type: string; data: string }) => void) => () => void;
      onEmulatorOutput: (callback: (data: { type: string; data: string }) => void) => () => void;
      onEmulatorTerminated: (callback: (data: { code: number }) => void) => () => void;
      onProcessOutput: (callback: (data: { type: string; data: string }) => void) => () => void;
      onMenuNewFile: (callback: () => void) => () => void;
      onMenuOpenFile: (callback: () => void) => () => void;
      onMenuOpenFolder: (callback: () => void) => () => void;
      onMenuSave: (callback: () => void) => () => void;
      onMenuSaveAs: (callback: () => void) => () => void;
      onMenuCompile: (callback: () => void) => () => void;
      onMenuRun: (callback: () => void) => () => void;
      onMenuDebug: (callback: () => void) => () => void;
      onMenuStop: (callback: () => void) => () => void;
      onMenuStepOver: (callback: () => void) => () => void;
      onMenuStepInto: (callback: () => void) => () => void;
      onMenuStepOut: (callback: () => void) => () => void;
      onMenuToggleBreakpoint: (callback: () => void) => () => void;
      onMenuAbout: (callback: () => void) => () => void;
      debuggerConnect: (options: { port: number; binary?: string }) => Promise<{ success: boolean; message?: string; error?: string }>;
      debuggerDisconnect: () => Promise<{ success: boolean }>;
      debuggerContinue: () => Promise<{ success: boolean; data?: string; error?: string }>;
      debuggerStep: () => Promise<{ success: boolean; data?: string; error?: string }>;
      debuggerStepOver: () => Promise<{ success: boolean; data?: string; error?: string }>;
      debuggerReadRegisters: () => Promise<{ success: boolean; registers?: Record<string, string>; error?: string }>;
      debuggerReadMemory: (options: { address: number; length: number }) => Promise<{ success: boolean; data?: string; error?: string }>;
      debuggerSetBreakpoint: (options: { address: number; type?: number }) => Promise<{ success: boolean; error?: string }>;
      debuggerRemoveBreakpoint: (options: { address: number }) => Promise<{ success: boolean; error?: string }>;
      debuggerGetStatus: () => Promise<{ connected: boolean; breakpoints: Array<{ address: number; type: number }> }>;
      debuggerRunWithGdb: (options: { command: string; args: string[]; cwd?: string; gdbPort?: number }) => Promise<{ success: boolean; pid?: number; gdbPort?: number; stdout?: string; stderr?: string; exitCode?: number }>;
    };
  }
}
