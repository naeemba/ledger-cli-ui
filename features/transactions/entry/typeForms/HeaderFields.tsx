'use client';

import React from 'react';
import type { DraftStatus } from '../draftReducer';
import type { HeaderFields } from '../types/adapter';
import { Field, SectionLabel } from './fields';
import Combobox from '@/components/Combobox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

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
      <ToggleGroup
        value={[header.status]}
        onValueChange={(values) => {
          if (values.length > 0) onChange({ status: values[0] as DraftStatus });
        }}
        spacing={0}
        variant="outline"
        size="sm"
        className="w-full"
      >
        <ToggleGroupItem value="none" className="flex-1">
          Unmarked
        </ToggleGroupItem>
        <ToggleGroupItem value="pending" className="flex-1">
          Pending (!)
        </ToggleGroupItem>
        <ToggleGroupItem value="cleared" className="flex-1">
          Cleared (*)
        </ToggleGroupItem>
      </ToggleGroup>
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
