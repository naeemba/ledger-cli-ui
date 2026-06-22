import Landing from '@/features/landing';

// Public marketing landing. Signed-in visitors are redirected to /dashboard by
// the proxy (a cheap session-cookie check), so this page stays auth-free.
export default function Home() {
  return <Landing />;
}
