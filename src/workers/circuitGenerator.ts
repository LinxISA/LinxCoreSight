/**
 * Large-Scale Circuit Generator
 * Generates circuits with millions of gates for testing P&R performance
 */

import { Gate, Wire, Net, Circuit, GateType } from './placeAndRoute.worker';

// Gate type probabilities
const GATE_TYPES: GateType[] = [
  'nand', 'and', 'or', 'xor', 'not', 'nor',
  'adder', 'subtractor', 'comparator',
  'reg', 'dff', 'latch',
  'mux', 'demux', 'encoder', 'decoder'
];

// Simple random for seeded generation
class SeededRandom {
  private seed: number;
  
  constructor(seed: number = 12345) {
    this.seed = seed;
  }
  
  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
  
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  
  choice<T>(arr: T[]): T {
    return arr[this.nextInt(0, arr.length - 1)];
  }
}

export interface CircuitGeneratorOptions {
  gateCount: number;
  fanout: number;          // Average wires per gate output
  seed?: number;
  gridWidth?: number;      // For grid-based placement
  gridHeight?: number;
  hierarchyDepth?: number; // How deep to create hierarchies
}

export class CircuitGenerator {
  private rng: SeededRandom;
  private gates: Gate[] = [];
  private nets: Net[] = [];
  private nextGateId: number = 0;
  
  constructor(seed: number = 12345) {
    this.rng = new SeededRandom(seed);
  }
  
  // Generate a random circuit
  generate(options: CircuitGeneratorOptions): Circuit {
    const {
      gateCount,
      fanout,
      gridWidth = 1000,
      gridHeight = 1000,
      hierarchyDepth = 3
    } = options;
    
    this.gates = [];
    this.nets = [];
    this.nextGateId = 0;
    
    // Generate gates
    this.generateGates(gateCount, gridWidth, gridHeight);
    
    // Create nets (connections)
    this.generateNets(fanout);
    
    // Create hierarchy
    if (hierarchyDepth > 0) {
      this.createHierarchy(hierarchyDepth);
    }
    
    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const gate of this.gates) {
      minX = Math.min(minX, gate.x);
      minY = Math.min(minY, gate.y);
      maxX = Math.max(maxX, gate.x + gate.width);
      maxY = Math.max(maxY, gate.y + gate.height);
    }
    
    return {
      gates: this.gates,
      nets: this.nets,
      width: maxX - minX + 100,
      height: maxY - minY + 100
    };
  }
  
  private generateGates(count: number, gridW: number, gridH: number): void {
    const cellSize = 30;
    const cols = Math.ceil(Math.sqrt(count));
    
    for (let i = 0; i < count; i++) {
      const type = this.rng.choice(GATE_TYPES);
      const col = i % cols;
      const row = Math.floor(i / cols);
      
      // Add some randomness to position
      const x = col * cellSize * 2 + this.rng.next() * cellSize;
      const y = row * cellSize * 2 + this.rng.next() * cellSize;
      
      const gate: Gate = {
        id: `g${this.nextGateId++}`,
        type,
        x,
        y,
        width: cellSize * 1.5,
        height: cellSize,
        inputs: this.generatePorts(type, 'input'),
        outputs: this.generatePorts(type, 'output')
      };
      
      this.gates.push(gate);
    }
  }
  
  private generatePorts(type: GateType, direction: 'input' | 'output'): string[] {
    const counts: Record<GateType, { input: number; output: number }> = {
      nand: { input: 2, output: 1 },
      and: { input: 2, output: 1 },
      or: { input: 2, output: 1 },
      xor: { input: 2, output: 1 },
      not: { input: 1, output: 1 },
      nor: { input: 2, output: 1 },
      xnor: { input: 2, output: 1 },
      adder: { input: 3, output: 2 }, // a, b, cin -> sum, cout
      subtractor: { input: 3, output: 2 },
      comparator: { input: 2, output: 3 },
      reg: { input: 2, output: 1 }, // d, clk -> q
      dff: { input: 2, output: 1 },
      latch: { input: 2, output: 1 },
      mux: { input: 3, output: 1 },
      demux: { input: 2, output: 2 },
      encoder: { input: 4, output: 2 },
      decoder: { input: 2, output: 4 },
      alu: { input: 3, output: 2 },
      ram: { input: 3, output: 1 },
      rom: { input: 2, output: 1 },
      input: { input: 0, output: 1 },
      output: { input: 1, output: 0 },
      clock: { input: 0, output: 1 },
      constant: { input: 0, output: 1 },
      chip: { input: 8, output: 8 },
      subcircuit: { input: 4, output: 4 }
    };
    
    const count = counts[type]?.[direction] || 1;
    const ports: string[] = [];
    
    for (let i = 0; i < count; i++) {
      if (direction === 'input') {
        ports.push(`in${i}[31:0]`);
      } else {
        ports.push(`out${i}[31:0]`);
      }
    }
    
    return ports;
  }
  
  private generateNets(fanout: number): void {
    // Create nets by connecting gate outputs to other gate inputs
    const outputGates = this.gates.filter(g => g.outputs.length > 0);
    const inputGates = this.gates.filter(g => g.inputs.length > 0);
    
    let netId = 0;
    
    for (const sourceGate of outputGates) {
      // Each output port creates a net
      for (let outIdx = 0; outIdx < sourceGate.outputs.length; outIdx++) {
        // Connect to multiple targets (fanout)
        const targetCount = Math.max(1, Math.floor(this.rng.next() * fanout));
        
        const connectedGates: string[] = [sourceGate.id];
        
        for (let t = 0; t < targetCount; t++) {
          // Find a random input gate
          const targetGate = this.rng.choice(inputGates);
          
          if (!connectedGates.includes(targetGate.id) && targetGate.id !== sourceGate.id) {
            connectedGates.push(targetGate.id);
            
            const net: Net = {
              id: `n${netId++}`,
              gates: [sourceGate.id, targetGate.id],
              wires: [{
                id: `w${netId}_${t}`,
                source: sourceGate.id,
                sourcePort: sourceGate.outputs[outIdx],
                target: targetGate.id,
                targetPort: targetGate.inputs[this.rng.nextInt(0, targetGate.inputs.length - 1)],
                bits: 32
              }]
            };
            
            this.nets.push(net);
          }
        }
      }
    }
  }
  
  private createHierarchy(depth: number): void {
    // Group nearby gates into subcircuits
    if (this.gates.length < 100) return;
    
    const groupSize = Math.ceil(this.gates.length / 10);
    
    for (let i = 0; i < this.gates.length; i += groupSize) {
      const group = this.gates.slice(i, i + groupSize);
      
      if (group.length > 10) {
        // Mark some gates as part of a subcircuit
        const subcircuitId = `sub${Math.floor(i / groupSize)}`;
        
        // Add metadata to gates
        group.forEach(gate => {
          gate.metadata = {
            ...gate.metadata,
            subcircuit: subcircuitId
          };
        });
      }
    }
  }
  
  // Generate a CPU-like circuit
  generateCPU(): Circuit {
    const gates: Gate[] = [];
    const nets: Net[] = [];
    let id = 0;
    
    const addGate = (type: GateType, name: string, x: number, y: number, 
                     inputs: string[], outputs: string[]): Gate => {
      const gate: Gate = {
        id: `${name}_${id++}`,
        type,
        x, y,
        width: 45,
        height: 30,
        inputs,
        outputs
      };
      gates.push(gate);
      return gate;
    };
    
    const addWire = (source: Gate, sourcePort: string, target: Gate, targetPort: string, bits: number = 1) => {
      nets.push({
        id: `net_${id++}`,
        gates: [source.id, target.id],
        wires: [{
          id: `wire_${id++}`,
          source: source.id,
          sourcePort,
          target: target.id,
          targetPort,
          bits
        }]
      });
    };
    
    // Clock generator
    const clock = addGate('clock', 'clk', 0, 0, [], ['clk_out']);
    
    // Program Counter
    const pc = addGate('dff', 'pc', 100, 0, ['d[31:0]'], ['q[31:0]']);
    addWire(clock, 'clk_out', pc, 'clk');
    
    // Instruction Register
    const ir = addGate('dff', 'ir', 100, 80, ['d[31:0]'], ['q[31:0]']);
    addWire(clock, 'clk_out', ir, 'clk');
    
    // Register File (4 registers)
    const regs: Gate[] = [];
    for (let i = 0; i < 4; i++) {
      const reg = addGate('reg', `reg${i}`, 250, i * 60, 
        ['data[31:0]', 'addr[1:0]', 'we'], 
        ['data_out[31:0]']);
      regs.push(reg);
      addWire(clock, 'clk_out', reg, 'clk');
    }
    
    // ALU
    const alu = addGate('alu', 'alu', 450, 100, 
      ['a[31:0]', 'b[31:0]', 'op[3:0]'], 
      ['result[31:0]', 'flags[3:0]']);
    addWire(clock, 'clk_out', alu, 'clk');
    
    // Control Unit
    const control = addGate('chip', 'control', 250, 300, 
      ['ir[31:0]', 'flags[3:0]'], 
      ['ctrl[15:0]']);
    
    // RAM
    const ram = addGate('ram', 'ram', 600, 100, 
      ['addr[15:0]', 'data_in[31:0]', 'we', 're'], 
      ['data_out[31:0]']);
    
    // Connect PC to RAM address
    addWire(pc, 'q[31:0]', ram, 'addr[15:0]', 32);
    
    // Connect RAM to IR
    addWire(ram, 'data_out[31:0]', ir, 'd[31:0]', 32);
    
    // Connect IR to Control
    addWire(ir, 'q[31:0]', control, 'ir[31:0]', 32);
    
    // Connect Control to ALU
    addWire(control, 'ctrl[15:0]', alu, 'op[3:0]', 16);
    
    // Connect Registers to ALU inputs
    regs.forEach((reg, i) => {
      addWire(reg, 'data_out[31:0]', alu, i === 0 ? 'a[31:0]' : 'b[31:0]', 32);
    });
    
    // Connect ALU result back to registers
    addWire(alu, 'result[31:0]', regs[0], 'data[31:0]', 32);
    
    // Flags to control
    addWire(alu, 'flags[3:0]', control, 'flags[3:0]', 4);
    
    return {
      gates,
      nets,
      width: 800,
      height: 500
    };
  }
}

// Export singleton generator
export const circuitGenerator = new CircuitGenerator();
