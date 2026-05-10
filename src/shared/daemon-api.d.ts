type LogLevel = "INFO" | "WARN" | "ERROR";

type UiState = "idle" | "mining" | "block-found";

type UiStatus = {
  state: UiState;
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

type DaemonSettings = {
  monerodPath: string;
  settingsPath: string;
};

type DaemonApi = {
  getSettings: () => Promise<DaemonSettings>;
  chooseMonerod: () => Promise<DaemonSettings>;
  getStatus: () => Promise<UiStatus>;
  startMining: (walletAddress: string, threads: number) => Promise<UiStatus>;
  stopMining: () => Promise<UiStatus>;
  setLimit: (down: number, up: number) => Promise<UiStatus>;
  getLogs: () => Promise<string[]>;
  logClient: (level: LogLevel, message: string) => Promise<void>;
  onStatus: (cb: (status: UiStatus) => void) => void;
  onSettings: (cb: (settings: DaemonSettings) => void) => void;
  onLog: (cb: (line: string) => void) => void;
  onError: (cb: (message: string) => void) => void;
};
