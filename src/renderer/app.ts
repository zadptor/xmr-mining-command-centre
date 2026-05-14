/// <reference path="../shared/daemon-api.d.ts" />

type AppWindow = Window & {
  daemonApi?: DaemonApi;
};

declare const PIXI: any;

type SceneState = UiStatus["state"] | "starting" | "error";
type SpriteDirection = "north" | "south" | "east" | "west" | "south-east" | "south-west";
type SpritePhase = "idle" | "walking" | "mining-action" | "celebrating";

const appWindow = window as AppWindow;

const statusEl = document.getElementById("status") as HTMLParagraphElement;
const actionFeedbackEl = document.getElementById("actionFeedback") as HTMLParagraphElement;
const monerodPathEl = document.getElementById("monerodPath") as HTMLInputElement;
const walletAddressEl = document.getElementById("walletAddress") as HTMLInputElement;
const threadsEl = document.getElementById("threads") as HTMLInputElement;
const limitDownEl = document.getElementById("limitDown") as HTMLInputElement;
const limitUpEl = document.getElementById("limitUp") as HTMLInputElement;
const logPanel = document.getElementById("logPanel") as HTMLPreElement;
const bridgeBannerEl = document.getElementById("bridgeBanner") as HTMLDivElement;
const toggleAnimationEl = document.getElementById("toggleAnimation") as HTMLButtonElement;

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

class MiningSpriteScene {
  private readonly basePath = "./assets/miner-character";
  private readonly idleKey = "stand_idle";
  private readonly walkKey = "walking";
  private readonly mineKey = "mining_action";
  private readonly celebrateKey = "gold_found";
  private readonly miningActionDurationMs = 10000;
  private app: any;
  private world: any;
  private sprite: any;
  private shadow: any;
  private oreNodes: any[] = [];
  private activeOreNode: any;
  private oreGlow: any;
  private celebrationLayer: any;
  private celebrationText: any;
  private confettiParticles: Array<{ shape: any; vx: number; vy: number; spin: number }> = [];
  private textures = new Map<string, any[]>();
  private state: SceneState = "idle";
  private phase: SpritePhase = "idle";
  private currentAnimation = "";
  private enabled = true;
  private targetX = 0;
  private targetY = 0;
  private actionMs = 0;
  private celebrationMs = 0;
  private ready = false;
  private lastDirection: SpriteDirection = "south";
  private nextMiningDirection: "east" | "west" = "east";

  constructor(private readonly host: HTMLElement) {
    void this.init();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.host.hidden = !enabled;

    if (!this.ready) {
      return;
    }

    if (enabled) {
      this.app.ticker.start();
      this.playState(this.state);
      return;
    }

    this.app.ticker.stop();
  }

  playState(state: SceneState): void {
    const previousState = this.state;
    this.state = state;

    if (!this.enabled) {
      return;
    }

    if (!this.ready) {
      return;
    }

    if (state === previousState && state === "mining" && this.phase !== "idle") {
      return;
    }

    if (state === "block-found") {
      this.phase = "celebrating";
      this.centerSprite();
      this.play("celebrate:south", 0.16);
      this.startCelebration();
      return;
    }

    if (state === "mining") {
      this.nextMiningDirection = "east";
      this.beginMiningWalk("east");
      return;
    }

    if (state === "starting") {
      this.beginMiningWalk("east");
      return;
    }

    this.phase = "idle";
    this.play("idle:south", 0.08);
  }

  private async init(): Promise<void> {
    if (typeof PIXI === "undefined") {
      console.warn("[UI] PixiJS not loaded; sprite scene unavailable");
      return;
    }

    this.app = new PIXI.Application();
    await this.app.init({
      resizeTo: this.host,
      backgroundAlpha: 0,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2)
    });

    this.host.appendChild(this.app.canvas);
    this.world = new PIXI.Container();
    this.app.stage.addChild(this.world);
    this.shadow = new PIXI.Graphics();
    this.app.stage.addChild(this.shadow);
    this.celebrationLayer = new PIXI.Container();
    this.app.stage.addChild(this.celebrationLayer);

    await this.loadTextures();
    this.buildMineBackground();

    this.sprite = new PIXI.AnimatedSprite(this.textures.get("idle:south"));
    this.sprite.anchor.set(0.5, 1);
    this.sprite.scale.set(2.65);
    this.sprite.animationSpeed = 0.08;
    this.sprite.play();
    this.app.stage.addChild(this.sprite);

    this.centerSprite();
    this.ready = true;
    this.playState(this.state);
    this.app.ticker.add((ticker: { deltaMS: number }) => this.update(ticker.deltaMS));
    this.setEnabled(this.enabled);
    new ResizeObserver(() => {
      this.buildMineBackground();
      if (this.state === "idle" || this.state === "block-found") {
        this.centerSprite();
      }
    }).observe(this.host);
  }

  private async loadTextures(): Promise<void> {
    await this.setTextures("idle:south", this.animationPaths(this.idleKey, 9));

    for (const direction of ["east", "west"] as const) {
      await this.setTextures("walk:" + direction, this.framePaths(this.walkKey, direction, 9));
    }

    for (const direction of ["east", "west"] as const) {
      await this.setTextures("mine:" + direction, this.framePaths(this.mineKey, direction, 9));
    }

    await this.setTextures("celebrate:south", this.framePaths(this.celebrateKey, "south", 9));
  }

  private buildMineBackground(): void {
    if (!this.world) {
      return;
    }

    for (const child of this.world.removeChildren()) {
      child.destroy();
    }

    const width = Math.max(320, this.host.clientWidth);
    const height = Math.max(220, this.host.clientHeight);
    const floorY = height - 74;
    const ceilingY = Math.max(28, height * 0.1);
    const backWallY = Math.max(76, height * 0.32);

    this.addRect(0, 0, width, height, 0x0b0d12);
    this.addRect(0, ceilingY, width, floorY - ceilingY + 28, 0x171820);
    this.addRect(0, floorY - 16, width, height - floorY + 16, 0x241d1a);

    for (let x = 0; x < width; x += 32) {
      const offset = (x / 32) % 3;
      this.addRect(x, ceilingY + offset * 8, 32, 24, offset === 1 ? 0x20222c : 0x151722);
      this.addRect(x, floorY + (offset === 2 ? 10 : 0), 32, 28, offset === 0 ? 0x332922 : 0x2a221e);
    }

    for (let x = -24; x < width; x += 96) {
      const y = backWallY + (x % 2 === 0 ? -10 : 8);
      this.addRockCluster(x, y, 0x22242e, 0x11131a);
    }

    this.addRect(0, floorY - 6, width, 8, 0x4a392f);
    this.addRect(0, floorY + 2, width, 6, 0x17120f);

    this.addLamp(92, floorY - 96);
    this.addLamp(width - 124, floorY - 96);

    this.oreGlow = new PIXI.Graphics();
    this.world.addChild(this.oreGlow);

    this.oreNodes = [
      this.addGemCluster("west-gems", 38, floorY - 34, 0x42d9ff, 0xa855f7),
      this.addGemCluster("east-gems", width - 92, floorY - 34, 0xffc247, 0x34f5c5)
    ];
    this.activeOreNode = this.oreNodes[0];

    this.drawOreGlow();
  }

  private addRect(x: number, y: number, width: number, height: number, color: number, alpha = 1): any {
    const rect = new PIXI.Graphics();
    rect.rect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
    rect.fill({ color, alpha });
    this.world.addChild(rect);
    return rect;
  }

  private addRockCluster(x: number, y: number, color: number, shade: number): void {
    this.addRect(x, y + 24, 56, 32, shade, 0.8);
    this.addRect(x + 8, y + 8, 64, 32, color, 0.84);
    this.addRect(x + 32, y, 40, 24, 0x2c2e39, 0.72);
    this.addRect(x + 16, y + 18, 16, 8, 0x353744, 0.72);
    this.addRect(x + 48, y + 30, 12, 8, 0x101218, 0.64);
  }

  private addLamp(x: number, y: number): void {
    const glow = new PIXI.Graphics();
    glow.circle(x + 8, y + 22, 118);
    glow.fill({ color: 0xffbf5f, alpha: 0.16 });
    glow.circle(x + 8, y + 22, 62);
    glow.fill({ color: 0xffd27a, alpha: 0.22 });
    this.world.addChild(glow);

    this.addRect(x - 6, y + 34, 28, 10, 0x5b3a24);
    this.addRect(x + 2, y + 44, 12, 72, 0x3a2619);
    this.addRect(x - 18, y + 112, 52, 10, 0x241711);
    this.addRect(x - 2, y + 8, 20, 24, 0x19110c);
    this.addRect(x + 2, y + 12, 12, 16, 0xffd166);
    this.addRect(x + 4, y + 14, 8, 10, 0xfff0a3);
  }

  private addGemCluster(
    label: string,
    x: number,
    y: number,
    primary: number,
    secondary: number
  ): any {
    const cluster = new PIXI.Graphics();
    cluster.label = label;
    cluster.x = Math.round(x);
    cluster.y = Math.round(y);

    cluster.rect(0, 24, 54, 8);
    cluster.fill({ color: 0x151013, alpha: 0.62 });
    cluster.rect(4, 12, 10, 18);
    cluster.fill({ color: primary, alpha: 0.92 });
    cluster.rect(10, 6, 8, 24);
    cluster.fill({ color: secondary, alpha: 0.94 });
    cluster.rect(22, 10, 12, 20);
    cluster.fill({ color: primary, alpha: 0.82 });
    cluster.rect(36, 14, 8, 16);
    cluster.fill({ color: secondary, alpha: 0.86 });
    cluster.rect(12, 8, 4, 6);
    cluster.fill({ color: 0xffffff, alpha: 0.7 });
    cluster.rect(26, 12, 4, 6);
    cluster.fill({ color: 0xffffff, alpha: 0.54 });

    this.world.addChild(cluster);
    return cluster;
  }

  private async setTextures(key: string, paths: string[]): Promise<void> {
    const textures = await Promise.all(paths.map((path) => PIXI.Assets.load(path)));
    for (const texture of textures) {
      if (texture?.source) {
        texture.source.scaleMode = "nearest";
      }
    }
    this.textures.set(key, textures);
  }

  private framePaths(animation: string, direction: string, count: number): string[] {
    return Array.from({ length: count }, (_value, index) => {
      return `${this.basePath}/animations/${animation}/${direction}/frame_${String(index).padStart(3, "0")}.png`;
    });
  }

  private animationPaths(animation: string, count: number): string[] {
    return Array.from({ length: count }, (_value, index) => {
      return `${this.basePath}/animations/${animation}/frame_${String(index).padStart(3, "0")}.png`;
    });
  }

  private play(key: string, speed: number): void {
    if (!this.sprite || this.currentAnimation === key) {
      return;
    }

    const textures = this.textures.get(key);
    if (!textures || textures.length === 0) {
      return;
    }

    this.currentAnimation = key;
    this.sprite.textures = textures;
    this.sprite.animationSpeed = speed;
    this.sprite.gotoAndPlay(0);
  }

  private update(deltaMs: number): void {
    if (!this.ready || !this.sprite) {
      return;
    }

    if (this.state === "mining" || this.state === "starting") {
      this.updateMovement(deltaMs);
    }

    if (this.state === "block-found") {
      this.sprite.y = this.groundY() - 16 + Math.sin(performance.now() / 150) * 8;
    }

    this.updateCelebration(deltaMs);

    if (this.phase === "mining-action" || this.state === "block-found") {
      this.drawOreGlow();
    }

    this.drawShadow();
  }

  private updateMovement(deltaMs: number): void {
    if (this.phase === "mining-action") {
      this.actionMs -= deltaMs;
      if (this.actionMs <= 0) {
        this.beginMiningWalk(this.nextMiningDirection);
      }
      return;
    }

    const dx = this.targetX - this.sprite.x;
    const dy = this.targetY - this.sprite.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 4) {
      if (this.state === "mining") {
        this.startMiningAction(this.lastDirection === "west" ? "west" : "east");
      } else {
        this.phase = "idle";
        this.play("idle:south", 0.08);
      }
      return;
    }

    const speed = this.state === "mining" ? 72 : 42;
    const step = Math.min(distance, speed * deltaMs / 1000);
    this.sprite.x += dx / distance * step;
    this.sprite.y += dy / distance * step;
  }

  private beginMiningWalk(direction: "east" | "west"): void {
    this.phase = "walking";
    this.lastDirection = direction;
    this.targetX = direction === "east" ? this.bounds().right : this.bounds().left;
    this.targetY = this.groundY();
    this.play("walk:" + direction, 0.18);
  }

  private startMiningAction(direction: "east" | "west"): void {
    this.phase = "mining-action";
    this.actionMs = this.miningActionDurationMs;
    this.nextMiningDirection = direction === "east" ? "west" : "east";
    this.activeOreNode = this.oreNodes.find((node) => node.label === `${direction}-gems`) ?? this.activeOreNode;
    this.play("mine:" + direction, 0.21);
    this.drawOreGlow();
  }

  private centerSprite(): void {
    if (!this.sprite) {
      return;
    }
    this.sprite.x = this.host.clientWidth / 2;
    this.sprite.y = this.groundY();
  }

  private groundY(): number {
    return Math.max(150, this.host.clientHeight - 52);
  }

  private bounds(): { left: number; right: number; top: number; bottom: number } {
    const width = Math.max(320, this.host.clientWidth);
    const height = Math.max(220, this.host.clientHeight);
    return {
      left: 86,
      right: width - 86,
      top: Math.max(94, height * 0.34),
      bottom: height - 50
    };
  }

  private drawShadow(): void {
    this.shadow.clear();
    this.shadow.ellipse(this.sprite.x, this.groundY() + 4, 40, 9);
    this.shadow.fill({ color: 0x000000, alpha: this.state === "block-found" ? 0.18 : 0.28 });
  }

  private drawOreGlow(): void {
    if (!this.oreGlow || !this.activeOreNode) {
      return;
    }

    const pulse = this.phase === "mining-action"
      ? 0.24 + Math.sin(performance.now() / 90) * 0.08
      : this.state === "block-found"
        ? 0.34 + Math.sin(performance.now() / 120) * 0.08
        : 0.16;
    const isEastGems = this.activeOreNode.label === "east-gems";
    this.oreGlow.clear();
    this.oreGlow.circle(this.activeOreNode.x + 26, this.activeOreNode.y + 16, this.phase === "mining-action" ? 74 : 46);
    this.oreGlow.fill({ color: isEastGems ? 0xffc247 : 0x44d9ff, alpha: pulse });
  }

  private startCelebration(): void {
    if (!this.celebrationLayer) {
      return;
    }

    this.celebrationLayer.removeChildren().forEach((child: any) => child.destroy());
    this.confettiParticles = [];
    this.celebrationMs = 2000;

    this.celebrationText = new PIXI.Text({
      text: "CONGRATULATIONS!!!\nBlock Found",
      style: {
        fontFamily: "\"Lucida Console\", \"Courier New\", monospace",
        fontSize: Math.max(20, Math.min(42, this.host.clientWidth / 14)),
        fontWeight: "900",
        fill: 0xfff0a3,
        stroke: { color: 0x5a2100, width: 6 },
        align: "center",
        dropShadow: {
          color: 0x000000,
          blur: 0,
          angle: Math.PI / 4,
          distance: 5,
          alpha: 0.9
        }
      }
    });
    this.celebrationText.anchor.set(0.5);
    this.celebrationText.x = this.host.clientWidth / 2;
    this.celebrationText.y = Math.max(82, this.host.clientHeight * 0.28);
    this.celebrationText.scale.set(0.2);
    this.celebrationLayer.addChild(this.celebrationText);

    const colors = [0xffc857, 0xf26822, 0x59d86f, 0x69e8f0, 0xffffff];
    const centerX = this.host.clientWidth / 2;
    const burstY = Math.max(90, this.host.clientHeight * 0.25);
    for (let index = 0; index < 76; index += 1) {
      const shape = new PIXI.Graphics();
      const width = 5 + Math.random() * 8;
      const height = 5 + Math.random() * 10;
      shape.rect(-width / 2, -height / 2, width, height);
      shape.fill(colors[index % colors.length]);
      shape.x = centerX + (Math.random() - 0.5) * 72;
      shape.y = burstY + (Math.random() - 0.5) * 36;
      this.celebrationLayer.addChild(shape);
      this.confettiParticles.push({
        shape,
        vx: (Math.random() - 0.5) * 520,
        vy: -260 - Math.random() * 300,
        spin: (Math.random() - 0.5) * 10
      });
    }
  }

  private updateCelebration(deltaMs: number): void {
    if (!this.celebrationLayer || this.celebrationMs <= 0) {
      return;
    }

    this.celebrationMs = Math.max(0, this.celebrationMs - deltaMs);
    const seconds = deltaMs / 1000;
    const elapsed = 2000 - this.celebrationMs;
    const fade = Math.min(1, this.celebrationMs / 350);

    if (this.celebrationText) {
      const pop = Math.min(1, elapsed / 180);
      this.celebrationText.scale.set(0.2 + pop * 0.8);
      this.celebrationText.y = Math.max(82, this.host.clientHeight * 0.28) + Math.sin(performance.now() / 80) * 4;
      this.celebrationText.alpha = fade;
    }

    for (const particle of this.confettiParticles) {
      particle.vy += 620 * seconds;
      particle.shape.x += particle.vx * seconds;
      particle.shape.y += particle.vy * seconds;
      particle.shape.rotation += particle.spin * seconds;
      particle.shape.alpha = fade;
    }

    if (this.celebrationMs === 0) {
      this.celebrationLayer.removeChildren().forEach((child: any) => child.destroy());
      this.confettiParticles = [];
      this.celebrationText = null;
    }
  }
}

const spriteScene = new MiningSpriteScene(document.getElementById("spriteStage") as HTMLDivElement);
let animationEnabled = true;

appendLog("INFO: UI script booting...");

function getDaemonApi(): DaemonApi | null {
  return appWindow.daemonApi ?? null;
}

function logClient(level: LogLevel, message: string): void {
  const api = getDaemonApi();
  if (!api) {
    appendLog(`WARN: IPC bridge unavailable; could not write to app log: ${message}`);
    return;
  }
  void api.logClient(level, message);
}

function showError(message: string): void {
  document.body.dataset.state = "error";
  spriteScene.playState("error");
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
  spriteScene.playState(status.state);
  bridgeBannerEl.hidden = true;
  statusEl.textContent = `Status: ${status.state} | ${status.logLine}`;
  metricHeight.textContent = String(status.height);
  metricTargetHeight.textContent = String(status.targetHeight);
  metricDifficulty.textContent = String(status.difficulty);
  metricTxPool.textContent = String(status.txPoolSize);
  metricPeers.textContent = String(status.peers);
  metricMiningSpeed.textContent = `${status.miningSpeed} H/s`;
  metricMiningThreads.textContent = String(status.miningThreads);

}

function setAnimationEnabled(enabled: boolean): void {
  animationEnabled = enabled;
  document.body.dataset.animation = enabled ? "on" : "off";
  toggleAnimationEl.textContent = enabled ? "Disable Animation" : "Enable Animation";
  toggleAnimationEl.setAttribute("aria-pressed", String(enabled));
  spriteScene.setEnabled(enabled);
}

function applySettings(settings: DaemonSettings): void {
  monerodPathEl.value = settings.monerodPath || "";
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
  if (animationEnabled) {
    spriteScene.playState("starting");
  }
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

toggleAnimationEl.addEventListener("click", () => {
  setAnimationEnabled(!animationEnabled);
  showAction(`Mining animation ${animationEnabled ? "enabled" : "disabled"}.`);
});

(document.getElementById("chooseMonerod") as HTMLButtonElement).addEventListener("click", async (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const api = getDaemonApi();
  if (!api) {
    showMissingBridge();
    return;
  }

  showAction("Selecting monerod.exe...");
  await runWithButtonState(button, async () => {
    try {
      const settings = await api.chooseMonerod();
      applySettings(settings);
      showAction(`Monero daemon path set: ${settings.monerodPath}`);
      await refreshStatus();
    } catch (error) {
      showError(`daemon path update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
});

(document.getElementById("clearLogs") as HTMLButtonElement).addEventListener("click", () => {
  logs.length = 0;
  logPanel.textContent = "";
  showAction("Runtime console cleared.");
});

(async () => {
  statusEl.textContent = DEFAULT_STATUS;
  setAnimationEnabled(animationEnabled);
  const api = getDaemonApi();

  if (!api) {
    showMissingBridge();
    return;
  }

  api.onStatus((status) => {
    applyStatus(status);
  });

  api.onSettings((settings) => {
    applySettings(settings);
  });

  api.onLog((line) => {
    appendLog(line);
  });

  api.onError((message) => {
    showError(`poll failed: ${message}`);
  });

  appendLog("INFO: IPC bridge detected.");
  try {
    const settings = await api.getSettings();
    applySettings(settings);
  } catch (error) {
    showError(`settings load failed: ${error instanceof Error ? error.message : String(error)}`);
  }

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
