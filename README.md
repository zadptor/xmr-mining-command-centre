# Monero Mine Central

Desktop application project to control Monero daemon mining from a graphical UI with animated mining feedback.

## Goals

- Integrate with Monero daemon binaries installed at `C:/Program Files/Monero GUI Wallet`
- Expose daemon utility commands in a friendly GUI
- Show animated mining state
- Celebrate block discovery with a visible animation state

## Repo Status

This repository contains a wired Electron desktop app with:

- Main process daemon RPC and IPC handlers in `src/main`
- A preload IPC bridge in `src/preload`
- Renderer controls and Pixi mining animation in `src/renderer`
- Shared daemon API declarations in `src/shared`

## Tech Stack

- Electron (desktop runtime)
- TypeScript
- PixiJS renderer animation
- Typed IPC bridge for secure daemon actions

## Commands

```bash
npm run build
npm run typecheck
npm run dev
npm run dist:win
```

## Security Notes

- Do not execute arbitrary shell text from UI.
- Use a strict allowlist of supported daemon commands and typed arguments.
- Keep executable paths configurable in settings with validation.

## Run

```bash
npm run dev
```
