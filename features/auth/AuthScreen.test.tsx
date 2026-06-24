import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { AuthScreen } from './AuthScreen';

describe('AuthScreen', () => {
  it('renders the brand tagline and a heading for sign-in', () => {
    const out = renderToStaticMarkup(<AuthScreen mode="sign-in" />);
    expect(out).toContain('Track every cent. Plain text. Yours.');
    expect(out).toContain('Welcome back');
  });
  it('renders the create-account heading for sign-up', () => {
    const out = renderToStaticMarkup(<AuthScreen mode="sign-up" />);
    expect(out).toContain('Create your account');
  });
});
