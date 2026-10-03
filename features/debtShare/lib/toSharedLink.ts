import type { SharedLink } from '../SharedLinkControls';
import type { ShareLink } from '@/lib/debt-share';

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
