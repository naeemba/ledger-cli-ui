import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type Props = {
  children: React.ReactNode;
  label?: string;
  className?: string;
};

const Help = ({ children, label = 'Help', className }: Props) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label}
        className={cn(
          'inline-flex h-5 w-5 items-center justify-center rounded-full text-muted transition-colors hover:bg-subtle hover:text-fg focus:outline-none focus:ring-2 focus:ring-accent/40',
          className
        )}
      >
        <QuestionMarkCircleIcon className="h-5 w-5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-normal text-left leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export default Help;
