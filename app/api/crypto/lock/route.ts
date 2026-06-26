import { auditService, auditRequestMeta } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { dropSessionDek } from '@/lib/crypto/sessionKeys';
import { NextResponse } from 'next/server';

export async function POST(): Promise<NextResponse> {
  const user = await requireUser();
  dropSessionDek(user.id);
  await auditService.record(user.id, {
    action: 'crypto.lock',
    result: 'success',
    ...(await auditRequestMeta()),
  });
  return new NextResponse(null, { status: 204 });
}
