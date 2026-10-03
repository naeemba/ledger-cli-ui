import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChromeRefresh from './ChromeRefresh';

const { refresh, pathname } = vi.hoisted(() => ({
  refresh: vi.fn(),
  pathname: { current: '/' },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ refresh }),
}));

// A server render never runs effects; run them inline so the check fires.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: (effect: () => void) => effect(),
}));

const visit = (path: string, renderedPublic: boolean) => {
  pathname.current = path;
  renderToStaticMarkup(<ChromeRefresh renderedPublic={renderedPublic} />);
};

describe('ChromeRefresh', () => {
  beforeEach(() => {
    refresh.mockReset();
  });

  it('refreshes when a public page links into the app', () => {
    visit('/debts', true);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('refreshes when the app links out to a public page', () => {
    visit('/s/abc', false);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('does not refresh between two app pages', () => {
    visit('/debts', false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not refresh between two public pages', () => {
    visit('/s/abc', true);
    expect(refresh).not.toHaveBeenCalled();
  });
});
