'use client';

import Combobox from '@/components/Combobox';
import type { Template } from '@/db/schema/template';
import { useRouter } from 'next/navigation';

type Props = { templates: Template[] };

const TemplatePicker = ({ templates }: Props) => {
  const router = useRouter();
  if (templates.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">
        Start from template…
      </span>
      <div className="min-w-[260px] flex-1 max-w-md">
        <Combobox
          value=""
          onChange={(value) => {
            // Names are unique per (userId, name) — see template_user_name index.
            const t = templates.find((x) => x.name === value);
            if (t) router.push(`/transactions/new?template=${t.id}`);
          }}
          options={templates.map((t) => t.name)}
          placeholder="Pick a template"
          allowFreeText={false}
        />
      </div>
    </div>
  );
};

export default TemplatePicker;
