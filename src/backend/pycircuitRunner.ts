/**
 * pyCircuit Runner
 * Compiles and runs programs using pyCircuit simulation
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { detectToolchain } from './toolchainManager';

export interface PycOptions {
  input: string;
  output?: string;
  optimization?: string;
  verbose?: boolean;
}

export interface PycResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
}

export interface SimOptions {
  binary: string;
  cycles?: number;
  waveform?: string;
  verbose?: boolean;
}

export interface SimResult {
  success: boolean;
  output: string;
  waveform?: string;
  error?: string;
  exitCode?: number;
}

// Store running simulation processes
const runningSims: Map<string, ChildProcess> = new Map();

/**
 * Check if file exists
 */
function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * Compile C/ASM to pyCircuit IR using pyc-compile
 */
export function pycCompile(options: PycOptions): PycResult {
  const toolchain = detectToolchain();
  
  if (!toolchain.isValid) {
    return {
      success: false,
      error: `Toolchain not valid: ${toolchain.errors.join(', ')}`,
    };
  }
  
  if (!fileExists(options.input)) {
    return {
      success: false,
      error: `Input file not found: ${options.input}`,
    };
  }
  
  const pyc = toolchain.paths.pyc;
  const args: string[] = [
    options.input,
    '-o', options.output || options.input.replace(/\.[^.]+$/, '.pyc'),
  ];
  
  if (options.optimization) {
    args.push('-O', options.optimization);
  }
  
  if (options.verbose) {
    console.log('Compiling to pyCircuit:', pyc, args.join(' '));
  }
  
  try {
    const output = require('child_process').execFileSync(pyc, args, {
      encoding: 'utf-8',
      timeout: 60000,
    });
    
    return {
      success: true,
      output,
    };
  } catch (error: any) {
    return {
      success: false,
      output: error.stdout,
      error: error.stderr || error.message,
      exitCode: error.status,
    };
  }
}

/**
 * Run pyCircuit simulation using pyc-opt run
 */
export function pycSimulate(options: SimOptions): SimResult {
  const toolchain = detectToolchain();
  
  if (!toolchain.isValid) {
    return {
      success: false,
      output: '',
      error: `Toolchain not valid: ${toolchain.errors.join(', ')}`,
    };
  }
  
  if (!fileExists(options.binary)) {
    return {
      success: false,
      output: '',
      error: `Binary not found: ${options.binary}`,
    };
  }
  
  const pycOpt = toolchain.paths.pycOpt;
  const args: string[] = [
    'run',
    options.binary,
  ];
  
  if (options.cycles) {
    args.push('--cycles', options.cycles.toString());
  }
  
  if (options.waveform) {
    args.push('--waveform', options.waveform);
  }
  
  if (options.verbose) {
    console.log('Running pyCircuit:', pycOpt, args.join(' '));
  }
  
  try {
    const output = require('child_process').execFileSync(pycOpt, args, {
      encoding: 'utf-8',
      timeout: 300000, // 5 min timeout
    });
    
    return {
      success: true,
      output,
      waveform: options.waveform,
    };
  } catch (error: any) {
    return {
      success: false,
      output: error.stdout || '',
      error: error.stderr || error.message,
      exitCode: error.status,
    };
  }
}

/**
 * Run pyCircuit simulation asynchronously
 */
export async function pycSimulateAsync(
  options: SimOptions,
  onOutput?: (data: string) => void,
  onError?: (error: string) => void
): Promise<SimResult> {
  return new Promise((resolve) => {
    const toolchain = detectToolchain();
    
    if (!toolchain.isValid) {
      resolve({
        success: false,
        output: '',
        error: `Toolchain not valid: ${toolchain.errors.join(', ')}`,
      });
      return;
    }
    
    if (!fileExists(options.binary)) {
      resolve({
        success: false,
        output: '',
        error: `Binary not found: ${options.binary}`,
      });
      return;
    }
    
    const pycOpt = toolchain.paths.pycOpt;
    const args: string[] = ['run', options.binary];
    
    if (options.cycles) {
      args.push('--cycles', options.cycles.toString());
    }
    
    if (options.waveform) {
      args.push('--waveform', options.waveform);
    }
    
    let output = '';
    let errorOutput = '';
    
    const proc = spawn(pycOpt, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    runningSims.set(options.binary, proc);
    
    proc.stdout?.on('data', (data: Buffer) => {
      const str = data.toString();
      output += str;
      onOutput?.(str);
    });
    
    proc.stderr?.on('data', (data: Buffer) => {
      const str = data.toString();
      errorOutput += str;
      onError?.(str);
    });
    
    proc.on('close', (code) => {
      runningSims.delete(options.binary);
      resolve({
        success: code === 0,
        output: output + errorOutput,
        waveform: options.waveform,
        exitCode: code ?? undefined,
      });
    });
    
    proc.on('error', (error) => {
      runningSims.delete(options.binary);
      resolve({
        success: false,
        output: output + errorOutput,
        error: error.message,
      });
    });
  });
}

/**
 * Stop running simulation
 */
export function stopSimulation(binaryPath: string): boolean {
  const proc = runningSims.get(binaryPath);
  
  if (proc) {
    try {
      proc.kill();
      runningSims.delete(binaryPath);
      return true;
    } catch (error) {
      console.error('Error stopping simulation:', error);
      return false;
    }
  }
  
  return false;
}

/**
 * Stop all running simulations
 */
export function stopAllSimulations(): void {
  for (const [binary, proc] of runningSims) {
    try {
      proc.kill();
    } catch (error) {
      console.error(`Error stopping simulation for ${binary}:`, error);
    }
  }
  runningSims.clear();
}

/**
 * Full pipeline: Compile with clang -> pyc-compile -> pyc-simulate
 */
export async function fullPipeline(
  sourceFile: string,
  options: {
    projectRoot: string;
    optimizationLevel?: string;
    cycles?: number;
    waveform?: string;
  },
  onProgress?: (stage: string, output: string) => void
): Promise<{
  success: boolean;
  elf?: string;
  pyc?: string;
  simOutput?: string;
  errors: string[];
}> {
  const errors: string[] = [];
  
  // Import build system
  const { buildProject } = await import('./buildSystem');
  
  // Stage 1: Compile to ELF
  onProgress?.('Compiling', 'Building with clang...');
  const buildResult = buildProject({
    projectRoot: options.projectRoot,
    sourceFiles: [sourceFile],
    optimizationLevel: options.optimizationLevel || '-O2',
  });
  
  if (!buildResult.success) {
    return {
      success: false,
      errors: buildResult.errors,
    };
  }
  
  const elfPath = buildResult.outputFile;
  if (!elfPath) {
    return {
      success: false,
      errors: ['No ELF output'],
    };
  }
  
  onProgress?.('Compiling', `ELF built: ${elfPath}`);
  
  // Stage 2: Compile to pyCircuit IR
  const pycPath = elfPath.replace('.elf', '.pyc');
  onProgress?.('pyCircuit', 'Compiling to pyCircuit IR...');
  
  const pycResult = pycCompile({
    input: elfPath,
    output: pycPath,
    optimization: '2',
  });
  
  if (!pycResult.success) {
    errors.push(`pyCircuit compilation failed: ${pycResult.error}`);
  }
  
  onProgress?.('pyCircuit', pycResult.output || 'Compiled');
  
  // Stage 3: Run simulation
  onProgress?.('Simulation', 'Running pyCircuit simulation...');
  
  const simResult = await pycSimulateAsync({
    binary: pycPath,
    cycles: options.cycles,
    waveform: options.waveform,
  });
  
  onProgress?.('Simulation', simResult.output || simResult.error || 'Done');
  
  return {
    success: simResult.success,
    elf: elfPath,
    pyc: pycPath,
    simOutput: simResult.output,
    errors: simResult.success ? [] : [simResult.error || 'Simulation failed'],
  };
}

export default {
  pycCompile,
  pycSimulate,
  pycSimulateAsync,
  stopSimulation,
  stopAllSimulations,
  fullPipeline,
};
