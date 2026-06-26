import 'server-only';
import { headers } from 'next/headers';

/** Best-effort request metadata for audit rows. Never throws. */
export const auditRequestMeta = async (): Promise<{
  ip?: string;
  userAgent?: string;
}> => {
  try {
    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
    const userAgent = h.get('user-agent') ?? undefined;
    return { ip, userAgent };
  } catch {
    return {};
  }
};
