import pino, { type Logger } from 'pino';
import 'server-only';

/**
 * Keys censored anywhere they appear in a logged object. This is a BACKSTOP,
 * not a license to log freely: never pass journal content, amounts, payee or
 * account names, passphrases, recovery codes, DEKs, or wraps to the logger —
 * pass only metadata (counts, sizes, ids, action names, result, reason).
 */
export const REDACT_PATHS = [
  'passphrase',
  'recoveryCode',
  'dek',
  'wrap',
  'password',
  'token',
  'authorization',
  'cookie',
  'secret',
  '*.passphrase',
  '*.recoveryCode',
  '*.dek',
  '*.wrap',
  '*.password',
  '*.token',
  '*.secret',
];

const level =
  process.env.LOG_LEVEL ??
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Only attach the pino-pretty transport in real `development` (not `test`),
// to avoid spawning a worker thread that can hang under vitest.
const isDev = process.env.NODE_ENV === 'development';

export const log: Logger = pino({
  level,
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  // Pretty in dev; plain JSON to stdout in prod (captured by Coolify/Docker).
  ...(isDev
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});

/** Child logger tagged with a subsystem name: createLogger('journal'). */
export const createLogger = (mod: string): Logger => log.child({ mod });
