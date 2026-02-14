/**
 * High-Performance Canvas Renderer for Circuit Visualization
 * Uses WebGL/Canvas2D with Level-of-Detail rendering for millions of gates
 */

import { Gate, Wire, Point, GateType } from './placeAndRoute.worker';

// LOD Levels
export enum LODLevel {
  EXTREME = 0,  // Zoomed way out - only clusters visible
  FAR = 1,      // Far zoom - blocks only
  MEDIUM = 2,   // Medium zoom - individual gates
  NEAR = 3,     // Close zoom - details visible
  DETAIL = 4    // Very close - all annotations visible
}

export interface RenderOptions {
  showGrid: boolean;
  showAnnotations: boolean;
  animatedWires: boolean;
  lodLevel: LODLevel;
  highlightPath?: string[];
  selectedGate?: string;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
}

// Gate colors by type
const GATE_COLORS: Record<GateType, { fill: string; stroke: string }> = {
  nand: { fill: '#0d9488', stroke: '#14b8a6' },
  and: { fill: '#0891b2', stroke: '#06b6d4' },
  or: { fill: '#0369a1', stroke: '#0ea5e9' },
  xor: { fill: '#075985', stroke: '#0ea5e9' },
  not: { fill: '#64748b', stroke: '#94a3b8' },
  nor: { fill: '#7c3aed', stroke: '#8b5cf6' },
  xnor: { fill: '#6d28d9', stroke: '#7c3ae2' },
  adder: { fill: '#ea580c', stroke: '#f97316' },
  subtractor: { fill: '#dc2626', stroke: '#ef4444' },
  comparator: { fill: '#c2410c', stroke: '#ea580c' },
  reg: { fill: '#16a34a', stroke: '#22c55e' },
  dff: { fill: '#15803d', stroke: '#16a34a' },
  latch: { fill: '#166534', stroke: '#15803d' },
  ram: { fill: '#14532d', stroke: '#166534' },
  rom: { fill: '#0f4c2c', stroke: '#14532d' },
  alu: { fill: '#db2777', stroke: '#ec4899' },
  mux: { fill: '#9333ea', stroke: '#a855f7' },
  demux: { fill: '#7e22ce', stroke: '#9333ea' },
  encoder: { fill: '#be185d', stroke: '#db2777' },
  decoder: { fill: '#9d174d', stroke: '#be185d' },
  input: { fill: '#2563eb', stroke: '#3b82f6' },
  output: { fill: '#dc2626', stroke: '#ef4444' },
  clock: { fill: '#eab308', stroke: '#facc15' },
  constant: { fill: '#4b5563', stroke: '#6b7280' },
  chip: { fill: '#374151', stroke: '#4b5563' },
  subcircuit: { fill: '#1f2937', stroke: '#374151' }
};

// Wire colors by bit width
const WIRE_COLORS: Record<number, string> = {
  1: '#22c55e',
  8: '#3b82f6',
  16: '#a855f7',
  32: '#f97316',
  64: '#06b6d4'
};

export class CircuitRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private gl: WebGLRenderingContext | null = null;
  private viewport: ViewportState = { x: 0, y: 0, zoom: 1, width: 800, height: 600 };
  private gates: Gate[] = [];
  private wires: Wire[] = [];
  private spatialIndex: Map<string, Gate[]> = new Map();
  private options: RenderOptions = {
    showGrid: true,
    showAnnotations: true,
    animatedWires: true,
    lodLevel: LODLevel.MEDIUM
  };
  private animationFrame: number = 0;
  private isAnimating: boolean = false;
  private lastFrameTime: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    
    // Try WebGL for better performance
    const glCanvas = document.createElement('canvas');
    this.gl = glCanvas.getContext('webgl', { alpha: true, antialias: true }) as unknown as WebGLRenderingContext;
    
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Handle window resize
    const resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    resizeObserver.observe(this.canvas.parentElement || document.body);
  }

  public resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.viewport.width = rect.width;
    this.viewport.height = rect.height;
    
    if (this.ctx) {
      this.ctx.scale(dpr, dpr);
    }
    
    this.render();
  }

  public setData(gates: Gate[], wires: Wire[]): void {
    this.gates = gates;
    this.wires = wires;
    this.buildSpatialIndex();
    this.render();
  }

  public setViewport(x: number, y: number, zoom: number): void {
    this.viewport.x = x;
    this.viewport.y = y;
    this.viewport.zoom = zoom;
    
    // Determine LOD based on zoom
    if (zoom < 0.01) this.options.lodLevel = LODLevel.EXTREME;
    else if (zoom < 0.05) this.options.lodLevel = LODLevel.FAR;
    else if (zoom < 0.2) this.options.lodLevel = LODLevel.MEDIUM;
    else if (zoom < 0.5) this.options.lodLevel = LODLevel.NEAR;
    else this.options.lodLevel = LODLevel.DETAIL;
    
    this.render();
  }

  public pan(dx: number, dy: number): void {
    this.viewport.x += dx;
    this.viewport.y += dy;
    this.render();
  }

  public zoom(factor: number, centerX: number, centerY: number): void {
    const oldZoom = this.viewport.zoom;
    const newZoom = Math.max(0.001, Math.min(10, oldZoom * factor));
    
    // Zoom towards center point
    const worldX = (centerX - this.viewport.x) / oldZoom;
    const worldY = (centerY - this.viewport.y) / oldZoom;
    
    this.viewport.zoom = newZoom;
    this.viewport.x = centerX - worldX * newZoom;
    this.viewport.y = centerY - worldY * newZoom;
    
    // Update LOD
    if (newZoom < 0.01) this.options.lodLevel = LODLevel.EXTREME;
    else if (newZoom < 0.05) this.options.lodLevel = LODLevel.FAR;
    else if (newZoom < 0.2) this.options.lodLevel = LODLevel.MEDIUM;
    else if (newZoom < 0.5) this.options.lodLevel = LODLevel.NEAR;
    else this.options.lodLevel = LODLevel.DETAIL;
    
    this.render();
  }

  public fitToContent(padding: number = 50): void {
    if (this.gates.length === 0) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const gate of this.gates) {
      minX = Math.min(minX, gate.x);
      minY = Math.min(minY, gate.y);
      maxX = Math.max(maxX, gate.x + gate.width);
      maxY = Math.max(maxY, gate.y + gate.height);
    }
    
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    const scaleX = (this.viewport.width - padding * 2) / contentWidth;
    const scaleY = (this.viewport.height - padding * 2) / contentHeight;
    const zoom = Math.min(scaleX, scaleY, 1);
    
    this.viewport.zoom = zoom;
    this.viewport.x = (this.viewport.width - contentWidth * zoom) / 2 - minX * zoom;
    this.viewport.y = (this.viewport.height - contentHeight * zoom) / 2 - minY * zoom;
    
    this.options.lodLevel = LODLevel.MEDIUM;
    this.render();
  }

  // Build spatial index for viewport culling
  private buildSpatialIndex(): void {
    this.spatialIndex.clear();
    
    // Simple grid-based indexing
    const cellSize = 500;
    
    for (const gate of this.gates) {
      const cellX = Math.floor(gate.x / cellSize);
      const cellY = Math.floor(gate.y / cellSize);
      const key = `${cellX},${cellY}`;
      
      if (!this.spatialIndex.has(key)) {
        this.spatialIndex.set(key, []);
      }
      this.spatialIndex.get(key)!.push(gate);
    }
  }

  // Get gates visible in viewport
  private getVisibleGates(): Gate[] {
    const { x, y, zoom, width, height } = this.viewport;
    
    // Calculate world bounds
    const worldLeft = -x / zoom;
    const worldTop = -y / zoom;
    const worldRight = worldLeft + width / zoom;
    const worldBottom = worldTop + height / zoom;
    
    const padding = 100 / zoom; // Extra buffer
    const queryBounds = {
      x: worldLeft - padding,
      y: worldTop - padding,
      width: worldRight - worldLeft + padding * 2,
      height: worldBottom - worldTop + padding * 2
    };
    
    // Query spatial index
    const cellSize = 500;
    const startCellX = Math.floor(queryBounds.x / cellSize);
    const endCellX = Math.floor((queryBounds.x + queryBounds.width) / cellSize);
    const startCellY = Math.floor(queryBounds.y / cellSize);
    const endCellY = Math.floor((queryBounds.y + queryBounds.height) / cellSize);
    
    const visibleGates: Gate[] = [];
    
    for (let cx = startCellX; cx <= endCellX; cx++) {
      for (let cy = startCellY; cy <= endCellY; cy++) {
        const key = `${cx},${cy}`;
        const cellGates = this.spatialIndex.get(key);
        if (cellGates) {
          for (const gate of cellGates) {
            if (this.gateInBounds(gate, queryBounds)) {
              visibleGates.push(gate);
            }
          }
        }
      }
    }
    
    return visibleGates;
  }

  private gateInBounds(gate: Gate, bounds: { x: number; y: number; width: number; height: number }): boolean {
    return !(gate.x + gate.width < bounds.x ||
             gate.x > bounds.x + bounds.width ||
             gate.y + gate.height < bounds.y ||
             gate.y > bounds.y + bounds.height);
  }

  // Main render function
  public render(): void {
    if (!this.ctx) return;
    
    const { width, height, x, y, zoom } = this.viewport;
    
    // Clear canvas
    this.ctx.fillStyle = '#0a0e14';
    this.ctx.fillRect(0, 0, width, height);
    
    // Apply viewport transform
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.scale(zoom, zoom);
    
    // Get visible elements using spatial index
    const visibleGates = this.getVisibleGates();
    
    // Render based on LOD
    switch (this.options.lodLevel) {
      case LODLevel.EXTREME:
        this.renderExtreme(visibleGates);
        break;
      case LODLevel.FAR:
        this.renderFar(visibleGates);
        break;
      case LODLevel.MEDIUM:
        this.renderMedium(visibleGates);
        break;
      case LODLevel.NEAR:
        this.renderNear(visibleGates);
        break;
      case LODLevel.DETAIL:
        this.renderDetail(visibleGates);
        break;
    }
    
    // Render wires (always)
    this.renderWires();
    
    // Render grid
    if (this.options.showGrid && zoom > 0.05) {
      this.renderGrid();
    }
    
    this.ctx.restore();
    
    // Update animation frame
    if (this.isAnimating) {
      this.animationFrame = requestAnimationFrame(() => this.render());
    }
  }

  private renderExtreme(gates: Gate[]): void {
    // Just render clusters/blocks
    for (const gate of gates) {
      const colors = GATE_COLORS[gate.type] || GATE_COLORS.chip;
      this.ctx!.fillStyle = colors.fill;
      this.ctx!.strokeStyle = colors.stroke;
      this.ctx!.lineWidth = 2 / this.viewport.zoom;
      
      // Render as simple rectangle
      this.ctx!.fillRect(gate.x, gate.y, gate.width * 3, gate.height * 3);
      this.ctx!.strokeRect(gate.x, gate.y, gate.width * 3, gate.height * 3);
    }
  }

  private renderFar(gates: Gate[]): void {
    for (const gate of gates) {
      const colors = GATE_COLORS[gate.type] || GATE_COLORS.chip;
      this.ctx!.fillStyle = colors.fill;
      this.ctx!.strokeStyle = colors.stroke;
      this.ctx!.lineWidth = 2 / this.viewport.zoom;
      
      // Render with label
      this.ctx!.fillRect(gate.x, gate.y, gate.width * 2, gate.height * 2);
      this.ctx!.strokeRect(gate.x, gate.y, gate.width * 2, gate.height * 2);
    }
  }

  private renderMedium(gates: Gate[]): void {
    for (const gate of gates) {
      const colors = GATE_COLORS[gate.type] || GATE_COLORS.chip;
      this.ctx!.fillStyle = colors.fill;
      this.ctx!.strokeStyle = colors.stroke;
      this.ctx!.lineWidth = 2 / this.viewport.zoom;
      
      // Render with type label
      this.ctx!.fillRect(gate.x, gate.y, gate.width, gate.height);
      this.ctx!.strokeRect(gate.x, gate.y, gate.width, gate.height);
      
      // Small label
      if (this.viewport.zoom > 0.1) {
        this.ctx!.fillStyle = '#ffffff';
        this.ctx!.font = `${10 / this.viewport.zoom}px JetBrains Mono`;
        this.ctx!.textAlign = 'center';
        this.ctx!.fillText(gate.type.toUpperCase(), gate.x + gate.width / 2, gate.y + gate.height / 2 + 4);
      }
    }
  }

  private renderNear(gates: Gate[]): void {
    for (const gate of gates) {
      const colors = GATE_COLORS[gate.type] || GATE_COLORS.chip;
      this.ctx!.fillStyle = colors.fill;
      this.ctx!.strokeStyle = colors.stroke;
      this.ctx!.lineWidth = 3 / this.viewport.zoom;
      
      // Render with full label
      this.ctx!.fillRect(gate.x, gate.y, gate.width, gate.height);
      this.ctx!.strokeRect(gate.x, gate.y, gate.width, gate.height);
      
      this.ctx!.fillStyle = '#ffffff';
      this.ctx!.font = `bold ${12 / this.viewport.zoom}px JetBrains Mono`;
      this.ctx!.textAlign = 'center';
      this.ctx!.fillText(gate.id, gate.x + gate.width / 2, gate.y + gate.height / 2 + 4);
      
      // Render ports
      this.renderPorts(gate);
    }
  }

  private renderDetail(gates: Gate[]): void {
    for (const gate of gates) {
      const colors = GATE_COLORS[gate.type] || GATE_COLORS.chip;
      this.ctx!.fillStyle = colors.fill;
      this.ctx!.strokeStyle = colors.stroke;
      this.ctx!.lineWidth = 3 / this.viewport.zoom;
      
      // Render with full details
      this.ctx!.fillRect(gate.x, gate.y, gate.width, gate.height);
      this.ctx!.strokeRect(gate.x, gate.y, gate.width, gate.height);
      
      // Label
      this.ctx!.fillStyle = '#ffffff';
      this.ctx!.font = `bold ${11 / this.viewport.zoom}px JetBrains Mono`;
      this.ctx!.textAlign = 'center';
      this.ctx!.fillText(gate.id, gate.x + gate.width / 2, gate.y + gate.height / 2);
      
      // Render ports with labels
      this.renderPorts(gate, true);
      
      // Render metadata if available
      if (gate.metadata && this.viewport.zoom > 0.8) {
        this.ctx!.font = `${8 / this.viewport.zoom}px JetBrains Mono`;
        this.ctx!.fillStyle = '#8b949e';
        this.ctx!.fillText(gate.type.toUpperCase(), gate.x + gate.width / 2, gate.y + gate.height + 12);
      }
    }
  }

  private renderPorts(gate: Gate, showLabels: boolean = false): void {
    const portSize = 6 / this.viewport.zoom;
    
    // Input ports (left side)
    for (let i = 0; i < gate.inputs.length; i++) {
      const py = gate.y + (i + 1) * gate.height / (gate.inputs.length + 1);
      
      this.ctx!.fillStyle = '#3b82f6';
      this.ctx!.beginPath();
      this.ctx!.arc(gate.x, py, portSize, 0, Math.PI * 2);
      this.ctx!.fill();
      
      if (showLabels && this.viewport.zoom > 0.3) {
        this.ctx!.fillStyle = '#8b949e';
        this.ctx!.font = `${8 / this.viewport.zoom}px JetBrains Mono`;
        this.ctx!.textAlign = 'right';
        this.ctx!.fillText(gate.inputs[i], gate.x - 8, py + 3);
      }
    }
    
    // Output ports (right side)
    for (let i = 0; i < gate.outputs.length; i++) {
      const py = gate.y + (i + 1) * gate.height / (gate.outputs.length + 1);
      
      this.ctx!.fillStyle = '#f97316';
      this.ctx!.beginPath();
      this.ctx!.arc(gate.x + gate.width, py, portSize, 0, Math.PI * 2);
      this.ctx!.fill();
      
      if (showLabels && this.viewport.zoom > 0.3) {
        this.ctx!.fillStyle = '#8b949e';
        this.ctx!.font = `${8 / this.viewport.zoom}px JetBrains Mono`;
        this.ctx!.textAlign = 'left';
        this.ctx!.fillText(gate.outputs[i], gate.x + gate.width + 8, py + 3);
      }
    }
  }

  private renderWires(): void {
    for (const wire of this.wires) {
      const sourceGate = this.gates.find(g => g.id === wire.source);
      const targetGate = this.gates.find(g => g.id === wire.target);
      
      if (!sourceGate || !targetGate) continue;
      
      const color = WIRE_COLORS[wire.bits] || WIRE_COLORS[1];
      this.ctx!.strokeStyle = color;
      this.ctx!.lineWidth = Math.max(1, Math.min(3, 2 / this.viewport.zoom));
      
      // Calculate start and end points
      const startX = sourceGate.x + sourceGate.width;
      const startY = sourceGate.y + sourceGate.height / 2;
      const endX = targetGate.x;
      const endY = targetGate.y + targetGate.height / 2;
      
      // Draw wire path
      this.ctx!.beginPath();
      this.ctx!.moveTo(startX, startY);
      
      if (wire.path && wire.path.length > 0) {
        for (const point of wire.path) {
          this.ctx!.lineTo(point.x, point.y);
        }
      } else {
        // Simple L-shaped path
        const midX = (startX + endX) / 2;
        this.ctx!.lineTo(midX, startY);
        this.ctx!.lineTo(midX, endY);
        this.ctx!.lineTo(endX, endY);
      }
      
      this.ctx!.stroke();
      
      // Draw arrow at end
      const angle = Math.atan2(endY - startY, endX - (startX + endX) / 2);
      this.ctx!.fillStyle = color;
      this.ctx!.beginPath();
      this.ctx!.moveTo(endX, endY);
      this.ctx!.lineTo(endX - 8 / this.viewport.zoom * Math.cos(angle - Math.PI / 6), 
                         endY - 8 / this.viewport.zoom * Math.sin(angle - Math.PI / 6));
      this.ctx!.lineTo(endX - 8 / this.viewport.zoom * Math.cos(angle + Math.PI / 6), 
                         endY - 8 / this.viewport.zoom * Math.sin(angle + Math.PI / 6));
      this.ctx!.closePath();
      this.ctx!.fill();
    }
  }

  private renderGrid(): void {
    const gridSize = 50;
    const { width, height, x, y, zoom } = this.viewport;
    
    // Calculate visible grid area
    const startX = Math.floor(-x / zoom / gridSize) * gridSize;
    const startY = Math.floor(-y / zoom / gridSize) * gridSize;
    const endX = startX + width / zoom + gridSize * 2;
    const endY = startY + height / zoom + gridSize * 2;
    
    this.ctx!.strokeStyle = '#1a2332';
    this.ctx!.lineWidth = 1 / zoom;
    
    for (let gx = startX; gx < endX; gx += gridSize) {
      this.ctx!.beginPath();
      this.ctx!.moveTo(gx, startY);
      this.ctx!.lineTo(gx, endY);
      this.ctx!.stroke();
    }
    
    for (let gy = startY; gy < endY; gy += gridSize) {
      this.ctx!.beginPath();
      this.ctx!.moveTo(startX, gy);
      this.ctx!.lineTo(endX, gy);
      this.ctx!.stroke();
    }
  }

  // Animation control
  public startAnimation(): void {
    this.isAnimating = true;
    this.animate();
  }

  public stopAnimation(): void {
    this.isAnimating = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }

  private animate(): void {
    if (!this.isAnimating) return;
    
    const now = performance.now();
    const delta = now - this.lastFrameTime;
    this.lastFrameTime = now;
    
    // Animate wires if enabled
    if (this.options.animatedWires) {
      this.render();
    }
    
    this.animationFrame = requestAnimationFrame(() => this.animate());
  }

  // Options
  public setOptions(options: Partial<RenderOptions>): void {
    this.options = { ...this.options, ...options };
    this.render();
  }

  public getOptions(): RenderOptions {
    return { ...this.options };
  }

  // Hit testing
  public hitTest(worldX: number, worldY: number, threshold: number = 10): Gate | null {
    // Query spatial index first
    const cellSize = 500;
    const cellX = Math.floor(worldX / cellSize);
    const cellY = Math.floor(worldY / cellSize);
    const key = `${cellX},${cellY}`;
    
    const nearbyGates = this.spatialIndex.get(key) || [];
    const expandedGates: Gate[] = [];
    
    // Also check neighboring cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nKey = `${cellX + dx},${cellY + dy}`;
        const nGates = this.spatialIndex.get(nKey);
        if (nGates) {
          expandedGates.push(...nGates);
        }
      }
    }
    
    for (const gate of expandedGates) {
      const expandedBounds = {
        x: gate.x - threshold,
        y: gate.y - threshold,
        width: gate.width + threshold * 2,
        height: gate.height + threshold * 2
      };
      
      if (worldX >= expandedBounds.x && worldX <= expandedBounds.x + expandedBounds.width &&
          worldY >= expandedBounds.y && worldY <= expandedBounds.y + expandedBounds.height) {
        return gate;
      }
    }
    
    return null;
  }

  // Convert screen coordinates to world coordinates
  public screenToWorld(screenX: number, screenY: number): Point {
    return {
      x: (screenX - this.viewport.x) / this.viewport.zoom,
      y: (screenY - this.viewport.y) / this.viewport.zoom
    };
  }

  // Convert world coordinates to screen coordinates
  public worldToScreen(worldX: number, worldY: number): Point {
    return {
      x: worldX * this.viewport.zoom + this.viewport.x,
      y: worldY * this.viewport.zoom + this.viewport.y
    };
  }

  public getViewport(): ViewportState {
    return { ...this.viewport };
  }
}
