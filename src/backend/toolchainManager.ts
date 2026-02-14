/**
 * Toolchain Manager
 * Manages LinxISA toolchain binaries (clang, qemu, pycircuit)
 * Links/scans toolchain from source locations to IDE's private folder
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

export interface ToolchainPaths {
  llvm: string;
  clang: string;
  ld: string;
  objdump: string;
  llvmMc: string;
  qemu: string;
  libc: string;
  linkerScript: string;
  pyc: string;
  pycOpt: string;
}

export interface ToolchainInfo {
  version: string;
  clangVersion: string;
  qemuVersion: string;
  pycVersion: string;
  paths: ToolchainPaths;
  isValid: boolean;
  errors: string[];
}

// Default source locations (user's home directory). Override with env vars if needed.
const HOME = os.homedir();

const TOOLCHAIN_SOURCE_PATHS = {
  llvm: process.env.LINX_LLVM_BIN || path.join(HOME, 'llvm-project', 'build-linxisa-clang', 'bin'),
  qemu: process.env.LINX_QEMU_BIN || path.join(HOME, 'qemu', 'build-linx'),
  libc: process.env.LINX_LIBC_PATH || path.join(HOME, 'linx-libc'),
  pyc: process.env.PYC_BIN || path.join(HOME, 'pyCircuit', 'build-top', 'bin'),
};

/**
 * Check if a file exists
 */
function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * Get toolchain binary path
 */
function getToolchainBinary(basePath: string, binaryName: string): string {
  const fullPath = path.join(basePath, binaryName);
  if (fileExists(fullPath)) {
    return fullPath;
  }
  // Try without extension on macOS
  if (process.platform === 'darwin') {
    const macPath = path.join(basePath, `${binaryName}.app`, 'Contents', 'MacOS', binaryName);
    if (fileExists(macPath)) {
      return macPath;
    }
  }
  return fullPath;
}

/**
 * Get version string from a binary
 */
function getBinaryVersion(binaryPath: string, args: string[] = ['--version']): string {
  try {
    if (!fileExists(binaryPath)) {
      return 'Not found';
    }
    const output = execSync(`"${binaryPath}" ${args.join(' ')}`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    // Extract first line
    return output.split('\n')[0].trim();
  } catch (error) {
    return 'Error getting version';
  }
}

/**
 * Detect and validate toolchain installation
 */
export function detectToolchain(): ToolchainInfo {
  const errors: string[] = [];
  
  // Check LLVM/Clang
  const clangPath = getToolchainBinary(TOOLCHAIN_SOURCE_PATHS.llvm, 'clang');
  const ldPath = getToolchainBinary(TOOLCHAIN_SOURCE_PATHS.llvm, 'ld.lld');
  const objdumpPath = getToolchainBinary(TOOLCHAIN_SOURCE_PATHS.llvm, 'llvm-objdump');
  const llvmMcPath = getToolchainBinary(TOOLCHAIN_SOURCE_PATHS.llvm, 'llvm-mc');
  
  if (!fileExists(clangPath)) {
    errors.push(`Clang not found at: ${clangPath}`);
  }
  if (!fileExists(ldPath)) {
    errors.push(`Linker (ld.lld) not found at: ${ldPath}`);
  }
  
  // Check QEMU
  const qemuPath = getToolchainBinary(TOOLCHAIN_SOURCE_PATHS.qemu, 'qemu-system-linx64');
  if (!fileExists(qemuPath)) {
    errors.push(`QEMU not found at: ${qemuPath}`);
  }
  
  // Check libc
  const libcPath = TOOLCHAIN_SOURCE_PATHS.libc;
  const linkerScript = path.join(libcPath, 'linx.ld');
  const liblinx = path.join(libcPath, 'liblinx.a');
  
  if (!fileExists(libcPath)) {
    errors.push(`Libc not found at: ${libcPath}`);
  }
  if (!fileExists(linkerScript)) {
    errors.push(`Linker script not found at: ${linkerScript}`);
  }
  if (!fileExists(liblinx)) {
    errors.push(`Library (liblinx.a) not found at: ${liblinx}`);
  }
  
  // Check pycircuit
  const pycPath = getToolchainBinary(TOOLCHAIN_SOURCE_PATHS.pyc, 'pyc-compile');
  const pycOptPath = getToolchainBinary(TOOLCHAIN_SOURCE_PATHS.pyc, 'pyc-opt');
  
  if (!fileExists(pycPath)) {
    errors.push(`pyc-compile not found at: ${pycPath}`);
  }
  
  // Get versions
  const clangVersion = getBinaryVersion(clangPath, ['--version']);
  const qemuVersion = getBinaryVersion(qemuPath, ['--version']);
  const pycVersion = getBinaryVersion(pycPath, ['--version']);
  
  const paths: ToolchainPaths = {
    llvm: TOOLCHAIN_SOURCE_PATHS.llvm,
    clang: clangPath,
    ld: ldPath,
    objdump: objdumpPath,
    llvmMc: llvmMcPath,
    qemu: qemuPath,
    libc: libcPath,
    linkerScript,
    pyc: pycPath,
    pycOpt: pycOptPath,
  };
  
  return {
    version: '1.0.0',
    clangVersion,
    qemuVersion,
    pycVersion,
    paths,
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Setup toolchain in IDE's private folder (symlinks)
 */
export function setupToolchain(ideToolchainPath: string): { success: boolean; error?: string } {
  try {
    // Create toolchain directory
    const toolchainDir = path.join(ideToolchainPath, 'toolchains');
    if (!fs.existsSync(toolchainDir)) {
      fs.mkdirSync(toolchainDir, { recursive: true });
    }
    
    // Create subdirectories
    const llvmDir = path.join(toolchainDir, 'linx-llvm', 'bin');
    const qemuDir = path.join(toolchainDir, 'linx-qemu', 'bin');
    const libcDir = path.join(toolchainDir, 'linx-libc');
    
    // Create symlinks for LLVM
    if (fs.existsSync(TOOLCHAIN_SOURCE_PATHS.llvm) && !fs.existsSync(llvmDir)) {
      fs.symlinkSync(TOOLCHAIN_SOURCE_PATHS.llvm, llvmDir, 'junction');
    }
    
    // Create symlinks for QEMU
    if (fs.existsSync(TOOLCHAIN_SOURCE_PATHS.qemu) && !fs.existsSync(qemuDir)) {
      fs.symlinkSync(TOOLCHAIN_SOURCE_PATHS.qemu, qemuDir, 'junction');
    }
    
    // Create symlinks for libc
    if (fs.existsSync(TOOLCHAIN_SOURCE_PATHS.libc) && !fs.existsSync(libcDir)) {
      fs.symlinkSync(TOOLCHAIN_SOURCE_PATHS.libc, libcDir, 'junction');
    }
    
    console.log('Toolchain setup complete:', toolchainDir);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Get toolchain paths for building
 */
export function getBuildToolchainPaths(projectRoot: string): {
  CC: string;
  LD: string;
  CFLAGS: string;
  LDFLAGS: string;
  LIBPATH: string;
} {
  const toolchain = detectToolchain();
  
  return {
    CC: toolchain.paths.clang,
    LD: toolchain.paths.ld,
    CFLAGS: `-target linx64 -g -O0`,
    LDFLAGS: `-T ${toolchain.paths.linkerScript} -L${toolchain.paths.libc} -llinx`,
    LIBPATH: toolchain.paths.libc,
  };
}

export default {
  detectToolchain,
  setupToolchain,
  getBuildToolchainPaths,
};
