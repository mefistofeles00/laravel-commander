/**
 * Runs commands (artisan, composer) with live output streaming.
 *
 * The most critical module — every feature sits on top of it.
 *
 * TODO Phase 1:
 * - child_process.spawn with live stdout/stderr streaming to the renderer
 * - Cancellation support
 * - Exit code handling
 * - Process lifecycle: what happens to long-running commands (migrate...)
 *   when the window closes
 */
export class CommandRunner {}
