/** "3 Oct 2026, 14:02" in the viewer's locale and time zone. Browser-only. */
export const formatUpdated = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
