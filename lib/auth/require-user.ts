import 'server-only';
import { auth } from './index';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export const requireUser = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  return session.user;
};

export const getOptionalUser = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
};
