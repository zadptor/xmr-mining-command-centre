import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import { MoneroDaemonRpc } from "./daemon-rpc";

type UiStatus = {
  state: "idle" | "mining" | "block-found";
  height: number;
  targetHeight: number;
  difficulty: number;
  txPoolSize: number;
  peers: number;
  miningActive: boolean;
  miningSpeed: number;
  miningThreads: number;
  logLine: string;
  lastUpdatedAt: string;
};

const rpc = new MoneroDaemonRpc();
let mainWindow: BrowserWindow | null = null;
let lastHeight = 0;
let lastBlockFoundAt = 0;
let miningExpected = false;
let lastStatus: UiStatus | null = null;
const logLines: string[] = [];
let logFilePath = "";

function log(level: "INFO" | "WARN" | "ERROR", source: "MAIN" | "UI", message: string): void {
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

async function pollStatus(): Promise<UiStatus> {
  const [info, miningStatus] = await Promise.all([
    rpc.getInfo(),
    rpc.getMiningStatus()
  ]);
  const now = Date.now();
  miningExpected = miningStatus.active;
  let state: UiStatus["state"] = miningStatus.active ? "mining" : "idle";

  if (miningExpected && lastHeight > 0 && info.height > lastHeight) {
    state = "block-found";
    lastBlockFoundAt = now;
    log("INFO", "MAIN", `New block height detected: ${lastHeight} -> ${info.height}`);
  } else if (lastBlockFoundAt > 0 && now - lastBlockFoundAt < 5000) {
    state = "block-found";
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
}

app.whenReady().then(() => {
  const logsDir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  logFilePath = path.join(logsDir, "app.log");
  createWindow();
  log("INFO", "MAIN", `App started. File logging to ${logFilePath}`);

  ipcMain.handle("daemon:get-status", async () => {
    try {
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

    log("INFO", "MAIN", "calling rpc.startMining...");
    await rpc.startMining(walletAddress, threads);
    log("INFO", "MAIN", "rpc.startMining completed");
    miningExpected = true;
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
    await rpc.stopMining();
    miningExpected = false;
    log("INFO", "MAIN", "stop_mining accepted");
    return pollStatus();
  });

  ipcMain.handle("daemon:set-limit", async (_event, down: number, up: number) => {
    if (!Number.isInteger(down) || !Number.isInteger(up)) {
      throw new Error("Limits must be integers.");
    }
    await rpc.setLimit(down, up);
    log("INFO", "MAIN", `set_limit accepted: down=${down} up=${up}`);
    return pollStatus();
  });

  ipcMain.handle("daemon:get-logs", async () => {
    return [...logLines];
  });
  ipcMain.handle("daemon:log-client", async (_event, level: "INFO" | "WARN" | "ERROR", message: string) => {
    log(level, "UI", message);
  });

  setInterval(async () => {
    try {
      const status = await pollStatus();
      mainWindow?.webContents.send("daemon:status", status);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("ERROR", "MAIN", `poll failed: ${message}`);
      mainWindow?.webContents.send("daemon:error", message);
    }
  }, 5000);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
