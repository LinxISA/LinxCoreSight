import React, { useRef, useEffect, useState } from 'react';
import { useIDEStore } from '../../store/ideStore';
import { ZoomIn, ZoomOut, RotateCcw, Play, Pause, SkipForward } from 'lucide-react';

// Types for pipeline visualization
interface PipelineStage {
  name: string;
  startCycle: number;
  endCycle: number;
  color: string;
}

interface PipelineInstruction {
  id: number;
  pc: number;
  label: string;
  stages: PipelineStage[];
}

// Sample data for demonstration
const sampleInstructions: PipelineInstruction[] = [
  { id: 0, pc: 0x1000, label: 'add x1, x2, x3', stages: [
    { name: 'Fetch', startCycle: 0, endCycle: 1, color: '#00d9ff' },
    { name: 'Decode', startCycle: 1, endCycle: 2, color: '#a855f7' },
    { name: 'Execute', startCycle: 2, endCycle: 3, color: '#00ff88' },
    { name: 'Memory', startCycle: 3, endCycle: 4, color: '#fbbf24' },
    { name: 'Writeback', startCycle: 4, endCycle: 5, color: '#ff6b35' },
  ]},
  { id: 1, pc: 0x1004, label: 'sub x4, x5, x6', stages: [
    { name: 'Fetch', startCycle: 1, endCycle: 2, color: '#00d9ff' },
    { name: 'Decode', startCycle: 2, endCycle: 3, color: '#a855f7' },
    { name: 'Execute', startCycle: 3, endCycle: 4, color: '#00ff88' },
    { name: 'Memory', startCycle: 4, endCycle: 5, color: '#fbbf24' },
    { name: 'Writeback', startCycle: 5, endCycle: 6, color: '#ff6b35' },
  ]},
  { id: 2, pc: 0x1008, label: 'ld x7, 0(x8)', stages: [
    { name: 'Fetch', startCycle: 2, endCycle: 3, color: '#00d9ff' },
    { name: 'Decode', startCycle: 3, endCycle: 4, color: '#a855f7' },
    { name: 'Execute', startCycle: 4, endCycle: 5, color: '#00ff88' },
    { name: 'Memory', startCycle: 5, endCycle: 7, color: '#fbbf24' },
    { name: 'Writeback', startCycle: 7, endCycle: 8, color: '#ff6b35' },
  ]},
  { id: 3, pc: 0x100c, label: 'st x9, 0(x10)', stages: [
    { name: 'Fetch', startCycle: 3, endCycle: 4, color: '#00d9ff' },
    { name: 'Decode', startCycle: 4, endCycle: 5, color: '#a855f7' },
    { name: 'Execute', startCycle: 5, endCycle: 6, color: '#00ff88' },
    { name: 'Memory', startCycle: 6, endCycle: 7, color: '#fbbf24' },
    { name: 'Writeback', startCycle: 7, endCycle: 8, color: '#ff6b35' },
  ]},
  { id: 4, pc: 0x1010, label: 'beq x1, x2, 0x20', stages: [
    { name: 'Fetch', startCycle: 4, endCycle: 5, color: '#00d9ff' },
    { name: 'Decode', startCycle: 5, endCycle: 6, color: '#a855f7' },
    { name: 'Execute', startCycle: 6, endCycle: 7, color: '#00ff88' },
    { name: 'Memory', startCycle: 7, endCycle: 8, color: '#fbbf24' },
    { name: 'Writeback', startCycle: 8, endCycle: 9, color: '#ff6b35' },
  ]},
];

const stageNames = ['Fetch', 'Decode', 'Execute', 'Memory', 'Writeback'];
const stageColors: Record<string, string> = {
  'Fetch': '#00d9ff',
  'Decode': '#a855f7',
  'Execute': '#00ff88',
  'Memory': '#fbbf24',
  'Writeback': '#ff6b35',
};

export function PipeviewPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 50, y: 30 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredInstruction, setHoveredInstruction] = useState<PipelineInstruction | null>(null);
  const [cycleRange, setCycleRange] = useState({ start: 0, end: 15 });

  // Draw the pipeline view
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const container = containerRef.current;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    // Clear canvas
    ctx.fillStyle = '#111820';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#2d3a4d';
    ctx.lineWidth = 0.5;
    const gridSize = 30 * zoom;
    
    // Vertical grid lines (cycles)
    for (let i = cycleRange.start; i <= cycleRange.end; i++) {
      const x = offset.x + i * gridSize;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Horizontal grid lines (instructions)
    for (let i = 0; i < sampleInstructions.length + 2; i++) {
      const y = offset.y + i * gridSize;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw stage labels
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = '#8b949e';
    stageNames.forEach((stage, i) => {
      const y = offset.y + (i + 1) * gridSize;
      ctx.fillText(stage, 5, y + gridSize / 2 + 4);
    });

    // Draw cycle numbers
    ctx.fillStyle = '#6e7681';
    for (let i = cycleRange.start; i <= cycleRange.end; i++) {
      const x = offset.x + i * gridSize + gridSize / 2 - 8;
      ctx.fillText(String(i), x, offset.y - 5);
    }

    // Draw instruction pipeline bars
    sampleInstructions.forEach((inst, instIndex) => {
      const y = offset.y + (instIndex + 1) * gridSize + 5;
      const height = gridSize - 10;

      inst.stages.forEach((stage) => {
        const x = offset.x + stage.startCycle * gridSize;
        const width = (stage.endCycle - stage.startCycle) * gridSize;

        // Draw stage bar
        ctx.fillStyle = stage.color + '80';
        ctx.fillRect(x, y, width, height);
        
        // Draw stage border
        ctx.strokeStyle = stage.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, height);

        // Draw stage name
        if (width > 30) {
          ctx.fillStyle = '#fff';
          ctx.font = '10px JetBrains Mono, monospace';
          ctx.fillText(stage.name[0], x + 4, y + height / 2 + 3);
        }
      });

      // Draw instruction label
      ctx.fillStyle = '#e6edf3';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText(`${inst.pc.toString(16)}: ${inst.label}`, offset.x + 5, y + height / 2 + 4);
    });

    // Draw hover highlight
    if (hoveredInstruction) {
      const idx = sampleInstructions.indexOf(hoveredInstruction);
      if (idx >= 0) {
        const y = offset.y + (idx + 1) * gridSize;
        ctx.fillStyle = '#00d9ff20';
        ctx.fillRect(offset.x, y, canvas.width - offset.x, gridSize);
      }
    }
  }, [zoom, offset, hoveredInstruction, cycleRange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(Math.max(0.5, Math.min(3, zoom + delta)));
  };

  const handleZoomIn = () => setZoom(Math.min(3, zoom + 0.2));
  const handleZoomOut = () => setZoom(Math.max(0.5, zoom - 0.2));
  const handleReset = () => {
    setZoom(1);
    setOffset({ x: 50, y: 30 });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-janus-border bg-janus-bg-tertiary">
        <span className="text-sm font-medium text-janus-text-primary">Pipeline View</span>
        <div className="flex items-center gap-1">
          <button 
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-janus-border rounded text-janus-text-secondary hover:text-janus-text-primary"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-janus-text-muted px-2">{Math.round(zoom * 100)}%</span>
          <button 
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-janus-border rounded text-janus-text-secondary hover:text-janus-text-primary"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button 
            onClick={handleReset}
            className="p-1.5 hover:bg-janus-border rounded text-janus-text-secondary hover:text-janus-text-primary ml-1"
            title="Reset View"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-janus-border text-xs">
        {stageNames.map(stage => (
          <div key={stage} className="flex items-center gap-1.5">
            <div 
              className="w-3 h-3 rounded-sm" 
              style={{ backgroundColor: stageColors[stage] }}
            />
            <span className="text-janus-text-secondary">{stage}</span>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-hidden cursor-grab"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <canvas 
          ref={canvasRef}
          className="w-full h-full"
        />
      </div>

      {/* Info panel */}
      <div className="px-3 py-2 border-t border-janus-border bg-janus-bg-tertiary text-xs">
        {hoveredInstruction ? (
          <div className="flex items-center gap-4">
            <span className="text-janus-accent-cyan">PC: 0x{hoveredInstruction.pc.toString(16)}</span>
            <span className="text-janus-text-primary">{hoveredInstruction.label}</span>
          </div>
        ) : (
          <span className="text-janus-text-muted">Hover over an instruction to see details</span>
        )}
      </div>
    </div>
  );
}
