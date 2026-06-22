'use client';
import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from '@naeemba/next-starter/client';

export const authClient = createAuthClient({ passkey: passkeyClient });
export const { signIn, signOut, useSession } = authClient;
