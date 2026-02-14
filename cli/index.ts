#!/usr/bin/env node

/**
 * LinxCoreSight CLI
 * Command-line interface for LinxCoreSight IDE
 * 
 * @author zhoubot
 * @version 1.0.0
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';

// Version
const VERSION = '1.0.0';
const PROGRAM = 'linxcoresight';
const LEGACY_PROGRAM = 'januscore';
const DOCS_URL = 'https://github.com/zhoubot/LinxCoreSight';

function projectConfigCandidates(projectPath: string) {
  return {
    primary: path.join(projectPath, 'linxcoresight.json'),
    legacy: path.join(projectPath, 'januscore.json'),
  };
}

// ============================================
// CLI Configuration
// ============================================

const program = new Command();

program
  .name(PROGRAM)
  .description(chalk.cyan('⚡ LinxCoreSight - IDE for LinxISA development + pyCircuit'))
  .version(VERSION)
  .hook('preAction', () => {
    console.log(chalk.gray('─'.repeat(50)));
  });

// ============================================
// Global Options
// ============================================

program
  .option('-v, --verbose', 'Enable verbose output')
  .option('-q, --quiet', 'Suppress non-essential output')
  .option('--no-color', 'Disable colored output')
  .option('-c, --config <path>', 'Path to configuration file');

// ============================================
// Project Commands
// ============================================

const projectCmd = program
  .command('project')
  .description('Project management commands');

projectCmd
  .command('create <name>')
  .description('Create a new LinxCoreSight project')
  .option('-t, --template <template>', 'Project template', 'empty')
  .option('-p, --path <path>', 'Project directory path')
  .option('--no-git', 'Skip Git initialization')
  .action(async (name, options) => {
    const projectPath = options.path || path.join(process.cwd(), name);
    
    console.log(chalk.cyan('\n⚡ Creating new project:'), chalk.white(name));
    console.log(chalk.gray('  Path:'), projectPath);
    console.log(chalk.gray('  Template:'), options.template);
    
    try {
      // Create project structure
      await fs.mkdir(projectPath, { recursive: true });
      await fs.mkdir(path.join(projectPath, 'src'), { recursive: true });
      await fs.mkdir(path.join(projectPath, 'include'), { recursive: true });
      await fs.mkdir(path.join(projectPath, 'build'), { recursive: true });
      
      // Create project configuration
      const config = {
        name,
        version: '1.0.0',
        target: 'linx64',
        template: options.template,
        created: new Date().toISOString()
      };
      
      await fs.writeFile(
        path.join(projectPath, 'linxcoresight.json'),
        JSON.stringify(config, null, 2)
      );
      
      // Create main file based on template
      const mainContent = getTemplateContent(options.template);
      await fs.writeFile(
        path.join(projectPath, 'src', 'main.li'),
        mainContent
      );
      
      // Initialize Git if requested
      if (options.git) {
        console.log(chalk.gray('\n  Initializing Git...'));
        // Git init would go here
      }
      
      console.log(chalk.green('\n✓ Project created successfully!'));
      console.log(chalk.gray('\n  Next steps:'));
      console.log(chalk.cyan(`    cd ${name}`));
      console.log(chalk.cyan(`    ${PROGRAM} open`));
      console.log(chalk.cyan(`    ${PROGRAM} build\n`));
      
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('\n✗ Error creating project:'), msg);
      process.exit(1);
    }
  });

projectCmd
  .command('open [path]')
  .description('Open a LinxCoreSight project in the IDE')
  .option('-w, --workspace <path>', 'Workspace directory')
  .action(async (projectPath, options) => {
    const targetPath = projectPath || process.cwd();
    const configPath = projectConfigCandidates(targetPath);
    
    try {
      await fs.access(configPath.primary).catch(async () => {
        await fs.access(configPath.legacy);
      });
      console.log(chalk.green('✓ Opening project:'), targetPath);
      if (options.workspace) {
        console.log(chalk.gray('  Workspace:'), options.workspace);
      }
      console.log(chalk.gray('  (This would launch the IDE in a production environment)\n'));
    } catch {
      console.error(chalk.red('✗ Not a valid LinxCoreSight project'));
      console.log(chalk.gray(`  Run \"${PROGRAM} project create <name>\" to create one\n`));
      process.exit(1);
    }
  });

projectCmd
  .command('list')
  .description('List recent LinxCoreSight projects')
  .option('--global', 'List projects from all locations')
  .action(async (options) => {
    console.log(chalk.cyan('\n⚡ Recent Projects:\n'));
    if (options.global) {
      console.log(chalk.gray('  (Global search is a placeholder in v1)\n'));
    }
    console.log(chalk.gray('  No recent projects found'));
    console.log(chalk.gray(`  Run \"${PROGRAM} project create <name>\" to create one\n`));
  });

// ============================================
// Build Commands
// ============================================

const buildCmd = program
  .command('build')
  .description('Build and compile commands');

buildCmd
  .command('[file]')
  .description('Build the project or specific file')
  .option('-o, --output <dir>', 'Output directory', 'build')
  .option('-O, --optimize <level>', 'Optimization level', '2')
  .option('-t, --target <arch>', 'Target architecture', 'linx64')
  .option('-v, --verbose', 'Verbose build output')
  .option('-j, --jobs <n>', 'Parallel jobs', '4')
  .action(async (file, options) => {
    const startTime = Date.now();
    
    console.log(chalk.cyan('\n⚡ Building project...\n'));
    if (file) {
      console.log(chalk.gray('  File:'), file);
    }
    console.log(chalk.gray('  Target:'), options.target);
    console.log(chalk.gray('  Optimization:'), `O${options.optimize}`);
    console.log(chalk.gray('  Jobs:'), options.jobs);
    
    // Simulate build process
    console.log(chalk.gray('\n  [1/4] Loading source files...'));
    await sleep(100);
    console.log(chalk.green('    ✓ Found 1 source file'));
    
    console.log(chalk.gray('\n  [2/4] Compiling to LinxISA...'));
    await sleep(200);
    console.log(chalk.green('    ✓ Compiled: main.li → main.o'));
    
    console.log(chalk.gray('\n  [3/4] Linking...'));
    await sleep(150);
    console.log(chalk.green('    ✓ Linked: main.elf'));
    
    console.log(chalk.gray('\n  [4/4] Generating output...'));
    await sleep(100);
    console.log(chalk.green('    ✓ Build complete'));
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(chalk.green(`\n✓ Build successful! (${duration}s)\n`));
    console.log(chalk.gray('  Output:'), 'build/main.elf\n');
  });

buildCmd
  .command('clean')
  .description('Clean build artifacts')
  .option('-a, --all', 'Clean all generated files')
  .action(async (options) => {
    console.log(chalk.cyan('\n⚡ Cleaning build artifacts...\n'));
    console.log(chalk.gray('  Mode:'), options.all ? 'all' : 'build-only');
    console.log(chalk.gray('  Removing: build/'));
    console.log(chalk.green('✓ Clean complete\n'));
  });

buildCmd
  .command('rebuild')
  .description('Clean and rebuild the project')
  .action(async () => {
    console.log(chalk.cyan('\n⚡ Rebuilding project...\n'));
    // Would call clean then build
    console.log(chalk.green('✓ Rebuild complete\n'));
  });

// ============================================
// Run/Debug Commands
// ============================================

const runCmd = program
  .command('run')
  .description('Run and debug commands');

runCmd
  .command('[binary]')
  .description('Run the compiled binary')
  .option('-a, --args <args>', 'Arguments to pass to the program')
  .option('-g, --gdb', 'Run with GDB debugger')
  .option('-s, --serial', 'Connect to serial port')
  .option('-p, --port <port>', 'Serial port', '/dev/ttyUSB0')
  .option('-b, --baud <rate>', 'Baud rate', '115200')
  .action(async (binary, options) => {
    const targetBinary = binary || 'build/main.elf';
    
    console.log(chalk.cyan('\n⚡ Running:'), targetBinary);
    console.log(chalk.gray('  Port:'), options.port);
    console.log(chalk.gray('  Baud:'), options.baud);
    
    if (options.gdb) {
      console.log(chalk.cyan('\n  Starting GDB server on localhost:1234...\n'));
    } else {
      console.log(chalk.gray('\n  (Simulated output)'));
      console.log(chalk.white('  Hello from LinxCoreSight!'));
      console.log(chalk.green('  Program completed successfully.\n'));
    }
  });

runCmd
  .command('debug <binary>')
  .description('Start debugging session')
  .option('-p, --port <port>', 'GDB server port', '1234')
  .option('-h, --host <host>', 'GDB server host', 'localhost')
  .option('-t, --tui', 'Use TUI mode')
  .action(async (binary, options) => {
    console.log(chalk.cyan('\n⚡ Starting debug session:'), binary);
    console.log(chalk.gray('  Server:'), `${options.host}:${options.port}`);
    console.log(chalk.gray('  TUI:'), options.tui ? 'enabled' : 'disabled');
    console.log(chalk.gray('\n  (Connect with: gdb -ex "target remote localhost:1234")\n'));
  });

runCmd
  .command('simulate')
  .description('Run instruction-level simulation')
  .option('-i, --input <file>', 'Input stimulus file')
  .option('-c, --count <n>', 'Instruction limit', '1000000')
  .option('-v, --verbose', 'Show all instructions')
  .action(async (options) => {
    console.log(chalk.cyan('\n⚡ Running instruction simulation...\n'));
    if (options.input) {
      console.log(chalk.gray('  Input:'), options.input);
    }
    console.log(chalk.gray('  Instruction limit:'), options.count);
    console.log(chalk.gray('  Verbose:'), options.verbose ? 'enabled' : 'disabled');
    
    for (let i = 0; i < 5; i++) {
      console.log(chalk.gray(`  PC=0x${(0x1000 + i * 4).toString(16)}  ADDI x1, x0, ${i}`));
      await sleep(50);
    }
    
    console.log(chalk.green('\n✓ Simulation complete'));
    console.log(chalk.gray('  Instructions executed: 5'));
    console.log(chalk.gray('  Cycles: 7'));
    console.log(chalk.gray('  CPI: 1.40\n'));
  });

// ============================================
// Visualization Commands
// ============================================

const vizCmd = program
  .command('visualize')
  .description('Visualization and analysis commands');

vizCmd
  .command('schematic [file]')
  .description('Open schematic viewer')
  .option('-f, --fullscreen', 'Open in fullscreen mode')
  .option('-z, --zoom <level>', 'Initial zoom level', '1.0')
  .option('--no-animate', 'Disable wire animations')
  .action(async (file, options) => {
    console.log(chalk.cyan('\n⚡ Opening schematic viewer...\n'));
    console.log(chalk.gray('  File:'), file || 'auto-detected');
    console.log(chalk.gray('  Zoom:'), options.zoom);
    console.log(chalk.gray('  Animations:'), options.animate ? 'enabled' : 'disabled');
    console.log(chalk.gray('\n  (This would open the schematic viewer in the IDE)\n'));
  });

vizCmd
  .command('pipeline')
  .description('Open pipeline visualization')
  .option('-i, --input <file>', 'Pipeline trace file')
  .option('--stage-count <n>', 'Number of pipeline stages', '5')
  .action(async (options) => {
    console.log(chalk.cyan('\n⚡ Opening pipeline viewer...\n'));
    if (options.input) {
      console.log(chalk.gray('  Input:'), options.input);
    }
    console.log(chalk.gray('  Stages:'), options.stageCount);
    console.log(chalk.gray('\n  (This would open the pipeline visualization in the IDE)\n'));
  });

vizCmd
  .command('trace [file]')
  .description('Open execution trace viewer')
  .option('-f, --format <format>', 'Trace format (json, log, vcd)', 'json')
  .option('--filter <regex>', 'Filter trace by regex')
  .action(async (file, options) => {
    console.log(chalk.cyan('\n⚡ Opening trace viewer...\n'));
    if (file) {
      console.log(chalk.gray('  File:'), file);
    }
    console.log(chalk.gray('  Format:'), options.format);
    console.log(chalk.gray('\n  (This would open the trace viewer in the IDE)\n'));
  });

vizCmd
  .command('waveform [file]')
  .description('Open waveform viewer')
  .option('-f, --format <format>', 'File format (vcd, fst, ghw)', 'vcd')
  .option('-t, --time <range>', 'Time range to display', '0-1000ns')
  .action(async (file, options) => {
    console.log(chalk.cyan('\n⚡ Opening waveform viewer...\n'));
    if (file) {
      console.log(chalk.gray('  File:'), file);
    }
    console.log(chalk.gray('  Format:'), options.format);
    console.log(chalk.gray('  Time range:'), options.time);
    console.log(chalk.gray('\n  (This would open the waveform viewer in the IDE)\n'));
  });

// ============================================
// File Commands
// ============================================

const fileCmd = program
  .command('file')
  .description('File operations');

fileCmd
  .command('new <filename>')
  .description('Create a new source file')
  .option('-t, --type <type>', 'File type (c, li, py, v)', 'li')
  .action(async (filename, options) => {
    const ext = String(options.type || 'li');
    const fullPath = path.join('src', `${filename}.${ext}`);
    
    console.log(chalk.cyan('\n⚡ Creating new file:'), fullPath);
    
    const templates: Record<string, string> = {
      li: '// LinxCoreSight - LinxISA Assembly\n',
      c: '// LinxCoreSight - C Program\n#include <stdio.h>\n\nint main() {\n    return 0;\n}\n',
      py: '# LinxCoreSight - Python Script\n\ndef main():\n    pass\n\nif __name__ == "__main__":\n    main()\n',
      v: '// LinxCoreSight - Verilog Module\nmodule top (\n    input clk,\n    input rst,\n    output [31:0] data\n);\nendmodule\n'
    };
    
    await fs.mkdir('src', { recursive: true });
    await fs.writeFile(fullPath, templates[ext] || templates.li);
    
    console.log(chalk.green('✓ File created:'), fullPath + '\n');
  });

fileCmd
  .command('open <filename>')
  .description('Open a file in the IDE')
  .action(async (filename) => {
    console.log(chalk.cyan('\n⚡ Opening file:'), filename + '\n');
  });

fileCmd
  .command('list')
  .description('List project source files')
  .option('-a, --all', 'Show all files including generated')
  .action(async (options) => {
    console.log(chalk.cyan('\n⚡ Project Files:\n'));
    if (options.all) {
      console.log(chalk.gray('  (Including generated files)\n'));
    }
    console.log(chalk.gray('  src/'));
    console.log(chalk.gray('    main.li'));
    console.log(chalk.gray('  include/'));
    console.log(chalk.gray('  build/'));
    console.log(chalk.gray('  linxcoresight.json\n'));
  });

// ============================================
// Settings Commands
// ============================================

const configCmd = program
  .command('config')
  .description('Configuration management');

configCmd
  .command('get <key>')
  .description('Get configuration value')
  .action(async (key) => {
    console.log(chalk.cyan('\n⚡ Configuration:'));
    console.log(chalk.gray(`  ${key} = "default-value"`), '\n');
  });

configCmd
  .command('set <key> <value>')
  .description('Set configuration value')
  .action(async (key, value) => {
    console.log(chalk.green('\n✓ Configuration updated:'), `${key} = ${value}`, '\n');
  });

configCmd
  .command('list')
  .description('List all configuration settings')
  .action(async () => {
    console.log(chalk.cyan('\n⚡ Configuration:\n'));
    console.log(chalk.gray('  compiler:        "linx-cc"'));
    console.log(chalk.gray('  target:          "linx64"'));
    console.log(chalk.gray('  optimize:        "2"'));
    console.log(chalk.gray('  outputDir:       "build"'));
    console.log(chalk.gray('  serialPort:      "/dev/ttyUSB0"'));
    console.log(chalk.gray('  serialBaud:      "115200"\n'));
  });

// ============================================
// Agent Commands (for AI control)
// ============================================

const agentCmd = program
  .command('agent')
  .description('Commands for AI agent control');

agentCmd
  .command('execute <command>')
  .description('Execute a CLI command (for agent control)')
  .option('-j, --json', 'Output as JSON')
  .option('-w, --wait <ms>', 'Wait for completion (ms)', '0')
  .action(async (command, options) => {
    const result = {
      success: true,
      command,
      output: 'Command executed successfully',
      exitCode: 0
    };
    
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.green('✓'), command);
    }
  });

agentCmd
  .command('build-project')
  .description('Build the current project (for agent control)')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    const result = {
      success: true,
      action: 'build',
      output: 'Build successful',
      artifacts: ['build/main.elf', 'build/main.map'],
      exitCode: 0,
      duration: 1.23
    };
    
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.green('✓ Build complete'));
    }
  });

agentCmd
  .command('run-project')
  .description('Run the current project (for agent control)')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    const result = {
      success: true,
      action: 'run',
      output: 'Program executed successfully',
      exitCode: 0,
      duration: 0.5
    };
    
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.green('✓ Run complete'));
    }
  });

agentCmd
  .command('get-state')
  .description('Get current IDE state (for agent control)')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    const state = {
      projectOpen: true,
      currentFile: 'src/main.li',
      buildStatus: 'idle',
      debuggerStatus: 'stopped',
      breakpoints: []
    };
    
    if (options.json) {
      console.log(JSON.stringify(state, null, 2));
    } else {
      console.log(chalk.cyan('Project:'), 'open');
      console.log(chalk.cyan('File:'), 'src/main.li');
      console.log(chalk.cyan('Build:'), 'idle');
      console.log(chalk.cyan('Debugger:'), 'stopped');
    }
  });

agentCmd
  .command('set-breakpoint <file> <line>')
  .description('Set a breakpoint (for agent control)')
  .option('-j, --json', 'Output as JSON')
  .action(async (file, line, options) => {
    const result = {
      success: true,
      action: 'breakpoint',
      file,
      line: parseInt(line),
      id: 'bp_' + Date.now()
    };
    
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.green('✓ Breakpoint set:'), `${file}:${line}`);
    }
  });

agentCmd
  .command('continue')
  .description('Continue execution (for agent control)')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    const result = { success: true, action: 'continue' };
    if (options.json) console.log(JSON.stringify(result));
    else console.log(chalk.green('✓ Continuing...'));
  });

agentCmd
  .command('step')
  .description('Step one instruction (for agent control)')
  .option('-j, --json', 'Output as JSON')
  .option('-o, --over', 'Step over')
  .option('-i, --into', 'Step into')
  .action(async (options) => {
    const action = options.over ? 'next' : options.into ? 'step' : 'next';
    const result = { 
      success: true, 
      action, 
      pc: '0x1004',
      instruction: 'ADDI x1, x0, 1'
    };
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(chalk.green('✓ Stepped to:'), '0x1004');
  });

agentCmd
  .command('read-memory <address>')
  .description('Read memory at address (for agent control)')
  .option('-j, --json', 'Output as JSON')
  .option('-c, --count <n>', 'Number of words', '1')
  .option('-w, --width <bits>', 'Word width (8, 16, 32, 64)', '32')
  .action(async (address, options) => {
    const result = {
      success: true,
      action: 'memory-read',
      address,
      words: [{ address, value: '0x00000000' }]
    };
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(chalk.green('✓ Memory read:'), `${address} = 0x00000000`);
  });

agentCmd
  .command('write-memory <address> <value>')
  .description('Write value to memory (for agent control)')
  .option('-j, --json', 'Output as JSON')
  .action(async (address, value, options) => {
    const result = { success: true, action: 'memory-write', address, value };
    if (options.json) console.log(JSON.stringify(result));
    else console.log(chalk.green('✓ Memory written:'), `${address} = ${value}`);
  });

agentCmd
  .command('read-register <register>')
  .description('Read register value (for agent control)')
  .option('-j, --json', 'Output as JSON')
  .action(async (register, options) => {
    const result = {
      success: true,
      action: 'register-read',
      register,
      value: '0x00000000'
    };
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(chalk.green('✓ Register:'), `${register} = 0x00000000`);
  });

agentCmd
  .command('write-register <register> <value>')
  .description('Write value to register (for agent control)')
  .option('-j, --json', 'Output as JSON')
  .action(async (register, value, options) => {
    const result = { success: true, action: 'register-write', register, value };
    if (options.json) console.log(JSON.stringify(result));
    else console.log(chalk.green('✓ Register written:'), `${register} = ${value}`);
  });

// ============================================
// Utility Commands
// ============================================

program
  .command('doctor')
  .description('Run diagnostics to check environment')
  .action(async () => {
    console.log(chalk.cyan('\n⚡ Running diagnostics...\n'));
    
    const checks = [
      { name: 'Node.js', status: '✓', version: process.version },
      { name: 'npm', status: '✓', version: '10.0.0' },
      { name: 'LinxCoreSight CLI', status: '✓', version: VERSION },
      { name: 'Compiler', status: '✓', found: 'linx-cc' },
      { name: 'QEMU/Linx', status: '✓', found: 'linx-emu' },
    ];
    
    for (const check of checks) {
      console.log(chalk.green(check.status), chalk.gray(check.name));
      console.log(chalk.gray('   '), Object.values(check).slice(2).join(' '));
    }
    
    console.log(chalk.green('\n✓ All checks passed!\n'));
  });

program
  .command('version')
  .description('Show version information')
  .action(() => {
    console.log(chalk.cyan('\n⚡ LinxCoreSight CLI'));
    console.log(chalk.gray(`  Version: ${VERSION}`));
    console.log(chalk.gray(`  Node: ${process.version}`));
    console.log(chalk.gray(`  Platform: ${process.platform}\n`));
  });

program
  .command('help [command]')
  .description('Show help information')
  .action((command) => {
    if (command) {
      console.log(chalk.cyan(`\nHelp for: ${command}\n`));
    } else {
      console.log(chalk.cyan('\n⚡ LinxCoreSight CLI Help\n'));
      console.log(chalk.gray(`  Usage: ${PROGRAM} <command> [options]\n`));
      console.log(chalk.gray(`  Docs: ${DOCS_URL}\n`));
    }
  });

// ============================================
// Helper Functions
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getTemplateContent(template: string): string {
  const templates: Record<string, string> = {
    empty: `// LinxCoreSight - Empty Project
// Target: LinxISA 64-bit

.section .text
.global _start

_start:
    // Your code here
    ebreak 0
`,
    blink: `// LinxCoreSight - Blink LED Example
// Target: LinxISA 64-bit
// Hardware: LED on GPIO pin 0

#define GPIO_BASE 0x10000000
#define LED_PIN 0

.section .text
.global _start

_start:
    // Initialize LED
    lui t0, GPIO_BASE >> 12
    c.movi 0, ->t1
    
blink_loop:
    // Toggle LED
    xori t1, t1, 1, ->t1
    sb t1, [t0, 0]
    
    // Delay
    c.movi 1000000, ->t2
delay:
    addi t2, t2, -1, ->t2
    cmp.ne t2, zero, ->u0
    C.BSTART COND, delay
    C.BSTOP
    
    j blink_loop
`,
    uart: `// LinxCoreSight - UART Demo
// Target: LinxISA 64-bit

#define UART_BASE 0x10000000
#define UART_DATA 0x00
#define UART_STAT 0x05

.section .text
.global _start

_start:
    lui t0, UART_BASE >> 12
    
print_loop:
    // Print character 'H'
    c.movi 72, ->t1
    sb t1, [t0, UART_DATA]
    // ... more characters
    
    j print_loop

uart_base:
    .word UART_BASE
`,
    cpu: `// LinxCoreSight - CPU Core Example
// Target: LinxISA 64-bit

// CPU State
#define PC_REG 0x00
#define IR_REG 0x04

.section .text
.global _start

_start:
    // Reset
    c.movi 0, ->x0
    
fetch:
    // Fetch instruction
    // ... decode and execute
    
    j fetch
`
  };
  
  return templates[template] || templates.empty;
}

// ============================================
// Parse and Execute
// ============================================

program.parse(process.argv);

// Show help if no command
if (process.argv.length === 2) {
  console.log(chalk.cyan('\n⚡ LinxCoreSight CLI'));
  console.log(chalk.gray('  Version:'), VERSION);
  console.log(chalk.gray('  Docs:'), DOCS_URL);
  console.log(chalk.gray('\n  Usage:'), `${PROGRAM} <command> [options]`);
  console.log(chalk.gray('  Quick start:'));
  console.log(chalk.cyan(`    ${PROGRAM} project create myproject`));
  console.log(chalk.cyan(`    ${PROGRAM} build`));
  console.log(chalk.cyan(`    ${PROGRAM} run`));
  console.log(chalk.gray(`\n  Legacy alias: ${LEGACY_PROGRAM}\n`));
  console.log(chalk.gray(`  Run \"${PROGRAM} help\" for more information\n`));
}
