import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { twMerge } from 'tailwind-merge';

type Props = {
  children: React.ReactNode;
  label?: string;
  className?: string;
};

const Help = ({ children, label = 'Help', className }: Props) => (
  <span
    className={twMerge('group relative inline-flex align-middle', className)}
  >
    <button
      type="button"
      aria-label={label}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted transition-colors hover:bg-subtle hover:text-fg focus:outline-none focus:ring-2 focus:ring-accent/40"
    >
      <QuestionMarkCircleIcon className="h-5 w-5" />
    </button>
    <span
      role="tooltip"
      className="pointer-events-none absolute left-6 top-1/2 z-30 w-64 -translate-y-1/2 rounded-lg border border-border bg-card p-3 text-xs font-normal leading-relaxed tracking-normal text-fg opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
    >
      {children}
    </span>
  </span>
);

export default Help;
