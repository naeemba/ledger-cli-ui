'use client';

import * as React from 'react';
import {
  caretAfterFormat,
  cleanAmountInput,
  countSignificant,
  groupAmountInput,
} from './AmountInput.util';
import { Input } from '@/components/ui/input';

type AmountInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'value' | 'onChange' | 'type'
> & {
  value: string;
  onChange: (raw: string) => void;
};

// A controlled amount field that displays comma-grouped digits while emitting
// the raw, un-grouped string to its parent — so balance maths and submission
// keep working unchanged. Restores the caret after each reformat so inserting a
// digit that shifts a comma doesn't jump the cursor to the end.
const AmountInput = ({ value, onChange, ...props }: AmountInputProps) => {
  const ref = React.useRef<HTMLInputElement>(null);
  const caretRef = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    if (caretRef.current !== null && ref.current) {
      ref.current.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
  });

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const typed = event.target.value;
    const selectionStart = event.target.selectionStart ?? typed.length;
    const significantBefore = countSignificant(typed, selectionStart);
    const raw = cleanAmountInput(typed);
    caretRef.current = caretAfterFormat(
      groupAmountInput(raw),
      significantBefore
    );
    onChange(raw);
  };

  return (
    <Input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={groupAmountInput(value)}
      onChange={handleChange}
      {...props}
    />
  );
};

export default AmountInput;
