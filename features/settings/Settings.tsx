import BaseCurrencyForm from './BaseCurrencyForm';
import DangerZone from './DangerZone';
import { clearSessionBaseCurrencyAction } from './actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Props = {
  base: string;
  currencies: string[];
  savedDefault: string | null;
  envFallback: string;
};

const Settings = ({ base, currencies, savedDefault, envFallback }: Props) => {
  const overrideActive =
    (savedDefault !== null && base !== savedDefault) ||
    (savedDefault === null && base !== envFallback);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Base currency</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <BaseCurrencyForm
            initial={savedDefault ?? envFallback}
            options={currencies}
          />
          {overrideActive && (
            <Alert>
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>
                  You&apos;re currently viewing reports in{' '}
                  <strong>{base}</strong>. This overrides your saved default.
                </span>
                <form action={clearSessionBaseCurrencyAction}>
                  <Button type="submit" variant="outline" size="sm">
                    Clear session override
                  </Button>
                </form>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <DangerZone />
    </div>
  );
};

export default Settings;
