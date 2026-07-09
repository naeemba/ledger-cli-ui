import 'server-only';
import TemplatesList from './TemplatesList';
import Help from '@/components/Help';
import PageContainer from '@/components/PageContainer';
import { buttonVariants } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/require-user';
import { templateRepository } from '@/lib/templates';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const Templates = async () => {
  const user = await requireUser();
  const templates = await templateRepository.list(user.id);

  return (
    <PageContainer>
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Templates</h1>
          <Help label="About templates">
            Reusable transaction shapes. Use a template to prefill the
            new-transaction form.
          </Help>
        </div>
        <Link
          href="/transactions/new"
          className={cn(buttonVariants({ size: 'sm' }))}
        >
          + New template
        </Link>
      </header>
      <TemplatesList templates={templates} />
    </PageContainer>
  );
};

export default Templates;
