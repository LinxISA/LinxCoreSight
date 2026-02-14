/**
 * Backend Index
 * Exports all backend modules
 */

// Toolchain management
export { detectToolchain, setupToolchain, getBuildToolchainPaths } from './toolchainManager';
export type { ToolchainPaths, ToolchainInfo } from './toolchainManager';

// Build system
export { buildProject, quickCompile, cleanBuild } from './buildSystem';
export type { BuildOptions, BuildResult, CompilationUnit } from './buildSystem';

// Emulator runner
export { 
  runEmulator, 
  runEmulatorAsync, 
  stopEmulator, 
  stopAllEmulators, 
  getRunningEmulators,
  runWithGDB 
} from './emulatorRunner';
export type { EmulatorOptions, EmulatorResult, EmulatorProcess } from './emulatorRunner';

// Disassembler
export { 
  disassemble, 
  getSymbols, 
  getSections, 
  getHeaders, 
  simpleDisassemble,
  disassembleToLines 
} from './disassembler';
export type { 
  DisassembleOptions, 
  DisassemblyResult, 
  SymbolInfo, 
  SectionInfo,
  DisassemblyLine 
} from './disassembler';

// pyCircuit runner
export { 
  pycCompile, 
  pycSimulate, 
  pycSimulateAsync, 
  stopSimulation, 
  stopAllSimulations,
  fullPipeline 
} from './pycircuitRunner';
export type { 
  PycOptions, 
  PycResult, 
  SimOptions, 
  SimResult 
} from './pycircuitRunner';
