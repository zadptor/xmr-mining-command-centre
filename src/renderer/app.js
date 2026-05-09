const statusEl = document.getElementById("status");
const minerEl = document.getElementById("miner");
const startBtn = document.getElementById("startMining");
const stopBtn = document.getElementById("stopMining");
const refreshBtn = document.getElementById("refresh");
const clearBtn = document.getElementById("clearLogs");
const logPanel = document.getElementById("logPanel");

let mining = false;
let foundTimer = null;
const logs = [];

function appendLog(line) {
  logs.push(line);
  if (logs.length > 120) logs.shift();
  if (logPanel) logPanel.textContent = logs.join("\n");
  if (logPanel) logPanel.scrollTop = logPanel.scrollHeight;
}

function setState(nextState) {
  document.body.dataset.state = nextState;
  const labels = {
    idle: "Status: idle",
    starting: "Status: starting…",
    mining: "Status: mining | daemon active",
    "block-found": "Status: block-found | XMR earned!",
    error: "Status: error"
  };
  if (statusEl) statusEl.textContent = labels[nextState] || `Status: ${nextState}`;
}

function flashBtn(btn) {
  if (!btn) return;
  btn.classList.remove("flash-success");
  void btn.offsetWidth;
  btn.classList.add("flash-success");
}

startBtn?.addEventListener("click", () => {
  if (mining) return;
  mining = true;
  setState("starting");
  appendLog("INFO: start_mining requested (demo mode)");

  setTimeout(() => {
    setState("mining");
    flashBtn(startBtn);
    appendLog("INFO: mining active | threads=2 | speed=312 H/s");

    if (foundTimer) clearTimeout(foundTimer);
    foundTimer = setTimeout(() => {
      setState("block-found");
      appendLog("INFO: Block found! XMR reward credited.");
      setTimeout(() => {
        if (mining) {
          setState("mining");
          appendLog("INFO: resumed mining after block");
        }
      }, 3200);
    }, 5000);
  }, 900);
});

stopBtn?.addEventListener("click", () => {
  if (!mining) return;
  mining = false;
  if (foundTimer) { clearTimeout(foundTimer); foundTimer = null; }
  setState("idle");
  flashBtn(stopBtn);
  appendLog("INFO: stop_mining requested (demo mode)");
});

refreshBtn?.addEventListener("click", () => {
  flashBtn(refreshBtn);
  appendLog("INFO: status refreshed (demo mode — no daemon connected)");
});

clearBtn?.addEventListener("click", () => {
  logs.length = 0;
  if (logPanel) logPanel.textContent = "";
  appendLog("INFO: console cleared");
});

appendLog("INFO: XMR Mining Command Centre loaded");
appendLog("INFO: Running in browser preview mode — connect Monero daemon for live data");
setState("idle");
