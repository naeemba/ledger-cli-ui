import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACT_PATHS } from './index';

// Build a logger that writes to an in-memory sink so we can assert on output.
const capture = () => {
  const lines: string[] = [];
  const logger = pino(
    { redact: { paths: REDACT_PATHS, censor: '[redacted]' }, base: null },
    { write: (s: string) => lines.push(s) }
  );
  return { logger, lines };
};

describe('logger redaction', () => {
  it('censors sensitive top-level keys', () => {
    const { logger, lines } = capture();
    logger.info({ passphrase: 'hunter2', userId: 'alice' }, 'unlock');
    const out = JSON.parse(lines[0]);
    expect(out.passphrase).toBe('[redacted]');
    expect(out.userId).toBe('alice');
  });

  it('censors nested secret/token keys', () => {
    const { logger, lines } = capture();
    logger.info({ ctx: { token: 't', secret: 's' } }, 'x');
    const out = JSON.parse(lines[0]);
    expect(out.ctx.token).toBe('[redacted]');
    expect(out.ctx.secret).toBe('[redacted]');
  });
});
