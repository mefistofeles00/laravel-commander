# Laravel Commander

> **Status: early development** — MVP features work; packaging and polish in progress.

An open-source desktop app for managing Laravel projects: add a project, edit
its `.env`, and run artisan commands — without touching the terminal.

## Features

- **Projects** — add a Laravel folder (validated: `artisan` + `laravel/framework`),
  see its Laravel version, PHP requirement and packages at a glance
- **.env editor** — comments, blank lines, key order and quote style survive
  every save; diff against `.env.example` with one-click add for missing keys;
  smart inputs (toggles for booleans, dropdowns for known keys, masked secrets)
- **Artisan panel** — full command catalog from `artisan list --format=json`,
  forms generated from each command's arguments and options, one-click quick
  actions, live ANSI-colored output with cancel support
- **PHP detection** — Herd, Homebrew, XAMPP and PATH fallback chain

Built with Electron, Vue 3, TypeScript, Tailwind CSS and shadcn-vue.

## Development

```bash
pnpm install
pnpm dev
```

## Layout

```
electron/main/       # Main process: window, services, IPC handlers
electron/preload/    # contextBridge API (the only place ipcRenderer is used)
src/                 # Renderer: Vue 3 pages, stores, components
shared/types.ts      # Typed IPC contract shared by main and renderer
```

All main↔renderer communication goes through the typed contract in
`shared/types.ts` — adding a channel there type-errors until both the preload
API and the main-process handler implement it.

## Scripts

| Command          | Description                              |
| ---------------- | ---------------------------------------- |
| `pnpm dev`       | Run in development with HMR              |
| `pnpm typecheck` | Typecheck main (node) and renderer (web) |
| `pnpm build`     | Typecheck + production build             |
| `pnpm lint`      | ESLint                                   |

## License

[MIT](LICENSE)
