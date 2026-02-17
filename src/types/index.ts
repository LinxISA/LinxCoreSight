// LinxCoreSight Type Definitions

// ============================================
// Project Types
// ============================================

export interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  createdAt: Date;
  modifiedAt: Date;
  settings: ProjectSettings;
  buildProfile?: ProjectBuildProfile;
}

export interface ProjectSettings {
  compiler: string;
  targetArchitecture: string;
  outputDir: string;
  includePaths: string[];
  defines: Record<string, string>;
  linkerScript?: string;
}

export interface ProjectBuildCommand {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface ProjectBuildProfile {
  kind: 'single_file' | 'command';
  build?: ProjectBuildCommand;
  run?: ProjectBuildCommand;
  successChecks?: {
    // Backward-compatible default checks when build/run-specific checks are absent.
    contains?: string[];
    notContains?: string[];
  };
  buildSuccessChecks?: {
    contains?: string[];
    notContains?: string[];
  };
  runSuccessChecks?: {
    contains?: string[];
    notContains?: string[];
  };
}

export interface ProjectArtifacts {
  elf?: string;
  bin?: string;
  objdump?: string;
  pipeview?: string;
  qemuLog?: string;
  qemuTrace?: string;
}

export interface ProjectConfigFile {
  name?: string;
  template?: string;
  createdAt?: string;
  buildProfile?: ProjectBuildProfile;
  artifacts?: ProjectArtifacts;
}

export interface PreparedProjectSpec {
  id: string;
  title: string;
  description: string;
  templateId: string;
  benchmarkId: 'coremark' | 'dhrystone';
  difficulty: 'intro' | 'intermediate' | 'advanced';
  tags: string[];
}

// ============================================
// File Types
// ============================================

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  path: string;
  children?: FileEntry[];
  expanded?: boolean;
}

export interface EditorTab {
  id: string;
  filePath: string;
  fileName: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  language: string;
  breakpoints?: number[];
}

// ============================================
// Editor Types
// ============================================

export interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  cursorPosition: { line: number; column: number };
}

export interface EditorPosition {
  line: number;
  column: number;
  filePath: string;
}

// ============================================
// Project State
// ============================================

export interface ProjectState {
  rootPath: string | null;
  files: FileEntry[];
  selectedFile: string | null;
  currentProject: Project | null;
  recentProjects: Project[];
}

// ============================================
// Emulator Types
// ============================================

export type EmulatorStatus = 'stopped' | 'running' | 'paused' | 'error';

export interface EmulatorState {
  status: EmulatorStatus;
  pid: number | null;
  output: string;
  binaryPath: string | null;
}

// ============================================
// Compiler Types
// ============================================

export type CompileStatus = 'idle' | 'compiling' | 'success' | 'error';

export interface CompileResult {
  success: boolean;
  output: string;
  errors: CompileError[];
  warnings: CompileWarning[];
  binaryPath?: string;
  compileTime?: number;
}

export interface CompileError {
  line: number;
  column: number;
  file: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface CompileWarning {
  line: number;
  column: number;
  file: string;
  message: string;
}

export interface CompileState {
  status: CompileStatus;
  output: string;
  errors: string[];
  lastCompileTime: number | null;
  result: CompileResult | null;
}

// ============================================
// Debugger Types
// ============================================

export type DebuggerStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'stepping';

export interface DebugBreakpoint {
  id: string;
  filePath: string;
  line: number;
  enabled: boolean;
  condition?: string;
  hitCount?: number;
}

export interface DebugFrame {
  id: number;
  function: string;
  file: string;
  line: number;
  address?: string;
}

export interface DebugVariable {
  name: string;
  value: string;
  type: string;
  scope: 'local' | 'global' | 'register';
}

export interface DebugState {
  status: DebuggerStatus;
  breakpoints: DebugBreakpoint[];
  callStack: DebugFrame[];
  variables: DebugVariable[];
  registers: Record<string, string>;
  memory: Map<string, string>;
  currentFrame: number;
}

export interface DebugExecutionPoint {
  file: string;
  line: number;
  column: number;
}

// ============================================
// Panel Types
// ============================================

export type PanelType = 'pipeview' | 'assembly' | 'memory' | 'registers' | 'trace' | 'wakeup' | 'schematic' | 'monitor' | 'terminal';

export interface PanelState {
  activePanel: PanelType;
  panelVisibility: Record<PanelType, boolean>;
}

// ============================================
// Monitor Types
// ============================================

export interface MonitorState {
  connected: boolean;
  port: string;
  baudRate: number;
  output: string;
}

// ============================================
// Settings Types
// ============================================

export interface AppSettings {
  theme: 'dark' | 'light' | 'high-contrast';
  fontSize: number;
  showMinimap: boolean;
  autoSave: boolean;
  autoCompile: boolean;
  compilerPath: string;
  clangxxPath: string;
  lldPath: string;
  qemuPath: string;
  qemuArgs: string[];
  workspacePath: string;
  wordWrap: boolean;
  tabSize: number;
  fontFamily: string;
  accentColor: string;
  compactMode: boolean;
  showLineNumbers: boolean;
}

// Default settings
export const defaultSettings: AppSettings = {
  theme: 'dark',
  fontSize: 14,
  showMinimap: true,
  autoSave: false,
  autoCompile: true,
  compilerPath: '',
  clangxxPath: '',
  lldPath: '',
  qemuPath: '',
  qemuArgs: [
    '-machine', 'virt',
    '-nographic',
    '-monitor', 'none',
    '-m', '512M'
  ],
  workspacePath: '',
  wordWrap: false,
  tabSize: 4,
  fontFamily: 'JetBrains Mono, Menlo, Consolas, monospace',
  accentColor: '#00d9ff',
  compactMode: false,
  showLineNumbers: true
};
