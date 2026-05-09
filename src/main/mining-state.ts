export type MiningState = "idle" | "mining" | "block-found";

export type MiningViewModel = {
  state: MiningState;
  hashrate: string;
  lastEventAt: string;
  logLine: string;
};

export const initialMiningViewModel: MiningViewModel = {
  state: "idle",
  hashrate: "0 H/s",
  lastEventAt: new Date().toISOString(),
  logLine: "Waiting to start mining..."
};
