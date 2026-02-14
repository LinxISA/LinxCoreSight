/**
 * TitleBar Component
 * Application header with logo and window controls
 */

import React from 'react';
import { 
  Settings, 
  Minimize2, 
  Maximize2, 
  X,
  Minus
} from 'lucide-react';
import { useIDEStore } from '../../store/ideStore';

export function TitleBar() {
  const { setShowSettings } = useIDEStore();
  
  return (
    <div className="h-10 flex items-center justify-between px-4 bg-[#111820] border-b border-[#2d3a4d]">
      {/* Logo and Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {/* Brand mark - text logo */}
          <span className="text-xl font-bold text-[#e6edf3]">
            L<span className="text-[#00d9ff]">CS</span>
          </span>
          <span className="text-lg font-semibold text-[#e6edf3]">
            Linx<span className="text-[#00d9ff]">CoreSight</span>
          </span>
        </div>
      </div>

      {/* Menu Items */}
      <div className="flex items-center gap-1 text-sm text-[#8b949e]">
        <button 
          onClick={() => window.electronAPI.onMenuNewFile(() => {})()}
          className="px-3 py-1 hover:bg-[#1a2332] rounded transition-colors"
        >
          File
        </button>
        <button 
          onClick={() => window.electronAPI.onMenuNewFile(() => {})()}
          className="px-3 py-1 hover:bg-[#1a2332] rounded transition-colors"
        >
          Edit
        </button>
        <button className="px-3 py-1 hover:bg-[#1a2332] rounded transition-colors">
          View
        </button>
        <button 
          onClick={() => window.electronAPI.onMenuCompile(() => {})()}
          className="px-3 py-1 hover:bg-[#1a2332] rounded transition-colors"
        >
          Build
        </button>
        <button 
          onClick={() => window.electronAPI.onMenuDebug(() => {})()}
          className="px-3 py-1 hover:bg-[#1a2332] rounded transition-colors"
        >
          Debug
        </button>
        <button className="px-3 py-1 hover:bg-[#1a2332] rounded transition-colors">
          Help
        </button>
      </div>

      {/* Window Controls */}
      <div className="flex items-center gap-1">
        <button 
          onClick={() => setShowSettings(true)}
          className="p-2 hover:bg-[#1a2332] rounded transition-colors text-[#8b949e] hover:text-[#e6edf3]"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
        <button 
          className="p-2 hover:bg-[#1a2332] rounded transition-colors text-[#8b949e] hover:text-[#e6edf3]"
          title="Toggle Theme"
        >
          <Settings className="w-4 h-4" />
        </button>
        
        {/* Window buttons */}
        <div className="flex items-center ml-2 gap-1">
          <button 
            className="p-1.5 hover:bg-[#1a2332] rounded transition-colors text-[#6e7681] hover:text-[#e6edf3]"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button 
            className="p-1.5 hover:bg-[#1a2332] rounded transition-colors text-[#6e7681] hover:text-[#e6edf3]"
            title="Maximize"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button 
            className="p-1.5 hover:bg-red-500/80 rounded transition-colors text-[#6e7681] hover:text-white"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default TitleBar;
