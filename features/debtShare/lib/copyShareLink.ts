import { toast } from 'sonner';

const linkUrl = (shareId: string, key: string): string =>
  `${window.location.origin}/s/${shareId}#${key}`;

/** Copy a share link to the clipboard and say whether it worked. */
export const copyShareLink = async (shareId: string, key: string) => {
  try {
    await navigator.clipboard.writeText(linkUrl(shareId, key));
    toast.success('Link copied.');
  } catch {
    // Safari refuses a copy that follows a server round trip.
    toast.error('Could not copy. Use Copy link.');
  }
};
