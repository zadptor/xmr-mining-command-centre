# Monero Mine Central

Electron desktop app for controlling a local Monero daemon mining session from a graphical UI with runtime logs, daemon metrics, and an optional PixiJS mining animation.

The app talks to `monerod` over RPC at `127.0.0.1:18081`. It does not execute arbitrary shell commands from the UI, and the exposed daemon actions are allowlisted through the Electron preload IPC bridge.

## Current Features

- Start and stop daemon mining from the desktop UI.
- Select and persist the local `monerod.exe` path.
- Poll daemon status using `/mining_status.active` as the source of truth for mining state.
- Show block height, target height, difficulty, tx pool size, peer count, mining speed, and mining threads.
- Write app and renderer activity to:
  - `C:\Users\USER\AppData\Roaming\monero-mine-central\logs\app.log`
- Show an in-app Runtime Console.
- Toggle the mining animation on or off to reduce renderer work while mining.
- Build a clickable Windows app folder with Electron Packager.

## Prerequisites

- Windows 10 or Windows 11.
- Node.js LTS with npm available in PowerShell.
- Git, if you are cloning the repository.
- Monero GUI Wallet or Monero CLI binaries installed locally.
- A synced or syncing local Monero daemon (`monerod`) listening on `127.0.0.1:18081`.

This project is currently Windows-oriented. Commands below use `npm.cmd` because that is the most reliable form from PowerShell in this environment.

## Download Monero

Use official Monero sources only.

- Official downloads page: [getmonero.org/downloads](https://www.getmonero.org/downloads/)
- Official GUI wallet releases: [github.com/monero-project/monero-gui/releases](https://github.com/monero-project/monero-gui/releases)
- Official CLI releases: [github.com/monero-project/monero/releases](https://github.com/monero-project/monero/releases)
- Monero docs on downloading binaries: [docs.getmonero.org/interacting/download-monero-binaries](https://docs.getmonero.org/interacting/download-monero-binaries/)

The GUI wallet package includes the GUI wallet and the Monero daemon binaries. This app expects `monerod.exe`; common install paths include:

```text
C:\Program Files\Monero GUI Wallet\monerod.exe
C:\Program Files (x86)\Monero GUI Wallet\monerod.exe
```

If your `monerod.exe` is elsewhere, use the app's `Choose monerod.exe` button.

## Antivirus Remark

Monero binaries may be flagged by antivirus or firewall tools because the package includes mining-capable software. The official Monero downloads page explicitly warns that some antivirus products may flag Monero executables and archives.

Do not bypass antivirus warnings for random downloads. Only download from official Monero sources, verify hashes/signatures, and then add an exclusion only for the folder where you intentionally installed Monero.

Recommended local folder pattern:

```text
C:\Monero\
```

After downloading, verify the archive before running it. The official downloads page publishes hashes and verification guidance.

## Local Blockchain Setup

Recommended path: let `monerod` sync normally over the peer-to-peer network. Official Monero guidance says most users do not need a downloaded raw blockchain file, and normal sync is usually faster because it downloads from many peers while validating blocks as they arrive.

Start local daemon sync manually:

```powershell
& "C:\Program Files\Monero GUI Wallet\monerod.exe" --rpc-bind-ip 127.0.0.1 --rpc-bind-port 18081
```

Or let Monero Mine Central start `monerod.exe` after you select the daemon path.

Advanced bootstrap option:

- Official import guide: [getmonero.org/resources/user-guides/importing_blockchain.html](https://www.getmonero.org/resources/user-guides/importing_blockchain.html)
- Current raw bootstrap file mentioned by Monero guide: [downloads.getmonero.org/blockchain.raw](https://downloads.getmonero.org/blockchain.raw)
- Import tool reference: [docs.getmonero.org/interacting/monero-blockchain-import-reference](https://docs.getmonero.org/interacting/monero-blockchain-import-reference/)

Import example:

```powershell
cd "C:\Program Files\Monero GUI Wallet"
.\monero-blockchain-import.exe --input-file "C:\Users\USER\Downloads\blockchain.raw"
```

Do not use `--dangerous-unverified-import` for a blockchain file downloaded from the internet. Monero docs describe that mode as safe only for your own trusted, already-verified export.

## Install Project Dependencies

From the repository root:

```powershell
npm.cmd install
```

## Run In Development

```powershell
npm.cmd run dev
```

This builds TypeScript and renderer assets, then launches Electron.

Expected daemon RPC:

```text
127.0.0.1:18081
```

If the app cannot find `monerod.exe`, click `Choose monerod.exe` and select the daemon binary from your Monero installation.

## Build And Typecheck

Run both before claiming a code fix:

```powershell
npm.cmd run typecheck
npm.cmd run build
```

`build` compiles main/preload TypeScript, compiles renderer TypeScript, copies `index.html`, `style.css`, `monero-xmr-logo.svg`, PixiJS, and renderer assets into `dist/renderer`.

## Build The Windows App Folder

Package a clickable Windows app folder:

```powershell
npm.cmd run dist:win
```

Output:

```text
release-current\Monero Mine Central-win32-x64\Monero Mine Central.exe
```

Important:

- This project uses `@electron/packager`, not Electron Builder.
- The `.exe` must stay inside its generated folder with the adjacent Electron support files.
- If packaging fails because `app.asar` or Electron files are locked, close any running packaged app or Electron process and run `npm.cmd run dist:win` again.
- After source or renderer changes, the existing `release-current` app is stale until `npm.cmd run dist:win` succeeds.

## Useful Debug Checks

Check app log:

```text
C:\Users\USER\AppData\Roaming\monero-mine-central\logs\app.log
```

Probe daemon `get_info`:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:18081/json_rpc" `
  -ContentType "application/json" `
  -Body '{"jsonrpc":"2.0","id":"0","method":"get_info"}'
```

Probe daemon mining status:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:18081/mining_status" `
  -ContentType "application/json" `
  -Body '{}'
```

## Project Structure

```text
src/main/       Electron main process, daemon startup, RPC IPC handlers
src/preload/    Safe preload bridge exposing window.daemonApi
src/renderer/   Browser UI, PixiJS scene, controls, styles, static assets
src/shared/     Shared ambient daemon API TypeScript declarations
scripts/        Build asset copy scripts
dist/           Generated build output
release-current/ Packaged Windows app output
```

## Security Notes

- No arbitrary shell execution from the renderer UI.
- Keep daemon methods allowlisted and typed.
- Mining state must come from daemon `/mining_status.active`.
- Every user action should produce visible UI feedback and app log output.
- Verify Monero downloads before running wallet or daemon binaries.
