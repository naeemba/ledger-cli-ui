import 'server-only';
import { getSession, requireSession } from '@/lib/auth-server';

export const requireUser = async () => (await requireSession()).user;

export const getOptionalUser = async () => (await getSession())?.user ?? null;
