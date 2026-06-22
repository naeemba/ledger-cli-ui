import { auth } from './auth';
import { createServer } from '@naeemba/next-starter/server';

export const { getSession, requireSession } = createServer(auth);
