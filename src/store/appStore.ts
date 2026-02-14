import { create } from 'zustand';
import { 
  FileEntry, 
  EditorTab, 
  EmulatorStatus, 
  CompileStatus, 
  PanelType,
  MonitorState,
  AppSettings,
  defaultSettings 
} from '../types';

// Helper to get file language from extension
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

// Generate unique ID
const generateId = () => Math.random().toString(36).substring(2, 9);

interface AppState {
  // Editor state
  tabs: EditorTab[];
  activeTabId: string | null;
  cursorPosition: { line: number; column: number };
  
  // Project state
  rootPath: string | null;
  files: FileEntry[];
  selectedFile: string | null;
  
  // Build state
  compileStatus: CompileStatus;
  compileOutput: string;
  compileErrors: string[];
  
  // Emulator state
  emulatorStatus: EmulatorStatus;
  emulatorPid: number | null;
  emulatorOutput: string;
  binaryPath: string | null;
  
  // Panel state
  activePanel: PanelType;
  panelVisibility: Record<PanelType, boolean>;
  
  // Monitor state
  monitor: MonitorState;
  
  // Settings
  settings: AppSettings;
  
  // Actions - Editor
  openFile: (filePath: string, content: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  saveTab: (tabId: string) => void;
  setCursorPosition: (line: number, column: number) => void;
  
  // Actions - Project
  setRootPath: (path: string | null) => void;
  setFiles: (files: FileEntry[]) => void;
  setSelectedFile: (path: string | null) => void;
  toggleFileExpanded: (path: string) => void;
  
  // Actions - Build
  setCompileStatus: (status: CompileStatus) => void;
  appendCompileOutput: (output: string) => void;
  setCompileErrors: (errors: string[]) => void;
  clearCompileOutput: () => void;
  
  // Actions - Emulator
  setEmulatorStatus: (status: EmulatorStatus) => void;
  setEmulatorPid: (pid: number | null) => void;
  appendEmulatorOutput: (output: string) => void;
  setBinaryPath: (path: string | null) => void;
  clearEmulatorOutput: () => void;
  
  // Actions - Panels
  setActivePanel: (panel: PanelType) => void;
  togglePanelVisibility: (panel: PanelType) => void;
  
  // Actions - Monitor
  setMonitorConnected: (connected: boolean) => void;
  setMonitorPort: (port: string) => void;
  setMonitorBaudRate: (baudRate: number) => void;
  appendMonitorOutput: (output: string) => void;
  clearMonitorOutput: () => void;
  
  // Actions - Settings
  updateSettings: (settings: Partial<AppSettings>) => void;
  
  // Actions - File operations
  createNewFile: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  tabs: [],
  activeTabId: null,
  cursorPosition: { line: 1, column: 1 },
  
  rootPath: null,
  files: [],
  selectedFile: null,
  
  compileStatus: 'idle',
  compileOutput: '',
  compileErrors: [],
  
  emulatorStatus: 'stopped',
  emulatorPid: null,
  emulatorOutput: '',
  binaryPath: null,
  
  activePanel: 'pipeview',
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
  
  monitor: {
    connected: false,
    port: '/dev/ttyUSB0',
    baudRate: 115200,
    output: ''
  },
  
  settings: defaultSettings,
  
  // Editor actions
  openFile: (filePath: string, content: string) => {
    const { tabs } = get();
    
    // Check if file is already open
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
      language: getLanguageFromPath(filePath)
    };
    
    set({
      tabs: [...tabs, newTab],
      activeTabId: newTab.id
    });
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
    
    set({
      tabs: newTabs,
      activeTabId: newActiveTabId
    });
  },
  
  setActiveTab: (tabId: string) => {
    set({ activeTabId: tabId });
  },
  
  updateTabContent: (tabId: string, content: string) => {
    const { tabs } = get();
    set({
      tabs: tabs.map(tab => {
        if (tab.id === tabId) {
          return {
            ...tab,
            content,
            isDirty: content !== tab.originalContent
          };
        }
        return tab;
      })
    });
  },
  
  saveTab: async (tabId: string) => {
    const { tabs } = get();
    const tab = tabs.find(t => t.id === tabId);
    if (!tab || !tab.isDirty) return;
    
    try {
      const result = await window.electronAPI.writeFile(tab.filePath, tab.content);
      if (result.success) {
        set({
          tabs: tabs.map(t => {
            if (t.id === tabId) {
              return {
                ...t,
                originalContent: t.content,
                isDirty: false
              };
            }
            return t;
          })
        });
      }
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  },
  
  setCursorPosition: (line: number, column: number) => {
    set({ cursorPosition: { line, column } });
  },
  
  // Project actions
  setRootPath: (path: string | null) => {
    set({ rootPath: path });
  },
  
  setFiles: (files: FileEntry[]) => {
    set({ files });
  },
  
  setSelectedFile: (path: string | null) => {
    set({ selectedFile: path });
  },
  
  toggleFileExpanded: (path: string) => {
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
  
  // Build actions
  setCompileStatus: (status: CompileStatus) => {
    set({ compileStatus: status });
  },
  
  appendCompileOutput: (output: string) => {
    set(state => ({ compileOutput: state.compileOutput + output }));
  },
  
  setCompileErrors: (errors: string[]) => {
    set({ compileErrors: errors });
  },
  
  clearCompileOutput: () => {
    set({ compileOutput: '', compileErrors: [] });
  },
  
  // Emulator actions
  setEmulatorStatus: (status: EmulatorStatus) => {
    set({ emulatorStatus: status });
  },
  
  setEmulatorPid: (pid: number | null) => {
    set({ emulatorPid: pid });
  },
  
  appendEmulatorOutput: (output: string) => {
    set(state => ({ emulatorOutput: state.emulatorOutput + output }));
  },
  
  setBinaryPath: (path: string | null) => {
    set({ binaryPath: path });
  },
  
  clearEmulatorOutput: () => {
    set({ emulatorOutput: '' });
  },
  
  // Panel actions
  setActivePanel: (panel: PanelType) => {
    set({ activePanel: panel });
  },
  
  togglePanelVisibility: (panel: PanelType) => {
    set(state => ({
      panelVisibility: {
        ...state.panelVisibility,
        [panel]: !state.panelVisibility[panel]
      }
    }));
  },
  
  // Monitor actions
  setMonitorConnected: (connected: boolean) => {
    set(state => ({
      monitor: { ...state.monitor, connected }
    }));
  },
  
  setMonitorPort: (port: string) => {
    set(state => ({
      monitor: { ...state.monitor, port }
    }));
  },
  
  setMonitorBaudRate: (baudRate: number) => {
    set(state => ({
      monitor: { ...state.monitor, baudRate }
    }));
  },
  
  appendMonitorOutput: (output: string) => {
    set(state => ({
      monitor: { ...state.monitor, output: state.monitor.output + output }
    }));
  },
  
  clearMonitorOutput: () => {
    set(state => ({
      monitor: { ...state.monitor, output: '' }
    }));
  },
  
  // Settings actions
  updateSettings: (newSettings: Partial<AppSettings>) => {
    set(state => ({
      settings: { ...state.settings, ...newSettings }
    }));
  },
  
  // File operations
  createNewFile: () => {
    const newTab: EditorTab = {
      id: generateId(),
      filePath: '',
      fileName: 'untitled',
      content: '',
      originalContent: '',
      isDirty: true,
      language: 'plaintext'
    };
    
    set(state => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id
    }));
  }
}));
