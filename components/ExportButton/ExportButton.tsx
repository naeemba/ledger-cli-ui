import { Download } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Link from 'next/link';

type Props = {
  href: string;
  label?: string;
};

const ExportButton = ({ href, label = 'Export CSV' }: Props) => (
  <Link
    href={href}
    className={cn(buttonVariants({ variant: 'outline', size: 'default' }))}
    download
  >
    <Download className="h-4 w-4" />
    {label}
  </Link>
);

export default ExportButton;
