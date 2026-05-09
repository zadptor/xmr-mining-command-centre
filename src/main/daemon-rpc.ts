import { request } from "node:http";

export type DaemonInfo = {
  height: number;
  target_height: number;
  difficulty: number;
  tx_count: number;
  tx_pool_size: number;
  incoming_connections_count: number;
  outgoing_connections_count: number;
  status: string;
};

export type MiningStatus = {
  active: boolean;
  address: string;
  speed: number;
  status: string;
  threads_count: number;
  untrusted: boolean;
};

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: Record<string, unknown>;
};

export class MoneroDaemonRpc {
  constructor(
    private readonly host = "127.0.0.1",
    private readonly port = 18081
  ) {}

  async getInfo(): Promise<DaemonInfo> {
    const result = await this.callRpc<DaemonInfo>("get_info");
    return result;
  }

  async startMining(walletAddress: string, threadsCount: number): Promise<void> {
    await this.callEndpoint("/start_mining", {
      miner_address: walletAddress,
      threads_count: threadsCount,
      do_background_mining: false,
      ignore_battery: true
    });
  }

  async stopMining(): Promise<void> {
    await this.callEndpoint("/stop_mining");
  }

  async setLimit(limitDown: number, limitUp: number): Promise<void> {
    await this.callEndpoint("/set_limit", {
      limit_down: limitDown,
      limit_up: limitUp
    });
  }

  async getMiningStatus(): Promise<MiningStatus> {
    return this.callEndpoint<MiningStatus>("/mining_status");
  }

  private async callRpc<T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const body: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: `mmc-${Date.now()}`,
      method,
      params
    };

    const response = await this.postJson("/json_rpc", body);
    if (response.error) {
      throw new Error(`${response.error.message} (code ${response.error.code})`);
    }
    return response.result as T;
  }

  private async callEndpoint<T = unknown>(
    path: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const response = await this.postJson(path, params ?? {});
    if (response.status && response.status !== "OK") {
      throw new Error(`Daemon returned status ${response.status}`);
    }
    return response as T;
  }

  private postJson(path: string, payload: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(payload);
      const req = request(
        {
          host: this.host,
          port: this.port,
          path,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body)
          }
        },
        (res) => {
          let raw = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            raw += chunk;
          });
          res.on("end", () => {
            try {
              resolve(JSON.parse(raw || "{}"));
            } catch {
              reject(new Error(`Invalid daemon response: ${raw}`));
            }
          });
        }
      );

      req.setTimeout(10000, () => {
        req.destroy(new Error("Daemon RPC request timed out after 10s."));
      });
      req.on("error", (err) => reject(err));
      req.write(body);
      req.end();
    });
  }
}
