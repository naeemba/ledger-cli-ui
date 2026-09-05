// The one error card every ledger-backed page shows when the shell-out fails,
// so restyling the failure state is a single edit.
const LedgerErrorCard = ({ what }: { what: string }) => (
  <div className="rounded-2xl border border-border bg-card p-6 text-sm text-negative shadow-sm">
    Failed to load {what} from ledger.
  </div>
);

export default LedgerErrorCard;
