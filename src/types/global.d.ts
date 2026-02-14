// Electron API type declarations

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
      compile: (options: { command: string; args: string[]; cwd?: string }) => Promise<CompileResult>;
      runEmulator: (options: { command: string; args: string[]; cwd?: string }) => Promise<EmulatorResult>;
      stopEmulator: () => Promise<{ success: boolean; error?: string }>;
      getEmulatorStatus: () => Promise<{ running: boolean; pid?: number }>;
      connectMonitor: (options: { port: string; baudRate: number }) => Promise<{ success: boolean; message?: string; error?: string }>;
      disconnectMonitor: () => Promise<{ success: boolean }>;
      sendToMonitor: (data: string) => Promise<{ success: boolean; error?: string }>;
      listSerialPorts: () => Promise<{ success: boolean; ports: Array<{ path: string; pnpId?: string; manufacturer?: string }>; error?: string }>;
      onMonitorData: (callback: (data: string) => void) => () => void;
      onMonitorError: (callback: (error: string) => void) => () => void;
      getPath: (name: string) => Promise<string>;
      getVersion: () => Promise<string>;
      onCompilerOutput: (callback: (data: { type: string; data: string }) => void) => () => void;
      onEmulatorOutput: (callback: (data: { type: string; data: string }) => void) => () => void;
      onEmulatorTerminated: (callback: (data: { code: number }) => void) => () => void;
      onMenuNewFile: (callback: () => void) => () => void;
      onMenuOpenFile: (callback: () => void) => () => void;
      onMenuOpenFolder: (callback: () => void) => () => void;
      onMenuSave: (callback: () => void) => () => void;
      onMenuSaveAs: (callback: () => void) => () => void;
      onMenuCompile: (callback: () => void) => () => void;
      onMenuRun: (callback: () => void) => () => void;
      onMenuDebug: (callback: () => void) => () => void;
      onMenuStop: (callback: () => void) => () => void;
      onMenuAbout: (callback: () => void) => () => void;
    };
  }
}

export {};
