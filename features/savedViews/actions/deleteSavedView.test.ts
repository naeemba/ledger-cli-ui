import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteSavedViewAction } from './deleteSavedView';
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
    savedViewService: { delete: vi.fn() },
  };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

describe('deleteSavedViewAction', () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'alice' } as never);
    vi.mocked(revalidatePath).mockClear();
    vi.mocked(savedViewService.delete).mockReset();
    vi.mocked(savedViewService.delete).mockResolvedValue(undefined);
  });

  it('delegates to the service and revalidates', async () => {
    await deleteSavedViewAction('V1');
    expect(savedViewService.delete).toHaveBeenCalledWith('alice', 'V1');
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });
});
