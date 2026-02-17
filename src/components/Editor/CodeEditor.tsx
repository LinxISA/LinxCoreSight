import React, { useRef, useEffect, useState } from 'react';
import Editor, { OnMount, OnChange } from '@monaco-editor/react';
import { useIDEStore } from '../../store/ideStore';
import { X, Search, Replace } from 'lucide-react';
import clsx from 'clsx';
import { registerLinxISALanguage, linxisaTheme } from './LinxISALanguage';

// Custom language definition for LinxISA - now imported from LinxISALanguage.ts

export function CodeEditor() {
  const { 
    tabs, 
    activeTabId, 
    setActiveTab, 
    closeTab, 
    updateTabContent,
    setCursorPosition,
    settings,
  } = useIDEStore();

  const editorRef = useRef<any>(null);
  const [showFind, setShowFind] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [matchCase, setMatchCase] = useState(false);

  const activeTab = tabs.find(t => t.id === activeTabId);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    
    // Register custom languages
    registerLinxISALanguage();
    
    // Define custom theme
    monaco.editor.defineTheme('janus-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        // LinxISA specific tokens
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'keyword', foreground: '569CD6' },
        { token: 'keyword.directive', foreground: 'C586C0' },
        { token: 'keyword.pseudo', foreground: '4EC9B0' },
        { token: 'variable', foreground: '9CDCFE' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'number.hex', foreground: 'D7BA7D' },
        { token: 'number.binary', foreground: 'D7BA7D' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'tag', foreground: 'DCDCAA' },
        { token: 'delimiter', foreground: 'D4D4D4' },
        { token: 'operator', foreground: 'D4D4D4' },
        // Legacy tokens (for compatibility)
        { token: 'instruction', foreground: '569CD6' },
        { token: 'register', foreground: '9CDCFE' },
        { token: 'directive', foreground: 'C586C0' },
        { token: 'label', foreground: 'DCDCAA' },
        { token: 'pseudo', foreground: '4EC9B0' },
      ],
      colors: {
        'editor.background': '#0a0e14',
        'editor.foreground': '#e6edf3',
        'editor.lineHighlightBackground': '#1a2332',
        'editor.selectionBackground': '#264f78',
        'editorCursor.foreground': '#00d9ff',
        'editorLineNumber.foreground': '#6e7681',
        'editorLineNumber.activeForeground': '#e6edf3',
      }
    });
    
    // Set editor options
    editor.updateOptions({
      fontSize: settings.fontSize || 14,
      minimap: { enabled: settings.showMinimap ?? true },
      fontFamily: 'JetBrains Mono, Menlo, Consolas, monospace',
      lineNumbers: 'on',
      renderLineHighlight: 'all',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 4,
      insertSpaces: true,
      wordWrap: 'off',
      bracketPairColorization: { enabled: true },
      padding: { top: 8, bottom: 8 },
      theme: 'janus-dark',
    });
    
    // Track cursor position
    editor.onDidChangeCursorPosition((e: any) => {
      setCursorPosition(e.position.lineNumber, e.position.column);
    });
    
    // Add keyboard shortcut for find
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      setShowFind(true);
    });
  };

  const handleEditorChange: OnChange = (value) => {
    if (activeTabId && value !== undefined) {
      updateTabContent(activeTabId, value);
    }
  };

  // Find functionality
  const handleFind = () => {
    if (!editorRef.current || !findText) return;
    
    const model = editorRef.current.getModel();
    if (!model) return;
    
    const searchParams = {
      searchString: findText,
      isRegex: useRegex,
      matchCase: matchCase
    };
    
    const matches = model.findMatches(searchParams.searchString, searchParams.isRegex, searchParams.matchCase, false, null, true);
    
    if (matches.length > 0) {
      editorRef.current.setSelection(matches[0].range);
      editorRef.current.revealLineInCenter(matches[0].range.startLineNumber);
    }
  };

  // Replace functionality
  const handleReplace = () => {
    if (!editorRef.current || !findText) return;
    
    const selection = editorRef.current.getSelection();
    if (!selection) return;
    
    const model = editorRef.current.getModel();
    if (!model) return;
    
    const selectedText = model.getValueInRange(selection);
    if (selectedText === findText || useRegex) {
      // Replace selection
      editorRef.current.executeEdits('replace', [{
        range: selection,
        text: replaceText
      }]);
    }
    
    // Find next
    handleFind();
  };

  // Replace all
  const handleReplaceAll = () => {
    if (!editorRef.current || !findText) return;
    
    const model = editorRef.current.getModel();
    if (!model) return;
    
    const text = model.getValue();
    const searchParams = {
      searchString: findText,
      isRegex: useRegex,
      matchCase: matchCase
    };
    
    let newText: string;
    if (useRegex) {
      const flags = (matchCase ? 'g' : 'gi');
      const regex = new RegExp(findText, flags);
      newText = text.replace(regex, replaceText);
    } else {
      if (matchCase) {
        newText = text.split(findText).join(replaceText);
      } else {
        const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        newText = text.replace(regex, replaceText);
      }
    }
    
    model.setValue(newText);
  };

  // Get language for Monaco based on file extension
  const getLanguage = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
      py: 'python',
      js: 'javascript',
      ts: 'typescript',
      tsx: 'typescriptreact',
      json: 'json',
      md: 'markdown',
      li: 'linxisa',
      linx: 'linxisa',
      asm: 'asm',
      s: 'asm',
    };
    return langMap[ext] || 'plaintext';
  };

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: '#0a0e14' }}>
      {/* Editor Tabs */}
      <div 
        className="flex items-center overflow-x-auto"
        style={{ backgroundColor: '#111820', borderBottom: '1px solid #2d3a4d' }}
      >
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors min-w-[120px] max-w-[200px]',
              activeTabId === tab.id
                ? 'text-[#e6edf3]'
                : 'text-[#8b949e] hover:text-[#e6edf3]'
            )}
            style={{ 
              backgroundColor: activeTabId === tab.id ? '#0a0e14' : '#111820',
              borderTop: activeTabId === tab.id ? '2px solid #00d9ff' : '2px solid transparent',
              borderRight: '1px solid #2d3a4d'
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="truncate flex-1">{tab.fileName}</span>
            {tab.isDirty && (
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#ff6b35' }} title="Unsaved changes" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="p-0.5 rounded text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#2d3a4d]"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        
        {/* Find button */}
        <button
          onClick={() => setShowFind(!showFind)}
          className="px-3 py-2 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a2332]"
          title="Find (Ctrl+F)"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      {/* Find/Replace Bar */}
      {showFind && (
        <div 
          className="flex items-center gap-2 px-3 py-2"
          style={{ backgroundColor: '#1a2332', borderBottom: '1px solid #2d3a4d' }}
        >
          <div className="flex items-center gap-1 flex-1">
            <input
              type="text"
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              placeholder="Find"
              className="px-2 py-1 text-sm rounded"
              style={{ backgroundColor: '#0a0e14', border: '1px solid #2d3a4d', color: '#e6edf3' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFind();
                if (e.key === 'Escape') setShowFind(false);
              }}
              autoFocus
            />
            <input
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replace"
              className="px-2 py-1 text-sm rounded"
              style={{ backgroundColor: '#0a0e14', border: '1px solid #2d3a4d', color: '#e6edf3' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleReplace();
              }}
            />
          </div>
          
          <label className="flex items-center gap-1 text-xs text-[#8b949e]">
            <input
              type="checkbox"
              checked={useRegex}
              onChange={(e) => setUseRegex(e.target.checked)}
              className="mr-1"
            />
            Regex
          </label>
          <label className="flex items-center gap-1 text-xs text-[#8b949e]">
            <input
              type="checkbox"
              checked={matchCase}
              onChange={(e) => setMatchCase(e.target.checked)}
              className="mr-1"
            />
            </label>
          
 Match Case
                   <button
            onClick={handleFind}
            className="px-2 py-1 text-sm text-[#e6edf3] bg-[#2d3a4d] rounded hover:bg-[#3d4a5d]"
          >
            Find
          </button>
          <button
            onClick={handleReplace}
            className="px-2 py-1 text-sm text-[#e6edf3] bg-[#2d3a4d] rounded hover:bg-[#3d4a5d]"
          >
            Replace
          </button>
          <button
            onClick={handleReplaceAll}
            className="px-2 py-1 text-sm text-[#e6edf3] bg-[#2d3a4d] rounded hover:bg-[#3d4a5d]"
          >
            Replace All
          </button>
          
          <button
            onClick={() => setShowFind(false)}
            className="p-1 text-[#8b949e] hover:text-[#e6edf3]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Monaco Editor */}
      <div className="flex-1">
        {activeTab ? (
          <Editor
            height="100%"
            language={getLanguage(activeTab.fileName)}
            value={activeTab.content}
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            theme="vs-dark"
            options={{
              fontSize: settings?.fontSize || 14,
              minimap: { enabled: settings?.showMinimap ?? true },
            }}
          />
        ) : (
          <div 
            className="h-full flex items-center justify-center text-[#6e7681]"
            style={{ backgroundColor: '#0a0e14' }}
          >
            <div className="text-center">
              <p className="text-lg mb-2">No file open</p>
              <p className="text-sm">Select a file from the sidebar or create a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
