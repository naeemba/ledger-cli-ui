import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renameSavedViewAction } from './renameSavedView';
import { requireUser } from '@/lib/auth/require-user';
import { savedViewService } from '@/lib/savedViews';
import { revalidatePath } from 'next/cache';

vi.mock('@/lib/auth/require-user', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/savedViews', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/savedViews')>(
      '@/lib/savedViews'
    );
  return {
    ...actual,
    savedViewService: { rename: vi.fn() },
  };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

describe('renameSavedViewAction', () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'alice' } as never);
    vi.mocked(revalidatePath).mockClear();
    vi.mocked(savedViewService.rename).mockReset();
  });

  it('returns invalid when name is empty', async () => {
    const result = await renameSavedViewAction('V1', '');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid');
    expect(savedViewService.rename).not.toHaveBeenCalled();
  });

  it('forwards rename happy path and revalidates', async () => {
    vi.mocked(savedViewService.rename).mockResolvedValue({
      ok: true,
      view: {
        id: 'V1',
        userId: 'alice',
        name: 'Groceries',
        targetPath: '/transactions',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const result = await renameSavedViewAction('V1', '  Groceries  ');
    expect(result.ok).toBe(true);
    expect(savedViewService.rename).toHaveBeenCalledWith(
      'alice',
      'V1',
      'Groceries'
    );
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('forwards name-conflict and skips revalidate', async () => {
    vi.mocked(savedViewService.rename).mockResolvedValue({
      ok: false,
      reason: 'name-conflict',
    });
    const result = await renameSavedViewAction('V1', 'Other');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('name-conflict');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('forwards not-found', async () => {
    vi.mocked(savedViewService.rename).mockResolvedValue({
      ok: false,
      reason: 'not-found',
    });
    const result = await renameSavedViewAction('V1', 'Other');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not-found');
  });
});
