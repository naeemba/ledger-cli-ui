'use client';

import React from 'react';
import type { HeaderFields } from '../types/adapter';
import { ChoiceToggle, Field, STATUS_OPTIONS, SectionLabel } from './fields';
import Combobox from '@/components/Combobox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export const HeaderFieldsEditor = ({
  header,
  payees,
  onChange,
}: {
  header: HeaderFields;
  payees: string[];
  onChange: (patch: Partial<HeaderFields>) => void;
}): React.JSX.Element => (
  <section className="flex flex-col gap-5">
    <SectionLabel>Details</SectionLabel>

    <Field label="Date" htmlFor="ty-date">
      <Input
        id="ty-date"
        type="date"
        value={header.date}
        onChange={(e) => onChange({ date: e.target.value })}
        required
      />
    </Field>

    <Field label="Status">
      <ChoiceToggle
        value={header.status}
        onChange={(status) => onChange({ status })}
        options={STATUS_OPTIONS}
        size="sm"
      />
    </Field>

    <Field label="Payee">
      <Combobox
        value={header.payee}
        onChange={(v) => onChange({ payee: v })}
        options={payees}
        placeholder="Type or pick a payee…"
      />
    </Field>

    <Field label="Note (optional)" htmlFor="ty-note">
      <Textarea
        id="ty-note"
        value={header.note}
        onChange={(e) => onChange({ note: e.target.value })}
        rows={3}
        placeholder="Comment lines — written below the payee with a ; prefix"
      />
    </Field>
  </section>
);
