import 'server-only';
import BaseCurrencyPicker from './BaseCurrencyPicker';
import { getOptionalUser } from '@/lib/auth/require-user';
import { getAvailableCurrencies, userSettingRepository } from '@/lib/settings';

const BaseCurrencyPickerSlot = async () => {
  const user = await getOptionalUser();
  if (!user) return null;
  const [{ currencies, base }, row] = await Promise.all([
    getAvailableCurrencies(),
    userSettingRepository.get(user.id),
  ]);
  return (
    <BaseCurrencyPicker
      current={base}
      available={currencies}
      savedDefault={row?.baseCurrency ?? null}
    />
  );
};

export default BaseCurrencyPickerSlot;
