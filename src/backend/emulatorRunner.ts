/**
 * Emulator Runner
 * Runs LinxISA ELF binaries in QEMU
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { detectToolchain } from './toolchainManager';

export interface EmulatorOptions {
  kernel: string;
  memory?: string;
  cpu?: string;
  serial?: string;
  gdb?: number;
  arguments?: string[];
  workingDirectory?: string;
}

export interface EmulatorResult {
  success: boolean;
  exitCode?: number;
  output: string;
  error?: string;
}

export interface EmulatorProcess {
  process: ChildProcess;
  pid: number;
  running: boolean;
}

// Store running emulator processes
const runningProcesses: Map<string, EmulatorProcess> = new Map();

/**
 * Check if ELF file exists
 */
function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * Run ELF in QEMU emulator
 */
export function runEmulator(
  options: EmulatorOptions,
  onOutput?: (data: string) => void,
  onError?: (error: string) => void
): EmulatorResult {
  const toolchain = detectToolchain();
  
  if (!toolchain.isValid) {
    return {
      success: false,
      output: '',
      error: `Toolchain not valid: ${toolchain.errors.join(', ')}`,
    };
  }
  
  if (!fileExists(options.kernel)) {
    return {
      success: false,
      output: '',
      error: `Kernel not found: ${options.kernel}`,
    };
  }
  
  const qemu = toolchain.paths.qemu;
  const args: string[] = [
    '-kernel', options.kernel,
    '-nographic',
  ];
  
  // Memory (default 256M)
  if (options.memory) {
    args.push('-m', options.memory);
  } else {
    args.push('-m', '256M');
  }
  
  // CPU (default linx-v3)
  if (options.cpu) {
    args.push('-cpu', options.cpu);
  }
  
  // Serial output to stdio
  args.push('-serial', 'stdio');
  
  // GDB debugging
  if (options.gdb) {
    args.push('-gdb', `tcp::${options.gdb}`);
    args.push('-S');  // Start suspended
  }
  
  // Additional arguments
  if (options.arguments) {
    args.push(...options.arguments);
  }
  
  let output = '';
  
  try {
    const proc = spawn(qemu, args, {
      cwd: options.workingDirectory || path.dirname(options.kernel),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    proc.stdout?.on('data', (data: Buffer) => {
      const str = data.toString();
      output += str;
      onOutput?.(str);
    });
    
    proc.stderr?.on('data', (data: Buffer) => {
      const str = data.toString();
      output += str;
      onError?.(str);
    });
    
    proc.on('close', (code) => {
      const processInfo = runningProcesses.get(options.kernel);
      if (processInfo) {
        processInfo.running = false;
      }
    });
    
    return {
      success: true,
      output,
      exitCode: 0,
    };
  } catch (error: any) {
    return {
      success: false,
      output,
      error: error.message,
    };
  }
}

/**
 * Run emulator asynchronously (for interactive use)
 */
export async function runEmulatorAsync(
  options: EmulatorOptions,
  onOutput?: (data: string) => void,
  onError?: (error: string) => void
): Promise<EmulatorResult> {
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
    
    if (!fileExists(options.kernel)) {
      resolve({
        success: false,
        output: '',
        error: `Kernel not found: ${options.kernel}`,
      });
      return;
    }
    
    const qemu = toolchain.paths.qemu;
    const args: string[] = [
      '-kernel', options.kernel,
      '-nographic',
    ];
    
    // Memory
    args.push('-m', options.memory || '256M');
    
    // CPU
    args.push('-cpu', options.cpu || 'linx-v3');
    
    // Serial
    args.push('-serial', 'stdio');
    
    // GDB
    if (options.gdb) {
      args.push('-gdb', `tcp::${options.gdb}`);
      args.push('-S');
    }
    
    // Additional args
    if (options.arguments) {
      args.push(...options.arguments);
    }
    
    let output = '';
    let errorOutput = '';
    
    const proc = spawn(qemu, args, {
      cwd: options.workingDirectory || path.dirname(options.kernel),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    const pid = proc.pid || 0;
    
    runningProcesses.set(options.kernel, {
      process: proc,
      pid,
      running: true,
    });
    
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
      runningProcesses.delete(options.kernel);
      resolve({
        success: code === 0,
        exitCode: code ?? undefined,
        output: output + errorOutput,
      });
    });
    
    proc.on('error', (error) => {
      runningProcesses.delete(options.kernel);
      resolve({
        success: false,
        output: output + errorOutput,
        error: error.message,
      });
    });
  });
}

/**
 * Stop running emulator
 */
export function stopEmulator(kernelPath: string): boolean {
  const processInfo = runningProcesses.get(kernelPath);
  
  if (processInfo && processInfo.running) {
    try {
      process.kill(processInfo.pid);
      processInfo.running = false;
      runningProcesses.delete(kernelPath);
      return true;
    } catch (error) {
      console.error('Error stopping emulator:', error);
      return false;
    }
  }
  
  return false;
}

/**
 * Stop all running emulators
 */
export function stopAllEmulators(): void {
  for (const [kernel, processInfo] of runningProcesses) {
    if (processInfo.running) {
      try {
        process.kill(processInfo.pid);
        processInfo.running = false;
      } catch (error) {
        console.error(`Error stopping emulator for ${kernel}:`, error);
      }
    }
  }
  runningProcesses.clear();
}

/**
 * Get running emulator info
 */
export function getRunningEmulators(): Array<{ kernel: string; pid: number }> {
  const info: Array<{ kernel: string; pid: number }> = [];
  
  for (const [kernel, processInfo] of runningProcesses) {
    if (processInfo.running) {
      info.push({ kernel, pid: processInfo.pid });
    }
  }
  
  return info;
}

/**
 * Run with GDB server enabled
 */
export function runWithGDB(
  options: EmulatorOptions,
  gdbPort: number = 1234
): EmulatorResult {
  return runEmulator({
    ...options,
    gdb: gdbPort,
  });
}

export default {
  runEmulator,
  runEmulatorAsync,
  stopEmulator,
  stopAllEmulators,
  getRunningEmulators,
  runWithGDB,
};
