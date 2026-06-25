import { Settings } from '@/features/settings';
import { requireUser } from '@/lib/auth/require-user';
import { cryptoStatus } from '@/lib/crypto/gate';
import { env } from '@/lib/env';
import { getAvailableCurrencies, userSettingRepository } from '@/lib/settings';

const SettingsPage = async () => {
  const user = await requireUser();
  const [{ currencies, base }, row, status] = await Promise.all([
    getAvailableCurrencies(),
    userSettingRepository.get(user.id),
    cryptoStatus(user.id),
  ]);
  return (
    <Settings
      base={base}
      currencies={currencies}
      savedDefault={row?.baseCurrency ?? null}
      envFallback={env.DEFAULT_CURRENCY}
      encryptionEnabled={status !== 'unset'}
    />
  );
};

export default SettingsPage;
