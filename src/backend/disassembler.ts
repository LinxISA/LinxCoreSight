/**
 * Disassembler
 * Disassemble ELF binaries using llvm-objdump
 */

import * as fs from 'fs';
import { execSync } from 'child_process';
import { detectToolchain } from './toolchainManager';

export interface DisassembleOptions {
  binary: string;
  showRawInstructions?: boolean;
  showSource?: boolean;
  startAddress?: string;
  endAddress?: string;
  architecture?: string;
}

export interface DisassemblyResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface SymbolInfo {
  name: string;
  address: string;
  size: string;
  type: string;
}

export interface SectionInfo {
  name: string;
  address: string;
  size: string;
  flags: string;
}

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
 * Disassemble ELF binary
 */
export function disassemble(options: DisassembleOptions): DisassemblyResult {
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
  
  const objdump = toolchain.paths.objdump;
  
  const args: string[] = [
    '-d',  // Disassemble
  ];
  
  // Show raw instructions
  if (options.showRawInstructions) {
    args.push('--show-raw-insn');
  } else {
    args.push('--no-show-raw-insn');
  }
  
  // Show source if debug info available
  if (options.showSource) {
    args.push('-S');
  }
  
  // Start/End address
  if (options.startAddress) {
    args.push('--start-address', options.startAddress);
  }
  if (options.endAddress) {
    args.push('--end-address', options.endAddress);
  }
  
  // Architecture
  if (options.architecture) {
    args.push('--architecture', options.architecture);
  }
  
  // Binary file
  args.push(options.binary);
  
  try {
    const cmd = `${objdump} ${args.join(' ')}`;
    const output = execSync(cmd, { encoding: 'utf-8' });
    
    return {
      success: true,
      output,
    };
  } catch (error: any) {
    return {
      success: false,
      output: '',
      error: error.message || 'Disassembly failed',
    };
  }
}

/**
 * Get symbols from binary
 */
export function getSymbols(binary: string): SymbolInfo[] {
  const toolchain = detectToolchain();
  
  if (!toolchain.isValid || !fileExists(binary)) {
    return [];
  }
  
  try {
    const objdump = toolchain.paths.objdump;
    const output = execSync(`${objdump} -t ${binary}`, { encoding: 'utf-8' });
    
    const symbols: SymbolInfo[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      // Parse: address type size name
      const match = line.match(/^([0-9a-f]+)\s+([lgwstub?])\s+([0-9a-f]+)\s+(.+)$/);
      if (match) {
        symbols.push({
          address: match[1],
          type: match[2],
          size: match[3],
          name: match[4],
        });
      }
    }
    
    return symbols;
  } catch (error) {
    console.error('Error getting symbols:', error);
    return [];
  }
}

/**
 * Get sections from binary
 */
export function getSections(binary: string): SectionInfo[] {
  const toolchain = detectToolchain();
  
  if (!toolchain.isValid || !fileExists(binary)) {
    return [];
  }
  
  try {
    const objdump = toolchain.paths.objdump;
    const output = execSync(`${objdump} -h ${binary}`, { encoding: 'utf-8' });
    
    const sections: SectionInfo[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      // Parse: Idx Name Size VMA LMA File-off Algn Flags
      const match = line.match(/^\s*\d+\s+(\S+)\s+([0-9a-f]+)\s+([0-9a-f]+)\s+([0-9a-f]+)\s+([0-9a-f]+)\s+\S+\s+(\S+.*)$/);
      if (match) {
        sections.push({
          name: match[1],
          size: match[2],
          address: match[3],
          flags: match[6],
        });
      }
    }
    
    return sections;
  } catch (error) {
    console.error('Error getting sections:', error);
    return [];
  }
}

/**
 * Get file headers
 */
export function getHeaders(binary: string): { error?: string; output?: string } {
  const toolchain = detectToolchain();
  
  if (!toolchain.isValid || !fileExists(binary)) {
    return { error: 'Binary not found or toolchain invalid' };
  }
  
  try {
    const objdump = toolchain.paths.objdump;
    const output = execSync(`${objdump} -f ${binary}`, { encoding: 'utf-8' });
    return { output };
  } catch (error: any) {
    return { error: error.message };
  }
}

/**
 * Simple disassembly for display in IDE
 */
export function simpleDisassemble(binary: string): string {
  const result = disassemble({
    binary,
    showRawInstructions: false,
  });
  
  if (!result.success) {
    return `Error: ${result.error}`;
  }
  
  // Parse and format for display
  const lines = result.output.split('\n');
  const formatted: string[] = [];
  
  for (const line of lines) {
    // Skip empty lines and section headers
    if (!line.trim() || line.includes('Disassembly of section')) {
      continue;
    }
    
    // Format: address:  bytes  instruction
    const match = line.match(/^\s*([0-9a-f]+):\s*([0-9a-f ]+)\s+(.+)$/);
    if (match) {
      formatted.push(`${match[1]}:  ${match[3]}`);
    } else {
      formatted.push(line);
    }
  }
  
  return formatted.join('\n');
}

/**
 * Disassemble to LinxISA format (with highlighting info)
 */
export interface DisassemblyLine {
  address: string;
  bytes: string;
  instruction: string;
  raw: string;
}

export function disassembleToLines(binary: string): DisassemblyLine[] {
  const result = disassemble({
    binary,
    showRawInstructions: true,
  });
  
  if (!result.success) {
    return [];
  }
  
  const lines: DisassemblyLine[] = [];
  const outputLines = result.output.split('\n');
  
  for (const line of outputLines) {
    if (!line.trim() || line.includes('Disassembly of section')) {
      continue;
    }
    
    // Parse: address:  bytes  instruction
    const match = line.match(/^\s*([0-9a-f]+):\s+([0-9a-f ]+)\s+(.+)$/);
    if (match) {
      lines.push({
        address: match[1],
        bytes: match[2].trim(),
        instruction: match[3].trim(),
        raw: line,
      });
    }
  }
  
  return lines;
}

export default {
  disassemble,
  getSymbols,
  getSections,
  getHeaders,
  simpleDisassemble,
  disassembleToLines,
};
