import { auth } from '@/lib/auth';
import { createAuthRoute } from '@naeemba/next-starter/auth-route';

export const { GET, POST } = createAuthRoute(auth);
