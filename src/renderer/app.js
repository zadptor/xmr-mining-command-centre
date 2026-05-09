const status = document.getElementById("status");
const toggle = document.getElementById("toggle");
const miner = document.getElementById("miner");

let mining = false;
let foundTimer = null;

function setState(nextState) {
  document.body.dataset.state = nextState;
  status.textContent = `Status: ${nextState}`;

  if (nextState === "mining") {
    toggle.textContent = "Stop Mining";
    return;
  }

  if (nextState === "idle") {
    toggle.textContent = "Start Mining";
    return;
  }

  toggle.textContent = "Keep Mining";
}

toggle?.addEventListener("click", () => {
  mining = !mining;
  if (foundTimer) {
    clearTimeout(foundTimer);
  }

  if (!mining) {
    setState("idle");
    return;
  }

  setState("mining");

  // Demo block-found animation trigger.
  foundTimer = setTimeout(() => {
    setState("block-found");
    miner?.classList.add("celebrate");

    setTimeout(() => {
      if (mining) {
        miner?.classList.remove("celebrate");
        setState("mining");
      }
    }, 1800);
  }, 3500);
});

setState("idle");
