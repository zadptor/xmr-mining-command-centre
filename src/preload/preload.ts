import { contextBridge, ipcRenderer } from "electron";

const api: DaemonApi = {
  getSettings: () => ipcRenderer.invoke("daemon:get-settings"),
  chooseMonerod: () => ipcRenderer.invoke("daemon:choose-monerod"),
  getStatus: () => ipcRenderer.invoke("daemon:get-status"),
  startMining: (walletAddress, threads) => ipcRenderer.invoke("daemon:start-mining", walletAddress, threads),
  stopMining: () => ipcRenderer.invoke("daemon:stop-mining"),
  setLimit: (down, up) => ipcRenderer.invoke("daemon:set-limit", down, up),
  getLogs: () => ipcRenderer.invoke("daemon:get-logs"),
  logClient: (level, message) => ipcRenderer.invoke("daemon:log-client", level, message),
  onStatus: (cb) => {
    ipcRenderer.on("daemon:status", (_event, payload) => cb(payload));
  },
  onSettings: (cb) => {
    ipcRenderer.on("daemon:settings", (_event, payload) => cb(payload));
  },
  onLog: (cb) => {
    ipcRenderer.on("daemon:log", (_event, payload) => cb(payload));
  },
  onError: (cb) => {
    ipcRenderer.on("daemon:error", (_event, payload) => cb(payload));
  }
};

contextBridge.exposeInMainWorld("daemonApi", api);
