import { describe, it, expect, vi, beforeEach } from 'vitest';

const cookieDelete = vi.fn();
const revalidatePath = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({ delete: cookieDelete }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

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
