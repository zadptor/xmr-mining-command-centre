import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";
import path from "node:path";
import fs from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { MoneroDaemonRpc } from "./daemon-rpc";

const rpc = new MoneroDaemonRpc();
const defaultMonerodPaths = [
  "C:\\Program Files\\Monero GUI Wallet\\monerod.exe",
  "C:\\Program Files (x86)\\Monero GUI Wallet\\monerod.exe"
];
let mainWindow: BrowserWindow | null = null;
let statusPollTimer: NodeJS.Timeout | null = null;
let managedDaemon: ChildProcessWithoutNullStreams | null = null;
let daemonStartupPromise: Promise<void> | null = null;
let settingsFilePath = "";
let configuredMonerodPath = "";
let lastHeight = 0;
let lastStatus: UiStatus | null = null;
const logLines: string[] = [];
let logFilePath = "";
const simulateBlockFound = process.argv.includes("--simulate-block-found");
let lastWalletBlockSignature = "";
let monerodStdoutScanBuffer = "";

function log(level: LogLevel, source: "MAIN" | "UI", message: string): void {
  const line = `[${new Date().toISOString()}] [${level}] [${source}] ${message}`;
  logLines.push(line);
  if (logLines.length > 400) {
    logLines.shift();
  }
  if (logFilePath) {
    fs.appendFileSync(logFilePath, `${line}\n`, "utf8");
  }
  mainWindow?.webContents.send("daemon:log", line);
}

function validateMonerodPath(candidatePath: string): string {
  const trimmedPath = candidatePath.trim();
  if (!trimmedPath) {
    throw new Error("Select monerod.exe before starting the daemon.");
  }
  if (path.basename(trimmedPath).toLowerCase() !== "monerod.exe") {
    throw new Error("Selected file must be named monerod.exe.");
  }
  if (!fs.existsSync(trimmedPath)) {
    throw new Error(`monerod.exe not found at ${trimmedPath}`);
  }
  return trimmedPath;
}

function findDefaultMonerodPath(): string {
  return defaultMonerodPaths.find((candidatePath) => fs.existsSync(candidatePath)) ?? "";
}

function getMonerodPath(): string {
  if (configuredMonerodPath) {
    return configuredMonerodPath;
  }
  return findDefaultMonerodPath();
}

function getDaemonSettings(): DaemonSettings {
  return {
    monerodPath: getMonerodPath(),
    settingsPath: settingsFilePath
  };
}

function simulatedBlockFoundStatus(): UiStatus {
  const baseHeight = lastStatus?.height && lastStatus.height > 0 ? lastStatus.height : 3250000;
  return walletBlockFoundStatus(baseHeight + 1, undefined, `Simulated Block Found | height ${baseHeight} -> ${baseHeight + 1}`);
}

function walletBlockFoundStatus(height: number, difficulty: string | undefined, logLine: string): UiStatus {
  return {
    state: "block-found",
    height,
    targetHeight: lastStatus?.targetHeight ?? height,
    difficulty: lastStatus?.difficulty ?? 1,
    txPoolSize: lastStatus?.txPoolSize ?? 0,
    peers: lastStatus?.peers ?? 0,
    miningActive: true,
    miningSpeed: lastStatus?.miningSpeed ?? 0,
    miningThreads: lastStatus?.miningThreads ?? 2,
    logLine: difficulty ? `${logLine} | difficulty=${difficulty}` : logLine,
    lastUpdatedAt: new Date().toISOString()
  };
}

function handleMonerodStdout(text: string): void {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return;
  }

  log("INFO", "MAIN", `monerod stdout: ${trimmedText}`);
  monerodStdoutScanBuffer = `${monerodStdoutScanBuffer} ${trimmedText}`.slice(-4000);

  const foundBlockMatch = /Found block\s+<([^>]+)>\s+at height\s+(\d+)\s+for difficulty:\s+(\d+)/i.exec(monerodStdoutScanBuffer);
  if (!foundBlockMatch) {
    return;
  }

  const [, blockId, heightText, difficulty] = foundBlockMatch;
  const signature = `${blockId}:${heightText}:${difficulty}`;
  if (signature === lastWalletBlockSignature) {
    return;
  }

  lastWalletBlockSignature = signature;
  const height = Number.parseInt(heightText, 10);
  const status = walletBlockFoundStatus(height, difficulty, `Wallet found block ${blockId} at height ${height}`);
  lastStatus = status;
  log("INFO", "MAIN", `Wallet found block ${blockId} at height ${height}`);
  mainWindow?.webContents.send("daemon:status", status);
}

function loadSettings(): void {
  if (!settingsFilePath || !fs.existsSync(settingsFilePath)) {
    configuredMonerodPath = findDefaultMonerodPath();
    return;
  }

  try {
    const settings = JSON.parse(fs.readFileSync(settingsFilePath, "utf8")) as Partial<DaemonSettings>;
    configuredMonerodPath = typeof settings.monerodPath === "string" ? settings.monerodPath : "";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("WARN", "MAIN", `settings load failed: ${message}`);
    configuredMonerodPath = findDefaultMonerodPath();
  }
}

function saveSettings(): void {
  if (!settingsFilePath) {
    throw new Error("Settings path is not initialized.");
  }

  fs.writeFileSync(
    settingsFilePath,
    JSON.stringify({ monerodPath: configuredMonerodPath }, null, 2),
    "utf8"
  );
}

async function pollStatus(): Promise<UiStatus> {
  const [info, miningStatus] = await Promise.all([
    rpc.getInfo(),
    rpc.getMiningStatus()
  ]);
  const previousHeight = lastHeight;
  const state: UiStatus["state"] = miningStatus.active ? "mining" : "idle";

  if (previousHeight > 0 && info.height > previousHeight) {
    log("INFO", "MAIN", `New block height observed: ${previousHeight} -> ${info.height}`);
  }

  lastHeight = info.height;

  const status: UiStatus = {
    state,
    height: info.height,
    targetHeight: info.target_height,
    difficulty: info.difficulty,
    txPoolSize: info.tx_pool_size,
    peers: info.incoming_connections_count + info.outgoing_connections_count,
    miningActive: miningStatus.active,
    miningSpeed: miningStatus.speed ?? 0,
    miningThreads: miningStatus.threads_count ?? 0,
    logLine: `daemon status=${info.status} | mining=${miningStatus.active ? "active" : "idle"} | speed=${miningStatus.speed ?? 0} H/s`,
    lastUpdatedAt: new Date().toISOString()
  };
  lastStatus = status;
  return status;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isDaemonRpcReady(): Promise<boolean> {
  try {
    await rpc.getInfo();
    return true;
  } catch {
    return false;
  }
}

async function waitForDaemonRpc(timeoutMs = 45000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isDaemonRpcReady()) {
      return;
    }
    await delay(1000);
  }
  throw new Error(`Monero daemon RPC did not become ready within ${timeoutMs / 1000}s.`);
}

async function ensureDaemonRunning(): Promise<void> {
  if (await isDaemonRpcReady()) {
    log("INFO", "MAIN", "Monero daemon RPC already available on 127.0.0.1:18081.");
    return;
  }

  const monerodPath = validateMonerodPath(getMonerodPath());
  if (!fs.existsSync(monerodPath)) {
    throw new Error(`monerod.exe not found at ${monerodPath}`);
  }

  log("INFO", "MAIN", `Starting Monero daemon from ${monerodPath}`);
  managedDaemon = spawn(monerodPath, [
    "--rpc-bind-ip",
    "127.0.0.1",
    "--rpc-bind-port",
    "18081",
    "--confirm-external-bind"
  ], {
    cwd: path.dirname(monerodPath),
    windowsHide: true
  });

  managedDaemon.stdout.on("data", (chunk: Buffer) => {
    handleMonerodStdout(chunk.toString("utf8"));
  });

  managedDaemon.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8").trim();
    if (text) {
      log("WARN", "MAIN", `monerod stderr: ${text}`);
    }
  });

  managedDaemon.on("error", (error) => {
    log("ERROR", "MAIN", `monerod failed to start: ${error.message}`);
  });

  managedDaemon.on("exit", (code, signal) => {
    log("WARN", "MAIN", `monerod exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    managedDaemon = null;
  });

  await waitForDaemonRpc();
  log("INFO", "MAIN", "Monero daemon RPC is ready on 127.0.0.1:18081.");
}

async function waitForDaemonStartup(): Promise<void> {
  if (daemonStartupPromise) {
    await daemonStartupPromise;
  }
}

function startDaemonStartup(): Promise<void> {
  daemonStartupPromise = ensureDaemonRunning();
  return daemonStartupPromise;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const indexPath = path.join(__dirname, "../../renderer/index.html");
  mainWindow.loadFile(indexPath);
  mainWindow.webContents.on("did-finish-load", () => {
    log("INFO", "MAIN", "Renderer finished loading.");
    if (simulateBlockFound) {
      setTimeout(() => {
        const status = simulatedBlockFoundStatus();
        log("INFO", "MAIN", "Sending simulated block-found status.");
        mainWindow?.webContents.send("daemon:status", status);
      }, 1000);
    }
  });
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    log("INFO", "UI", `console level=${level} ${sourceId}:${line} ${message}`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log("ERROR", "MAIN", `Renderer process gone: ${details.reason} exitCode=${details.exitCode}`);
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    log("ERROR", "MAIN", `Renderer failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function stopStatusPolling(): void {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
}

app.whenReady().then(() => {
  const logsDir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  logFilePath = path.join(logsDir, "app.log");
  settingsFilePath = path.join(app.getPath("userData"), "settings.json");
  loadSettings();
  createWindow();
  log("INFO", "MAIN", `App started. File logging to ${logFilePath}`);
  void startDaemonStartup()
    .then(async () => {
      const status = await pollStatus();
      mainWindow?.webContents.send("daemon:status", status);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      log("ERROR", "MAIN", `daemon startup failed: ${message}`);
      mainWindow?.webContents.send("daemon:error", `daemon startup failed: ${message}`);
    });

  ipcMain.handle("daemon:get-settings", async () => {
    return getDaemonSettings();
  });

  ipcMain.handle("daemon:choose-monerod", async () => {
    const dialogOptions: OpenDialogOptions = {
      title: "Select monerod.exe",
      defaultPath: getMonerodPath() || "C:\\Program Files\\Monero GUI Wallet",
      filters: [{ name: "Monero daemon", extensions: ["exe"] }],
      properties: ["openFile"]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || result.filePaths.length === 0) {
      return getDaemonSettings();
    }

    configuredMonerodPath = validateMonerodPath(result.filePaths[0]);
    saveSettings();
    log("INFO", "MAIN", `Saved monerod path: ${configuredMonerodPath}`);
    mainWindow?.webContents.send("daemon:settings", getDaemonSettings());

    void startDaemonStartup()
      .then(async () => {
        const status = await pollStatus();
        mainWindow?.webContents.send("daemon:status", status);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        log("ERROR", "MAIN", `daemon startup failed after settings update: ${message}`);
        mainWindow?.webContents.send("daemon:error", `daemon startup failed: ${message}`);
      });

    return getDaemonSettings();
  });

  ipcMain.handle("daemon:get-status", async () => {
    try {
      await waitForDaemonStartup();
      return await pollStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("ERROR", "MAIN", `get-status failed: ${message}`);
      throw error;
    }
  });

  ipcMain.handle("daemon:start-mining", async (_event, walletAddress: string, threads: number) => {
    log("INFO", "MAIN", `daemon:start-mining received walletLength=${walletAddress?.length ?? 0} threads=${threads}`);
    if (!walletAddress || walletAddress.length < 20) {
      log("WARN", "MAIN", "daemon:start-mining rejected: invalid wallet");
      throw new Error("Wallet address looks invalid.");
    }
    if (!Number.isInteger(threads) || threads <= 0 || threads > 128) {
      log("WARN", "MAIN", "daemon:start-mining rejected: invalid threads");
      throw new Error("Threads must be an integer between 1 and 128.");
    }

    await waitForDaemonStartup();
    log("INFO", "MAIN", "calling rpc.startMining...");
    await rpc.startMining(walletAddress, threads);
    log("INFO", "MAIN", "rpc.startMining completed");
    log("INFO", "MAIN", `start_mining accepted for ${walletAddress.slice(0, 12)}... with ${threads} threads`);
    try {
      return await pollStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("WARN", "MAIN", `start_mining accepted but status refresh failed: ${message}`);
      return {
        state: "mining",
        height: lastStatus?.height ?? 0,
        targetHeight: lastStatus?.targetHeight ?? 0,
        difficulty: lastStatus?.difficulty ?? 0,
        txPoolSize: lastStatus?.txPoolSize ?? 0,
        peers: lastStatus?.peers ?? 0,
        miningActive: true,
        miningSpeed: lastStatus?.miningSpeed ?? 0,
        miningThreads: threads,
        logLine: `start_mining accepted; status refresh failed: ${message}`,
        lastUpdatedAt: new Date().toISOString()
      };
    }
  });

  ipcMain.handle("daemon:stop-mining", async () => {
    await waitForDaemonStartup();
    await rpc.stopMining();
    log("INFO", "MAIN", "stop_mining accepted");
    return pollStatus();
  });

  ipcMain.handle("daemon:set-limit", async (_event, down: number, up: number) => {
    if (!Number.isInteger(down) || !Number.isInteger(up)) {
      throw new Error("Limits must be integers.");
    }
    await waitForDaemonStartup();
    await rpc.setLimit(down, up);
    log("INFO", "MAIN", `set_limit accepted: down=${down} up=${up}`);
    return pollStatus();
  });

  ipcMain.handle("daemon:get-logs", async () => {
    return [...logLines];
  });
  ipcMain.handle("daemon:log-client", async (_event, level: LogLevel, message: string) => {
    log(level, "UI", message);
  });

  statusPollTimer = setInterval(async () => {
    try {
      await waitForDaemonStartup();
      const status = await pollStatus();
      mainWindow?.webContents.send("daemon:status", status);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("ERROR", "MAIN", `poll failed: ${message}`);
      mainWindow?.webContents.send("daemon:error", message);
    }
  }, 5000);
});

app.on("before-quit", () => {
  stopStatusPolling();
  if (managedDaemon) {
    log("INFO", "MAIN", "Stopping app-managed monerod process.");
    managedDaemon.kill();
    managedDaemon = null;
  }
});

app.on("window-all-closed", () => {
  log("INFO", "MAIN", "All windows closed; stopping status polling.");
  stopStatusPolling();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
