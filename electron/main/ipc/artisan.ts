import type { CommandRunner } from '../services/CommandRunner'

/**
 * Artisan IPC handlers.
 * TODO Phase 2: artisan:list (command catalog via `php artisan list
 * --format=json`), artisan:run (streamed through CommandRunner),
 * artisan:cancel.
 */
export function registerArtisanIpc(runner: CommandRunner): void {
  // Handlers land in Phase 2; the runner is injected now so the
  // registration pattern is established.
  void runner
}
