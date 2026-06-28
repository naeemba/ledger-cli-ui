'use client';

export type TabItem = { id: string; label: string; disabled?: boolean };

export function TabBar({
  tabs,
  active,
  onSelect,
}: {
  tabs: TabItem[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-border">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={tab.disabled}
            onClick={() => onSelect(tab.id)}
            className={[
              'rounded-t-md border border-b-0 px-4 py-2 text-sm font-medium',
              selected
                ? 'bg-accent text-accent-foreground'
                : 'border-transparent opacity-60',
              tab.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
            ].join(' ')}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
