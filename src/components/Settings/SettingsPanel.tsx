/**
 * Settings Panel Component
 * Configure IDE settings and preferences
 */

import React, { useState, useEffect } from 'react';
import { useIDEStore } from '../../store/ideStore';
import { Save, RotateCcw, FolderOpen, Check, AlertCircle } from 'lucide-react';

export function SettingsPanel() {
  const { settings, updateSettings, setShowSettings } = useIDEStore();
  const [localSettings, setLocalSettings] = useState(settings);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    // Load persisted settings. Keep a fallback to the old key for migration.
    try {
      const keyNew = 'linxcoresight-settings';
      const keyOld = 'janus-coresight-settings';
      const raw = localStorage.getItem(keyNew) || localStorage.getItem(keyOld);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      setLocalSettings((prev) => ({ ...prev, ...parsed }));
      updateSettings(parsed);
      if (!localStorage.getItem(keyNew)) {
        localStorage.setItem(keyNew, raw);
      }
    } catch (_e) {
      // Ignore corrupted local storage values.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (key: string, value: any) => {
    setLocalSettings((prev: any) => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setSaveStatus('idle');
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      // Save to local storage
      localStorage.setItem('linxcoresight-settings', JSON.stringify(localSettings));
      updateSettings(localSettings);
      setSaveStatus('saved');
      setHasChanges(false);
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      setSaveStatus('error');
    }
  };

  const handleReset = () => {
    setLocalSettings(settings);
    setHasChanges(false);
  };

  const handleBrowse = async (key: string) => {
    const result = await window.electronAPI.openFolderDialog();
    if (!result.canceled && result.filePaths.length > 0) {
      handleChange(key, result.filePaths[0]);
    }
  };

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'editor', label: 'Editor' },
    { id: 'toolchain', label: 'Toolchain' },
    { id: 'appearance', label: 'Appearance' },
  ];

  const [activeTab, setActiveTab] = useState('general');

  return (
    <div className="h-full flex flex-col bg-[#0a0e14]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2d3a4d]">
        <h2 className="text-lg font-semibold text-[#e6edf3]">Settings</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={!hasChanges}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-[#8b949e] hover:text-[#e6edf3] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saveStatus === 'saving'}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded ${
              hasChanges 
                ? 'bg-[#00d9ff] text-[#0a0e14] hover:bg-[#00d9ff]/80' 
                : 'bg-[#2d3a4d] text-[#6e7681] cursor-not-allowed'
            }`}
          >
            {saveStatus === 'saving' ? (
              <span>Saving...</span>
            ) : saveStatus === 'saved' ? (
              <>
                <Check className="w-4 h-4" />
                <span>Saved</span>
              </>
            ) : saveStatus === 'error' ? (
              <>
                <AlertCircle className="w-4 h-4" />
                <span>Error</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#2d3a4d]">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm transition-colors ${
              activeTab === tab.id
                ? 'text-[#00d9ff] border-b-2 border-[#00d9ff]'
                : 'text-[#8b949e] hover:text-[#e6edf3]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-[#e6edf3] mb-3">General</h3>
              <div className="space-y-4">
                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-[#e6edf3]">Auto Save</span>
                    <p className="text-xs text-[#6e7681]">Automatically save files before build</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.autoSave || false}
                    onChange={(e) => handleChange('autoSave', e.target.checked)}
                    className="w-4 h-4 accent-[#00d9ff]"
                  />
                </label>

                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-[#e6edf3]">Auto Compile</span>
                    <p className="text-xs text-[#6e7681]">Automatically compile before running</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.autoCompile || false}
                    onChange={(e) => handleChange('autoCompile', e.target.checked)}
                    className="w-4 h-4 accent-[#00d9ff]"
                  />
                </label>

                <div>
                  <span className="text-sm text-[#e6edf3]">Workspace</span>
                  <p className="text-xs text-[#6e7681] mb-2">Default workspace directory</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={localSettings.workspacePath || ''}
                      onChange={(e) => handleChange('workspacePath', e.target.value)}
                      className="flex-1 px-3 py-2 text-sm bg-[#111820] border border-[#2d3a4d] rounded text-[#e6edf3]"
                      placeholder="/path/to/workspace"
                    />
                    <button
                      onClick={() => handleBrowse('workspacePath')}
                      className="p-2 bg-[#2d3a4d] rounded hover:bg-[#3d4a5d]"
                    >
                      <FolderOpen className="w-4 h-4 text-[#8b949e]" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'editor' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-[#e6edf3] mb-3">Editor</h3>
              <div className="space-y-4">
                <div>
                  <span className="text-sm text-[#e6edf3]">Font Size</span>
                  <p className="text-xs text-[#6e7681] mb-2">Editor font size in pixels</p>
                  <input
                    type="number"
                    min={10}
                    max={32}
                    value={localSettings.fontSize || 14}
                    onChange={(e) => handleChange('fontSize', parseInt(e.target.value))}
                    className="w-24 px-3 py-2 text-sm bg-[#111820] border border-[#2d3a4d] rounded text-[#e6edf3]"
                  />
                </div>

                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-[#e6edf3]">Show Minimap</span>
                    <p className="text-xs text-[#6e7681]">Display minimap in editor</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.showMinimap ?? true}
                    onChange={(e) => handleChange('showMinimap', e.target.checked)}
                    className="w-4 h-4 accent-[#00d9ff]"
                  />
                </label>

                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-[#e6edf3]">Word Wrap</span>
                    <p className="text-xs text-[#6e7681]">Wrap long lines</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.wordWrap || false}
                    onChange={(e) => handleChange('wordWrap', e.target.checked)}
                    className="w-4 h-4 accent-[#00d9ff]"
                  />
                </label>

                <div>
                  <span className="text-sm text-[#e6edf3]">Tab Size</span>
                  <p className="text-xs text-[#6e7681] mb-2">Number of spaces per tab</p>
                  <select
                    value={localSettings.tabSize || 4}
                    onChange={(e) => handleChange('tabSize', parseInt(e.target.value))}
                    className="px-3 py-2 text-sm bg-[#111820] border border-[#2d3a4d] rounded text-[#e6edf3]"
                  >
                    <option value={2}>2 spaces</option>
                    <option value={4}>4 spaces</option>
                    <option value={8}>8 spaces</option>
                  </select>
                </div>

                <div>
                  <span className="text-sm text-[#e6edf3]">Font Family</span>
                  <p className="text-xs text-[#6e7681] mb-2">Editor font family</p>
                  <input
                    type="text"
                    value={localSettings.fontFamily || 'JetBrains Mono, Menlo, Consolas, monospace'}
                    onChange={(e) => handleChange('fontFamily', e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-[#111820] border border-[#2d3a4d] rounded text-[#e6edf3]"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'toolchain' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-[#e6edf3] mb-3">Compiler</h3>
              <div className="space-y-4">
                <div>
                  <span className="text-sm text-[#e6edf3]">Clang Path</span>
                  <p className="text-xs text-[#6e7681] mb-2">Path to LinxISA clang compiler</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={localSettings.compilerPath || ''}
                      onChange={(e) => handleChange('compilerPath', e.target.value)}
                      className="flex-1 px-3 py-2 text-sm bg-[#111820] border border-[#2d3a4d] rounded text-[#e6edf3]"
                      placeholder="/path/to/clang"
                    />
                    <button
                      onClick={() => handleBrowse('compilerPath')}
                      className="p-2 bg-[#2d3a4d] rounded hover:bg-[#3d4a5d]"
                    >
                      <FolderOpen className="w-4 h-4 text-[#8b949e]" />
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-sm text-[#e6edf3]">Clang++ Path</span>
                  <p className="text-xs text-[#6e7681] mb-2">Path to LinxISA clang++ compiler</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={localSettings.clangxxPath || ''}
                      onChange={(e) => handleChange('clangxxPath', e.target.value)}
                      className="flex-1 px-3 py-2 text-sm bg-[#111820] border border-[#2d3a4d] rounded text-[#e6edf3]"
                      placeholder="/path/to/clang++"
                    />
                    <button
                      onClick={() => handleBrowse('clangxxPath')}
                      className="p-2 bg-[#2d3a4d] rounded hover:bg-[#3d4a5d]"
                    >
                      <FolderOpen className="w-4 h-4 text-[#8b949e]" />
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-sm text-[#e6edf3]">Linker Path</span>
                  <p className="text-xs text-[#6e7681] mb-2">Path to ld.lld linker</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={localSettings.lldPath || ''}
                      onChange={(e) => handleChange('lldPath', e.target.value)}
                      className="flex-1 px-3 py-2 text-sm bg-[#111820] border border-[#2d3a4d] rounded text-[#e6edf3]"
                      placeholder="/path/to/ld.lld"
                    />
                    <button
                      onClick={() => handleBrowse('lldPath')}
                      className="p-2 bg-[#2d3a4d] rounded hover:bg-[#3d4a5d]"
                    >
                      <FolderOpen className="w-4 h-4 text-[#8b949e]" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-[#e6edf3] mb-3">Emulator</h3>
              <div className="space-y-4">
                <div>
                  <span className="text-sm text-[#e6edf3]">QEMU Path</span>
                  <p className="text-xs text-[#6e7681] mb-2">Path to qemu-system-linx64</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={localSettings.qemuPath || ''}
                      onChange={(e) => handleChange('qemuPath', e.target.value)}
                      className="flex-1 px-3 py-2 text-sm bg-[#111820] border border-[#2d3a4d] rounded text-[#e6edf3]"
                      placeholder="/path/to/qemu-system-linx64"
                    />
                    <button
                      onClick={() => handleBrowse('qemuPath')}
                      className="p-2 bg-[#2d3a4d] rounded hover:bg-[#3d4a5d]"
                    >
                      <FolderOpen className="w-4 h-4 text-[#8b949e]" />
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-sm text-[#e6edf3]">QEMU Arguments</span>
                  <p className="text-xs text-[#6e7681] mb-2">Additional QEMU arguments</p>
                  <input
                    type="text"
                    value={(localSettings.qemuArgs || []).join(' ')}
                    onChange={(e) => handleChange('qemuArgs', e.target.value.split(' ').filter(Boolean))}
                    className="w-full px-3 py-2 text-sm bg-[#111820] border border-[#2d3a4d] rounded text-[#e6edf3]"
                    placeholder="-nographic -kernel"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-[#e6edf3] mb-3">Theme</h3>
              <div className="space-y-4">
                <div>
                  <span className="text-sm text-[#e6edf3]">Color Theme</span>
                  <p className="text-xs text-[#6e7681] mb-2">Choose your preferred color scheme</p>
                  <select
                    value={localSettings.theme || 'dark'}
                    onChange={(e) => handleChange('theme', e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-[#111820] border border-[#2d3a4d] rounded text-[#e6edf3]"
                  >
                    <option value="dark">Circuit Dark (Default)</option>
                    <option value="light">Light</option>
                    <option value="high-contrast">High Contrast</option>
                  </select>
                </div>

                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-[#e6edf3]">Accent Color</span>
                    <p className="text-xs text-[#6e7681]">Primary accent color</p>
                  </div>
                  <input
                    type="color"
                    value={localSettings.accentColor || '#00d9ff'}
                    onChange={(e) => handleChange('accentColor', e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer"
                  />
                </label>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-[#e6edf3] mb-3">Interface</h3>
              <div className="space-y-4">
                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-[#e6edf3]">Compact Mode</span>
                    <p className="text-xs text-[#6e7681]">Use smaller UI elements</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.compactMode || false}
                    onChange={(e) => handleChange('compactMode', e.target.checked)}
                    className="w-4 h-4 accent-[#00d9ff]"
                  />
                </label>

                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-[#e6edf3]">Show Line Numbers</span>
                    <p className="text-xs text-[#6e7681]">Display line numbers in editor</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.showLineNumbers ?? true}
                    onChange={(e) => handleChange('showLineNumbers', e.target.checked)}
                    className="w-4 h-4 accent-[#00d9ff]"
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
