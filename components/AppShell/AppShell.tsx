'use client';

import { isAuthPath } from './authPaths';
import CommandPalette, {
  CommandPaletteProvider,
} from '@/components/CommandPalette';
import AppHeader from '@/components/Header/AppHeader';
import AppSidebar from '@/components/Sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { usePathname } from 'next/navigation';

type Props = {
  children: React.ReactNode;
  headerSlot?: React.ReactNode;
  // Server-rendered banner element, passed from the root layout so this client
  // shell never imports the server-only currency module directly. Rendered only
  // inside the app chrome — never on the landing or auth pages.
  bannerSlot?: React.ReactNode;
};

const AppShell = ({ children, headerSlot, bannerSlot }: Props) => {
  const pathname = usePathname();
  const isAuthPage = isAuthPath(pathname);

  // The marketing landing at `/` owns its own full-bleed chrome — no sidebar,
  // header, or app-only banners.
  if (pathname === '/') {
    return <>{children}</>;
  }

  if (isAuthPage) {
    return (
      <TooltipProvider>
        <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-12 sm:px-6">
          {children}
        </main>
        <Toaster />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <CommandPaletteProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <AppHeader slot={headerSlot} />
            <div className="mx-auto w-full max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
              {bannerSlot}
              {children}
            </div>
          </SidebarInset>
          <CommandPalette />
          <Toaster />
        </SidebarProvider>
      </CommandPaletteProvider>
    </TooltipProvider>
  );
};

export default AppShell;
