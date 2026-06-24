import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { SentNotice } from './SentNotice';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('SentNotice', () => {
  const base = {
    email: 'me@example.com',
    canResend: true,
    onResend: () => {},
    onUseDifferentEmail: () => {},
  };

  it('shows the destination email', () => {
    expect(html(<SentNotice {...base} />)).toContain('me@example.com');
  });
  it('shows the spam/junk warning', () => {
    expect(html(<SentNotice {...base} />).toLowerCase()).toContain(
      'spam or junk folder'
    );
  });
  it('disables resend when cooldown is active', () => {
    const out = html(<SentNotice {...base} canResend={false} />);
    expect(out).toContain('disabled');
  });
});
