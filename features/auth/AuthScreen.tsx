import { AuthForm } from './AuthForm';
import { BrandPanel } from './BrandPanel';
import type { AuthMode } from './authCopy';

interface AuthScreenProps {
  mode: AuthMode;
}

export function AuthScreen({ mode }: AuthScreenProps) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel />
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <AuthForm mode={mode} />
        </div>
      </div>
    </main>
  );
}
