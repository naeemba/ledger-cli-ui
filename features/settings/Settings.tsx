import BaseCurrencyForm from './BaseCurrencyForm';
import DangerZone from './DangerZone';
import DashboardWidgetsForm from './DashboardWidgetsForm';
import EntryTabOrderForm from './EntryTabOrderForm';
import SecuritySection from './SecuritySection';
import { clearSessionBaseCurrencyAction } from './actions';
import PageContainer from '@/components/PageContainer';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AuditLog } from '@/db/schema/auditLog';
import { ActivityCard } from '@/features/activity';
import { type WidgetSetting } from '@/lib/dashboard/widgets';
import { type TabId } from '@/lib/transactions/entryTabs';

type Props = {
  base: string;
  currencies: string[];
  savedDefault: string | null;
  envFallback: string;
  encryptionEnabled: boolean;
  recentActivity: AuditLog[];
  entryTabOrder: TabId[];
  dashboardWidgets: WidgetSetting[];
};

const Settings = ({
  base,
  currencies,
  savedDefault,
  envFallback,
  encryptionEnabled,
  recentActivity,
  entryTabOrder,
  dashboardWidgets,
}: Props) => {
  const overrideActive =
    (savedDefault !== null && base !== savedDefault) ||
    (savedDefault === null && base !== envFallback);

  return (
    <PageContainer>
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

      <Card>
        <CardHeader>
          <CardTitle>Transaction entry tabs</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Reorder the tabs on the add/edit transaction screen. The top tab is
            the one that opens by default.
          </p>
          <EntryTabOrderForm initial={entryTabOrder} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dashboard widgets</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Reorder or hide the sections on your dashboard.
          </p>
          <DashboardWidgetsForm initial={dashboardWidgets} />
        </CardContent>
      </Card>

      <SecuritySection enabled={encryptionEnabled} />

      <ActivityCard rows={recentActivity} />

      <DangerZone />
    </PageContainer>
  );
};

export default Settings;
