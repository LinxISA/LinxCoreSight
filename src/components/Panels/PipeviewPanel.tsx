import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useIDEStore } from '../../store/ideStore';
import { ZoomIn, ZoomOut, RotateCcw, RefreshCw } from 'lucide-react';

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

const defaultStageNames = ['Fetch', 'Decode', 'Execute', 'Memory', 'Writeback'];
const defaultStageColors: Record<string, string> = {
  Fetch: '#00d9ff',
  Decode: '#a855f7',
  Execute: '#00ff88',
  Memory: '#fbbf24',
  Writeback: '#ff6b35',
};

const sampleInstructions: PipelineInstruction[] = [
  {
    id: 0,
    pc: 0x1000,
    label: 'add x1, x2, x3',
    stages: defaultStageNames.map((name, i) => ({
      name,
      startCycle: i,
      endCycle: i + 1,
      color: defaultStageColors[name],
    })),
  },
  {
    id: 1,
    pc: 0x1004,
    label: 'sub x4, x5, x6',
    stages: defaultStageNames.map((name, i) => ({
      name,
      startCycle: i + 1,
      endCycle: i + 2,
      color: defaultStageColors[name],
    })),
  },
];

function normalizeInstruction(raw: any, index: number): PipelineInstruction | null {
  if (!raw) {
    return null;
  }

  const label = String(raw.label || raw.asm || raw.text || `instruction_${index}`).trim();
  const pcValue = raw.pc ?? raw.address ?? 0;
  const parsedPc = typeof pcValue === 'string'
    ? parseInt(pcValue.replace(/^0x/i, ''), 16)
    : Number(pcValue);
  const pc = Number.isFinite(parsedPc) ? parsedPc : 0;

  const rawStages = Array.isArray(raw.stages) ? raw.stages : [];
  const stages: PipelineStage[] = rawStages.length > 0
    ? rawStages
      .map((stage: any, stageIndex: number) => {
        const stageName = String(stage.name || defaultStageNames[stageIndex] || `S${stageIndex}`);
        const startCycle = Number(stage.startCycle ?? stage.start ?? (index + stageIndex));
        const endCycle = Number(stage.endCycle ?? stage.end ?? (startCycle + 1));
        return {
          name: stageName,
          startCycle: Number.isFinite(startCycle) ? startCycle : index + stageIndex,
          endCycle: Number.isFinite(endCycle) ? endCycle : index + stageIndex + 1,
          color: stage.color || defaultStageColors[stageName] || '#7d8590',
        };
      })
      .filter((stage: PipelineStage) => stage.endCycle > stage.startCycle)
    : defaultStageNames.map((stageName, stageIndex) => ({
      name: stageName,
      startCycle: index + stageIndex,
      endCycle: index + stageIndex + 1,
      color: defaultStageColors[stageName],
    }));

  return {
    id: Number.isFinite(Number(raw.id)) ? Number(raw.id) : index,
    pc,
    label,
    stages,
  };
}

function parseQemuTrace(traceText: string): PipelineInstruction[] {
  const lines = traceText.split('\n');
  const parsed: PipelineInstruction[] = [];
  const seen = new Set<string>();
  const pcRegex = /^\s*0x([0-9a-fA-F]+):/;
  const objRegex = /^\s*OBJD-T:\s*(\S+)/;

  for (let i = 0; i < lines.length;) {
    const pcMatch = lines[i].match(pcRegex);
    if (!pcMatch) {
      i += 1;
      continue;
    }

    const pcHex = pcMatch[1].toLowerCase();
    const objChunks: string[] = [];
    let j = i + 1;
    while (j < lines.length) {
      if (pcRegex.test(lines[j])) {
        break;
      }
      const objMatch = lines[j].match(objRegex);
      if (objMatch) {
        objChunks.push(objMatch[1]);
      }
      j += 1;
    }

    const label = objChunks.length > 0
      ? `OBJD-T ${objChunks[0]}${objChunks.length > 1 ? ' ...' : ''}`
      : `PC 0x${pcHex}`;

    const key = `${pcHex}:${label}`;
    if (seen.has(key)) {
      i = j;
      continue;
    }
    seen.add(key);

    const idx = parsed.length;
    parsed.push({
      id: idx,
      pc: parseInt(pcHex, 16),
      label,
      stages: defaultStageNames.map((stageName, stageIndex) => ({
        name: stageName,
        startCycle: idx + stageIndex,
        endCycle: idx + stageIndex + 1,
        color: defaultStageColors[stageName],
      })),
    });

    if (parsed.length >= 200) {
      break;
    }

    i = j;
  }

  return parsed;
}

export function PipeviewPanel() {
  const store = useIDEStore();
  const { currentProject, compileStatus, emulatorStatus } = store;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 50, y: 30 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredInstruction, setHoveredInstruction] = useState<PipelineInstruction | null>(null);
  const [cycleRange, setCycleRange] = useState({ start: 0, end: 20 });
  const [instructions, setInstructions] = useState<PipelineInstruction[]>(sampleInstructions);
  const [sourcePath, setSourcePath] = useState<string>('sample');
  const [loadError, setLoadError] = useState<string>('');

  const stageNames = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const inst of instructions) {
      for (const stage of inst.stages) {
        if (!seen.has(stage.name)) {
          seen.add(stage.name);
          names.push(stage.name);
        }
      }
    }
    return names.length > 0 ? names : defaultStageNames;
  }, [instructions]);

  const stageColors = useMemo(() => {
    const colors: Record<string, string> = { ...defaultStageColors };
    for (const inst of instructions) {
      for (const stage of inst.stages) {
        if (!colors[stage.name]) {
          colors[stage.name] = stage.color || '#7d8590';
        }
      }
    }
    return colors;
  }, [instructions]);

  const loadPipeview = useCallback(async () => {
    if (!currentProject) {
      setInstructions(sampleInstructions);
      setSourcePath('sample');
      setLoadError('');
      return;
    }

    const configPath = `${currentProject.path}/linxcoresight.json`;
    const configResult = await window.electronAPI.readFile(configPath);
    const resolveProjectPath = (target?: string): string | null => {
      if (!target) return null;
      if (target.startsWith('/')) return target;
      return `${currentProject.path.replace(/\/+$/, '')}/${target.replace(/\\/g, '/').replace(/^\.\//, '')}`;
    };

    let pipeviewPath: string | null = null;
    let qemuTracePath: string | null = null;

    if (configResult.success && configResult.content) {
      try {
        const parsed = JSON.parse(configResult.content) as {
          artifacts?: { pipeview?: string; qemuTrace?: string };
        };
        pipeviewPath = resolveProjectPath(parsed.artifacts?.pipeview);
        qemuTracePath = resolveProjectPath(parsed.artifacts?.qemuTrace);
      } catch (_error) {
        pipeviewPath = null;
        qemuTracePath = null;
      }
    }

    if (pipeviewPath && await window.electronAPI.exists(pipeviewPath)) {
      const pipeResult = await window.electronAPI.readFile(pipeviewPath);
      if (pipeResult.success && pipeResult.content) {
        try {
          const parsed = JSON.parse(pipeResult.content);
          const rawInstructions = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed.instructions)
              ? parsed.instructions
              : [];
          const normalized = rawInstructions
            .map((inst: any, idx: number) => normalizeInstruction(inst, idx))
            .filter(Boolean) as PipelineInstruction[];

          if (normalized.length > 0) {
            setInstructions(normalized);
            setSourcePath(pipeviewPath);
            setLoadError('');
            return;
          }
        } catch (_error) {
          // Ignore parse failure and try fallback trace.
        }
      }
    }

    if (qemuTracePath && await window.electronAPI.exists(qemuTracePath)) {
      const traceResult = await window.electronAPI.readFile(qemuTracePath);
      if (traceResult.success && traceResult.content) {
        const parsedTrace = parseQemuTrace(traceResult.content);
        if (parsedTrace.length > 0) {
          setInstructions(parsedTrace);
          setSourcePath(qemuTracePath);
          setLoadError('');
          return;
        }
      }
    }

    setInstructions(sampleInstructions);
    setSourcePath('sample');
    setLoadError('No generated pipeview artifact found yet. Run a demo to generate one.');
  }, [currentProject]);

  useEffect(() => {
    void loadPipeview();
  }, [loadPipeview, compileStatus, emulatorStatus]);

  useEffect(() => {
    if (instructions.length === 0) {
      setCycleRange({ start: 0, end: 20 });
      return;
    }
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const inst of instructions) {
      for (const stage of inst.stages) {
        min = Math.min(min, stage.startCycle);
        max = Math.max(max, stage.endCycle);
      }
    }
    const start = Number.isFinite(min) ? Math.max(0, Math.floor(min) - 1) : 0;
    const end = Number.isFinite(max) ? Math.ceil(max) + 1 : 20;
    setCycleRange({ start, end });
  }, [instructions]);

  // Draw the pipeline view
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = containerRef.current;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    ctx.fillStyle = '#111820';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#2d3a4d';
    ctx.lineWidth = 0.5;
    const gridSize = 30 * zoom;

    for (let i = cycleRange.start; i <= cycleRange.end; i++) {
      const x = offset.x + i * gridSize;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    for (let i = 0; i < instructions.length + 2; i++) {
      const y = offset.y + i * gridSize;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = '#8b949e';
    stageNames.forEach((stage, i) => {
      const y = offset.y + (i + 1) * gridSize;
      ctx.fillText(stage, 5, y + gridSize / 2 + 4);
    });

    ctx.fillStyle = '#6e7681';
    for (let i = cycleRange.start; i <= cycleRange.end; i++) {
      const x = offset.x + i * gridSize + gridSize / 2 - 8;
      ctx.fillText(String(i), x, offset.y - 5);
    }

    instructions.forEach((inst, instIndex) => {
      const y = offset.y + (instIndex + 1) * gridSize + 5;
      const height = gridSize - 10;

      inst.stages.forEach((stage) => {
        const x = offset.x + stage.startCycle * gridSize;
        const width = (stage.endCycle - stage.startCycle) * gridSize;
        const stageColor = stage.color || stageColors[stage.name] || '#7d8590';

        ctx.fillStyle = `${stageColor}80`;
        ctx.fillRect(x, y, width, height);

        ctx.strokeStyle = stageColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, height);

        if (width > 30) {
          ctx.fillStyle = '#fff';
          ctx.font = '10px JetBrains Mono, monospace';
          ctx.fillText(stage.name[0], x + 4, y + height / 2 + 3);
        }
      });

      ctx.fillStyle = '#e6edf3';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText(`${inst.pc.toString(16)}: ${inst.label}`, offset.x + 5, y + height / 2 + 4);
    });

    if (hoveredInstruction) {
      const idx = instructions.findIndex((inst) => inst.id === hoveredInstruction.id);
      if (idx >= 0) {
        const y = offset.y + (idx + 1) * gridSize;
        ctx.fillStyle = '#00d9ff20';
        ctx.fillRect(offset.x, y, canvas.width - offset.x, gridSize);
      }
    }
  }, [zoom, offset, hoveredInstruction, cycleRange, stageNames, stageColors, instructions]);

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
      <div className="flex items-center justify-between px-3 py-2 border-b border-janus-border bg-janus-bg-tertiary">
        <span className="text-sm font-medium text-janus-text-primary">Pipeline View</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => void loadPipeview()}
            className="p-1.5 hover:bg-janus-border rounded text-janus-text-secondary hover:text-janus-text-primary"
            title="Reload Pipeview"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
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

      <div className="flex items-center justify-between gap-4 px-3 py-2 border-b border-janus-border text-xs">
        <div className="flex items-center gap-4">
          {stageNames.map((stage) => (
            <div key={stage} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: stageColors[stage] || '#7d8590' }}
              />
              <span className="text-janus-text-secondary">{stage}</span>
            </div>
          ))}
        </div>
        <span className="text-janus-text-muted truncate max-w-[40%]" title={sourcePath}>
          source: {sourcePath}
        </span>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-hidden cursor-grab"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      <div className="px-3 py-2 border-t border-janus-border bg-janus-bg-tertiary text-xs">
        {loadError ? (
          <span className="text-[#fbbf24]">{loadError}</span>
        ) : hoveredInstruction ? (
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
