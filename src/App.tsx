/**
 * LinxCoreSight - Desktop IDE
 * IDE for LinxISA development, pyCircuit simulation, and hardware visualization
 */

import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useIDEStore } from './store/ideStore';
import { TitleBar } from './components/Layout/TitleBar';
import { WelcomeScreen } from './components/Layout/WelcomeScreen';
import { Sidebar } from './components/Layout/Sidebar';
import { Toolbar } from './components/Toolbar/Toolbar';
import { CodeEditor } from './components/Editor/CodeEditor';
import { OutputPanel } from './components/Panels/OutputPanel';
import { PipeviewPanel } from './components/Panels/PipeviewPanel';
import { AssemblyPanel } from './components/Panels/AssemblyPanel';
import { MemoryPanel } from './components/Panels/MemoryPanel';
import { RegisterPanel } from './components/Panels/RegisterPanel';
import { TerminalPanel } from './components/Terminal/TerminalPanel';
import { TracePanel } from './components/Panels/TracePanel';
import { WakeupPanel } from './components/Panels/WakeupPanel';
import { SchematicPanel } from './components/Panels/SchematicPanel';
import { MonitorPanel } from './components/Monitor/MonitorPanel';
import { StatusBar } from './components/Layout/StatusBar';
import { DebugPanel } from './components/Debugger/DebugPanel';
import { SettingsPanel } from './components/Settings/SettingsPanel';

// Panel configuration for right side
const rightPanelButtons = [
  { id: 'pipeview', label: 'Pipeview' },
  { id: 'assembly', label: 'Assembly' },
  { id: 'memory', label: 'Memory' },
  { id: 'registers', label: 'Registers' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'trace', label: 'Trace' },
  { id: 'wakeup', label: 'Wakeup' },
  { id: 'schematic', label: 'Schematic' },
  { id: 'monitor', label: 'Monitor' },
] as const;

export default function App() {
  // Get state from store
  const store = useIDEStore();
  
  const {
    // Project state
    currentProject,
    isWelcomeScreen,
    files,
    rootPath,
    
    // Editor state
    tabs,
    activeTabId,
    activePanel,
    setActivePanel,
    showSettings,
    setShowSettings,
    openFile,
    createNewFile,
    closeTab,
    setActiveTab,
    updateTabContent,
    saveTab,
    
    // Compilation
    compileStatus,
    compileOutput,
    setCompileStatus,
    setCompileResult,
    clearCompileOutput,
    
    // Emulator
    emulatorStatus,
    emulatorOutput,
    binaryPath,
    setEmulatorStatus,
    setBinaryPath,
    appendEmulatorOutput,
    clearEmulatorOutput,
    
    // Debugger
    debuggerStatus,
    breakpoints,
    startEmulator,
    stopEmulator,
    
    // Panel
    setWelcomeScreen,
  } = store;

  // Local state for UI
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [outputPanelCollapsed, setOutputPanelCollapsed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Get active tab
  const activeTab = useMemo(() => 
    tabs.find(t => t.id === activeTabId),
    [tabs, activeTabId]
  );

  // Handle project creation
  const handleCreateProject = useCallback(async (name: string, path: string, template: string) => {
    // Use electron API to create project
    const projectJson = {
      name,
      template,
      createdAt: new Date().toISOString()
    };
    
    // Create project directory structure
    await window.electronAPI.mkdir(path);
    await window.electronAPI.mkdir(`${path}/src`);
    await window.electronAPI.mkdir(`${path}/include`);
    await window.electronAPI.mkdir(`${path}/build`);
    
    // Write project config
    await window.electronAPI.writeFile(
      `${path}/linxcoresight.json`,
      JSON.stringify(projectJson, null, 2)
    );
    
    // Create default source file
    const defaultCode = template === 'blink' 
      ? `# Blink LED example (LinxCoreSight)\n\nvoid _start() {\n    // Your code here\n}\n`
      : `// LinxCoreSight Project\n\nvoid _start() {\n    // Your code here\n}\n`;
    
    await window.electronAPI.writeFile(`${path}/src/main.c`, defaultCode);
    
    // Open the project
    store.createProject(name, path, template);
    store.openProject(path);
  }, [store]);

  // Handle project open
  const handleOpenProject = useCallback(async (path: string) => {
    await store.openProject(path);
  }, [store]);

  // Handle file selection from sidebar
  const handleFileSelect = useCallback(async (filePath: string) => {
    const result = await window.electronAPI.readFile(filePath);
    if (result.success && result.content !== undefined) {
      openFile(filePath, result.content);
    }
  }, [openFile]);

  // Handle compile
  const handleCompile = useCallback(async (): Promise<string | null> => {
    if (!activeTab || !activeTab.filePath) return null;

    const { settings } = store;
    setCompileStatus('compiling');
    clearCompileOutput();

    const cleanup = window.electronAPI.onCompilerOutput((data) => {
      appendEmulatorOutput(data.data);
    });

    const inputPath = activeTab.filePath;
    const outputDir = inputPath.substring(0, inputPath.lastIndexOf('/') + 1) || './';
    const baseName = inputPath.substring(inputPath.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
    const objectPath = `${outputDir}${baseName}.o`;
    const finalBinaryPath = `${outputDir}${baseName}`;

    const targetTriple = 'linx64-linx-none-elf';

    const compilerC = settings.compilerPath || 'clang';
    const compilerDir = compilerC.includes('/') ? compilerC.slice(0, compilerC.lastIndexOf('/')) : '';
    const siblingTool = (name: string) => (compilerDir ? `${compilerDir}/${name}` : name);
    const compilerCxx = settings.clangxxPath || siblingTool('clang++');
    const lldPath = settings.lldPath || siblingTool('ld.lld');

    const commonCFlags = [
      '-target', targetTriple,
      '-O2',
      '-g',
      '-ffreestanding',
      '-fno-builtin',
      '-nostdlib',
    ];

    try {
      const tc = await window.electronAPI.getToolchainInfo();
      const linxisaRoot = tc?.tools?.linxisa;
      if (linxisaRoot) {
        commonCFlags.push(`-I${linxisaRoot}/tests/qemu/lib`);
        commonCFlags.push(`-I${linxisaRoot}/toolchain/libc/include`);
      }
    } catch (_e) {
      // Toolchain auto-detect is best-effort; users can set paths in Settings.
    }

    const compileCommand = activeTab.language === 'cpp' ? compilerCxx : compilerC;

    // Step 1: Compile to object file
    const compileArgs = [
      ...commonCFlags,
      '-c', inputPath,
      '-o', objectPath
    ];

    appendEmulatorOutput(`[Compiler]: ${compileCommand} ${compileArgs.join(' ')}\n`);
    
    const compileResult = await window.electronAPI.compile({
      command: compileCommand,
      args: compileArgs,
    });

    if (!compileResult.success) {
      cleanup();
      setCompileStatus('error');
      appendEmulatorOutput('\n[Compilation Failed]:\n' + compileResult.stderr);
      return null;
    }
    appendEmulatorOutput('\n[Compilation Successful]\n');

    // Step 2: Link object file
    const linkArgs = [
      '-r',
      objectPath,
      '-o', finalBinaryPath
    ];

    appendEmulatorOutput(`[Linker]: ${lldPath} ${linkArgs.join(' ')}\n`);
    const linkResult = await window.electronAPI.compile({
      command: lldPath,
      args: linkArgs,
    });

    cleanup();

    if (linkResult.success) {
      setCompileStatus('success');
      setBinaryPath(finalBinaryPath);
      appendEmulatorOutput('\n[Linking Successful]\n');
      return finalBinaryPath;
    } else {
      setCompileStatus('error');
      appendEmulatorOutput('\n[Linking Failed]:\n' + linkResult.stderr);
      return null;
    }
  }, [activeTab, store, setCompileStatus, clearCompileOutput, appendEmulatorOutput, setBinaryPath]);

  // Handle run
  const handleRun = useCallback(async () => {
    let kernelPath = binaryPath;
    if (!kernelPath) {
      kernelPath = await handleCompile();
      if (!kernelPath) return;
    }

    const { settings } = store;
    setEmulatorStatus('running');
    clearEmulatorOutput();

    const qemuArgs = [
      ...settings.qemuArgs,
      '-kernel', kernelPath
    ];

    appendEmulatorOutput(`[QEMU]: ${settings.qemuPath} ${qemuArgs.join(' ')}\n\n`);

    const result = await window.electronAPI.runEmulator({
      command: settings.qemuPath,
      args: qemuArgs,
    });

    if (result.success) {
      appendEmulatorOutput(result.stdout || '');
      appendEmulatorOutput(result.stderr || '');
    } else {
      appendEmulatorOutput(`\n[Error]: ${result.stderr || 'Unknown error'}\n`);
    }
    
    setEmulatorStatus('stopped');
  }, [binaryPath, handleCompile, store, setEmulatorStatus, clearEmulatorOutput, appendEmulatorOutput]);

  // Handle stop
  const handleStop = useCallback(async () => {
    await window.electronAPI.stopEmulator();
    setEmulatorStatus('stopped');
  }, [setEmulatorStatus]);

  // Handle debug
  const handleDebug = useCallback(async () => {
    setShowDebugPanel(true);
    await handleRun();
  }, [handleRun]);

  // Handle new file
  const handleNewFile = useCallback(() => {
    const fileName = `untitled-${Date.now()}.c`;
    createNewFile(fileName, 'c');
  }, [createNewFile]);

  // Handle save
  const handleSave = useCallback(() => {
    if (activeTabId) {
      saveTab(activeTabId);
    }
  }, [activeTabId, saveTab]);

  // Render right panel content
  const renderRightPanel = () => {
    switch (activePanel) {
      case 'pipeview':
        return <PipeviewPanel />;
      case 'assembly':
        return <AssemblyPanel />;
      case 'memory':
        return <MemoryPanel />;
      case 'registers':
        return <RegisterPanel />;
      case 'terminal':
        return <TerminalPanel />;
      case 'trace':
        return <TracePanel />;
      case 'wakeup':
        return <WakeupPanel />;
      case 'schematic':
        return <SchematicPanel />;
      case 'monitor':
        return <MonitorPanel />;
      default:
        return <SchematicPanel />;
    }
  };

  // Menu event handlers
  useEffect(() => {
    // File menu
    const unsubNewFile = window.electronAPI.onMenuNewFile(() => {
      handleNewFile();
    });
    
    const unsubOpenFile = window.electronAPI.onMenuOpenFile(async () => {
      const result = await window.electronAPI.openFileDialog();
      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const fileResult = await window.electronAPI.readFile(filePath);
        if (fileResult.success && fileResult.content !== undefined) {
          openFile(filePath, fileResult.content);
        }
      }
    });
    
    const unsubOpenFolder = window.electronAPI.onMenuOpenFolder(async () => {
      const result = await window.electronAPI.openFolderDialog();
      if (!result.canceled && result.filePaths.length > 0) {
        handleOpenProject(result.filePaths[0]);
      }
    });
    
    const unsubSave = window.electronAPI.onMenuSave(() => {
      if (activeTabId) {
        saveTab(activeTabId);
      }
    });
    
    const unsubSaveAs = window.electronAPI.onMenuSaveAs(() => {
      // TODO: Implement Save As
    });
    
    // Build menu
    const unsubCompile = window.electronAPI.onMenuCompile(() => {
      handleCompile();
    });
    
    const unsubRun = window.electronAPI.onMenuRun(() => {
      handleRun();
    });
    
    const unsubStop = window.electronAPI.onMenuStop(() => {
      handleStop();
    });
    
    // Debug menu
    const unsubDebug = window.electronAPI.onMenuDebug(() => {
      handleDebug();
    });
    
    const unsubStepOver = window.electronAPI.onMenuStepOver(() => {
      // TODO: Implement step over
    });
    
    const unsubStepInto = window.electronAPI.onMenuStepInto(() => {
      // TODO: Implement step into
    });
    
    const unsubStepOut = window.electronAPI.onMenuStepOut(() => {
      // TODO: Implement step out
    });
    
    const unsubToggleBreakpoint = window.electronAPI.onMenuToggleBreakpoint(() => {
      // TODO: Implement toggle breakpoint
    });
    
    // Help menu
    const unsubAbout = window.electronAPI.onMenuAbout(() => {
      // TODO: Show about dialog
    });
    
    return () => {
      unsubNewFile();
      unsubOpenFile();
      unsubOpenFolder();
      unsubSave();
      unsubSaveAs();
      unsubCompile();
      unsubRun();
      unsubStop();
      unsubDebug();
      unsubStepOver();
      unsubStepInto();
      unsubStepOut();
      unsubToggleBreakpoint();
      unsubAbout();
    };
  }, [handleNewFile, handleCompile, handleRun, handleStop, handleDebug, activeTabId, openFile, saveTab]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + B - Compile
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        handleCompile();
      }
      
      // F5 - Run
      if (e.key === 'F5' && !e.shiftKey) {
        e.preventDefault();
        handleRun();
      }
      
      // Shift + F5 - Stop
      if (e.key === 'F5' && e.shiftKey) {
        e.preventDefault();
        handleStop();
      }
      
      // Ctrl/Cmd + N - New File
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleNewFile();
      }
      
      // Ctrl/Cmd + O - Open File
      if ((e.ctrlKey || e.metaKey) && e.key === 'o' && !e.shiftKey) {
        e.preventDefault();
        window.electronAPI.openFileDialog().then(async (result) => {
          if (!result.canceled && result.filePaths.length > 0) {
            const filePath = result.filePaths[0];
            const fileResult = await window.electronAPI.readFile(filePath);
            if (fileResult.success && fileResult.content !== undefined) {
              openFile(filePath, fileResult.content);
            }
          }
        });
      }
      
      // Ctrl/Cmd + Shift + O - Open Folder
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'O') {
        e.preventDefault();
        window.electronAPI.openFolderDialog().then(async (result) => {
          if (!result.canceled && result.filePaths.length > 0) {
            handleOpenProject(result.filePaths[0]);
          }
        });
      }
      
      // Ctrl/Cmd + S - Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        if (activeTabId) {
          saveTab(activeTabId);
        }
      }
      
      // Ctrl/Cmd + W - Close Tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) {
          closeTab(activeTabId);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCompile, handleRun, handleStop, handleNewFile, activeTabId, openFile, saveTab, closeTab, handleOpenProject]);

  // Show welcome screen if no project
  if (isWelcomeScreen || !currentProject) {
    return (
      <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ backgroundColor: '#0a0e14' }}>
        <TitleBar />
        <div style={{ flex: 1, overflow: 'auto' }}>
          {showSettings ? (
            <SettingsPanel />
          ) : (
            <WelcomeScreen 
              onCreateProject={handleCreateProject}
              onOpenProject={handleOpenProject}
            />
          )}
        </div>
      </div>
    );
  }

  // Show settings panel as modal
  if (showSettings) {
    return (
      <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ backgroundColor: '#0a0e14' }}>
        <TitleBar />
        <SettingsPanel />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ backgroundColor: '#0a0e14', color: '#e6edf3' }}>
      {/* Title Bar */}
      <TitleBar />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <PanelGroup direction="horizontal">
          <Panel 
            defaultSize={sidebarCollapsed ? 1 : 20} 
            minSize={1}
            maxSize={40}
          >
            <Sidebar 
              files={files}
              rootPath={rootPath}
              onFileSelect={handleFileSelect}
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            />
          </Panel>
          
          <PanelResizeHandle className="w-1 bg-[#2d3a4d] hover:bg-[#00d9ff] transition-colors" />
          
          {/* Main Editor Area */}
          <Panel defaultSize={sidebarCollapsed ? 99 : 80}>
            <PanelGroup direction="vertical">
              {/* Toolbar and Editor */}
              <Panel defaultSize={outputPanelCollapsed ? 100 : 70} minSize={30}>
                <div className="h-full flex flex-col">
                  {/* Toolbar */}
                  <Toolbar 
                    onCompile={handleCompile}
                    onRun={handleRun}
                    onStop={handleStop}
                    onDebug={handleDebug}
                    onNewFile={handleNewFile}
                    onSave={handleSave}
                  />

                  {/* Editor */}
                  <div className="flex-1 overflow-hidden">
                    <CodeEditor />
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle className="h-1 bg-[#2d3a4d] hover:bg-[#00d9ff] transition-colors" />

              {/* Output Panel */}
              {!outputPanelCollapsed && (
                <Panel defaultSize={30} minSize={15} maxSize={50}>
                  <OutputPanel 
                    onClose={() => setOutputPanelCollapsed(true)}
                  />
                </Panel>
              )}
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="w-1 bg-[#2d3a4d] hover:bg-[#00d9ff] transition-colors" />

          {/* Right Panel (Visualization) */}
          <Panel defaultSize={25} minSize={15} maxSize={50}>
            <div className="h-full flex flex-col bg-[#111820] border-l border-[#2d3a4d]">
              {/* Panel Tabs */}
              <div className="flex items-center border-b border-[#2d3a4d]">
                {rightPanelButtons.map((btn) => (
                  <button
                    key={btn.id}
                    onClick={() => setActivePanel(btn.id as any)}
                    className={`px-4 py-2 text-sm transition-colors ${
                      activePanel === btn.id
                        ? 'text-[#00d9ff] border-b-2 border-[#00d9ff]'
                        : 'text-[#8b949e] hover:text-[#e6edf3]'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
              
              {/* Panel Content */}
              <div className="flex-1 overflow-auto">
                {renderRightPanel()}
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>

      {/* Status Bar */}
      <StatusBar />

      {/* Debug Panel Overlay */}
      {showDebugPanel && (
        <DebugPanel onClose={() => setShowDebugPanel(false)} />
      )}
    </div>
  );
}
