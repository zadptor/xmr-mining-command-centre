import { spawn } from "node:child_process";

export const MONERO_GUI_DIR = "C:/Program Files/Monero GUI Wallet";

export type MoneroCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

export async function runMoneroCommand(
  exeName: string,
  args: string[],
  cwd = MONERO_GUI_DIR
): Promise<MoneroCommandResult> {
  return new Promise((resolve) => {
    const proc = spawn(exeName, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    proc.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });
  });
}
