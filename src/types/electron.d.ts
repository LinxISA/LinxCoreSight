// Global type declarations for Electron API exposed via preload
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

export interface CompileResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface EmulatorResult {
  success: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  pid?: number;
}

export interface ProcessResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ToolchainInfo {
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
}

export interface ElectronAPI {
  // Dialogs
  openFileDialog: (options?: { filters?: { name: string; extensions: string[] }[]; defaultPath?: string }) => Promise<DialogResult>;
  openFolderDialog: () => Promise<DialogResult>;
  saveFileDialog: (options?: { filters?: { name: string; extensions: string[] }[]; defaultPath?: string }) => Promise<SaveDialogResult>;

  // File System
  readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  traceReadMeta: (tracePath: string) => Promise<{ ok: boolean; metaPath?: string; metaJson?: string; error?: string }>;
  traceOpenSession: (tracePath: string) => Promise<{ ok: boolean; sessionId?: number; sizeBytes?: number; mtimeMs?: number; error?: string }>;
  traceReadChunk: (sessionId: number, offset: number, bytes: number) => Promise<{ ok: boolean; chunk?: string; nextOffset?: number; eof?: boolean; error?: string }>;
  traceCloseSession: (sessionId: number) => Promise<{ ok: boolean }>;
  writeFile: (filePath: string, content: string) => Promise<FSResult>;
  readDir: (dirPath: string) => Promise<{ success: boolean; files?: FileEntry[]; error?: string }>;
  stat: (filePath: string) => Promise<{ success: boolean; stats?: FileStats; error?: string }>;
  exists: (filePath: string) => Promise<boolean>;
  mkdir: (dirPath: string) => Promise<FSResult>;
  delete: (filePath: string) => Promise<FSResult>;
  rename: (oldPath: string, newPath: string) => Promise<FSResult>;
  createProjectFromTemplate: (request: { name: string; location: string; template: string }) => Promise<{ success: boolean; projectPath?: string; template?: string; error?: string }>;

  // Compiler
  compile: (options: { command: string; args: string[]; cwd?: string }) => Promise<CompileResult>;
  onCompilerOutput: (callback: (data: { type: string; data: string }) => void) => () => void;
  runProcess: (options: { command: string; args: string[]; cwd?: string; env?: Record<string, string>; streamOutput?: boolean; managed?: boolean }) => Promise<ProcessResult>;

  // Emulator
  runEmulator: (options: { command: string; args: string[]; cwd?: string }) => Promise<EmulatorResult>;
  stopEmulator: () => Promise<{ success: boolean; error?: string }>;
  getEmulatorStatus: () => Promise<{ running: boolean; pid?: number }>;
  onEmulatorOutput: (callback: (data: { type: string; data: string }) => void) => () => void;
  onEmulatorTerminated: (callback: (data: { code: number }) => void) => () => void;
  onProcessOutput: (callback: (data: { type: string; data: string }) => void) => () => void;

  // Serial monitor
  connectMonitor: (options: { port: string; baudRate: number }) => Promise<{ success: boolean; message?: string; error?: string }>;
  disconnectMonitor: () => Promise<{ success: boolean }>;
  sendToMonitor: (data: string) => Promise<{ success: boolean; error?: string }>;
  listSerialPorts: () => Promise<{ success: boolean; ports: Array<{ path: string; pnpId?: string; manufacturer?: string }>; error?: string }>;
  onMonitorData: (callback: (data: string) => void) => () => void;
  onMonitorError: (callback: (error: string) => void) => () => void;

  // App
  getPath: (name: string) => Promise<string>;
  getVersion: () => Promise<string>;

  // Toolchain
  getToolchainInfo: () => Promise<ToolchainInfo>;

  // Menu Events
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
  onOpenTrace?: (callback: (tracePath: string) => void) => () => void;

  // Debugger
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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
