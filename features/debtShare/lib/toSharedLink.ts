import type { ShareLink } from '@/lib/debt-share';

/** A share link as the client controls take it: the date sent as ISO text. */
export type SharedLink = Omit<ShareLink, 'updatedAt'> & { updatedAt: string };

/** A server share link in the shape the client controls take. */
export const toSharedLink = ({
  shareId,
  key,
  updatedAt,
}: ShareLink): SharedLink => ({
  shareId,
  key,
  updatedAt: updatedAt.toISOString(),
});
