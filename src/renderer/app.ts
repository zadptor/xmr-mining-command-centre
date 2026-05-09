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

type AppWindow = Window & {
  daemonApi?: DaemonApi;
};

const appWindow = window as AppWindow;

const statusEl = document.getElementById("status") as HTMLParagraphElement;
const actionFeedbackEl = document.getElementById("actionFeedback") as HTMLParagraphElement;
const walletAddressEl = document.getElementById("walletAddress") as HTMLInputElement;
const threadsEl = document.getElementById("threads") as HTMLInputElement;
const limitDownEl = document.getElementById("limitDown") as HTMLInputElement;
const limitUpEl = document.getElementById("limitUp") as HTMLInputElement;
const logPanel = document.getElementById("logPanel") as HTMLPreElement;
const minerEl = document.getElementById("miner") as HTMLDivElement;
const bridgeBannerEl = document.getElementById("bridgeBanner") as HTMLDivElement;

const metricHeight = document.getElementById("height") as HTMLSpanElement;
const metricTargetHeight = document.getElementById("targetHeight") as HTMLSpanElement;
const metricDifficulty = document.getElementById("difficulty") as HTMLSpanElement;
const metricTxPool = document.getElementById("txPool") as HTMLSpanElement;
const metricPeers = document.getElementById("peers") as HTMLSpanElement;
const metricMiningSpeed = document.getElementById("miningSpeed") as HTMLSpanElement;
const metricMiningThreads = document.getElementById("miningThreads") as HTMLSpanElement;

const MAX_LOG_LINES = 120;
const logs: string[] = [];
const DEFAULT_STATUS = "Status: idle";
appendLog("INFO: UI script booting...");

function getDaemonApi(): DaemonApi | null {
  return appWindow.daemonApi ?? null;
}

function logClient(level: "INFO" | "WARN" | "ERROR", message: string): void {
  const api = getDaemonApi();
  if (!api) {
    appendLog(`WARN: IPC bridge unavailable; could not write to app log: ${message}`);
    return;
  }
  void api.logClient(level, message);
}

function showError(message: string): void {
  document.body.dataset.state = "error";
  statusEl.textContent = `Status: error | ${message}`;
  actionFeedbackEl.textContent = message;
  actionFeedbackEl.classList.add("error");
  appendLog(`ERROR: ${message}`);
  logClient("ERROR", message);
}

function showAction(message: string): void {
  actionFeedbackEl.textContent = message;
  actionFeedbackEl.classList.remove("error");
  appendLog(`INFO: ${message}`);
  logClient("INFO", message);
}

function flashButton(button: HTMLButtonElement): void {
  button.classList.remove("flash-success");
  void button.offsetWidth;
  button.classList.add("flash-success");
}

async function runWithButtonState(button: HTMLButtonElement, action: () => Promise<void>): Promise<void> {
  button.disabled = true;
  try {
    await action();
    flashButton(button);
  } finally {
    button.disabled = false;
  }
}

function appendLog(line: string): void {
  logs.push(line);
  while (logs.length > MAX_LOG_LINES) {
    logs.shift();
  }
  logPanel.textContent = logs.join("\n");
  logPanel.scrollTop = logPanel.scrollHeight;
}

function applyStatus(status: UiStatus): void {
  document.body.dataset.state = status.state;
  bridgeBannerEl.hidden = true;
  statusEl.textContent = `Status: ${status.state} | ${status.logLine}`;
  metricHeight.textContent = String(status.height);
  metricTargetHeight.textContent = String(status.targetHeight);
  metricDifficulty.textContent = String(status.difficulty);
  metricTxPool.textContent = String(status.txPoolSize);
  metricPeers.textContent = String(status.peers);
  metricMiningSpeed.textContent = `${status.miningSpeed} H/s`;
  metricMiningThreads.textContent = String(status.miningThreads);

  if (status.state === "block-found") {
    minerEl.classList.add("celebrate");
    setTimeout(() => minerEl.classList.remove("celebrate"), 1400);
  }
}

async function refreshStatus(): Promise<void> {
  const api = getDaemonApi();
  if (!api) {
    showMissingBridge();
    return;
  }

  try {
    const status = await api.getStatus();
    applyStatus(status);
  } catch (error) {
    showError(`refresh failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function showMissingBridge(): void {
  bridgeBannerEl.hidden = false;
  showError("IPC bridge missing. Preload failed to expose daemonApi.");
}

(document.getElementById("startMining") as HTMLButtonElement).addEventListener("click", async (event) => {
  console.log("[UI] Start Mining button clicked");
  const button = event.currentTarget as HTMLButtonElement;
  const walletAddress = walletAddressEl.value.trim();
  const threads = Number.parseInt(threadsEl.value, 10);
  const api = getDaemonApi();

  console.log("[UI] start_mining payload", {
    walletPreview: walletAddress.slice(0, 12),
    walletLength: walletAddress.length,
    threads
  });
  logClient("INFO", `start click walletLength=${walletAddress.length} threads=${threads}`);

  if (!api) {
    showMissingBridge();
    return;
  }

  if (walletAddress.length < 20) {
    showError("Enter a valid wallet address before starting mining.");
    return;
  }
  if (!Number.isInteger(threads) || threads < 1 || threads > 128) {
    showError("Threads must be an integer between 1 and 128.");
    return;
  }

  document.body.dataset.state = "starting";
  statusEl.textContent = "Status: starting | start_mining request in progress";
  showAction("Starting mining request...");
  await runWithButtonState(button, async () => {
    try {
      console.log("[UI] invoking daemonApi.startMining...");
      const status = await api.startMining(walletAddress, threads);
      console.log("[UI] daemonApi.startMining resolved", status);
      showAction(`Mining started with ${threads} thread(s).`);
      appendLog(`Requested start_mining: threads=${threads}`);
      applyStatus(status);
    } catch (error) {
      console.error("[UI] daemonApi.startMining failed", error);
      showError(`start_mining failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
});

(document.getElementById("stopMining") as HTMLButtonElement).addEventListener("click", async (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const api = getDaemonApi();
  if (!api) {
    showMissingBridge();
    return;
  }

  showAction("Stopping mining request...");
  await runWithButtonState(button, async () => {
    try {
      const status = await api.stopMining();
      showAction("Mining stopped.");
      appendLog("Requested stop_mining");
      applyStatus(status);
    } catch (error) {
      showError(`stop_mining failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
});

(document.getElementById("setLimit") as HTMLButtonElement).addEventListener("click", async (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const down = Number.parseInt(limitDownEl.value, 10);
  const up = Number.parseInt(limitUpEl.value, 10);
  const api = getDaemonApi();
  if (!api) {
    showMissingBridge();
    return;
  }

  showAction("Applying network limit request...");
  await runWithButtonState(button, async () => {
    try {
      const status = await api.setLimit(down, up);
      showAction(`Network limits applied: down=${down} up=${up}`);
      appendLog(`Requested set_limit: down=${down} up=${up}`);
      applyStatus(status);
    } catch (error) {
      showError(`set_limit failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
});

(document.getElementById("refresh") as HTMLButtonElement).addEventListener("click", () => {
  showAction("Refreshing status...");
  void refreshStatus();
});

(document.getElementById("clearLogs") as HTMLButtonElement).addEventListener("click", () => {
  logs.length = 0;
  logPanel.textContent = "";
  showAction("Runtime console cleared.");
});

(async () => {
  statusEl.textContent = DEFAULT_STATUS;
  const api = getDaemonApi();

  if (!api) {
    showMissingBridge();
    return;
  }

  api.onStatus((status) => {
    applyStatus(status);
  });

  api.onLog((line) => {
    appendLog(line);
  });

  api.onError((message) => {
    showError(`poll failed: ${message}`);
  });

  appendLog("INFO: IPC bridge detected.");
  try {
    const initialLogs = await api.getLogs();
    for (const line of initialLogs) {
      appendLog(line);
    }
  } catch (error) {
    showError(`initial log fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  await refreshStatus();
})();
