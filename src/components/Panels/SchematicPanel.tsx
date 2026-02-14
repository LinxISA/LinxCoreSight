import React, { useEffect, useRef, useState } from 'react';
import cytoscape, { Core, ElementsDefinition } from 'cytoscape';
import cytoscapeDagre from 'cytoscape-dagre';
import { ZoomIn, ZoomOut, Maximize2, ChevronRight, ChevronDown, Layers } from 'lucide-react';

// Register dagre layout
cytoscape.use(cytoscapeDagre);

// Sample hierarchical schematic data - Linx Core
interface SchematicNode {
  id: string;
  label: string;
  type: 'core' | 'alu' | 'reg' | 'mem' | 'cache' | 'fetch' | 'decode' | 'execute' | 'wb';
}

const schematicNodes: SchematicNode[] = [
  // Top level
  { id: 'linx_core', label: 'LinxCore', type: 'core' },
  
  // Pipeline stages
  { id: 'fetch', label: 'Fetch Unit', type: 'fetch' },
  { id: 'decode', label: 'Decode Unit', type: 'decode' },
  { id: 'execute', label: 'Execute Unit', type: 'execute' },
  { id: 'wb', label: 'Writeback', type: 'wb' },
  
  // Execution units
  { id: 'alu0', label: 'ALU 0', type: 'alu' },
  { id: 'alu1', label: 'ALU 1', type: 'alu' },
  { id: 'alu2', label: 'ALU 2', type: 'alu' },
  { id: 'alu3', label: 'ALU 3', type: 'alu' },
  
  // Register file
  { id: 'regfile', label: 'Register File', type: 'reg' },
  
  // Memory
  { id: 'icache', label: 'I-Cache', type: 'cache' },
  { id: 'dcache', label: 'D-Cache', type: 'cache' },
  { id: 'l2cache', label: 'L2 Cache', type: 'cache' },
  { id: 'dram', label: 'DRAM', type: 'mem' },
];

const schematicEdges = [
  // Core connections
  { source: 'linx_core', target: 'fetch' },
  { source: 'linx_core', target: 'decode' },
  { source: 'linx_core', target: 'execute' },
  { source: 'linx_core', target: 'wb' },
  
  // Pipeline flow
  { source: 'fetch', target: 'decode' },
  { source: 'decode', target: 'execute' },
  { source: 'execute', target: 'wb' },
  
  // Execution units
  { source: 'execute', target: 'alu0' },
  { source: 'execute', target: 'alu1' },
  { source: 'execute', target: 'alu2' },
  { source: 'execute', target: 'alu3' },
  
  // Register file connections
  { source: 'regfile', target: 'decode' },
  { source: 'execute', target: 'regfile' },
  
  // Memory hierarchy
  { source: 'fetch', target: 'icache' },
  { source: 'execute', target: 'dcache' },
  { source: 'icache', target: 'l2cache' },
  { source: 'dcache', target: 'l2cache' },
  { source: 'l2cache', target: 'dram' },
];

const nodeColors: Record<string, string> = {
  core: '#00d9ff',
  alu: '#00ff88',
  reg: '#a855f7',
  mem: '#ff6b35',
  cache: '#fbbf24',
  fetch: '#00d9ff',
  decode: '#a855f7',
  execute: '#00ff88',
  wb: '#ff4757',
};

export function SchematicPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['linx_core']));
  const [selectedNode, setSelectedNode] = useState<SchematicNode | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const elements: ElementsDefinition = {
      nodes: schematicNodes.map(node => ({
        data: {
          id: node.id,
          label: node.label,
          type: node.type,
        },
      })),
      edges: schematicEdges.map(edge => ({
        data: {
          id: `${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
        },
      })),
    };

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
            'font-size': '11px',
            'text-valign': 'center',
            'text-halign': 'center',
            'width': (ele) => ele.data('type') === 'core' ? 80 : 50,
            'height': (ele) => ele.data('type') === 'core' ? 80 : 50,
            'shape': (ele) => ele.data('type') === 'core' ? 'round-rectangle' : 'ellipse',
            'border-width': 2,
            'border-color': '#fff',
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#2d3a4d',
            'target-arrow-color': '#2d3a4d',
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
      ],
      layout: {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 40,
        rankSep: 60,
        padding: 30,
      } as any,
    });

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nodeData = schematicNodes.find(n => n.id === node.id());
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

  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.2);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() / 1.2);
  const handleFit = () => cyRef.current?.fit();

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  // Build hierarchical tree
  const renderTree = () => {
    const renderNode = (nodeId: string, depth: number): React.ReactNode => {
      const node = schematicNodes.find(n => n.id === nodeId);
      if (!node) return null;
      
      const hasChildren = schematicEdges.some(e => e.source === nodeId);
      const isExpanded = expandedNodes.has(nodeId);
      const children = schematicEdges
        .filter(e => e.source === nodeId)
        .map(e => e.target);
      
      return (
        <div key={nodeId}>
          <div 
            className="flex items-center gap-1 py-1 px-2 hover:bg-janus-bg-tertiary cursor-pointer"
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => hasChildren && toggleNode(nodeId)}
          >
            {hasChildren && (
              isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
            )}
            {!hasChildren && <span className="w-3" />}
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: nodeColors[node.type] }}
            />
            <span className="text-sm text-janus-text-primary">{node.label}</span>
          </div>
          {isExpanded && children.map(childId => renderNode(childId, depth + 1))}
        </div>
      );
    };
    
    return renderNode('linx_core', 0);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-janus-border bg-janus-bg-tertiary">
        <span className="text-sm font-medium text-janus-text-primary">Hierarchical Schematic</span>
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
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Hierarchy Tree */}
        <div className="w-1/3 border-r border-janus-border overflow-y-auto py-2">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-janus-border text-xs text-janus-text-secondary">
            <Layers className="w-3 h-3" />
            <span>Hierarchy</span>
          </div>
          {renderTree()}
        </div>

        {/* Graph View */}
        <div className="flex-1" ref={containerRef} />
      </div>

      {/* Info Panel */}
      <div className="px-3 py-2 border-t border-janus-border bg-janus-bg-tertiary">
        {selectedNode ? (
          <div className="text-xs">
            <div className="flex items-center gap-2">
              <span className="text-janus-text-secondary">Selected:</span>
              <span className="text-janus-text-primary font-medium">{selectedNode.label}</span>
            </div>
            <div className="text-janus-text-muted mt-1">Type: {selectedNode.type}</div>
          </div>
        ) : (
          <span className="text-xs text-janus-text-muted">Click on a component to see details</span>
        )}
      </div>
    </div>
  );
}
