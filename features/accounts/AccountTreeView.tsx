// features/accounts/AccountTreeView.tsx
'use client';

import { useState } from 'react';
import AccountButtons from './AccountButtons';
import FriendlyBalance from './FriendlyBalance';
import type { AccountNode } from './accountTree';

const Node = ({
  node,
  forceOpen,
}: {
  node: AccountNode;
  forceOpen: boolean;
}) => {
  const hasChildren = node.children.length > 0;
  const [open, setOpen] = useState(node.path === 'Expenses');
  const isOpen = forceOpen || open;

  return (
    <li>
      <div className="group flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-subtle">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={isOpen}
            aria-label={
              isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`
            }
            className="text-muted-foreground"
          >
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className="inline-block w-[1ch]" aria-hidden="true" />
        )}
        <span className="font-medium text-fg">{node.name}</span>
        <FriendlyBalance amount={node.amount} role={node.role} />
        <span className="ml-auto">
          <AccountButtons path={node.path} />
        </span>
      </div>
      {hasChildren && isOpen && (
        <ul className="ml-4 space-y-1 border-l border-border pl-4">
          {node.children.map((child) => (
            <Node key={child.path} node={child} forceOpen={forceOpen} />
          ))}
        </ul>
      )}
    </li>
  );
};

const AccountTreeView = ({
  nodes,
  forceOpen,
}: {
  nodes: AccountNode[];
  forceOpen: boolean;
}) => {
  if (nodes.length === 0) {
    return (
      <p className="px-3 py-2 text-sm text-muted-foreground">No accounts.</p>
    );
  }
  return (
    <ul className="space-y-1">
      {nodes.map((node) => (
        <Node key={node.path} node={node} forceOpen={forceOpen} />
      ))}
    </ul>
  );
};

export default AccountTreeView;
