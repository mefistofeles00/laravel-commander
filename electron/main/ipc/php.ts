import { handle } from './registry'
import type { PhpEnvironment } from '../services/PhpEnvironment'

export function registerPhpIpc(php: PhpEnvironment): void {
  handle('php:detect', () => php.detect())
}
