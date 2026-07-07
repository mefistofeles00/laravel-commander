/**
 * Detects the PHP binary to use for a project.
 *
 * TODO Phase 1:
 * - Platform-specific fallback chain: Herd, Valet, system PHP on PATH
 * - Version detection (`php -v`)
 * - Manual PHP path override (biggest known risk area — user setups vary:
 *   Herd, Valet, XAMPP, brew, apt, Windows PATH)
 */
export class PhpEnvironment {}
