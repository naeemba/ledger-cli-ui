import ChangePassphraseCard from './ChangePassphraseCard';
import ResetEncryptionCard from './ResetEncryptionCard';
import RotateRecoveryCard from './RotateRecoveryCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Props = {
  enabled: boolean;
};

const SecuritySection = ({ enabled }: Props) => {
  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Encryption is not set up for this account.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Security</h2>
      <ChangePassphraseCard />
      <RotateRecoveryCard />
      <ResetEncryptionCard />
    </div>
  );
};

export default SecuritySection;
