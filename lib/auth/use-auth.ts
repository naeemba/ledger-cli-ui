'use client';

import { authClient } from './client';
import { useRouter } from 'next/navigation';

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
};

type UseAuthResult = {
  user: SessionUser | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

export const useAuth = (): UseAuthResult => {
  const router = useRouter();
  const { data, isPending } = authClient.useSession();
  const sessionUser = data?.user;
  const user: SessionUser | null = sessionUser
    ? {
        id: sessionUser.id,
        name: sessionUser.name,
        email: sessionUser.email,
        emailVerified: sessionUser.emailVerified,
        image: sessionUser.image,
      }
    : null;

  const signOut = async () => {
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  };

  return { user, isLoading: isPending, signOut };
};
