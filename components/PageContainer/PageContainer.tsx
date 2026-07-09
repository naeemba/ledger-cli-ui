import { cn } from '@/lib/utils';

type Props = {
  children: React.ReactNode;
  className?: string;
};

// Standardizes the vertical rhythm of a page's content stack so every app page
// lays out identically. Width, horizontal padding, and top/bottom padding are
// owned by AppShell's content column — deliberately absent here so pages cannot
// diverge on those. `className` is an escape hatch for a genuine per-page need.
const PageContainer = ({ children, className }: Props) => (
  <div className={cn('flex flex-col gap-6', className)}>{children}</div>
);

export default PageContainer;
