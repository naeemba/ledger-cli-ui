import { completionAt, type CompletionLists } from './completionContext';
import type {
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete';

/** Adapt the pure `completionAt` resolver into a CodeMirror CompletionSource. */
export const ledgerCompletions =
  (lists: CompletionLists) =>
  (ctx: CompletionContext): CompletionResult | null => {
    const res = completionAt(ctx.state.doc.toString(), ctx.pos, lists);
    if (!res) return null;
    return {
      from: res.from,
      options: res.options.map((label) => ({ label, type: 'text' })),
      validFor: /^[\w:$€£.\- ]*$/,
    };
  };
