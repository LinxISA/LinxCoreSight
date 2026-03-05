import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import path from 'path';
import log from 'electron-log';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';

// Try to import serialport
let SerialPort: any = null;
try {
  SerialPort = require('serialport');
} catch (e) {
  log.warn('SerialPort not available:', e);
}

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.info('LinxCoreSight starting...');

// Global exception handlers
process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error);
  app.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection:', reason);
});

let mainWindow: BrowserWindow | null = null;
let mainWindowReady = false;
let qemuProcess: ChildProcess | null = null;
let managedRunProcess: ChildProcess | null = null;
let serialPort: any = null;
let pendingTraceOpenPath: string | null = null;
let uiSnapshotHook: ((reason: string) => Promise<void>) | null = null;
const TRACE_META_READER_CHUNK_SIZE = 256 * 1024;
const TRACE_META_READER_RETRIES = 6;
const TRACE_META_READER_RETRY_MS = 120;

type TraceFileSession = {
  sessionId: number;
  tracePath: string;
  fd: number;
  sizeBytes: number;
  mtimeMs: number;
};

const traceSessions = new Map<number, TraceFileSession>();
let traceSessionCounter = 1;

// Canvas-heavy trace rendering is more stable without GPU compositing on some Macs.
app.disableHardwareAcceleration();

// Force production mode for now - check if we're in packaged app
const isProd = app.isPackaged;
const isDev = !isProd && process.env.NODE_ENV !== 'production';
const UI_SNAPSHOT_ENV = process.env.LCS_UI_SNAPSHOT || process.env.LINXCORESIGHT_UI_SNAPSHOT || '';
const UI_SNAPSHOT_ARG = process.argv.includes('--ui-snapshot');
const UI_SNAPSHOT_ENABLED = UI_SNAPSHOT_ENV === '1' || UI_SNAPSHOT_ENV.toLowerCase() === 'true' || UI_SNAPSHOT_ARG;

log.info('App packaging status:', {
  isPackaged: app.isPackaged,
  isDev,
  nodeEnv: process.env.NODE_ENV,
  uiSnapshotEnabled: UI_SNAPSHOT_ENABLED,
});

// Handle renderer process errors
app.on('render-process-gone', (_event, _details) => {
  log.error('Renderer process gone');
});

app.on('unresponsive', () => {
  log.warn('Window became unresponsive');
});

app.on('responsive', () => {
  log.info('Window became responsive again');
});

function resolveFirstExisting(candidates: string[]): string {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0] || '';
}

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

function terminateChildProcess(proc: ChildProcess | null, label: string): boolean {
  if (!proc) {
    return false;
  }

  try {
    const pid = proc.pid;
    if (pid && process.platform !== 'win32') {
      process.kill(-pid, 'SIGTERM');
    } else {
      proc.kill('SIGTERM');
    }
    log.info(`Terminated ${label}`, { pid: proc.pid });
    return true;
  } catch (error) {
    log.warn(`Failed to terminate ${label} gracefully`, error);
    try {
      proc.kill('SIGKILL');
      return true;
    } catch (_killError) {
      return false;
    }
  }
}

// Toolchain paths - detect and configure automatically
function getToolchainPaths() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const appDir = app.isPackaged 
    ? path.join(process.resourcesPath, 'toolchains')
    : path.join(__dirname, '..', 'toolchains');

  const bundledQemuCandidates = [
    path.join(appDir, 'qemu', 'build-linx', 'qemu-system-linx64'),
    path.join(appDir, 'qemu', 'build', 'qemu-system-linx64'),
    path.join(appDir, 'qemu', 'build-tci', 'qemu-system-linx64'),
  ];
  const localQemuCandidates = [
    path.join(homeDir, 'qemu', 'build-linx', 'qemu-system-linx64'),
    path.join(homeDir, 'qemu', 'build', 'qemu-system-linx64'),
    path.join(homeDir, 'qemu', 'build-tci', 'qemu-system-linx64'),
  ];
  const bundledLlvmBin = path.join(appDir, 'llvm-project', 'build-linxisa-clang', 'bin');
  const localLlvmBin = path.join(homeDir, 'llvm-project', 'build-linxisa-clang', 'bin');
  const llvmBin = resolveFirstExisting([bundledLlvmBin, localLlvmBin]);
  const linxisaRoot = resolveFirstExisting([
    path.join(appDir, 'linx-isa'),
    path.join(appDir, 'linxisa'),
    path.join(homeDir, 'linx-isa'),
    path.join(homeDir, 'linxisa'),
  ]);

  return {
    qemu: resolveFirstExisting([...bundledQemuCandidates, ...localQemuCandidates]),
    clang: path.join(llvmBin, 'clang'),
    clangxx: path.join(llvmBin, 'clang++'),
    lld: path.join(llvmBin, 'ld.lld'),
    pyCircuit: resolveFirstExisting([
      path.join(appDir, 'pyCircuit'),
      path.join(homeDir, 'pyCircuit'),
    ]),
    linxisa: linxisaRoot,
    workDir: path.join(homeDir, 'LinxCoreSight', 'workspace')
  };
}

// Check if toolchain exists
function checkToolchain() {
  const tools = getToolchainPaths();
  const results: Record<string, boolean> = {};
  
  try {
    results.qemu = fs.existsSync(tools.qemu) && isExecutable(tools.qemu);
    results.clang = fs.existsSync(tools.clang) && isExecutable(tools.clang);
    results.clangxx = fs.existsSync(tools.clangxx) && isExecutable(tools.clangxx);
    results.lld = fs.existsSync(tools.lld) && isExecutable(tools.lld);
    results.pyCircuit = fs.existsSync(tools.pyCircuit);
    results.linxisa = fs.existsSync(tools.linxisa);
  } catch (e) {
    log.error('Error checking toolchain:', e);
  }
  
  log.info('Toolchain status:', results);
  return { tools, results };
}

function getRepoRoot(): string {
  return path.join(__dirname, '..');
}

function normalizeTemplateId(template: string): string {
  if (template === 'drystone') {
    return 'dhrystone';
  }
  return template;
}

function copyDirectoryRecursive(sourceDir: string, destinationDir: string): void {
  fs.mkdirSync(destinationDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const srcPath = path.join(sourceDir, entry.name);
    const dstPath = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function createWindow() {
  log.info('Creating main window...');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: true,
    backgroundColor: '#0a0e14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      devTools: true
    },
    show: false,
    titleBarStyle: 'default'
  });

  // Create application menu
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New File', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu:new-file') },
        { label: 'Open File...', accelerator: 'CmdOrCtrl+O', click: () => mainWindow?.webContents.send('menu:open-file') },
        { label: 'Open Folder...', accelerator: 'CmdOrCtrl+Shift+O', click: () => mainWindow?.webContents.send('menu:open-folder') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => mainWindow?.webContents.send('menu:save') },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow?.webContents.send('menu:save-as') },
        { type: 'separator' },
        { label: 'Exit', accelerator: 'Alt+F4', click: () => app.quit() }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Build',
      submenu: [
        { label: 'Compile', accelerator: 'CmdOrCtrl+B', click: () => mainWindow?.webContents.send('menu:compile') },
        { label: 'Run', accelerator: 'F5', click: () => mainWindow?.webContents.send('menu:run') },
        { type: 'separator' },
        { label: 'Stop', accelerator: 'Shift+F5', click: () => mainWindow?.webContents.send('menu:stop') }
      ]
    },
    {
      label: 'Debug',
      submenu: [
        { label: 'Start Debugging', accelerator: 'F5', click: () => mainWindow?.webContents.send('menu:debug') },
        { label: 'Stop Debugging', accelerator: 'Shift+F5', click: () => mainWindow?.webContents.send('menu:stop') },
        { type: 'separator' },
        { label: 'Step Over', accelerator: 'F10', click: () => mainWindow?.webContents.send('menu:step-over') },
        { label: 'Step Into', accelerator: 'F11', click: () => mainWindow?.webContents.send('menu:step-into') },
        { label: 'Step Out', accelerator: 'Shift+F11', click: () => mainWindow?.webContents.send('menu:step-out') },
        { type: 'separator' },
        { label: 'Toggle Breakpoint', accelerator: 'F9', click: () => mainWindow?.webContents.send('menu:toggle-breakpoint') }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Documentation', click: () => shell.openExternal('https://github.com/zhoubot/LinxCoreSight') },
        { label: 'About LinxCoreSight', click: () => mainWindow?.webContents.send('menu:about') }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  const captureRendererDomSnapshot = async (reason: string) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const snapshot = await mainWindow.webContents.executeJavaScript(`(() => {
        const imgs = Array.from(document.querySelectorAll('img')).map((img) => {
          const r = img.getBoundingClientRect();
          return { src: img.getAttribute('src') || '', w: r.width, h: r.height, x: r.x, y: r.y };
        });
        const canvases = Array.from(document.querySelectorAll('canvas')).map((c) => {
          const r = c.getBoundingClientRect();
          return { w: r.width, h: r.height, x: r.x, y: r.y };
        });
        const body = getComputedStyle(document.body).backgroundColor;
        const rootEl = document.getElementById('root');
        const rootBg = rootEl ? getComputedStyle(rootEl).backgroundColor : 'n/a';
        const rootRect = rootEl ? rootEl.getBoundingClientRect() : { width: -1, height: -1 };
        const text = rootEl ? (rootEl.textContent || '').slice(0, 240) : '';
        return {
          title: document.title,
          bodyBg: body,
          rootBg,
          rootW: rootRect.width,
          rootH: rootRect.height,
          rootText: text,
          imgCount: imgs.length,
          imgs,
          canvasCount: canvases.length,
          canvases,
        };
      })()`);
      log.info('Renderer DOM snapshot', { reason, snapshot } as any);
    } catch (error) {
      log.warn('Renderer DOM snapshot failed', { reason, error } as any);
    }
  };
  uiSnapshotHook = captureRendererDomSnapshot;

  mainWindow.webContents.on('did-finish-load', () => {
    log.info('Renderer did-finish-load');
    mainWindowReady = true;
    if (pendingTraceOpenPath) {
      mainWindow?.webContents.send('trace:open', pendingTraceOpenPath);
      pendingTraceOpenPath = null;
    }
    if (UI_SNAPSHOT_ENABLED) {
      setTimeout(() => {
        void captureRendererDomSnapshot('did-finish-load+2500ms');
      }, 2500);
      setTimeout(() => {
        void captureRendererDomSnapshot('did-finish-load+7000ms');
      }, 7000);
    }
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    log.error('Renderer did-fail-load', { errorCode, errorDescription, validatedURL });
    void captureRendererDomSnapshot('did-fail-load');
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log.error('Renderer process gone', details);
    void captureRendererDomSnapshot('render-process-gone');
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2 || /error|exception|failed|trace load timeout/i.test(message)) {
      log.error('Renderer console', { level, message, line, sourceId });
    }
  });

  mainWindow.on('ready-to-show', () => {
    log.info('Window ready to show');
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    uiSnapshotHook = null;
    terminateChildProcess(qemuProcess, 'qemu process');
    qemuProcess = null;
    terminateChildProcess(managedRunProcess, 'managed run process');
    managedRunProcess = null;
    for (const sessionId of traceSessions.keys()) {
      closeTraceSession(sessionId);
    }
  });

  // Load the app
  if (isDev) {
    log.info('Loading dev server...');
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    log.info('Loading production build...');
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Open DevTools for debugging (disabled)
  // mainWindow.webContents.openDevTools();

  log.info('Main window created successfully');
}

function isLinxTracePath(p: string): boolean {
  return p.endsWith('.linxtrace');
}

function assertCanonicalLinxTracePath(normalized: string): void {
  if (normalized.endsWith('.gz')) {
    throw new Error(`unsupported trace artifact: ${normalized} (compressed traces are disabled; regenerate as *.linxtrace)`);
  }
  if (normalized.endsWith('.linxtrace.jsonl') || normalized.endsWith('.linxtrace.meta.json') || normalized.endsWith('.jsonl') || normalized.endsWith('.meta.json')) {
    throw new Error(`unsupported legacy trace artifact: ${normalized} (expected single-file *.linxtrace with in-band META)`);
  }
  if (!isLinxTracePath(normalized)) {
    throw new Error(`unsupported trace extension: ${normalized} (expected *.linxtrace)`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readNextLine(fd: number, startOffset: number): { nextOffset: number; line: string; found: boolean } {
  const readBuf = Buffer.allocUnsafe(TRACE_META_READER_CHUNK_SIZE);
  const parts: Buffer[] = [];
  let partsLen = 0;
  let offset = startOffset;

  while (true) {
    const n = fs.readSync(fd, readBuf, 0, TRACE_META_READER_CHUNK_SIZE, offset);
    if (n <= 0) {
      if (partsLen === 0) {
        return { nextOffset: offset, line: '', found: false };
      }
      const line = Buffer.concat(parts, partsLen).toString('utf8');
      return { nextOffset: offset, line, found: true };
    }

    const chunk = readBuf.subarray(0, n);
    let cursor = 0;
    while (cursor < n) {
      const nl = chunk.indexOf('\n', cursor);
      if (nl < 0) {
        const tail = chunk.subarray(cursor, n);
        if (tail.length > 0) {
          parts.push(Buffer.from(tail));
          partsLen += tail.length;
        }
        offset += tail.length;
        break;
      }

      if (nl > cursor) {
        const linePart = chunk.subarray(cursor, nl);
        parts.push(Buffer.from(linePart));
        partsLen += linePart.length;
      }

      const line = partsLen > 0 ? Buffer.concat(parts, partsLen).toString('utf8') : '';
      if (line.trim().length > 0) {
        return { nextOffset: offset + nl + 1, line: line.trim(), found: true };
      }

      parts.length = 0;
      partsLen = 0;
      cursor = nl + 1;
      offset = offset + nl + 1;
      if (cursor >= n) {
        break;
      }
    }
  }
}

function isTransientMetaParseError(message: string): boolean {
  return /Unexpected end of JSON input|Unexpected token|unterminated string/i.test(message);
}

async function readFirstRecordFromTrace(
  fd: number,
  normalized: string,
): Promise<{ text: string; found: boolean; rec?: Record<string, unknown> }> {
  let offset = 0;
  while (true) {
    for (let attempt = 1; attempt <= TRACE_META_READER_RETRIES; attempt += 1) {
      const { nextOffset, line, found } = readNextLine(fd, offset);
      log.debug('trace:readMeta line probe', {
        tracePath: normalized,
        attempt,
        offset,
        nextOffset,
        found,
      });
      if (!found) {
        if (attempt < TRACE_META_READER_RETRIES) {
          await delay(TRACE_META_READER_RETRY_MS);
          offset = Math.max(offset, nextOffset);
          continue;
        }
        return { text: '', found: false };
      }

      const trimmed = line.trim();
      if (!trimmed) {
        offset = nextOffset;
        break;
      }

      try {
        const rec = JSON.parse(trimmed);
        if (!rec || typeof rec !== 'object') {
          throw new Error('first record is not an object');
        }
        return { text: trimmed, found: true, rec };
      } catch (error: any) {
        const parseMessage = String(error?.message || error);
        if (attempt < TRACE_META_READER_RETRIES && isTransientMetaParseError(parseMessage)) {
          log.warn('trace:readMeta transient JSON parse while reading META; retrying', {
            tracePath: normalized,
            attempt,
            parseMessage,
          });
          await delay(TRACE_META_READER_RETRY_MS * attempt);
          continue;
        }
        throw error;
      }

      return { text: trimmed, found: true };
    }
    return { text: '', found: false };
  }
}

async function readTraceMetaFromFilePath(normalized: string): Promise<{ json: Record<string, unknown>; text: string }> {
  assertCanonicalLinxTracePath(normalized);
  const fd = fs.openSync(normalized, 'r');
  try {
    const { text, found, rec } = await readFirstRecordFromTrace(fd, normalized);
    if (!found) {
      throw new Error(`missing META record in trace: ${normalized}`);
    }
    if (!rec || rec.type !== 'META') {
      throw new Error(`first non-empty record is not META: ${normalized}`);
    }
    const metaObj = { ...rec } as Record<string, unknown>;
    delete metaObj.type;
    return { json: metaObj, text };
  } finally {
    fs.closeSync(fd);
  }
}

function closeTraceSession(sessionId: number): boolean {
  const sess = traceSessions.get(sessionId);
  if (!sess) {
    return false;
  }
  try {
    fs.closeSync(sess.fd);
  } catch (error) {
    log.warn(`Failed closing trace session fd ${sessionId}`, error);
  }
  traceSessions.delete(sessionId);
  return true;
}

function requestOpenTrace(pathToOpen: string) {
  const normalized = path.resolve(pathToOpen);
  if (!fs.existsSync(normalized)) {
    return;
  }
  if (!isLinxTracePath(normalized)) {
    log.warn('Ignoring unsupported trace argument', { tracePath: normalized });
    return;
  }
  if (mainWindow && mainWindowReady) {
    mainWindow.webContents.send('trace:open', normalized);
  } else {
    pendingTraceOpenPath = normalized;
  }
}

// App lifecycle
app.whenReady().then(() => {
  log.info('App ready');
  createWindow();

  const argTrace = process.argv.find((arg) => typeof arg === 'string' && arg.endsWith('.linxtrace'));
  if (argTrace) {
    requestOpenTrace(argTrace);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  requestOpenTrace(filePath);
});

app.on('window-all-closed', () => {
  log.info('All windows closed');
  for (const sessionId of traceSessions.keys()) {
    closeTraceSession(sessionId);
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

// File operations
ipcMain.handle('dialog:openFile', async (_, options) => {
  log.info('Opening file dialog');
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    defaultPath: options?.defaultPath,
    filters: options?.filters || [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Python', extensions: ['py'] },
      { name: 'C/C++', extensions: ['c', 'cpp', 'h', 'hpp'] },
      { name: 'Verilog', extensions: ['v', 'sv'] },
      { name: 'LinxISA', extensions: ['li', 'linx', 'asm'] }
    ]
  });
  return result;
});

ipcMain.handle('dialog:openFolder', async () => {
  log.info('Opening folder dialog');
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  });
  return result;
});

ipcMain.handle('dialog:saveFile', async (_, options) => {
  log.info('Opening save dialog');
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: options?.filters || [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Python', extensions: ['py'] },
      { name: 'LinxISA', extensions: ['li', 'linx'] }
    ],
    defaultPath: options?.defaultPath
  });
  return result;
});

ipcMain.handle('fs:readFile', async (_, filePath: string) => {
  log.info('Reading file:', filePath);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content };
  } catch (error: any) {
    log.error('Error reading file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('trace:readMeta', async (_, tracePath: string) => {
  try {
    const normalized = path.resolve(tracePath);
    assertCanonicalLinxTracePath(normalized);
    const startedAt = Date.now();
    const { json: metaObj, text: firstRecord } = await readTraceMetaFromFilePath(normalized);
    log.info('trace:readMeta parsed first record', {
      tracePath: normalized,
      len: firstRecord.length,
      first: firstRecord.slice(0, 60),
      elapsedMs: Date.now() - startedAt,
    });
    return { ok: true, metaPath: normalized, meta: metaObj };
  } catch (error: any) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle('trace:openSession', async (_, tracePath: string) => {
  try {
    const normalized = path.resolve(tracePath);
    assertCanonicalLinxTracePath(normalized);
    const st = fs.statSync(normalized);
    if (!st.isFile()) {
      return { ok: false, error: 'trace path is not a file' };
    }
    const fd = fs.openSync(normalized, 'r');
    const sessionId = traceSessionCounter++;
    traceSessions.set(sessionId, {
      sessionId,
      tracePath: normalized,
      fd,
      sizeBytes: Number(st.size || 0),
      mtimeMs: Number(st.mtimeMs || 0),
    });
    return {
      ok: true,
      sessionId,
      sizeBytes: Number(st.size || 0),
      mtimeMs: Number(st.mtimeMs || 0),
    };
  } catch (error: any) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle(
  'trace:readChunk',
  async (_: unknown, sessionId: number, offset: number, bytes: number) => {
    const sess = traceSessions.get(Number(sessionId));
    if (!sess) {
      return { ok: false, error: `unknown trace session ${sessionId}` };
    }
    try {
      const safeOffset = Math.max(0, Number(offset || 0));
      const safeBytes = Math.max(1, Math.min(64 * 1024 * 1024, Number(bytes || 0)));
      if (safeOffset >= sess.sizeBytes) {
        return { ok: true, chunk: '', nextOffset: safeOffset, eof: true };
      }

      const readBytes = Math.min(safeBytes, sess.sizeBytes - safeOffset);
      const buf = Buffer.allocUnsafe(readBytes);
      const n = fs.readSync(sess.fd, buf, 0, readBytes, safeOffset);
      const chunk = n > 0 ? buf.toString('utf8', 0, n) : '';
      const nextOffset = safeOffset + n;
      const eof = nextOffset >= sess.sizeBytes;
      return { ok: true, chunk, nextOffset, eof };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },
);

ipcMain.handle('trace:closeSession', async (_, sessionId: number) => {
  return { ok: closeTraceSession(Number(sessionId)) };
});

ipcMain.handle('debug:uiSnapshot', async (_event, reason?: string) => {
  if (!uiSnapshotHook) {
    return { ok: false, error: 'snapshot hook unavailable' };
  }
  try {
    await uiSnapshotHook(`ipc:${String(reason || 'manual')}`);
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
});

ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
  log.info('Writing file:', filePath);
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (error: any) {
    log.error('Error writing file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:readDir', async (_, dirPath: string) => {
  log.info('Reading directory:', dirPath);
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = entries.map(entry => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      path: path.join(dirPath, entry.name)
    }));
    return { success: true, files };
  } catch (error: any) {
    log.error('Error reading directory:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:stat', async (_, filePath: string) => {
  try {
    const stats = fs.statSync(filePath);
    return {
      success: true,
      stats: {
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        mtime: stats.mtime.toISOString()
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:exists', async (_, filePath: string) => {
  return fs.existsSync(filePath);
});

ipcMain.handle('fs:mkdir', async (_, dirPath: string) => {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:delete', async (_, filePath: string) => {
  try {
    fs.rmSync(filePath, { recursive: true });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:rename', async (_, oldPath: string, newPath: string) => {
  try {
    fs.renameSync(oldPath, newPath);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('project:createFromTemplate', async (_event, request: {
  name: string;
  location: string;
  template: string;
}) => {
  try {
    const normalizedTemplate = normalizeTemplateId(request.template || 'empty');
    const safeName = (request.name || 'linxcoresight-project').trim();
    const location = (request.location || '').trim();
    if (!safeName || !location) {
      return { success: false, error: 'Project name and location are required' };
    }

    const projectPath = path.join(location, safeName);
    if (fs.existsSync(projectPath)) {
      const entries = fs.readdirSync(projectPath);
      if (entries.length > 0) {
        return { success: false, error: `Project directory already exists and is not empty: ${projectPath}` };
      }
    } else {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    const repoRoot = getRepoRoot();
    const preparedTemplateDir = path.join(repoRoot, 'templates', 'prepared', normalizedTemplate);
    const isPreparedTemplate = fs.existsSync(preparedTemplateDir);

    if (isPreparedTemplate) {
      copyDirectoryRecursive(preparedTemplateDir, projectPath);

      const benchmarkSourceDir = path.join(repoRoot, 'third_party', 'benchmarks', normalizedTemplate);
      if (fs.existsSync(benchmarkSourceDir)) {
        copyDirectoryRecursive(benchmarkSourceDir, path.join(projectPath, 'benchmarks', normalizedTemplate));
      }
    } else {
      fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });
      fs.mkdirSync(path.join(projectPath, 'include'), { recursive: true });
      fs.mkdirSync(path.join(projectPath, 'build'), { recursive: true });
      const templateContent: Record<string, string> = {
        blink: `// LinxCoreSight Blink Template\n\nvoid _start(void) {\n  while (1) {\n  }\n}\n`,
        uart: `#include <stdint.h>\n\n#define UART_DR (*(volatile uint32_t *)(0x10000000))\n\nvoid _start(void) {\n  UART_DR = 'H';\n  UART_DR = 'i';\n  UART_DR = '\\n';\n}\n`,
        cpu: `// LinxCoreSight CPU Core Template\n\nvoid _start(void) {\n}\n`,
        empty: `// LinxCoreSight Project\n\nvoid _start(void) {\n}\n`,
      };
      fs.writeFileSync(path.join(projectPath, 'src', 'main.c'), templateContent[normalizedTemplate] || templateContent.empty, 'utf-8');
    }

    const configPath = path.join(projectPath, 'linxcoresight.json');
    let config: Record<string, any> = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch (_error) {
        config = {};
      }
    }
    config.name = safeName;
    config.template = normalizedTemplate;
    config.createdAt = config.createdAt || new Date().toISOString();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    return { success: true, projectPath, template: normalizedTemplate };
  } catch (error: any) {
    log.error('Error creating project from template:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('process:run', async (_event, options: {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  streamOutput?: boolean;
  managed?: boolean;
}) => {
  log.info('Running process:', options.command, options.args);
  return new Promise((resolve) => {
    const streamOutput = options.streamOutput === true;
    const managed = options.managed === true;
    if (managed) {
      terminateChildProcess(managedRunProcess, 'previous managed run process');
      managedRunProcess = null;
    }

    const proc = spawn(options.command, options.args || [], {
      cwd: options.cwd || process.cwd(),
      shell: false,
      detached: managed && process.platform !== 'win32',
      env: { ...process.env, ...(options.env || {}) },
    });
    if (managed) {
      managedRunProcess = proc;
    }

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      if (streamOutput) {
        mainWindow?.webContents.send('process:output', { type: 'stdout', data: text });
      }
    });
    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      if (streamOutput) {
        mainWindow?.webContents.send('process:output', { type: 'stderr', data: text });
      }
    });
    proc.on('close', (code) => {
      if (managedRunProcess === proc) {
        managedRunProcess = null;
      }
      resolve({ success: code === 0, stdout, stderr, exitCode: code ?? -1 });
    });
    proc.on('error', (error) => {
      if (managedRunProcess === proc) {
        managedRunProcess = null;
      }
      resolve({ success: false, stdout, stderr: `${stderr}\n${error.message}`, exitCode: -1 });
    });
  });
});

// Compiler integration
ipcMain.handle('compiler:compile', async (_, options: { command: string; args: string[]; cwd?: string }) => {
  log.info('Running compiler:', options.command, options.args);
  
  return new Promise((resolve) => {
    const proc = spawn(options.command, options.args, {
      cwd: options.cwd || process.cwd(),
      shell: true,
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      mainWindow?.webContents.send('compiler:output', { type: 'stdout', data: text });
    });

    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      mainWindow?.webContents.send('compiler:output', { type: 'stderr', data: text });
    });

    proc.on('close', (code) => {
      log.info('Compiler finished with code:', code);
      resolve({ success: code === 0, stdout, stderr, exitCode: code });
    });

    proc.on('error', (error) => {
      log.error('Compiler error:', error);
      resolve({ success: false, stdout, stderr: error.message, exitCode: -1 });
    });
  });
});

// QEMU Integration
ipcMain.handle('emulator:run', async (_, options: { command: string; args: string[]; cwd?: string }) => {
  log.info('Starting QEMU:', options.command, options.args);

  if (qemuProcess) {
    terminateChildProcess(qemuProcess, 'previous qemu process');
    qemuProcess = null;
  }

  return new Promise((resolve) => {
    if (!options.command) {
      resolve({ success: false, stdout: '', stderr: 'QEMU command is empty', exitCode: -1 });
      return;
    }

    const isPathLike = options.command.includes(path.sep) || options.command.startsWith('.');
    if (isPathLike && !fs.existsSync(options.command)) {
      resolve({ success: false, stdout: '', stderr: `QEMU not found: ${options.command}`, exitCode: -1 });
      return;
    }

    qemuProcess = spawn(options.command, options.args, {
      cwd: options.cwd || process.cwd(),
      shell: false,
      detached: process.platform !== 'win32',
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    qemuProcess.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      mainWindow?.webContents.send('emulator:output', { type: 'stdout', data: text });
    });

    qemuProcess.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      mainWindow?.webContents.send('emulator:output', { type: 'stderr', data: text });
    });

    qemuProcess.on('close', (code) => {
      log.info('QEMU finished with code:', code);
      qemuProcess = null;
      mainWindow?.webContents.send('emulator:terminated', { code });
      resolve({ success: code === 0, stdout, stderr, exitCode: code });
    });

    qemuProcess.on('error', (error) => {
      log.error('QEMU error:', error);
      qemuProcess = null;
      resolve({ success: false, stdout, stderr: error.message, exitCode: -1 });
    });
  });
});

ipcMain.handle('emulator:stop', async () => {
  log.info('Stopping QEMU');
  const stoppedQemu = terminateChildProcess(qemuProcess, 'qemu process');
  qemuProcess = null;

  const stoppedManaged = terminateChildProcess(managedRunProcess, 'managed run process');
  managedRunProcess = null;

  if (stoppedQemu || stoppedManaged) {
    return { success: true };
  }
  return { success: false, error: 'No process running' };
});

ipcMain.handle('emulator:status', async () => {
  return { running: qemuProcess !== null, pid: qemuProcess?.pid };
});

// Serial Monitor
ipcMain.handle('monitor:connect', async (event, options: { port: string; baudRate: number }) => {
  log.info('Connecting to serial port:', options.port, options.baudRate);
  
  if (!SerialPort) {
    return { success: false, error: 'SerialPort module not available' };
  }
  
  // Close existing connection if any
  if (serialPort && serialPort.isOpen) {
    await new Promise<void>((resolve) => {
      serialPort.close(() => resolve());
    });
  }
  
  try {
    serialPort = new SerialPort({
      path: options.port,
      baudRate: options.baudRate || 115200,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
    });
    
    serialPort.on('data', (data: Buffer) => {
      // Send data to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('monitor:data', data.toString());
      }
    });
    
    serialPort.on('error', (err: Error) => {
      log.error('Serial port error:', err);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('monitor:error', err.message);
      }
    });
    
    serialPort.on('close', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('monitor:disconnected');
      }
    });
    
    // Wait for port to open
    await new Promise<void>((resolve, reject) => {
      serialPort.on('open', () => resolve());
      serialPort.on('error', (err: Error) => reject(err));
      // Timeout after 5 seconds
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
    
    return { success: true, message: `Connected to ${options.port}` };
  } catch (error: any) {
    log.error('Failed to connect to serial port:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('monitor:disconnect', async () => {
  log.info('Disconnecting serial port');
  
  if (serialPort && serialPort.isOpen) {
    return new Promise((resolve) => {
      serialPort.close((err: Error | undefined) => {
        if (err) {
          log.error('Error closing serial port:', err);
          resolve({ success: false, error: err.message });
        } else {
          serialPort = null;
          resolve({ success: true });
        }
      });
    });
  }
  
  return { success: true };
});

ipcMain.handle('monitor:send', async (_, data: string) => {
  log.info('Sending to serial:', data);
  
  if (!serialPort || !serialPort.isOpen) {
    return { success: false, error: 'Serial port not connected' };
  }
  
  return new Promise((resolve) => {
    serialPort.write(data, (err: Error | undefined) => {
      if (err) {
        log.error('Error sending to serial:', err);
        resolve({ success: false, error: err.message });
      } else {
        resolve({ success: true });
      }
    });
  });
});

ipcMain.handle('monitor:list', async () => {
  if (!SerialPort) {
    return { success: false, error: 'SerialPort module not available', ports: [] };
  }
  
  try {
    const ports = await SerialPort.list();
    return { success: true, ports };
  } catch (error: any) {
    log.error('Error listing serial ports:', error);
    return { success: false, error: error.message, ports: [] };
  }
});

// App info
ipcMain.handle('app:getPath', async (_, name: string) => {
  return app.getPath(name as any);
});

ipcMain.handle('app:getVersion', async () => {
  return app.getVersion();
});

// Toolchain info
ipcMain.handle('toolchain:getInfo', async () => {
  return checkToolchain();
});

// ============================================
// GDB Debugger Implementation
// ============================================

import net from 'net';

// GDB Stub state
let gdbSocket: net.Socket | null = null;
let debuggerConnected = false;
let currentBreakpoints: Map<number, number> = new Map(); // address -> type

// GDB Remote Protocol packet helpers
function gdbChecksum(data: string): string {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data.charCodeAt(i);
  }
  return (sum % 256).toString(16).padStart(2, '0');
}

function gdbMakePacket(data: string): string {
  const checksum = gdbChecksum(data);
  return `$${data}#${checksum}`;
}

function gdbParsePacket(data: string): { ack: string; data: string } | null {
  if (data.length < 4) return null;
  if (data[0] !== '$') return null;
  
  const hashIndex = data.indexOf('#');
  if (hashIndex === -1 || data.length < hashIndex + 3) return null;
  
  const packetData = data.substring(1, hashIndex);
  return { ack: '+', data: packetData };
}

// Send GDB command and wait for response
function gdbSendCommand(socket: net.Socket, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const packet = gdbMakePacket(command);
    let response = '';
    let timeout: NodeJS.Timeout;
    
    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeListener('data', onData);
    };
    
    const onData = (chunk: Buffer) => {
      response += chunk.toString();
      
      // Look for complete packet
      const ackMatch = response.match(/\+/);
      if (ackMatch) {
        const packetStart = response.indexOf('$');
        const hashIndex = response.indexOf('#', packetStart);
        
        if (hashIndex !== -1 && response.length >= hashIndex + 3) {
          cleanup();
          
          // Extract packet data
          const packetData = response.substring(packetStart + 1, hashIndex);
          resolve(packetData);
        }
      }
    };
    
    socket.on('data', onData);
    
    // Timeout after 5 seconds
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error('GDB command timeout'));
    }, 5000);
    
    socket.write(packet);
  });
}

// IPC Handlers for Debugger
ipcMain.handle('debugger:connect', async (_, options: { port: number; binary?: string }) => {
  log.info('Connecting to GDB stub on port:', options.port);
  
  return new Promise((resolve) => {
    try {
      gdbSocket = net.createConnection({ port: options.port }, () => {
        log.info('Connected to GDB stub');
        debuggerConnected = true;
        resolve({ success: true, message: 'Connected to debugger' });
      });
      
      gdbSocket.on('error', (err) => {
        log.error('GDB connection error:', err);
        debuggerConnected = false;
        resolve({ success: false, error: err.message });
      });
      
      gdbSocket.on('close', () => {
        log.info('GDB connection closed');
        debuggerConnected = false;
        gdbSocket = null;
      });
      
    } catch (err: any) {
      log.error('Failed to connect to GDB:', err);
      resolve({ success: false, error: err.message });
    }
  });
});

ipcMain.handle('debugger:disconnect', async () => {
  log.info('Disconnecting from GDB stub');
  
  if (gdbSocket) {
    gdbSocket.end();
    gdbSocket = null;
    debuggerConnected = false;
  }
  
  return { success: true };
});

ipcMain.handle('debugger:continue', async () => {
  if (!gdbSocket || !debuggerConnected) {
    return { success: false, error: 'Not connected to debugger' };
  }
  
  try {
    const response = await gdbSendCommand(gdbSocket, 'c');
    return { success: true, data: response };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('debugger:step', async () => {
  if (!gdbSocket || !debuggerConnected) {
    return { success: false, error: 'Not connected to debugger' };
  }
  
  try {
    const response = await gdbSendCommand(gdbSocket, 's');
    return { success: true, data: response };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('debugger:stepOver', async () => {
  // For step over, we need to use 's' with a breakpoint after the next instruction
  // Simplified: just do a regular step for now
  if (!gdbSocket || !debuggerConnected) {
    return { success: false, error: 'Not connected to debugger' };
  }
  
  try {
    const response = await gdbSendCommand(gdbSocket, 's');
    return { success: true, data: response };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('debugger:readRegisters', async () => {
  if (!gdbSocket || !debuggerConnected) {
    return { success: false, error: 'Not connected to debugger' };
  }
  
  try {
    const response = await gdbSendCommand(gdbSocket, 'g');
    // Parse register response (hex string)
    const registers: Record<string, string> = {};
    const regNames = ['zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2', 't3', 't4', 't5', 't6',
                      's0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11',
                      'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'pc'];
    
    // Each register is 16 hex chars (64-bit)
    for (let i = 0; i < regNames.length && i * 16 < response.length; i++) {
      registers[regNames[i]] = '0x' + response.substring(i * 16, (i + 1) * 16);
    }
    
    return { success: true, registers };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('debugger:readMemory', async (_, options: { address: number; length: number }) => {
  if (!gdbSocket || !debuggerConnected) {
    return { success: false, error: 'Not connected to debugger' };
  }
  
  try {
    const addrHex = options.address.toString(16);
    const lenHex = options.length.toString(16);
    const response = await gdbSendCommand(gdbSocket, `m${addrHex},${lenHex}`);
    return { success: true, data: response };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('debugger:setBreakpoint', async (_, options: { address: number; type?: number }) => {
  if (!gdbSocket || !debuggerConnected) {
    return { success: false, error: 'Not connected to debugger' };
  }
  
  try {
    const addrHex = options.address.toString(16);
    const type = options.type || 0; // 0 = software breakpoint
    // Z type,address,kind
    const response = await gdbSendCommand(gdbSocket, `Z0,${addrHex},4`);
    
    if (response === 'OK') {
      currentBreakpoints.set(options.address, type);
      return { success: true };
    } else {
      return { success: false, error: response };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('debugger:removeBreakpoint', async (_, options: { address: number }) => {
  if (!gdbSocket || !debuggerConnected) {
    return { success: false, error: 'Not connected to debugger' };
  }
  
  try {
    const addrHex = options.address.toString(16);
    const response = await gdbSendCommand(gdbSocket, `z0,${addrHex},4`);
    
    if (response === 'OK') {
      currentBreakpoints.delete(options.address);
      return { success: true };
    } else {
      return { success: false, error: response };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('debugger:getStatus', async () => {
  return { 
    connected: debuggerConnected,
    breakpoints: Array.from(currentBreakpoints.entries()).map(([addr, type]) => ({ address: addr, type }))
  };
});

// Run emulator with GDB stub enabled
ipcMain.handle('debugger:runWithGdb', async (_, options: { 
  command: string; 
  args: string[]; 
  cwd?: string;
  gdbPort?: number;
}) => {
  const gdbPort = options.gdbPort || 1234;
  log.info('Running emulator with GDB stub on port:', gdbPort);
  
  // Add GDB stub argument to QEMU
  const gdbArgs = [...options.args, '-gdb', `tcp::${gdbPort}`, '-S']; // -S means wait for debugger
  
  return new Promise((resolve) => {
    try {
      qemuProcess = spawn(options.command, gdbArgs, {
        cwd: options.cwd || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      qemuProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('emulator:output', { type: 'stdout', data: data.toString() });
        }
      });
      
      qemuProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('emulator:output', { type: 'stderr', data: data.toString() });
        }
      });
      
      qemuProcess.on('close', (code) => {
        log.info('QEMU process exited with code:', code);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('emulator:terminated', { code: code || 0 });
        }
      });
      
      qemuProcess.on('error', (error) => {
        log.error('QEMU error:', error);
        resolve({ success: false, stdout, stderr: error.message, exitCode: -1 });
      });
      
      // Wait a moment for QEMU to start
      setTimeout(() => {
        resolve({ success: true, pid: qemuProcess?.pid, gdbPort });
      }, 1000);
      
    } catch (err: any) {
      log.error('Failed to start QEMU with GDB:', err);
      resolve({ success: false, stdout: '', stderr: err.message, exitCode: -1 });
    }
  });
});

log.info('IPC handlers registered');
