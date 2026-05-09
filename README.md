# Monero Mine Central

Desktop application project to control Monero daemon mining from a graphical UI with animated mining feedback.

## Goals

- Integrate with Monero daemon binaries installed at `C:/Program Files/Monero GUI Wallet`
- Expose daemon utility commands in a friendly GUI
- Show animated mining state
- Celebrate block discovery with a visible animation state

## Repo Status

This repository is initialized and contains a starter structure with:

- Main process utilities in `src/main`
- Renderer prototype in `src/renderer`
- Initial Monero CLI wrapper (`src/main/monero-cli.ts`)
- Pixel-style mining animation states (`idle`, `mining`, `block-found`)

## Proposed Tech Stack

- Electron (desktop runtime)
- React + TypeScript (renderer)
- IPC bridge for secure command execution
- Child process wrapper for daemon/CLI integration

## Next Build Steps

1. Add dependencies (`electron`, `vite`, `react`, `typescript`, `@types/node`)
2. Replace `dev` placeholder script with real Electron + Vite dev workflow
3. Implement command catalog for daemon commands (start, stop, status, set options, show stats)
4. Parse daemon output stream and map events to UI state updates
5. Implement richer sprite-sheet pixel animations for mining and block-found states
6. Add logs pane and command history in the UI

## Security Notes

- Do not execute arbitrary shell text from UI.
- Use a strict allowlist of supported daemon commands and typed arguments.
- Keep executable paths configurable in settings with validation.

## Run (Current Placeholder)

```bash
npm run dev
```

This currently prints a setup note until dependencies and Electron wiring are added.
