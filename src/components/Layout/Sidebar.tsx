/**
 * Sidebar Component
 * File explorer and project tree view
 */

import React, { useState, useRef, useEffect } from 'react';
import { useIDEStore } from '../../store/ideStore';
import { 
  Folder, 
  FolderOpen, 
  File, 
  FileCode, 
  FileText, 
  ChevronRight, 
  ChevronDown,
  RefreshCw,
  PanelLeftClose,
  PanelLeft,
  FilePlus,
  Trash2,
  Edit3,
  FolderPlus
} from 'lucide-react';
import clsx from 'clsx';

// File icon based on extension
const FileIcon = ({ fileName, isDirectory }: { fileName: string; isDirectory: boolean }) => {
  if (isDirectory) {
    return <Folder className="w-4 h-4 text-[#fbbf24]" />;
  }
  
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const iconMap: Record<string, React.ReactNode> = {
    py: <FileCode className="w-4 h-4 text-[#00d9ff]" />,
    c: <FileCode className="w-4 h-4 text-[#00d9ff]" />,
    cpp: <FileCode className="w-4 h-4 text-[#00d9ff]" />,
    h: <FileCode className="w-4 h-4 text-[#00d9ff]" />,
    hpp: <FileCode className="w-4 h-4 text-[#00d9ff]" />,
    v: <FileCode className="w-4 h-4 text-[#a855f7]" />,
    sv: <FileCode className="w-4 h-4 text-[#a855f7]" />,
    li: <FileCode className="w-4 h-4 text-[#00ff88]" />,
    linx: <FileCode className="w-4 h-4 text-[#00ff88]" />,
    json: <FileText className="w-4 h-4 text-[#ff6b35]" />,
    md: <FileText className="w-4 h-4 text-[#8b949e]" />,
  };
  
  return iconMap[ext] || <File className="w-4 h-4 text-[#6e7681]" />;
};

// File tree item component
const FileTreeItem = ({ 
  entry, 
  depth = 0,
  onFileSelect,
  selectedFile,
  onContextMenu
}: { 
  entry: any; 
  depth?: number;
  onFileSelect?: (path: string) => void;
  selectedFile?: string | null;
  onContextMenu?: (e: React.MouseEvent, entry: any) => void;
}) => {
  const [localExpanded, setLocalExpanded] = useState(entry.expanded || false);
  
  const handleClick = async () => {
    if (entry.isDirectory) {
      setLocalExpanded(!localExpanded);
    } else if (onFileSelect) {
      onFileSelect(entry.path);
    }
  };

  const isSelected = selectedFile === entry.path;

  return (
    <div>
      <div 
        className={clsx(
          'flex items-center gap-1 px-2 py-1 cursor-pointer text-sm transition-colors',
          isSelected 
            ? 'bg-[#00d9ff]/20 text-[#00d9ff]' 
            : 'hover:bg-[#1a2332] text-[#8b949e] hover:text-[#e6edf3]'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu && onContextMenu(e, entry)}
      >
        {/* Expand/Collapse Icon */}
        {entry.isDirectory && (
          localExpanded 
            ? <ChevronDown className="w-3 h-3 text-[#6e7681]" />
            : <ChevronRight className="w-3 h-3 text-[#6e7681]" />
        )}
        
        {/* File/Folder Icon */}
        <FileIcon fileName={entry.name} isDirectory={entry.isDirectory} />
        
        {/* File Name */}
        <span className="truncate">{entry.name}</span>
      </div>
      
      {/* Children */}
      {entry.isDirectory && localExpanded && entry.children && (
        <div>
          {entry.children.map((child: any, index: number) => (
            <FileTreeItem 
              key={child.path || index}
              entry={child}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              selectedFile={selectedFile}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Main Sidebar Component
interface SidebarProps {
  files: any[];
  rootPath: string | null;
  onFileSelect?: (path: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ 
  files, 
  rootPath, 
  onFileSelect,
  collapsed = false,
  onToggleCollapse
}: SidebarProps) {
  const store = useIDEStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    path: string | null;
    isDirectory: boolean;
  }>({ visible: false, x: 0, y: 0, path: null, isDirectory: false });
  
  // New file dialog state
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileParentPath, setNewFileParentPath] = useState('');

  // Get selected file from store
  const selectedFile = store.selectedFile;
  const setSelectedFile = store.setSelectedFile;
  const toggleFileExpanded = store.toggleFileExpanded;
  const createFile = store.createFile;
  const deleteFile = store.deleteFile;
  const renameFile = store.renameFile;
  const refreshFiles = store.refreshFiles;
  const openFile = store.openFile;
  const setFiles = store.setFiles;

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(prev => ({ ...prev, visible: false }));
    if (contextMenu.visible) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu.visible]);

  // Handle context menu
  const handleContextMenu = (e: React.MouseEvent, entry: any) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      path: entry.path,
      isDirectory: entry.isDirectory
    });
  };

  // Handle new file
  const handleNewFile = async () => {
    if (newFileName && newFileParentPath) {
      await createFile(newFileParentPath, newFileName);
      // Open the new file
      await openFile(`${newFileParentPath}/${newFileName}`, '');
      setShowNewFileDialog(false);
      setNewFileName('');
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (contextMenu.path) {
      await deleteFile(contextMenu.path);
    }
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  // Handle new file in root
  const handleNewFileInRoot = async () => {
    if (rootPath) {
      setNewFileParentPath(rootPath);
      setShowNewFileDialog(true);
    }
  };

  // Handle refresh - reload files from disk
  const handleRefresh = async () => {
    if (!rootPath) return;
    
    setIsRefreshing(true);
    
    // Read directory and rebuild file tree
    try {
      const result = await window.electronAPI.readDir(rootPath);
      if (result.success && result.files) {
        // Recursively build file tree
        const buildTree = async (dirPath: string): Promise<any[]> => {
          const files: any[] = [];
          const dirResult = await window.electronAPI.readDir(dirPath);
          
          if (dirResult.success && dirResult.files) {
            for (const file of dirResult.files) {
              const fullPath = `${dirPath}/${file.name}`;
              if (file.isDirectory) {
                files.push({
                  name: file.name,
                  isDirectory: true,
                  path: fullPath,
                  expanded: false,
                  children: []
                });
              } else {
                files.push({
                  name: file.name,
                  isDirectory: false,
                  path: fullPath
                });
              }
            }
          }
          return files;
        };
        
        const newFiles = await buildTree(rootPath);
        setFiles(newFiles);
      }
    } catch (error) {
      console.error('Error refreshing files:', error);
    }
    
    setIsRefreshing(false);
  };

  // Handle file select from store
  const handleFileSelect = async (filePath: string) => {
    setSelectedFile(filePath);
    if (onFileSelect) {
      onFileSelect(filePath);
    }
  };

  if (collapsed) {
    return (
      <div className="h-full w-10 flex flex-col items-center py-2 bg-[#111820] border-r border-[#2d3a4d]">
        <button 
          onClick={onToggleCollapse}
          className="p-2 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a2332] rounded"
          title="Expand Sidebar"
        >
          <PanelLeft className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#111820] border-r border-[#2d3a4d]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2d3a4d]">
        <span className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          <button 
            onClick={handleRefresh}
            className="p-1 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a2332] rounded"
            title="Refresh"
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={onToggleCollapse}
            className="p-1 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a2332] rounded"
            title="Collapse Sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Project Name */}
      {rootPath && (
        <div className="px-3 py-2 text-sm text-[#e6edf3] font-medium border-b border-[#2d3a4d]">
          {rootPath.split('/').pop()}
        </div>
      )}

      {/* File Tree */}
      <div className="flex-1 overflow-auto py-1">
        {files.length === 0 ? (
          <div className="px-3 py-2 text-sm text-[#6e7681]">
            No files in project
          </div>
        ) : (
          files.map((entry, index) => (
            <FileTreeItem 
              key={entry.path || index}
              entry={entry}
              onFileSelect={handleFileSelect}
              selectedFile={selectedFile}
              onContextMenu={handleContextMenu}
            />
          ))
        )}
      </div>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div 
          className="fixed bg-[#1a2332] border border-[#2d3a4d] rounded shadow-lg py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.isDirectory && (
            <button
              onClick={() => {
                setNewFileParentPath(contextMenu.path || '');
                setShowNewFileDialog(true);
                setContextMenu(prev => ({ ...prev, visible: false }));
              }}
              className="w-full px-3 py-1.5 text-sm text-[#e6edf3] hover:bg-[#2d3a4d] flex items-center gap-2"
            >
              <FilePlus className="w-4 h-4" /> New File
            </button>
          )}
          <button
            onClick={handleDelete}
            className="w-full px-3 py-1.5 text-sm text-[#ff4757] hover:bg-[#2d3a4d] flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      )}

      {/* New File Dialog */}
      {showNewFileDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#111820] border border-[#2d3a4d] rounded-lg p-4 w-80">
            <h3 className="text-lg font-semibold text-[#e6edf3] mb-4">New File</h3>
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="filename.c"
              className="w-full px-3 py-2 bg-[#1a2332] border border-[#2d3a4d] rounded text-[#e6edf3] mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNewFile();
                if (e.key === 'Escape') setShowNewFileDialog(false);
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewFileDialog(false)}
                className="px-3 py-1.5 text-sm text-[#8b949e] hover:text-[#e6edf3]"
              >
                Cancel
              </button>
              <button
                onClick={handleNewFile}
                disabled={!newFileName}
                className="px-3 py-1.5 text-sm bg-[#00d9ff] text-[#0a0e14] rounded hover:bg-[#00b8e6] disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
