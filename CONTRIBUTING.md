# Contributing to Laravel Commander

Thanks for helping! This document gets you from clone to merged PR.

## Setup

You need Node.js 22+ and [pnpm](https://pnpm.io). PHP is only needed to
exercise the artisan features against a real Laravel project.

```bash
git clone https://github.com/OWNER/laravel-commander.git
cd laravel-commander
pnpm install
pnpm dev
```

## Scripts

| Command          | Description                                     |
| ---------------- | ----------------------------------------------- |
| `pnpm dev`       | Run in development with HMR                     |
| `pnpm typecheck` | Typecheck main (node) and renderer (web)        |
| `pnpm lint`      | ESLint                                          |
| `pnpm format`    | Prettier                                        |
| `pnpm build`     | Typecheck + production build of all 3 processes |

## Architecture in 60 seconds

```
electron/main/       Main process: window, services, IPC handlers
├── services/        ProjectManager, PhpEnvironment, CommandRunner, EnvFileService
└── ipc/             One registrar per feature area + typed registry helpers
electron/preload/    contextBridge API — the ONLY place ipcRenderer is used
src/                 Renderer: Vue 3 pages, Pinia stores, components
shared/types.ts      The typed IPC contract both sides compile against
```

**The IPC contract is the spine of the app.** To add a new capability:

1. Declare the channel in `IpcChannels` (or `IpcEvents` for main→renderer
   pushes) in `shared/types.ts`, and add the method to `LaravelCommanderApi`.
2. Implement the handler in the matching `electron/main/ipc/*.ts` registrar
   using the typed `handle()` helper.
3. Expose the method in `electron/preload/index.ts`.
4. Call `window.api.yourMethod()` from the renderer.

TypeScript fails the build until all steps agree — that's intentional.

**Security ground rules** (enforced in review):

- `contextIsolation` stays on, `nodeIntegration` stays off.
- The renderer never passes raw file paths to execute or raw shell commands.
  Everything is validated in the main process against stored project data.
- Processes are spawned with `spawn`/`execFile` (argument arrays), never a shell.

## Pull requests

- Keep PRs focused — one feature or fix per PR.
- `pnpm lint` and `pnpm build` must pass; CI runs both.
- UI changes: include a screenshot, and match the existing design language
  (dark warm-charcoal theme, monospace for paths/versions/commands).
- New .env parsing or artisan edge cases: describe the input that triggered
  them in the PR so the case is reproducible.

## Reporting bugs

Use the bug report template. The PHP setup detected (bottom-left of the
sidebar) and your OS are the two facts we almost always need.
