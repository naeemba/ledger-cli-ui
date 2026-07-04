'use client';

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useReducer,
  useState,
} from 'react';
import { toast } from 'sonner';
import type { SubmitAction, TransactionActionState } from '../actions';
import { FormLens } from './FormLens';
import { RawLens } from './RawLens';
import { TabBar } from './TabBar';
import { TypeLens } from './TypeLens';
import { getAccountBalance as defaultGetAccountBalance } from './actions/getAccountBalance';
import { computeBalance } from './balance';
import {
  draftReducer,
  emptyPostings,
  initDraft,
  serializeDraftJson,
} from './draftReducer';
import { draftToTemplateDraft } from './draftToTemplateDraft';
import { detectType } from './types/registry';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import SaveAsTemplateButton from '@/features/templates/SaveAsTemplateButton';
import type { TemplateDraft } from '@/lib/templates/schema';
import {
  type TabId,
  TAB_LABELS,
  normalizeTabOrder,
} from '@/lib/transactions/entryTabs';
import type { TransactionDraft } from '@/lib/transactions/schema';
import { useRouter } from 'next/navigation';

export type TransactionEntryProps = {
  accounts: string[];
  payees: string[];
  defaultCurrency: string;
  /** Commodities already used in the journal, for currency autocomplete. */
  currencies?: string[];
  mode?: 'create' | 'edit';
  // `date` is optional on the prop so server-side template prefill can omit it
  // and let the client compute today's date in the user's local timezone.
  initialDraft?: Omit<TransactionDraft, 'date'> & { date?: string };
  uid?: string;
  expectedFingerprint?: string;
  submitAction: SubmitAction;
  templateMissing?: boolean;
  getAccountBalance?: (account: string, currency: string) => Promise<string>;
  tabOrder?: TabId[];
};

const todayISO = (): string => {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
};

const initialState: TransactionActionState = { ok: false };

const TransactionEntry = ({
  accounts,
  payees,
  defaultCurrency,
  currencies = [],
  mode,
  initialDraft,
  uid,
  expectedFingerprint,
  submitAction,
  templateMissing,
  getAccountBalance,
  tabOrder,
}: TransactionEntryProps) => {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    submitAction,
    initialState
  );

  const [draft, dispatch] = useReducer(draftReducer, undefined, () =>
    initDraft(
      { ...initialDraft, date: initialDraft?.date ?? todayISO() },
      defaultCurrency
    )
  );

  const orderedTabs = normalizeTabOrder(tabOrder);
  const tabs = orderedTabs.map((id) => ({ id, label: TAB_LABELS[id] }));

  const [active, setActive] = useState<string>(() =>
    mode === 'edit' && !detectType(draft) ? 'form' : orderedTabs[0]
  );
  const [rawError, setRawError] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  // Set by the "Save & add another" button so the success effect resets the
  // form in place instead of navigating away. Reset after each save.
  const saveAndAddAnother = useRef(false);

  const resetForm = useCallback(() => {
    dispatch({
      type: 'replaceAll',
      state: initDraft({ date: todayISO() }, defaultCurrency),
    });
  }, [defaultCurrency]);

  useEffect(() => {
    // Capture and clear on every settled result. If a "Save & add another"
    // submit fails, leaving the ref set would make the next Enter-key submit
    // reset in place instead of redirecting — contradicting the documented
    // "Enter defaults to redirect" contract.
    const addAnother = saveAndAddAnother.current;
    saveAndAddAnother.current = false;
    if (!state?.ok) return;
    if (mode === 'edit') {
      toast.success('Transaction updated');
      router.push('/transactions');
      router.refresh();
      return;
    }
    toast.success('Transaction saved');
    if (addAnother) {
      resetForm();
      router.refresh();
      return;
    }
    router.push('/');
    router.refresh();
  }, [state, router, mode, resetForm]);

  useEffect(() => {
    if (templateMissing) {
      toast.error('Template not found — starting from scratch');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const balanceKind = computeBalance(draft.postings).kind;
  const canSubmit =
    !isPending &&
    draft.date !== '' &&
    draft.payee.trim() !== '' &&
    draft.postings.every((p) => p.account.trim() !== '') &&
    (balanceKind === 'balanced' || balanceKind === 'auto-balance') &&
    !(active === 'raw' && rawError !== null);

  const templateDraft: TemplateDraft = draftToTemplateDraft(draft);
  const canSaveTemplate =
    draft.payee.trim() !== '' &&
    draft.postings.filter((p) => p.account.trim() !== '').length >= 2;

  const fieldErrors = state?.fieldErrors;

  return (
    <Card>
      <CardContent>
        <form ref={formRef} action={formAction} className="flex flex-col gap-6">
          <input
            type="hidden"
            name="draft"
            value={serializeDraftJson(
              draft,
              mode === 'edit' ? 'edit' : 'create'
            )}
          />
          {mode === 'edit' && uid && (
            <input type="hidden" name="uid" value={uid} />
          )}
          {mode === 'edit' && expectedFingerprint && (
            <input
              type="hidden"
              name="expectedFingerprint"
              value={expectedFingerprint}
            />
          )}

          <TabBar tabs={tabs} active={active} onSelect={setActive} />

          {active === 'types' && (
            <TypeLens
              draft={draft}
              dispatch={dispatch}
              accounts={accounts}
              payees={payees}
              defaultCurrency={defaultCurrency}
              currencies={currencies}
              getAccountBalance={getAccountBalance ?? defaultGetAccountBalance}
            />
          )}

          {active === 'form' && (
            <FormLens
              draft={draft}
              dispatch={dispatch}
              accounts={accounts}
              payees={payees}
              defaultCurrency={defaultCurrency}
              currencies={currencies}
              fieldErrors={fieldErrors}
            />
          )}

          {active === 'raw' && (
            <RawLens
              draft={draft}
              dispatch={dispatch}
              onError={setRawError}
              accounts={accounts}
              payees={payees}
              commodities={currencies}
            />
          )}

          {state?.formError ===
          'This transaction was modified somewhere else.' ? (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>{state.formError} Reload to see the latest version.</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => router.refresh()}
                >
                  Reload
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            state?.formError && (
              <Alert variant="destructive">
                <AlertDescription>{state.formError}</AlertDescription>
              </Alert>
            )
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">
              {mode === 'edit'
                ? 'Rewrites the original block in its source file.'
                : "Appended to your journal's main file."}
            </span>
            <div className="flex items-center gap-2">
              <SaveAsTemplateButton
                draft={templateDraft}
                disabled={!canSaveTemplate}
              />
              {mode !== 'edit' && (
                <Button
                  type="submit"
                  variant="outline"
                  disabled={!canSubmit}
                  onClick={() => {
                    saveAndAddAnother.current = true;
                  }}
                >
                  {isPending ? 'Saving…' : 'Save & add another'}
                </Button>
              )}
              <Button
                type="submit"
                disabled={!canSubmit}
                onClick={() => {
                  saveAndAddAnother.current = false;
                }}
              >
                {isPending
                  ? 'Saving…'
                  : mode === 'edit'
                    ? 'Save changes'
                    : 'Add transaction'}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default TransactionEntry;
