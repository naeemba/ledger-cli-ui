'use server';

import { requireUser } from '@/lib/auth/require-user';
import { savedViewService } from '@/lib/savedViews';
import { revalidatePath } from 'next/cache';

export const deleteSavedViewAction = async (id: string): Promise<void> => {
  const user = await requireUser();
  await savedViewService.delete(user.id, id);
  revalidatePath('/', 'layout');
};
