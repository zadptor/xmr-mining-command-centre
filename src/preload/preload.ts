import { contextBridge, ipcRenderer } from "electron";

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

type DaemonApi = {
  getStatus: () => Promise<UiStatus>;
  startMining: (walletAddress: string, threads: number) => Promise<UiStatus>;
  stopMining: () => Promise<UiStatus>;
  setLimit: (down: number, up: number) => Promise<UiStatus>;
  getLogs: () => Promise<string[]>;
  logClient: (level: "INFO" | "WARN" | "ERROR", message: string) => Promise<void>;
  onStatus: (cb: (status: UiStatus) => void) => void;
  onLog: (cb: (line: string) => void) => void;
  onError: (cb: (message: string) => void) => void;
};

const api: DaemonApi = {
  getStatus: () => ipcRenderer.invoke("daemon:get-status"),
  startMining: (walletAddress, threads) => ipcRenderer.invoke("daemon:start-mining", walletAddress, threads),
  stopMining: () => ipcRenderer.invoke("daemon:stop-mining"),
  setLimit: (down, up) => ipcRenderer.invoke("daemon:set-limit", down, up),
  getLogs: () => ipcRenderer.invoke("daemon:get-logs"),
  logClient: (level, message) => ipcRenderer.invoke("daemon:log-client", level, message),
  onStatus: (cb) => {
    ipcRenderer.on("daemon:status", (_event, payload) => cb(payload));
  },
  onLog: (cb) => {
    ipcRenderer.on("daemon:log", (_event, payload) => cb(payload));
  },
  onError: (cb) => {
    ipcRenderer.on("daemon:error", (_event, payload) => cb(payload));
  }
};

contextBridge.exposeInMainWorld("daemonApi", api);
