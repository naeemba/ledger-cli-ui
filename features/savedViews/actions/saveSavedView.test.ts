import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSavedViewAction } from './saveSavedView';
import { requireUser } from '@/lib/auth/require-user';
import { savedViewService } from '@/lib/savedViews';
import { revalidatePath } from 'next/cache';

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: vi.fn(),
}));
vi.mock('@/lib/savedViews', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/savedViews')>(
      '@/lib/savedViews'
    );
  return {
    ...actual,
    savedViewService: {
      saveOrOverwrite: vi.fn(),
    },
  };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

describe('saveSavedViewAction', () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'alice' } as never);
    vi.mocked(revalidatePath).mockClear();
    vi.mocked(savedViewService.saveOrOverwrite).mockReset();
  });

  it('returns ok:true and revalidates on success', async () => {
    vi.mocked(savedViewService.saveOrOverwrite).mockResolvedValue({
      ok: true,
      view: {
        id: 'V1',
        userId: 'alice',
        name: 'Food',
        targetPath: '/transactions',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const result = await saveSavedViewAction({
      name: 'Food',
      targetPath: '/transactions',
    });
    expect(result).toEqual({ ok: true, viewId: 'V1' });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('returns invalid with fieldErrors when input fails zod', async () => {
    const result = await saveSavedViewAction({
      name: '',
      targetPath: '/api/upload',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid');
      expect(result.fieldErrors).toBeDefined();
      expect(Object.keys(result.fieldErrors ?? {})).toContain('name');
      expect(Object.keys(result.fieldErrors ?? {})).toContain('targetPath');
    }
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(savedViewService.saveOrOverwrite).not.toHaveBeenCalled();
  });

  it('forwards name-conflict and does not revalidate', async () => {
    vi.mocked(savedViewService.saveOrOverwrite).mockResolvedValue({
      ok: false,
      reason: 'name-conflict',
    });
    const result = await saveSavedViewAction({
      name: 'Food',
      targetPath: '/transactions',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('name-conflict');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('passes overwrite flag through to the service', async () => {
    vi.mocked(savedViewService.saveOrOverwrite).mockResolvedValue({
      ok: true,
      view: {
        id: 'V1',
        userId: 'alice',
        name: 'Food',
        targetPath: '/balance',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await saveSavedViewAction(
      { name: 'Food', targetPath: '/balance' },
      { overwrite: true }
    );
    expect(savedViewService.saveOrOverwrite).toHaveBeenCalledWith(
      'alice',
      { name: 'Food', targetPath: '/balance' },
      { overwrite: true }
    );
  });
});
