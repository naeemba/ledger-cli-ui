'use client';

import { Loader2, Play, Terminal } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  runLedgerCommandAction,
  type LedgerCommandResult,
} from './actions/runLedgerCommand';
import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';

const HISTORY_LIMIT = 20;

const EXAMPLES = [
  'bal Assets Liabilities',
  'reg Expenses --period "last 3 months"',
  'bal --flat --sort -amount Expenses',
  'print --limit "amount > 100"',
  'stats',
];

const CommandConsole = () => {
  const [command, setCommand] = useState('bal');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LedgerCommandResult | null>(null);
  // Session-only; a command worth keeping is a command worth pasting somewhere.
  const [history, setHistory] = useState<string[]>([]);
  // -1 means "typing", otherwise an index into history for arrow-key recall.
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || running) return;
    setRunning(true);
    setHistoryIndex(-1);
    try {
      setResult(await runLedgerCommandAction(trimmed));
      setHistory((previous) =>
        [trimmed, ...previous.filter((c) => c !== trimmed)].slice(
          0,
          HISTORY_LIMIT
        )
      );
    } finally {
      setRunning(false);
    }
  };

  const recall = (offset: number) => {
    const next = Math.min(
      Math.max(historyIndex + offset, -1),
      history.length - 1
    );
    setHistoryIndex(next);
    setCommand(next === -1 ? '' : history[next]);
  };

  const use = (value: string) => {
    setCommand(value);
    inputRef.current?.focus();
  };

  const output = result
    ? [result.stdout, result.stderr].filter(Boolean).join('\n')
    : '';

  return (
    <div className="space-y-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(command);
        }}
        className="flex gap-2"
      >
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <Terminal className="size-4 shrink-0 opacity-50" />
          </InputGroupAddon>
          <InputGroupInput
            ref={inputRef}
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                recall(1);
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                recall(-1);
              }
            }}
            placeholder="bal Assets -X USD"
            spellCheck={false}
            autoComplete="off"
            aria-label="Ledger command"
            className="font-mono"
          />
        </InputGroup>
        <Button type="submit" disabled={running || !command.trim()}>
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Run
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => use(example)}
            className="border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-full border px-3 py-1 font-mono text-xs"
          >
            {example}
          </button>
        ))}
      </div>

      {result && (
        <div className="border-border overflow-hidden rounded-md border">
          <div className="border-border bg-muted/50 text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs">
            <span className="text-foreground font-mono">
              {result.command ? `ledger ${result.command}` : 'Not run'}
            </span>
            <span className="flex items-center gap-3">
              <span>{result.durationMilliseconds} ms</span>
              <span
                className={
                  result.ok
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-destructive'
                }
              >
                {result.ok ? 'ok' : 'failed'}
              </span>
            </span>
          </div>
          <pre className="max-h-[60vh] overflow-auto px-3 py-3 font-mono text-xs leading-relaxed whitespace-pre">
            {output || 'No output.'}
          </pre>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Read-only reports only. Options that read or write files are rejected;
        your journal and price database are supplied automatically. Press the up
        arrow to recall an earlier command.
      </p>
    </div>
  );
};

export default CommandConsole;
