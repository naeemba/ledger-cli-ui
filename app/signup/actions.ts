'use server';

import { randomBytes } from 'crypto';
import { auth } from '@/lib/auth';
import {
  collectFieldErrors,
  signupSchema,
  type FieldErrors,
} from '@/lib/auth/schemas';
import { headers } from 'next/headers';

export type SignupState = {
  ok: boolean;
  errors?: FieldErrors<typeof signupSchema>;
};

export async function signupAction(
  _prev: SignupState | null,
  formData: FormData
): Promise<SignupState> {
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
  });
  if (!parsed.success) {
    return { ok: false, errors: collectFieldErrors(parsed.error) };
  }

  try {
    await auth.api.signUpEmail({
      body: {
        email: parsed.data.email,
        name: parsed.data.name,
        password: randomBytes(32).toString('base64url'),
      },
      headers: await headers(),
    });
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : 'Signup failed, please try again';
    return { ok: false, errors: { form: message } };
  }
}
