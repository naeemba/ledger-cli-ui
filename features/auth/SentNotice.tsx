'use client';

import { MailCheck } from 'lucide-react';
import { sentCopy } from './authCopy';

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
  const copy = sentCopy();
  return (
    <div className="flex flex-col gap-6" aria-live="polite">
      <div className="au-icon-tile">
        <MailCheck className="size-5" aria-hidden />
      </div>
      <div className="space-y-2">
        <h2 className="ff-display text-[clamp(1.75rem,3.5vw,2.4rem)] leading-tight">
          {copy.heading}
        </h2>
        <p className="text-[0.95rem] text-[color:var(--txt-dim)]">
          We sent a sign-in link to{' '}
          <span className="ff-mono text-[color:var(--txt)]">{email}</span>. It
          expires in 10 minutes.
        </p>
      </div>
      <p className="au-note">{copy.spam}</p>
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          className="au-btn au-btn--ghost"
          onClick={onResend}
          disabled={!canResend}
        >
          Resend link
        </button>
        <button
          type="button"
          className="au-btn au-btn--ghost border-0 bg-transparent text-[color:var(--txt-dim)]"
          onClick={onUseDifferentEmail}
        >
          Use a different email
        </button>
      </div>
    </div>
  );
}
