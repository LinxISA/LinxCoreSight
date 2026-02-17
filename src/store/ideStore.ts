/**
 * IDE Store - Central state management for the complete IDE
 * Handles projects, editing, compilation, debugging, and visualization
 */

import { create } from 'zustand';
import { 
  // Project
  Project, ProjectSettings,
  // Editor
  EditorTab, FileEntry,
  // Compiler
  CompileStatus, CompileResult, CompileError, CompileWarning,
  // Debugger
  DebuggerStatus, DebugBreakpoint, DebugFrame, DebugVariable,
  // Panels
  PanelType,
  // Settings
  AppSettings, defaultSettings,
  // Monitor
  MonitorState
} from '../types';

// Import backend modules (for Node.js/Electron environment)
// These will only work in the main process or with proper IPC
let buildProject: any = null;
let runEmulator: any = null;
let disassembleToLines: any = null;
let detectToolchain: any = null;
let pycSimulate: any = null;
let fullPipeline: any = null;

// Lazy load backend modules (only available in Electron main process)
const loadBackend = async () => {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    try {
      // In Electron, use IPC to call backend
      return null;
    } catch (e) {
      console.warn('Backend modules not available in renderer');
    }
  }
  return null;
};

// ============================================
// Utility Functions
// ============================================

const generateId = () => Math.random().toString(36).substring(2, 11);

const sanitizeDisplayString = (value: string, fallback: string, maxLen: number): string => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const strippedControls = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!strippedControls) {
    return fallback;
  }
  if (strippedControls.length > maxLen) {
    return fallback;
  }
  const nonAsciiCount = (strippedControls.match(/[^\x20-\x7e]/g) || []).length;
  if (strippedControls.length >= 32 && nonAsciiCount / strippedControls.length > 0.35) {
    return fallback;
  }
  return strippedControls;
};

const sanitizeProjectName = (name: string): string =>
  sanitizeDisplayString(name, 'Project', 80);

const sanitizeProjectPath = (path: string): string =>
  sanitizeDisplayString(path, '', 512);

const getLanguageFromPath = (filePath: string): string => {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    'py': 'python',
    'c': 'c',
    'cpp': 'cpp',
    'cc': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'v': 'verilog',
    'sv': 'systemverilog',
    'li': 'linxisa',
    'linx': 'linxisa',
    'asm': 'assembly',
    'json': 'json',
    'md': 'markdown',
    'txt': 'plaintext'
  };
  return languageMap[ext] || 'plaintext';
};

// ============================================
// IDE State Interface
// ============================================

interface IDEState {
  // --- Project Management ---
  currentProject: Project | null;
  recentProjects: Project[];
  rootPath: string | null;
  files: FileEntry[];
  
  // --- Editor ---
  tabs: EditorTab[];
  activeTabId: string | null;
  cursorPosition: { line: number; column: number };
  selectedFile: string | null;
  
  // --- Compilation ---
  compileStatus: CompileStatus;
  compileOutput: string;
  compileErrors: CompileError[];
  compileWarnings: CompileWarning[];
  lastCompileResult: CompileResult | null;
  
  // --- Debugging ---
  debuggerStatus: DebuggerStatus;
  breakpoints: DebugBreakpoint[];
  callStack: DebugFrame[];
  variables: DebugVariable[];
  registers: Record<string, string>;
  executionPoint: { file: string; line: number; column: number } | null;
  
  // --- Execution ---
  emulatorStatus: 'stopped' | 'running' | 'paused' | 'error';
  emulatorPid: number | null;
  emulatorOutput: string;
  binaryPath: string | null;
  
  // --- Visualization ---
  activePanel: PanelType;
  panelVisibility: Record<PanelType, boolean>;
  
  // --- Monitor ---
  monitor: MonitorState;
  
  // --- Settings ---
  settings: AppSettings;
  
  // --- UI State ---
  isWelcomeScreen: boolean;
  showSettings: boolean;
  sidebarWidth: number;
  outputPanelHeight: number;
  
  // ========================
  // Project Actions
  // ========================
  createProject: (name: string, path: string, template?: string) => Project;
  openProject: (path: string) => Promise<void>;
  closeProject: () => void;
  addRecentProject: (project: Project) => void;
  setRootPath: (path: string | null) => void;
  setFiles: (files: FileEntry[]) => void;
  setSelectedFile: (path: string | null) => void;
  toggleFileExpanded: (path: string) => void;
  createFile: (parentPath: string, fileName: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  renameFile: (oldPath: string, newName: string) => Promise<void>;
  refreshFiles: () => Promise<void>;
  
  // ========================
  // Editor Actions
  // ========================
  openFile: (filePath: string, content: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  saveTab: (tabId: string) => Promise<void>;
  saveAllTabs: () => Promise<void>;
  setCursorPosition: (line: number, column: number) => void;
  createNewFile: (name?: string, language?: string) => void;
  createNewFolder: (name: string) => void;
  
  // ========================
  // Breakpoint Actions
  // ========================
  addBreakpoint: (filePath: string, line: number, condition?: string) => void;
  removeBreakpoint: (id: string) => void;
  toggleBreakpoint: (id: string) => void;
  updateBreakpoint: (id: string, updates: Partial<DebugBreakpoint>) => void;
  clearAllBreakpoints: () => void;
  
  // ========================
  // Compilation Actions
  // ========================
  setCompileStatus: (status: CompileStatus) => void;
  setCompileResult: (result: CompileResult) => void;
  appendCompileOutput: (output: string) => void;
  clearCompileOutput: () => void;
  
  // ========================
  // Toolchain Actions
  // ========================
  buildProject: () => Promise<void>;
  runInEmulator: () => Promise<void>;
  disassembleBinary: () => Promise<any[] | null>;
  runPyCircuit: (cycles?: number) => Promise<void>;
  stopExecution: () => void;
  
  // ========================
  // Debugger Actions
  // ========================
  setDebuggerStatus: (status: DebuggerStatus) => void;
  setExecutionPoint: (point: { file: string; line: number; column: number } | null) => void;
  setCallStack: (frames: DebugFrame[]) => void;
  setVariables: (vars: DebugVariable[]) => void;
  setRegisters: (regs: Record<string, string>) => void;
  stepOver: () => void;
  stepInto: () => void;
  stepOut: () => void;
  continueExecution: () => void;
  pauseExecution: () => void;
  stopDebugging: () => void;
  
  // ========================
  // Execution Actions
  // ========================
  setEmulatorStatus: (status: 'stopped' | 'running' | 'paused' | 'error') => void;
  setEmulatorPid: (pid: number | null) => void;
  appendEmulatorOutput: (output: string) => void;
  clearEmulatorOutput: () => void;
  setBinaryPath: (path: string | null) => void;
  startEmulator: (binaryPath: string) => Promise<void>;
  stopEmulator: () => void;
  
  // ========================
  // Panel Actions
  // ========================
  setActivePanel: (panel: PanelType) => void;
  togglePanelVisibility: (panel: PanelType) => void;
  
  // ========================
  // Monitor Actions
  // ========================
  setMonitorConnected: (connected: boolean) => void;
  setMonitorPort: (port: string) => void;
  setMonitorBaudRate: (baudRate: number) => void;
  appendMonitorOutput: (output: string) => void;
  clearMonitorOutput: () => void;
  
  // ========================
  // Settings Actions
  // ========================
  updateSettings: (settings: Partial<AppSettings>) => void;
  
  // ========================
  // UI Actions
  // ========================
  setWelcomeScreen: (show: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setShowSettings: (show: boolean) => void;
  setOutputPanelHeight: (height: number) => void;
}

export const useIDEStore = create<IDEState>((set, get) => ({
  // ========================
  // Initial State
  // ========================
  
  // Project
  currentProject: null,
  recentProjects: [],
  rootPath: null,
  files: [],
  
  // Editor
  tabs: [],
  activeTabId: null,
  cursorPosition: { line: 1, column: 1 },
  selectedFile: null,
  
  // Compilation
  compileStatus: 'idle',
  compileOutput: '',
  compileErrors: [],
  compileWarnings: [],
  lastCompileResult: null,
  
  // Debugger
  debuggerStatus: 'idle',
  breakpoints: [],
  callStack: [],
  variables: [],
  registers: {},
  executionPoint: null,
  
  // Execution
  emulatorStatus: 'stopped',
  emulatorPid: null,
  emulatorOutput: '',
  binaryPath: null,
  
  // Visualization
  activePanel: 'schematic',
  panelVisibility: {
    pipeview: true,
    assembly: true,
    trace: true,
    wakeup: true,
    schematic: true,
    memory: true,
    registers: true,
    monitor: true,
    terminal: true
  },
  
  // Monitor
  monitor: {
    connected: false,
    port: '/dev/ttyUSB0',
    baudRate: 115200,
    output: ''
  },
  
  // Settings
  settings: defaultSettings,
  
  // UI
  isWelcomeScreen: true,
  showSettings: false,
  sidebarWidth: 250,
  outputPanelHeight: 200,
  
  // ========================
  // Project Actions
  // ========================
  
  createProject: (name: string, path: string, template = 'empty') => {
    const safeName = sanitizeProjectName(name);
    const safePath = sanitizeProjectPath(path);
    const project: Project = {
      id: generateId(),
      name: safeName,
      path: safePath || path,
      description: `LinxCoreSight Project - ${template} template`,
      createdAt: new Date(),
      modifiedAt: new Date(),
      settings: {
        compiler: 'linx-cc',
        targetArchitecture: 'linx64',
        outputDir: 'build',
        includePaths: ['./include'],
        defines: {}
      }
    };
    
    set({ 
      currentProject: project,
      isWelcomeScreen: false,
      rootPath: safePath || path,
      files: [
        { name: 'src', isDirectory: true, path: `${safePath || path}/src`, expanded: true, children: [
          { name: 'main.li', isDirectory: false, path: `${safePath || path}/src/main.li` }
        ]},
        { name: 'include', isDirectory: true, path: `${safePath || path}/include`, expanded: false, children: [] },
        { name: 'build', isDirectory: true, path: `${safePath || path}/build`, expanded: false, children: [] },
        { name: 'linxcoresight.json', isDirectory: false, path: `${safePath || path}/linxcoresight.json` }
      ]
    });
    
    // Add to recent projects
    const { recentProjects } = get();
    const projectPathKey = safePath || path;
    set({ recentProjects: [project, ...recentProjects.filter(p => p.path !== projectPathKey)].slice(0, 10) });
    
    return project;
  },
  
  openProject: async (path: string) => {
    const safePath = sanitizeProjectPath(path) || path;
    // Read directory structure from disk
    const buildTree = async (dirPath: string): Promise<FileEntry[]> => {
      try {
        const result = await window.electronAPI.readDir(dirPath);
        if (!result.success || !result.files) return [];
        
        const entries: FileEntry[] = [];
        for (const file of result.files) {
          if (file.isDirectory) {
            entries.push({
              name: file.name,
              isDirectory: true,
              path: file.path,
              expanded: false,
              children: await buildTree(file.path)
            });
          } else {
            entries.push({
              name: file.name,
              isDirectory: false,
              path: file.path
            });
          }
        }
        // Sort: directories first, then files, alphabetically
        entries.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
        return entries;
      } catch (error) {
        console.error('Error building file tree:', error);
        return [];
      }
    };
    
    const files = await buildTree(safePath);
    
    const project: Project = {
      id: generateId(),
      name: sanitizeProjectName(safePath.split('/').pop() || safePath.split('\\').pop() || 'Project'),
      path: safePath,
      createdAt: new Date(),
      modifiedAt: new Date(),
      settings: {
        compiler: 'linx-cc',
        targetArchitecture: 'linx64',
        outputDir: 'build',
        includePaths: ['./include'],
        defines: {}
      }
    };
    
    set({ 
      currentProject: project,
      isWelcomeScreen: false,
      rootPath: safePath,
      files
    });
    
    // Add to recent projects
    const { recentProjects } = get();
    set({ recentProjects: [project, ...recentProjects.filter(p => p.path !== safePath)].slice(0, 10) });
  },
  
  closeProject: () => {
    set({ 
      currentProject: null,
      rootPath: null,
      files: [],
      tabs: [],
      activeTabId: null,
      isWelcomeScreen: true
    });
  },
  
  addRecentProject: (project: Project) => {
    const { recentProjects } = get();
    const sanitizedProject: Project = {
      ...project,
      name: sanitizeProjectName(project.name || 'Project'),
      path: sanitizeProjectPath(project.path) || project.path,
    };
    set({ 
      recentProjects: [sanitizedProject, ...recentProjects.filter(p => p.path !== sanitizedProject.path)].slice(0, 10) 
    });
  },
  
  setRootPath: (path) => set({ rootPath: path }),
  setFiles: (files) => set({ files }),
  setSelectedFile: (path) => set({ selectedFile: path }),
  
  toggleFileExpanded: (path) => {
    const { files } = get();
    const toggleInTree = (entries: FileEntry[]): FileEntry[] => {
      return entries.map(entry => {
        if (entry.path === path) {
          return { ...entry, expanded: !entry.expanded };
        }
        if (entry.children) {
          return { ...entry, children: toggleInTree(entry.children) };
        }
        return entry;
      });
    };
    set({ files: toggleInTree(files) });
  },
  
  createFile: async (parentPath: string, fileName: string) => {
    const filePath = `${parentPath}/${fileName}`;
    await window.electronAPI.writeFile(filePath, '');
    // Refresh the file tree
    const { rootPath, files } = get();
    if (rootPath) {
      const buildTree = async (dirPath: string): Promise<FileEntry[]> => {
        try {
          const result = await window.electronAPI.readDir(dirPath);
          if (!result.success || !result.files) return [];
          
          const entries: FileEntry[] = [];
          for (const file of result.files) {
            if (file.isDirectory) {
              entries.push({
                name: file.name,
                isDirectory: true,
                path: file.path,
                expanded: false,
                children: await buildTree(file.path)
              });
            } else {
              entries.push({
                name: file.name,
                isDirectory: false,
                path: file.path
              });
            }
          }
          entries.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
          });
          return entries;
        } catch (error) {
          return [];
        }
      };
      const newFiles = await buildTree(rootPath);
      set({ files: newFiles });
    }
  },
  
  deleteFile: async (path: string) => {
    await window.electronAPI.delete(path);
    // Refresh the file tree
    const { rootPath } = get();
    if (rootPath) {
      const buildTree = async (dirPath: string): Promise<FileEntry[]> => {
        try {
          const result = await window.electronAPI.readDir(dirPath);
          if (!result.success || !result.files) return [];
          
          const entries: FileEntry[] = [];
          for (const file of result.files) {
            if (file.isDirectory) {
              entries.push({
                name: file.name,
                isDirectory: true,
                path: file.path,
                expanded: false,
                children: await buildTree(file.path)
              });
            } else {
              entries.push({
                name: file.name,
                isDirectory: false,
                path: file.path
              });
            }
          }
          entries.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
          });
          return entries;
        } catch (error) {
          return [];
        }
      };
      const newFiles = await buildTree(rootPath);
      set({ files: newFiles });
    }
  },
  
  renameFile: async (oldPath: string, newName: string) => {
    const parts = oldPath.split('/');
    parts[parts.length - 1] = newName;
    const newPath = parts.join('/');
    await window.electronAPI.rename(oldPath, newPath);
    // Refresh the file tree
    const { rootPath } = get();
    if (rootPath) {
      const buildTree = async (dirPath: string): Promise<FileEntry[]> => {
        try {
          const result = await window.electronAPI.readDir(dirPath);
          if (!result.success || !result.files) return [];
          
          const entries: FileEntry[] = [];
          for (const file of result.files) {
            if (file.isDirectory) {
              entries.push({
                name: file.name,
                isDirectory: true,
                path: file.path,
                expanded: false,
                children: await buildTree(file.path)
              });
            } else {
              entries.push({
                name: file.name,
                isDirectory: false,
                path: file.path
              });
            }
          }
          entries.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
          });
          return entries;
        } catch (error) {
          return [];
        }
      };
      const newFiles = await buildTree(rootPath);
      set({ files: newFiles });
    }
  },
  
  refreshFiles: async () => {
    const { rootPath } = get();
    if (!rootPath) return;
    
    const buildTree = async (dirPath: string): Promise<FileEntry[]> => {
      try {
        const result = await window.electronAPI.readDir(dirPath);
        if (!result.success || !result.files) return [];
        
        const entries: FileEntry[] = [];
        for (const file of result.files) {
          if (file.isDirectory) {
            entries.push({
              name: file.name,
              isDirectory: true,
              path: file.path,
              expanded: false,
              children: await buildTree(file.path)
            });
          } else {
            entries.push({
              name: file.name,
              isDirectory: false,
              path: file.path
            });
          }
        }
        entries.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
        return entries;
      } catch (error) {
        return [];
      }
    };
    const newFiles = await buildTree(rootPath);
    set({ files: newFiles });
  },
  
  // ========================
  // Editor Actions
  // ========================
  
  openFile: (filePath: string, content: string) => {
    const { tabs } = get();
    const existingTab = tabs.find(tab => tab.filePath === filePath);
    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return;
    }
    
    const fileName = filePath.split(/[/\\]/).pop() || 'untitled';
    const newTab: EditorTab = {
      id: generateId(),
      filePath,
      fileName,
      content,
      originalContent: content,
      isDirty: false,
      language: getLanguageFromPath(filePath),
      breakpoints: []
    };
    
    set({ tabs: [...tabs, newTab], activeTabId: newTab.id });
  },
  
  closeTab: (tabId: string) => {
    const { tabs, activeTabId } = get();
    const newTabs = tabs.filter(tab => tab.id !== tabId);
    let newActiveTabId = activeTabId;
    
    if (activeTabId === tabId) {
      const closedIndex = tabs.findIndex(tab => tab.id === tabId);
      if (newTabs.length > 0) {
        newActiveTabId = newTabs[Math.min(closedIndex, newTabs.length - 1)].id;
      } else {
        newActiveTabId = null;
      }
    }
    
    set({ tabs: newTabs, activeTabId: newActiveTabId });
  },
  
  setActiveTab: (tabId) => set({ activeTabId: tabId }),
  
  updateTabContent: (tabId, content) => {
    const { tabs } = get();
    set({
      tabs: tabs.map(tab => 
        tab.id === tabId 
          ? { ...tab, content, isDirty: content !== tab.originalContent }
          : tab
      )
    });
  },
  
  saveTab: async (tabId) => {
    const { tabs } = get();
    const tab = tabs.find(t => t.id === tabId);
    if (!tab || !tab.isDirty) return;

    try {
      const result = await window.electronAPI.writeFile(tab.filePath, tab.content);
      if (!result.success) {
        throw new Error(result.error || 'Failed to save file');
      }
      set({
        tabs: tabs.map(t =>
          t.id === tabId
            ? { ...t, originalContent: t.content, isDirty: false }
            : t
        )
      });
    } catch (error) {
      console.error('Error saving tab:', error);
    }
  },
  
  saveAllTabs: async () => {
    const { tabs } = get();
    const pending: Promise<void>[] = [];
    tabs.forEach(tab => {
      if (tab.isDirty) {
        pending.push(get().saveTab(tab.id));
      }
    });
    await Promise.all(pending);
  },
  
  setCursorPosition: (line, column) => set({ cursorPosition: { line, column } }),
  
  createNewFile: (name = 'untitled', language = 'plaintext') => {
    const { rootPath, tabs } = get();
    const filePath = rootPath ? `${rootPath}/src/${name}` : `/${name}`;
    
    const newTab: EditorTab = {
      id: generateId(),
      filePath,
      fileName: name,
      content: getDefaultContent(language),
      originalContent: '',
      isDirty: true,
      language: getLanguageFromPath(name) || language,
      breakpoints: []
    };
    
    set({ tabs: [...tabs, newTab], activeTabId: newTab.id });
  },
  
  createNewFolder: (name) => {
    const { rootPath, files } = get();
    if (!rootPath) return;
    
    // Would create folder via electron API
    console.log('Creating folder:', `${rootPath}/${name}`);
  },
  
  // ========================
  // Breakpoint Actions
  // ========================
  
  addBreakpoint: (filePath, line, condition) => {
    const { breakpoints } = get();
    const newBreakpoint: DebugBreakpoint = {
      id: generateId(),
      filePath,
      line,
      enabled: true,
      condition
    };
    set({ breakpoints: [...breakpoints, newBreakpoint] });
  },
  
  removeBreakpoint: (id) => {
    const { breakpoints } = get();
    set({ breakpoints: breakpoints.filter(bp => bp.id !== id) });
  },
  
  toggleBreakpoint: (id) => {
    const { breakpoints } = get();
    set({ 
      breakpoints: breakpoints.map(bp => 
        bp.id === id ? { ...bp, enabled: !bp.enabled } : bp
      )
    });
  },
  
  updateBreakpoint: (id, updates) => {
    const { breakpoints } = get();
    set({ 
      breakpoints: breakpoints.map(bp => 
        bp.id === id ? { ...bp, ...updates } : bp
      )
    });
  },
  
  clearAllBreakpoints: () => set({ breakpoints: [] }),
  
  // ========================
  // Compilation Actions
  // ========================
  
  setCompileStatus: (status) => set({ compileStatus: status }),
  
  setCompileResult: (result) => set({
    compileStatus: result.success ? 'success' : 'error',
    compileOutput: result.output,
    compileErrors: result.errors,
    compileWarnings: result.warnings,
    lastCompileResult: result,
    binaryPath: result.binaryPath || null
  }),
  
  appendCompileOutput: (output) => {
    set(state => ({ compileOutput: state.compileOutput + output }));
  },
  
  clearCompileOutput: () => set({ 
    compileOutput: '', 
    compileErrors: [],
    compileWarnings: []
  }),
  
  // ========================
  // Toolchain Actions
  // ========================
  
  // Build project using LinxISA toolchain
  buildProject: async () => {
    const state = get();
    if (!state.currentProject || !state.rootPath) {
      set({ compileStatus: 'error', compileOutput: 'No project open' });
      return;
    }
    
    set({ compileStatus: 'compiling', compileOutput: 'Building project...\n' });
    
    try {
      // Use Electron IPC to call backend
      const result = await (window as any).electronAPI?.buildProject({
        projectRoot: state.rootPath,
        sourceFiles: [],
        outputName: 'main',
      });
      
      if (result?.success) {
        set({
          compileStatus: 'success',
          compileOutput: `Build successful! (${result.buildTimeMs}ms)\nOutput: ${result.outputFile}`,
          binaryPath: result.outputFile,
          compileErrors: [],
        });
      } else {
        set({
          compileStatus: 'error',
          compileOutput: result?.output || 'Build failed',
          compileErrors: result?.errors?.map((e: string) => ({ 
            file: '', 
            line: 0, 
            column: 0, 
            message: e,
            severity: 'error' 
          })) || [],
        });
      }
    } catch (error: any) {
      set({ 
        compileStatus: 'error', 
        compileOutput: `Build error: ${error.message}`,
        compileErrors: [{ file: '', line: 0, column: 0, message: error.message, severity: 'error' }]
      });
    }
  },
  
  // Run binary in QEMU
  runInEmulator: async () => {
    const state = get();
    if (!state.binaryPath) {
      set({ emulatorStatus: 'error', emulatorOutput: 'No binary to run. Build first.' });
      return;
    }
    
    set({ emulatorStatus: 'running', emulatorOutput: 'Starting QEMU...\n' });
    
    try {
      const result = await (window as any).electronAPI?.runEmulator({
        kernel: state.binaryPath,
      });
      
      if (result?.success) {
        set({ 
          emulatorStatus: 'stopped', 
          emulatorOutput: (state.emulatorOutput || '') + (result.output || '') + '\nEmulator exited.'
        });
      } else {
        set({ 
          emulatorStatus: 'error', 
          emulatorOutput: (state.emulatorOutput || '') + (result.error || 'Run failed') 
        });
      }
    } catch (error: any) {
      set({ 
        emulatorStatus: 'error', 
        emulatorOutput: `Emulator error: ${error.message}` 
      });
    }
  },
  
  // Disassemble binary
  disassembleBinary: async () => {
    const state = get();
    if (!state.binaryPath) {
      return null;
    }
    
    try {
      const result = await (window as any).electronAPI?.disassemble({
        binary: state.binaryPath,
      });
      
      return result?.lines || null;
    } catch (error) {
      console.error('Disassembly error:', error);
      return null;
    }
  },
  
  // Run pyCircuit simulation
  runPyCircuit: async (cycles?: number) => {
    const state = get();
    if (!state.binaryPath) {
      set({ emulatorStatus: 'error', emulatorOutput: 'No binary to simulate. Build first.' });
      return;
    }
    
    set({ emulatorStatus: 'running', emulatorOutput: 'Running pyCircuit simulation...\n' });
    
    try {
      const result = await (window as any).electronAPI?.runPyCircuit({
        binary: state.binaryPath,
        cycles,
      });
      
      if (result?.success) {
        set({ 
          emulatorStatus: 'stopped', 
          emulatorOutput: (state.emulatorOutput || '') + (result.output || '') + '\nSimulation complete.'
        });
      } else {
        set({ 
          emulatorStatus: 'error', 
          emulatorOutput: (state.emulatorOutput || '') + (result.error || 'Simulation failed') 
        });
      }
    } catch (error: any) {
      set({ 
        emulatorStatus: 'error', 
        emulatorOutput: `Simulation error: ${error.message}` 
      });
    }
  },
  
  // Stop running emulator/simulation
  stopExecution: () => {
    set({ emulatorStatus: 'stopped' });
    (window as any).electronAPI?.stopEmulator?.();
  },
  
  // ========================
  // Debugger Actions
  // ========================
  
  setDebuggerStatus: (status) => set({ debuggerStatus: status }),
  
  setExecutionPoint: (point) => set({ executionPoint: point }),
  
  setCallStack: (frames) => set({ callStack: frames }),
  
  setVariables: (vars) => set({ variables: vars }),
  
  setRegisters: (regs) => set({ registers: regs }),
  
  stepOver: () => {
    set({ debuggerStatus: 'stepping' });
    // Would send step command to debugger
    console.log('Stepping over...');
  },
  
  stepInto: () => {
    set({ debuggerStatus: 'stepping' });
    console.log('Stepping into...');
  },
  
  stepOut: () => {
    set({ debuggerStatus: 'stepping' });
    console.log('Stepping out...');
  },
  
  continueExecution: () => {
    set({ debuggerStatus: 'running' });
    console.log('Continuing execution...');
  },
  
  pauseExecution: () => {
    set({ debuggerStatus: 'paused' });
    console.log('Pausing execution...');
  },
  
  stopDebugging: () => {
    set({ 
      debuggerStatus: 'stopped',
      executionPoint: null,
      callStack: [],
      variables: []
    });
    console.log('Stopping debugger...');
  },
  
  // ========================
  // Execution Actions
  // ========================
  
  setEmulatorStatus: (status) => set({ emulatorStatus: status }),
  setEmulatorPid: (pid) => set({ emulatorPid: pid }),
  appendEmulatorOutput: (output) => {
    set(state => ({ emulatorOutput: state.emulatorOutput + output }));
  },
  clearEmulatorOutput: () => set({ emulatorOutput: '' }),
  setBinaryPath: (path) => set({ binaryPath: path }),
  
  startEmulator: async (binaryPath) => {
    set({ 
      emulatorStatus: 'running', 
      binaryPath,
      emulatorOutput: `Starting emulator with: ${binaryPath}\n`
    });
    console.log('Starting emulator:', binaryPath);
  },
  
  stopEmulator: () => {
    const { emulatorPid } = get();
    if (emulatorPid) {
      console.log('Stopping emulator:', emulatorPid);
    }
    set({ 
      emulatorStatus: 'stopped', 
      emulatorPid: null 
    });
  },
  
  // ========================
  // Panel Actions
  // ========================
  
  setActivePanel: (panel) => set({ activePanel: panel }),
  
  togglePanelVisibility: (panel) => {
    set(state => ({
      panelVisibility: { ...state.panelVisibility, [panel]: !state.panelVisibility[panel] }
    }));
  },
  
  // ========================
  // Monitor Actions
  // ========================
  
  setMonitorConnected: (connected) => set(state => ({
    monitor: { ...state.monitor, connected }
  })),
  
  setMonitorPort: (port) => set(state => ({
    monitor: { ...state.monitor, port }
  })),
  
  setMonitorBaudRate: (baudRate) => set(state => ({
    monitor: { ...state.monitor, baudRate }
  })),
  
  appendMonitorOutput: (output) => set(state => ({
    monitor: { ...state.monitor, output: state.monitor.output + output }
  })),
  
  clearMonitorOutput: () => set(state => ({
    monitor: { ...state.monitor, output: '' }
  })),
  
  // ========================
  // Settings Actions
  // ========================
  
  updateSettings: (newSettings) => {
    set(state => ({ settings: { ...state.settings, ...newSettings } }));
  },
  
  // ========================
  // UI Actions
  // ========================
  
  setWelcomeScreen: (show) => set({ isWelcomeScreen: show }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setShowSettings: (show) => set({ showSettings: show }),
  setOutputPanelHeight: (height) => set({ outputPanelHeight: height })
}));

// Helper function for default content
function getDefaultContent(language: string): string {
  const templates: Record<string, string> = {
    linxisa: `// LinxCoreSight - LinxISA Assembly
// Target: LinxISA 64-bit

.section .text
.global _start

_start:
    // Entry point - LinxISA uses destination-last syntax: op src1, src2, ->dest
    c.movi 0, ->a0          // Initialize counter
    c.movi 10, ->a1         // Loop count
    
loop:
    c.lwi [sp, 0], ->t0     // Load counter
    addw t0, a0.sw, ->t0   // Increment
    c.swi t0#1, [sp, 0]    // Store counter
    cmp.lt t0, a1.sw, ->u0  // Compare
    C.BSTART COND, loop     // Branch if condition met
    C.BSTOP
    
    // Exit
    c.movi 0, ->a0          // Return code 0
    ebreak 0                // Break to debugger
`,
    c: `// LinxCoreSight - C Program
#include <stdio.h>

int main(int argc, char** argv) {
    printf("Hello, LinxCoreSight!\\n");
    return 0;
}
`,
    python: `# LinxCoreSight - Python Script
def main():
    print("Hello, LinxCoreSight!")
    
if __name__ == "__main__":
    main()
`,
    verilog: `// LinxCoreSight - Verilog Module
module top (
    input  wire clk,
    input  wire rst,
    output wire [31:0] data
);
    
    // Your logic here
    
endmodule
`,
    json: `{
  "name": "linxcoresight-project",
  "version": "1.0.0",
  "target": "linx64"
}
`
  };
  
  return templates[language] || '// New file\n';
}
