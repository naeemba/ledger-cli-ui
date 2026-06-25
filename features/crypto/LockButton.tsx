'use client';

import { LockIcon } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { lock } from '@/features/crypto/lib/unlockFlow';

export const LockButton = () => {
  const handleLock = async () => {
    await lock();
    window.location.assign('/crypto/unlock');
  };

  return (
    <DropdownMenuItem onClick={handleLock}>
      <LockIcon /> Lock vault
    </DropdownMenuItem>
  );
};
