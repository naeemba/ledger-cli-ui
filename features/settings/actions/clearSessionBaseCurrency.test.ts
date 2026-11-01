import { describe, it, expect, vi, beforeEach } from 'vitest';

const cookieDelete = vi.fn();
const revalidatePath = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({ delete: cookieDelete }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

// The real barrel loads the repository and DB graph, which takes seconds on a
// cold import and times this test out when the suite runs in parallel.
vi.mock('@/lib/settings', () => ({ COOKIE_NAME: 'baseCurrency' }));

beforeEach(() => {
  cookieDelete.mockReset();
  revalidatePath.mockReset();
});

describe('clearSessionBaseCurrencyAction', () => {
  it('deletes the cookie and revalidates layouts', async () => {
    const { clearSessionBaseCurrencyAction } =
      await import('./clearSessionBaseCurrency');
    await clearSessionBaseCurrencyAction();
    expect(cookieDelete).toHaveBeenCalledWith('baseCurrency');
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });
});
