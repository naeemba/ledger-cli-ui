import { buttonVariants } from '@/components/ui/button';
import Link from 'next/link';

export default function AccountDeletedPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Your account was deleted</h1>
        <p className="text-muted-foreground max-w-md">
          Your journals and account have been permanently removed. There is
          nothing left to recover.
        </p>
      </div>
      <Link href="/" className={buttonVariants({ variant: 'outline' })}>
        Back to home
      </Link>
    </main>
  );
}
