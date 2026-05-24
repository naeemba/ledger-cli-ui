import { Settings } from '@/features/settings';
import { requireUser } from '@/lib/auth/require-user';
import { env } from '@/lib/env';
import { getAvailableCurrencies, userSettingRepository } from '@/lib/settings';

const SettingsPage = async () => {
  const user = await requireUser();
  const [{ currencies, base }, row] = await Promise.all([
    getAvailableCurrencies(),
    userSettingRepository.get(user.id),
  ]);
  return (
    <Settings
      base={base}
      currencies={currencies}
      savedDefault={row?.baseCurrency ?? null}
      envFallback={env.DEFAULT_CURRENCY}
    />
  );
};

export default SettingsPage;
