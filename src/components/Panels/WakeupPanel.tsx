import React, { useEffect, useRef, useState } from 'react';
import cytoscape, { Core, ElementsDefinition, NodeDefinition } from 'cytoscape';
import cytoscapeDagre from 'cytoscape-dagre';
import { ZoomIn, ZoomOut, Maximize2, Filter } from 'lucide-react';

// Register dagre layout
cytoscape.use(cytoscapeDagre);

// Sample wakeup chain data
interface WakeupNode {
  id: string;
  label: string;
  type: 'reg' | 'alu' | 'load' | 'store' | 'branch';
  cycle: number;
}

interface WakeupEdge {
  source: string;
  target: string;
  type: 'data' | 'control';
}

const sampleNodes: WakeupNode[] = [
  { id: 'n0', label: 'LD x1, 0(x2)', type: 'load', cycle: 2 },
  { id: 'n1', label: 'ADD x3, x1, x4', type: 'alu', cycle: 4 },
  { id: 'n2', label: 'SUB x5, x3, x6', type: 'alu', cycle: 5 },
  { id: 'n3', label: 'MUL x7, x3, x5', type: 'alu', cycle: 6 },
  { id: 'n4', label: 'ST x7, 0(x8)', type: 'store', cycle: 7 },
  { id: 'n5', label: 'BNE x3, x5, +16', type: 'branch', cycle: 6 },
  { id: 'n6', label: 'AND x9, x7, x10', type: 'alu', cycle: 8 },
  { id: 'n7', label: 'OR x11, x9, x12', type: 'alu', cycle: 9 },
];

const sampleEdges: WakeupEdge[] = [
  { source: 'n0', target: 'n1', type: 'data' },
  { source: 'n1', target: 'n2', type: 'data' },
  { source: 'n1', target: 'n3', type: 'data' },
  { source: 'n2', target: 'n3', type: 'data' },
  { source: 'n3', target: 'n4', type: 'data' },
  { source: 'n2', target: 'n5', type: 'control' },
  { source: 'n3', target: 'n6', type: 'data' },
  { source: 'n6', target: 'n7', type: 'data' },
];

const nodeColors: Record<string, string> = {
  reg: '#00d9ff',
  alu: '#00ff88',
  load: '#fbbf24',
  store: '#ff6b35',
  branch: '#a855f7',
};

export function WakeupPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [selectedNode, setSelectedNode] = useState<WakeupNode | null>(null);
  const [highlightedPath, setHighlightedPath] = useState<string[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Convert data to Cytoscape elements
    const elements: ElementsDefinition = {
      nodes: sampleNodes.map(node => ({
        data: {
          id: node.id,
          label: node.label,
          type: node.type,
          cycle: node.cycle,
        },
      })),
      edges: sampleEdges.map(edge => ({
        data: {
          id: `${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
          type: edge.type,
        },
      })),
    };

    // Initialize Cytoscape
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele) => nodeColors[ele.data('type')] || '#666',
            'label': 'data(label)',
            'color': '#e6edf3',
            'font-size': '10px',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 4,
            'width': 40,
            'height': 40,
            'border-width': 2,
            'border-color': '#fff',
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': (ele) => ele.data('type') === 'control' ? '#a855f7' : '#2d3a4d',
            'target-arrow-color': (ele) => ele.data('type') === 'control' ? '#a855f7' : '#2d3a4d',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#00d9ff',
          },
        },
        {
          selector: '.highlighted',
          style: {
            'background-color': '#ff4757',
            'border-color': '#ff4757',
          },
        },
        {
          selector: '.highlighted-edge',
          style: {
            'line-color': '#ff4757',
            'target-arrow-color': '#ff4757',
            'width': 3,
          },
        },
      ],
      layout: {
        name: 'dagre',
        rankDir: 'LR',
        nodeSep: 50,
        rankSep: 80,
        padding: 20,
      } as any,
    });

    // Event handlers
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nodeData = sampleNodes.find(n => n.id === node.id());
      setSelectedNode(nodeData || null);
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setSelectedNode(null);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, []);

  const handleHighlightCriticalPath = () => {
    if (!cyRef.current) return;
    
    const cy = cyRef.current;
    
    // Reset highlighting
    cy.elements().removeClass('highlighted highlighted-edge');
    
    // Simple critical path: longest chain from source to sink
    const path = ['n0', 'n1', 'n2', 'n3', 'n6', 'n7'];
    setHighlightedPath(path);
    
    // Highlight nodes
    path.forEach(id => {
      cy.getElementById(id).addClass('highlighted');
    });
    
    // Highlight edges
    for (let i = 0; i < path.length - 1; i++) {
      const edgeId = `${path[i]}-${path[i + 1]}`;
      cy.getElementById(edgeId).addClass('highlighted-edge');
    }
  };

  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.2);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() / 1.2);
  const handleFit = () => cyRef.current?.fit();

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-janus-border bg-janus-bg-tertiary">
        <span className="text-sm font-medium text-janus-text-primary">Wakeup Chains</span>
        <div className="flex items-center gap-1">
          <button 
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-janus-border rounded text-janus-text-secondary hover:text-janus-text-primary"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button 
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-janus-border rounded text-janus-text-secondary hover:text-janus-text-primary"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button 
            onClick={handleFit}
            className="p-1.5 hover:bg-janus-border rounded text-janus-text-secondary hover:text-janus-text-primary"
            title="Fit View"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button 
            onClick={handleHighlightCriticalPath}
            className="p-1.5 hover:bg-janus-border rounded text-janus-accent-red hover:text-janus-accent-red ml-1"
            title="Highlight Critical Path"
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-janus-border text-xs">
        {Object.entries(nodeColors).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-janus-text-secondary capitalize">{type}</span>
          </div>
        ))}
      </div>

      {/* Graph Container */}
      <div ref={containerRef} className="flex-1" />

      {/* Info Panel */}
      <div className="px-3 py-2 border-t border-janus-border bg-janus-bg-tertiary">
        {selectedNode ? (
          <div className="text-xs space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-janus-text-secondary">Node:</span>
              <span className="text-janus-text-primary font-medium">{selectedNode.label}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-janus-text-secondary">Type: <span className="capitalize">{selectedNode.type}</span></span>
              <span className="text-janus-text-secondary">Cycle: {selectedNode.cycle}</span>
            </div>
          </div>
        ) : (
          <span className="text-xs text-janus-text-muted">Click on a node to see details</span>
        )}
      </div>
    </div>
  );
}
