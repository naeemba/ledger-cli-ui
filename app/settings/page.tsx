import { Settings } from '@/features/settings';
import { auditService } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { cryptoStatus } from '@/lib/crypto/gate';
import { parseDashboardWidgets } from '@/lib/dashboard/widgets';
import { env } from '@/lib/env';
import { getAvailableCurrencies, userSettingRepository } from '@/lib/settings';
import { parseEntryTabOrder } from '@/lib/transactions/entryTabs';

const SettingsPage = async () => {
  const user = await requireUser();
  const [{ currencies, base }, row, status, recentActivity] = await Promise.all(
    [
      getAvailableCurrencies(),
      userSettingRepository.get(user.id),
      cryptoStatus(user.id),
      auditService.listForUser(user.id, { limit: 3 }),
    ]
  );
  return (
    <Settings
      base={base}
      currencies={currencies}
      savedDefault={row?.baseCurrency ?? null}
      envFallback={env.DEFAULT_CURRENCY}
      encryptionEnabled={status !== 'unset'}
      recentActivity={recentActivity}
      entryTabOrder={parseEntryTabOrder(row?.entryTabOrder ?? null)}
      dashboardWidgets={parseDashboardWidgets(row?.dashboardWidgets ?? null)}
    />
  );
};

export default SettingsPage;
