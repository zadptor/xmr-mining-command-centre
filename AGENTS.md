# AGENTS.md

## Mission
Build **MoneroMineCentral** as an Electron desktop app that controls a running Monero daemon and makes mining visually fun with crypto/pixel-style states and animations, while keeping daemon RPC and IPC safe, typed, and observable.

## Current State
- Electron + TypeScript app is wired and buildable.
- Renderer script execution issue is fixed. Do not reintroduce `export {}` in `src/renderer/app.ts` unless `index.html` is changed to load it as `type="module"`.
- Preload exposes `window.daemonApi` and renderer guards missing preload with a visible IPC bridge banner.
- Main process captures renderer console messages, renderer load failures, and renderer crashes into the app log.
- File logging is enabled in Electron userData:
  - `C:\Users\USER\AppData\Roaming\monero-mine-central\logs\app.log`
- Monero daemon RPC is wired and tested against a local daemon on `127.0.0.1:18081`.
- Important RPC endpoint distinction:
  - `get_info` uses JSON-RPC endpoint `/json_rpc`.
  - `start_mining`, `stop_mining`, `set_limit`, and `mining_status` use direct daemon endpoints:
    - `/start_mining`
    - `/stop_mining`
    - `/set_limit`
    - `/mining_status`
- `pollStatus()` uses `/mining_status.active` as the source of truth for `idle` vs `mining`.
- `Start Mining` click path has been validated end-to-end:
  - renderer click log
  - `daemon:start-mining` IPC
  - daemon `/start_mining`
  - daemon `/mining_status`
  - UI state update
- Renderer UI has been redesigned with crypto/mining theme:
  - Monero logo in header
  - animated miner/pickaxe scene
  - ore pile sparks while mining
  - floating Monero coin
  - hash-rain background
  - runtime console
  - metrics for height, target, difficulty, tx pool, peers, mining speed, and mining threads
- `monero-xmr-logo.svg` is copied into `dist/renderer` during build.
- A clickable Windows app build is available at:
  - `release-current\Monero Mine Central-win32-x64\Monero Mine Central.exe`
- Packaging command:
  - `npm.cmd run dist:win`
- Packaging uses `@electron/packager`, not Electron Builder. Electron Builder had Windows symlink/code-sign helper failures in this environment.

## Commands
- Build:
  - `npm.cmd run build`
- Typecheck:
  - `npm.cmd run typecheck`
- Development run:
  - `npm.cmd run dev`
- Package Windows clickable app folder:
  - `npm.cmd run dist:win`

## Guardrails
- No arbitrary shell execution from UI.
- Keep daemon methods allowlisted and typed.
- No fake success states. `mining` must reflect daemon `/mining_status.active`.
- Every user action must produce visible feedback in UI and write to the log file.
- Do not claim a fix without running `npm.cmd run build` and `npm.cmd run typecheck`.
- For start/stop mining changes, validate app log entries and, when possible, verify daemon state with `/mining_status`.
- Keep edits focused. Do not do drive-by refactors.

## Known Environment Notes
- The app expects `monerod` RPC on `127.0.0.1:18081`.
- The packaged `.exe` must stay inside its generated folder with adjacent Electron support files.
- Old folders such as `release`, `release-build`, `release-app`, and `release-packaged` may exist from previous packaging attempts. Use `release-current`.
- If packaging fails with locked `app.asar`, close any running packaged app or Electron process, or package into a fresh output folder.

## Debug Checklist
1. Run `npm.cmd run build`.
2. Run `npm.cmd run typecheck`.
3. Run `npm.cmd run dev` or launch `release-current\Monero Mine Central-win32-x64\Monero Mine Central.exe`.
4. Check in-app Runtime Console for renderer boot/action logs.
5. Check app log:
   - `C:\Users\USER\AppData\Roaming\monero-mine-central\logs\app.log`
6. For daemon wiring, probe:
   - `POST http://127.0.0.1:18081/json_rpc` with `get_info`
   - `POST http://127.0.0.1:18081/mining_status` with `{}`

## Immediate Definition Of Done
- Clicking `Start Mining` visibly changes UI to `starting`, then `mining` only when daemon accepts and reports active.
- A click produces logs in both:
  - in-app Runtime Console
  - `C:\Users\USER\AppData\Roaming\monero-mine-central\logs\app.log`
- If mining fails, the user sees explicit error text.
- Packaged Windows app can be launched without `npm run dev`.
