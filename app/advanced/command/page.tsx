import Help from '@/components/Help';
import PageContainer from '@/components/PageContainer';
import CommandConsole from '@/features/advanced/CommandConsole';
import { requireUser } from '@/lib/auth/require-user';

const CommandPage = async () => {
  await requireUser();

  return (
    <PageContainer>
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Command</h1>
          <Help label="About the command console">
            Runs a ledger report against your own journal and shows the raw
            output. Only read-only report commands are accepted, and the journal
            and price database are passed for you.
          </Help>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Run a ledger command and read its output exactly as the CLI prints it.
        </p>
      </div>
      <CommandConsole />
    </PageContainer>
  );
};

export default CommandPage;
