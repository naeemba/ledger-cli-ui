import { getObjectStore } from './client';
import { pullToLocal } from './download';
import { userPrefix } from './manifest';
import { pushFromLocal } from './save';

/** Mirror the user's canonical journal down to the local cache. */
export const pull = (userId: string): Promise<{ fingerprint: string }> =>
  pullToLocal(getObjectStore(), userId);

/** Mirror the user's local cache up to the canonical store. */
export const push = (userId: string): Promise<void> =>
  pushFromLocal(getObjectStore(), userId);

/** Delete every canonical object for the user (used before a full import). */
export const clearRemote = (userId: string): Promise<void> =>
  getObjectStore().deletePrefix(userPrefix(userId));
