'use client';

import CommandPalette, {
  CommandPaletteProvider,
} from '@/components/CommandPalette';
import AppHeader from '@/components/Header/AppHeader';
import AppSidebar from '@/components/Sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { usePathname } from 'next/navigation';

const AUTH_PATHS = new Set(['/login', '/signup']);

const AppShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const isAuthPage = AUTH_PATHS.has(pathname);

  if (isAuthPage) {
    return (
      <TooltipProvider>
        <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-12 sm:px-6">
          {children}
        </main>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <CommandPaletteProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <AppHeader />
            <div className="mx-auto w-full max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
              {children}
            </div>
          </SidebarInset>
          <CommandPalette />
        </SidebarProvider>
      </CommandPaletteProvider>
    </TooltipProvider>
  );
};

export default AppShell;
