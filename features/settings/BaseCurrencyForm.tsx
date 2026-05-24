'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import Combobox from '@/components/Combobox/Combobox';
import { Button } from '@/components/ui/button';
import { setSavedBaseCurrencyAction } from '@/features/settings/actions';

type Props = {
  initial: string;
  options: string[];
};

const BaseCurrencyForm = ({ initial, options }: Props) => {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();

  const onSave = () => {
    startTransition(async () => {
      const result = await setSavedBaseCurrencyAction(value);
      if (result.ok) toast.success('Default currency saved');
      else toast.error(result.message);
    });
  };

  return (
    <div className="flex items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Default currency</label>
        <Combobox
          value={value}
          onChange={setValue}
          options={options}
          triggerClassName="min-w-[180px]"
          allowFreeText={false}
        />
      </div>
      <Button onClick={onSave} disabled={pending || value === initial}>
        Save
      </Button>
    </div>
  );
};

export default BaseCurrencyForm;
