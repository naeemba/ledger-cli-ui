'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import Combobox from '@/components/Combobox/Combobox';
import { Button } from '@/components/ui/button';
import {
  clearSessionBaseCurrencyAction,
  setSessionBaseCurrencyAction,
} from '@/features/settings/actions';

type Props = {
  current: string;
  available: string[];
  savedDefault: string | null;
};

const BaseCurrencyPicker = ({ current, available, savedDefault }: Props) => {
  const [pending, startTransition] = useTransition();
  const overridden = savedDefault !== null && current !== savedDefault;

  const onChange = (next: string) => {
    if (next === current) return;
    startTransition(async () => {
      const result = await setSessionBaseCurrencyAction(next);
      if (!result.ok) toast.error(result.message);
    });
  };

  const onReset = () => {
    startTransition(async () => {
      await clearSessionBaseCurrencyAction();
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      <Combobox
        value={current}
        onChange={onChange}
        options={available}
        triggerClassName="min-w-[120px]"
        placeholder={current}
        allowFreeText={false}
      />
      {overridden && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={pending}
          title={`Reset to your saved default (${savedDefault})`}
        >
          Reset
        </Button>
      )}
    </div>
  );
};

export default BaseCurrencyPicker;
