'use client';

import { isAuthPath } from './authPaths';
import { isPublicPath } from './publicPaths';
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

  // Public marketing pages own their own full-bleed chrome — no sidebar,
  // header, or app-only banners. Centralized in publicPaths.ts (tested) so the
  // bare-landing decision isn't a magic literal duplicated with the proxy.
  if (isPublicPath(pathname)) {
    return <>{children}</>;
  }

  // Auth pages own their own full-bleed chrome — AuthScreen renders its own
  // <main> split layout, so the shell must not wrap it in a width-clamped
  // container (the old starter centered-card wrapper squished the split into a
  // narrow column and nested <main> inside <main>).
  if (isAuthPage) {
    return (
      <TooltipProvider>
        {children}
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
