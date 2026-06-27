'use client';

import * as React from 'react';
import { getNavSections } from '@/components/nav/config';
import { useActiveMenu } from '@/components/nav/useActiveMenu';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { APP_NAME } from '@/lib/app';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const AppSidebar = () => {
  const pathname = usePathname();
  const sections = React.useMemo(() => getNavSections(), []);
  const { isActive } = useActiveMenu(pathname);
  const { setOpenMobile } = useSidebar();

  // Close the mobile drawer whenever navigation lands on a new route. The
  // shadcn SidebarMenuButton only fires onClick and never dismisses the
  // overlay, so without this the drawer stays open on top of the content
  // after tapping a nav link. Keying off the pathname covers every entry
  // point (nav links, command palette, breadcrumbs, browser back/forward),
  // not just the menu buttons.
  React.useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 px-2 py-1"
          aria-label={`${APP_NAME} home`}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent text-xs font-bold text-accent-fg">
            L
          </span>
          <span className="truncate text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            {APP_NAME}
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.id}>
            <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={isActive(item)}
                        tooltip={item.title}
                        render={<Link href={item.href} />}
                      >
                        <Icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
};

export default AppSidebar;
