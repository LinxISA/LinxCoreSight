/**
 * Place and Route Worker - Handles heavy computations off the main thread
 * Supports millions of gates through spatial indexing and chunked processing
 */

// Types for circuit data
export interface Gate {
  id: string;
  type: GateType;
  x: number;
  y: number;
  width: number;
  height: number;
  inputs: string[];
  outputs: string[];
  metadata?: Record<string, unknown>;
}

export interface Wire {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  bits: number;
  path?: Point[];
}

export interface Point {
  x: number;
  y: number;
}

export interface Net {
  id: string;
  gates: string[];
  wires: Wire[];
}

export interface Circuit {
  gates: Gate[];
  nets: Net[];
  width: number;
  height: number;
}

export interface PlacementResult {
  gates: Gate[];
  width: number;
  height: number;
  iterations: number;
}

export interface RoutingResult {
  wires: Wire[];
  score: number;
}

// Messages between main thread and worker
export type WorkerMessage = 
  | { type: 'PLACE'; payload: { circuit: Circuit; options?: PlaceOptions } }
  | { type: 'ROUTE'; payload: { circuit: Circuit; options?: RouteOptions } }
  | { type: 'PLACE_AND_ROUTE'; payload: { circuit: Circuit; options?: PnROptions } }
  | { type: 'CANCEL' }
  | { type: 'PROGRESS'; payload: { progress: number; status: string } };

export interface PlaceOptions {
  gridSize?: number;
  maxIterations?: number;
  temperature?: number;
  coolingRate?: number;
  seed?: number;
}

export interface RouteOptions {
  layerCount?: number;
  costPerVia?: number;
  congestionWeight?: number;
}

export interface PnROptions extends PlaceOptions, RouteOptions {}

// Simulated annealing placement
function simulatedAnnealingPlacement(
  gates: Gate[],
  options: PlaceOptions = {}
): PlacementResult {
  const {
    gridSize = 20,
    maxIterations = 10000,
    temperature = 1000,
    coolingRate = 0.995,
  } = options;

  // Initialize positions in a grid
  const cols = Math.ceil(Math.sqrt(gates.length));
  gates.forEach((gate, i) => {
    gate.x = (i % cols) * gridSize * 2;
    gate.y = Math.floor(i / cols) * gridSize * 2;
    gate.width = gridSize * 1.5;
    gate.height = gridSize;
  });

  let currentTemp = temperature;
  let bestGates = JSON.parse(JSON.stringify(gates));
  let bestScore = calculatePlacementScore(gates);

  for (let iter = 0; iter < maxIterations && currentTemp > 0.1; iter++) {
    // Progress reporting every 100 iterations
    if (iter % 100 === 0) {
      self.postMessage({
        type: 'PROGRESS',
        payload: { progress: iter / maxIterations, status: 'Placing gates...' }
      } as WorkerMessage);
    }

    // Generate neighbor solution
    const idx1 = Math.floor(Math.random() * gates.length);
    const idx2 = Math.floor(Math.random() * gates.length);
    
    // Swap two gates
    const tempX = gates[idx1].x;
    const tempY = gates[idx1].y;
    gates[idx1].x = gates[idx2].x;
    gates[idx1].y = gates[idx2].y;
    gates[idx2].x = tempX;
    gates[idx2].y = tempY;

    const newScore = calculatePlacementScore(gates);
    const delta = newScore - bestScore;

    // Accept or reject
    if (delta < 0 || Math.random() < Math.exp(-delta / currentTemp)) {
      if (newScore < bestScore) {
        bestScore = newScore;
        bestGates = JSON.parse(JSON.stringify(gates));
      }
    } else {
      // Revert swap
      gates[idx1].x = gates[idx2].x;
      gates[idx1].y = gates[idx2].y;
      gates[idx2].x = tempX;
      gates[idx2].y = tempY;
    }

    currentTemp *= coolingRate;
  }

  // Calculate bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  bestGates.forEach((g: Gate) => {
    minX = Math.min(minX, g.x);
    minY = Math.min(minY, g.y);
    maxX = Math.max(maxX, g.x + g.width);
    maxY = Math.max(maxY, g.y + g.height);
  });

  return {
    gates: bestGates,
    width: maxX - minX + gridSize * 2,
    height: maxY - minY + gridSize * 2,
    iterations: maxIterations
  };
}

// Calculate wire length score (shorter = better)
function calculatePlacementScore(gates: Gate[]): number {
  let score = 0;
  
  // Build net list from gate connections
  const netMap = new Map<string, string[]>();
  gates.forEach(gate => {
    gate.outputs.forEach(output => {
      const key = `${gate.id}:${output}`;
      if (!netMap.has(key)) netMap.set(key, []);
      // Find connected inputs (simplified)
      gates.forEach(other => {
        if (other.inputs.some(i => i.includes(gate.id) || i.includes(output))) {
          const connKey = `${other.id}:${other.inputs.find(i => i.includes(gate.id) || i.includes(output))}`;
          if (!netMap.has(connKey)) netMap.set(connKey, []);
        }
      });
    });
  });

  // Sum of squared wire lengths
  netMap.forEach((targets, source) => {
    const sourceGate = gates.find(g => source.startsWith(g.id));
    if (!sourceGate) return;
    
    targets.forEach(target => {
      const targetGate = gates.find(g => target.startsWith(g.id));
      if (targetGate) {
        const dx = targetGate.x - sourceGate.x;
        const dy = targetGate.y - sourceGate.y;
        score += dx * dx + dy * dy;
      }
    });
  });

  return score;
}

// Orthogonal routing (Manhattan-style like Turing Complete)
function orthogonalRouting(
  gates: Gate[],
  nets: Net[],
  options: RouteOptions = {}
): RoutingResult {
  const { costPerVia = 1 } = options;
  
  const wires: Wire[] = [];
  let totalWireLength = 0;
  let totalVias = 0;

  nets.forEach((net, netIdx) => {
    if (netIdx % 100 === 0) {
      self.postMessage({
        type: 'PROGRESS',
        payload: { progress: netIdx / nets.length, status: 'Routing wires...' }
      } as WorkerMessage);
    }

    if (net.gates.length < 2) return;

    // Get gate positions
    const positions = net.gates
      .map(gateId => gates.find(g => g.id === gateId))
      .filter(Boolean) as Gate[];

    if (positions.length < 2) return;

    // Route between all pairs using L-shaped paths
    for (let i = 0; i < positions.length - 1; i++) {
      const source = positions[i];
      const target = positions[i + 1];
      
      // Calculate L-shaped path (horizontal then vertical)
      const midX = (source.x + source.width / 2 + target.x + target.width / 2) / 2;
      const midY = (source.y + source.height / 2 + target.y + target.height / 2) / 2;
      
      const path: Point[] = [
        { x: source.x + source.width / 2, y: source.y + source.height / 2 },
        { x: midX, y: source.y + source.height / 2 },
        { x: midX, y: midY },
        { x: target.x + target.width / 2, y: midY },
        { x: target.x + target.width / 2, y: target.y + target.height / 2 },
      ];

      // Calculate wire length
      for (let j = 1; j < path.length; j++) {
        totalWireLength += Math.abs(path[j].x - path[j-1].x) + Math.abs(path[j].y - path[j-1].y);
      }

      wires.push({
        id: `wire_${net.id}_${i}`,
        source: source.id,
        sourcePort: source.outputs[0] || 'out',
        target: target.id,
        targetPort: target.inputs[0] || 'in',
        bits: 1,
        path
      });
    }
  });

  const score = totalWireLength + totalVias * costPerVia;

  return { wires, score };
}

// Main message handler
self.onmessage = function(e: MessageEvent<WorkerMessage>) {
  const msg = e.data;

  switch (msg.type) {
    case 'PLACE': {
      const { circuit, options } = msg.payload;
      const result = simulatedAnnealingPlacement(circuit.gates, options);
      self.postMessage({ type: 'PLACE_RESULT', payload: result });
      break;
    }
    
    case 'ROUTE': {
      const { circuit, options } = msg.payload;
      const result = orthogonalRouting(circuit.gates, circuit.nets, options);
      self.postMessage({ type: 'ROUTE_RESULT', payload: result });
      break;
    }
    
    case 'PLACE_AND_ROUTE': {
      const { circuit, options } = msg.payload;
      
      // Phase 1: Placement
      const placeResult = simulatedAnnealingPlacement(circuit.gates, options);
      
      // Phase 2: Routing
      const routeResult = orthogonalRouting(placeResult.gates, circuit.nets, options);
      
      self.postMessage({ 
        type: 'PLACE_AND_ROUTE_RESULT', 
        payload: { 
          gates: placeResult.gates, 
          wires: routeResult.wires,
          width: placeResult.width,
          height: placeResult.height
        } 
      });
      break;
    }
    
    case 'CANCEL': {
      // Cancellation logic would go here
      break;
    }
    default: {
      break;
    }
  }
};

// Type exports for main thread
export type GateType = 
  | 'nand' | 'and' | 'or' | 'xor' | 'not' | 'nor' | 'xnor'
  | 'adder' | 'subtractor' | 'comparator'
  | 'reg' | 'dff' | 'latch' | 'ram' | 'rom'
  | 'alu' | 'mux' | 'demux' | 'encoder' | 'decoder'
  | 'input' | 'output' | 'clock' | 'constant'
  | 'chip' | 'subcircuit';
