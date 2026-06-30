'use client';

import CodeMirror from '@uiw/react-codemirror';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { CompletionLists } from '@/lib/ledger/completionContext';
import { ledgerCompletions } from '@/lib/ledger/completions';
import { formatLedgerText } from '@/lib/ledger/format';
import { ledgerLanguage } from '@/lib/ledger/highlight';
import {
  autocompletion,
  acceptCompletion,
  completionStatus,
} from '@codemirror/autocomplete';
import { indentLess, insertTab } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap, type KeyBinding } from '@codemirror/view';

type Props = {
  'value': string;
  'onChange': (value: string) => void;
  'accounts': string[];
  'payees': string[];
  'commodities': string[];
  'aria-label'?: string;
};

// Enter accepts an open completion (return false → fall through to the default
// autocomplete keymap); otherwise it inserts a newline pre-indented to 4 spaces
// so each new posting line starts indented.
const smartEnter: KeyBinding = {
  key: 'Enter',
  run: (view) => {
    if (completionStatus(view.state) === 'active') return false;
    const { state } = view;
    const line = state.doc.lineAt(state.selection.main.head);
    const insert = line.text.trim() === '' && line.number > 1 ? '\n' : '\n    ';
    view.dispatch(state.replaceSelection(insert), {
      scrollIntoView: true,
      userEvent: 'input',
    });
    return true;
  },
};

// Tab accepts an open completion; otherwise it inserts a tab (4 spaces).
// Shift+Tab de-dents.
const smartTab: KeyBinding = {
  key: 'Tab',
  run: (view) =>
    completionStatus(view.state) === 'active'
      ? acceptCompletion(view)
      : insertTab(view),
  shift: indentLess,
};

export function LedgerEditor({
  value,
  onChange,
  accounts,
  payees,
  commodities,
  'aria-label': ariaLabel,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const lists: CompletionLists = { accounts, payees, commodities };

  const format = useCallback(
    () => onChange(formatLedgerText(value)),
    [onChange, value]
  );

  const extensions: Extension[] = [
    ledgerLanguage(),
    indentUnit.of('    '),
    autocompletion({ override: [ledgerCompletions(lists)], icons: false }),
    Prec.highest(
      keymap.of([
        smartEnter,
        smartTab,
        {
          key: 'Shift-Alt-f',
          run: (view) => {
            onChange(formatLedgerText(view.state.doc.toString()));
            return true;
          },
        },
      ])
    ),
    EditorView.domEventHandlers({
      blur: (_e, view) => {
        onChange(formatLedgerText(view.state.doc.toString()));
        return false;
      },
    }),
    // Drive the editor and its autocomplete dropdown off the app's CSS
    // variables so it tracks the active light/dark theme (the built-in light
    // theme is disabled via `theme="none"` on the CodeMirror element below).
    EditorView.theme({
      '&': {
        fontSize: '0.875rem',
        backgroundColor: 'transparent',
        color: 'var(--foreground)',
      },
      '&.cm-focused': { outline: 'none' },
      '.cm-content': {
        fontFamily: 'var(--font-mono, monospace)',
        caretColor: 'var(--foreground)',
      },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection':
        {
          backgroundColor:
            'color-mix(in oklch, var(--foreground) 18%, transparent)',
        },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'var(--muted-foreground)',
        border: 'none',
      },
      '.cm-tooltip': {
        backgroundColor: 'var(--popover)',
        color: 'var(--popover-foreground)',
        border: '1px solid var(--border)',
        borderRadius: '0.5rem',
        overflow: 'hidden',
        boxShadow: '0 4px 12px rgb(0 0 0 / 0.15)',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul': {
        fontFamily: 'var(--font-mono, monospace)',
        maxHeight: '12rem',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
        color: 'var(--popover-foreground)',
        padding: '3px 8px',
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'var(--accent)',
        color: 'var(--accent-foreground)',
      },
      '.cm-completionMatchedText': {
        color: 'var(--primary)',
        textDecoration: 'none',
        fontWeight: '600',
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionMatchedText':
        { color: 'inherit' },
    }),
    EditorView.contentAttributes.of({
      'aria-label': ariaLabel ?? 'Transaction ledger text',
    }),
  ];

  if (!mounted) {
    return (
      <div className="flex flex-col gap-2">
        <div
          className="rounded-md border border-input overflow-hidden min-h-[12rem]"
          aria-label={ariaLabel}
        />
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" disabled>
            Format (⇧⌥F)
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-md border border-input overflow-hidden">
        <CodeMirror
          value={value}
          onChange={onChange}
          theme="none"
          extensions={extensions}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
          }}
          minHeight="12rem"
        />
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={format}>
          Format (⇧⌥F)
        </Button>
      </div>
    </div>
  );
}
