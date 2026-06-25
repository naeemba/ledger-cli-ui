import { requireUser } from '@/lib/auth/require-user';
import { getUserCryptoRepository } from '@/lib/crypto';
import { setSessionDek } from '@/lib/crypto/sessionKeys';
import { decodeDek } from '@/lib/crypto/transport';
import { rateLimit, UNLOCK } from '@/lib/rate-limit';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await requireUser();

  const limit = rateLimit(UNLOCK, user.id);
  if (!limit.allowed) {
    const retryAfter = Math.ceil((limit.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: 'Too many unlock attempts. Please wait a moment.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.max(1, retryAfter)) },
      }
    );
  }

  if (!(await getUserCryptoRepository().exists(user.id))) {
    return NextResponse.json(
      { error: 'Encryption is not set up for this account.' },
      { status: 409 }
    );
  }

  let dek: Buffer;
  try {
    const body = (await req.json()) as { dek?: unknown };
    dek = decodeDek(body?.dek);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Bad request' },
      { status: 400 }
    );
  }

  setSessionDek(user.id, dek);
  return new NextResponse(null, { status: 204 });
}
