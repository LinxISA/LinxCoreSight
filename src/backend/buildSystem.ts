/**
 * Build System
 * Compiles and links C/Assembly programs to ELF binaries
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, exec } from 'child_process';
import { detectToolchain, getBuildToolchainPaths } from './toolchainManager';

export interface BuildOptions {
  projectRoot: string;
  sourceFiles: string[];
  outputName?: string;
  optimizationLevel?: string;
  includeDebugSymbols?: boolean;
  verbose?: boolean;
}

export interface BuildResult {
  success: boolean;
  outputFile?: string;
  objectFiles: string[];
  errors: string[];
  warnings: string[];
  buildTimeMs?: number;
}

export interface CompilationUnit {
  source: string;
  object: string;
  success: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Ensure directory exists
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Compile a single C file to object file
 */
function compileFile(
  sourcePath: string,
  outputPath: string,
  options: BuildOptions,
  toolchain: ReturnType<typeof detectToolchain>
): CompilationUnit {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    const cflags = [
      '-target linx64',
      '-c',
      '-g',  // Always include debug symbols
      options.optimizationLevel || '-O0',
      '-Wall',
      '-Wextra',
    ].join(' ');
    
    const cmd = `${toolchain.paths.clang} ${cflags} "${sourcePath}" -o "${outputPath}"`;
    
    if (options.verbose) {
      console.log('Compiling:', cmd);
    }
    
    execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
    
    return {
      source: sourcePath,
      object: outputPath,
      success: true,
      errors: [],
      warnings: [],
    };
  } catch (error: any) {
    const errorMsg = error.stdout || error.stderr || String(error);
    errors.push(`Failed to compile ${path.basename(sourcePath)}:\n${errorMsg}`);
    
    return {
      source: sourcePath,
      object: outputPath,
      success: false,
      errors,
      warnings,
    };
  }
}

/**
 * Compile assembly file (.s) to object file
 */
function assembleFile(
  sourcePath: string,
  outputPath: string,
  options: BuildOptions,
  toolchain: ReturnType<typeof detectToolchain>
): CompilationUnit {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    const cmd = `${toolchain.paths.clang} -target linx64 -c -g "${sourcePath}" -o "${outputPath}"`;
    
    if (options.verbose) {
      console.log('Assembling:', cmd);
    }
    
    execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
    
    return {
      source: sourcePath,
      object: outputPath,
      success: true,
      errors: [],
      warnings: [],
    };
  } catch (error: any) {
    const errorMsg = error.stdout || error.stderr || String(error);
    errors.push(`Failed to assemble ${path.basename(sourcePath)}:\n${errorMsg}`);
    
    return {
      source: sourcePath,
      object: outputPath,
      success: false,
      errors,
      warnings,
    };
  }
}

/**
 * Link object files into ELF executable
 */
function linkFiles(
  objectFiles: string[],
  outputPath: string,
  options: BuildOptions,
  toolchain: ReturnType<typeof detectToolchain>
): { success: boolean; error?: string } {
  try {
    const ldflags = [
      `-T ${toolchain.paths.linkerScript}`,
      `-L${toolchain.paths.libc}`,
      '-llinx',
      '-g',
    ].join(' ');
    
    const objFilesStr = objectFiles.join(' ');
    const cmd = `${toolchain.paths.ld} ${ldflags} ${objFilesStr} -o "${outputPath}"`;
    
    if (options.verbose) {
      console.log('Linking:', cmd);
    }
    
    execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
    
    return { success: true };
  } catch (error: any) {
    const errorMsg = error.stdout || error.stderr || String(error);
    return { success: false, error: errorMsg };
  }
}

/**
 * Build the project
 */
export function buildProject(options: BuildOptions): BuildResult {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const objectFiles: string[] = [];
  
  // Detect toolchain
  const toolchain = detectToolchain();
  
  if (!toolchain.isValid) {
    return {
      success: false,
      objectFiles: [],
      errors: toolchain.errors,
      warnings: [],
    };
  }
  
  // Setup build directory
  const buildDir = path.join(options.projectRoot, 'build');
  const outputDir = path.join(options.projectRoot, 'output');
  ensureDir(buildDir);
  ensureDir(outputDir);
  
  const outputName = options.outputName || 'main';
  const outputPath = path.join(outputDir, `${outputName}.elf`);
  
  // Find source files
  const sourceExtensions = ['.c', '.C', '.cpp', '.cxx', '.s', '.S'];
  const sources = options.sourceFiles.length > 0
    ? options.sourceFiles
    : findSourceFiles(options.projectRoot, sourceExtensions);
  
  if (sources.length === 0) {
    return {
      success: false,
      objectFiles: [],
      errors: ['No source files found'],
      warnings: [],
    };
  }
  
  // Compile each source file
  for (const source of sources) {
    const basename = path.basename(source, path.extname(source));
    const objectPath = path.join(buildDir, `${basename}.o`);
    
    const ext = path.extname(source).toLowerCase();
    let result: CompilationUnit;
    
    if (ext === '.c' || ext === '.cpp' || ext === '.cxx') {
      result = compileFile(source, objectPath, options, toolchain);
    } else if (ext === '.s' || ext === '.S') {
      result = assembleFile(source, objectPath, options, toolchain);
    } else {
      continue;
    }
    
    if (result.success) {
      objectFiles.push(objectPath);
    } else {
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }
  }
  
  // If compilation failed, return early
  if (errors.length > 0) {
    return {
      success: false,
      objectFiles,
      errors,
      warnings,
    };
  }
  
  // Link object files
  const linkResult = linkFiles(objectFiles, outputPath, options, toolchain);
  
  if (!linkResult.success) {
    errors.push(`Linking failed: ${linkResult.error}`);
  }
  
  const buildTimeMs = Date.now() - startTime;
  
  return {
    success: errors.length === 0,
    outputFile: linkResult.success ? outputPath : undefined,
    objectFiles,
    errors,
    warnings,
    buildTimeMs,
  };
}

/**
 * Find all source files in a directory recursively
 */
function findSourceFiles(dir: string, extensions: string[]): string[] {
  const sources: string[] = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      // Skip hidden directories and common build directories
      if (entry.name.startsWith('.') || 
          entry.name === 'node_modules' ||
          entry.name === 'build' ||
          entry.name === 'output') {
        continue;
      }
      
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        sources.push(...findSourceFiles(fullPath, extensions));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          sources.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error('Error reading directory:', dir, error);
  }
  
  return sources;
}

/**
 * Quick compile single file
 */
export function quickCompile(
  sourcePath: string,
  outputPath: string,
  options: Partial<BuildOptions> = {}
): BuildResult {
  const projectRoot = path.dirname(sourcePath);
  
  return buildProject({
    projectRoot,
    sourceFiles: [sourcePath],
    outputName: path.basename(outputPath, '.elf'),
    optimizationLevel: options.optimizationLevel || '-O0',
    includeDebugSymbols: options.includeDebugSymbols ?? true,
    verbose: options.verbose ?? false,
  });
}

/**
 * Clean build directory
 */
export function cleanBuild(projectRoot: string): { success: boolean; error?: string } {
  try {
    const buildDir = path.join(projectRoot, 'build');
    const outputDir = path.join(projectRoot, 'output');
    
    if (fs.existsSync(buildDir)) {
      fs.rmSync(buildDir, { recursive: true });
    }
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true });
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export default {
  buildProject,
  quickCompile,
  cleanBuild,
};
