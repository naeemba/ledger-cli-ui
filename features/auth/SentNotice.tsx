'use client';

import { MailCheck } from 'lucide-react';
import { sentCopy } from './authCopy';
import { Button } from '@/components/ui/button';

interface SentNoticeProps {
  email: string;
  canResend: boolean;
  onResend: () => void;
  onUseDifferentEmail: () => void;
}

export function SentNotice({
  email,
  canResend,
  onResend,
  onUseDifferentEmail,
}: SentNoticeProps) {
  const copy = sentCopy(email);
  return (
    <div className="flex flex-col gap-4 text-center" aria-live="polite">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
        <MailCheck className="size-6 text-foreground" aria-hidden />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{copy.heading}</h2>
        <p className="text-sm text-muted-foreground">
          We sent a sign-in link to{' '}
          <span className="font-medium text-foreground">{email}</span>. It
          expires in 10 minutes.
        </p>
      </div>
      <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        {copy.spam}
      </p>
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onResend}
          disabled={!canResend}
        >
          Resend link
        </Button>
        <Button type="button" variant="ghost" onClick={onUseDifferentEmail}>
          Use a different email
        </Button>
      </div>
    </div>
  );
}
