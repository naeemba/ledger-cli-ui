'use client';

import { LogOutIcon } from 'lucide-react';
import * as React from 'react';
import { CommandPaletteTrigger } from '@/components/CommandPalette';
import { getNavSections } from '@/components/nav/config';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAuth } from '@/lib/auth/use-auth';
import Link from 'next/link';

type Props = { slot?: React.ReactNode };

const AppHeader = ({ slot }: Props) => {
  const sections = React.useMemo(() => getNavSections(), []);
  const { user, signOut } = useAuth();
  const userInitial = (user?.email?.[0] ?? 'U').toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-bg/60 sm:px-6 lg:px-8">
      <SidebarTrigger />

      <NavigationMenu className="hidden md:flex" align="start">
        <NavigationMenuList>
          {sections.map((section) => (
            <NavigationMenuItem key={section.id}>
              <NavigationMenuTrigger>{section.title}</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-[520px] gap-1 p-2 md:w-[600px] md:grid-cols-2">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.id}>
                        <NavigationMenuLink render={<Link href={item.href} />}>
                          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-sm font-medium leading-none">
                              {item.title}
                            </span>
                            <span className="line-clamp-2 text-xs text-muted-foreground">
                              {item.description}
                            </span>
                          </div>
                        </NavigationMenuLink>
                      </li>
                    );
                  })}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          ))}
        </NavigationMenuList>
      </NavigationMenu>

      <div className="ml-auto flex items-center gap-2">
        {slot}
        <CommandPaletteTrigger />
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="User menu"
                >
                  <span className="grid size-7 place-items-center rounded-full bg-muted text-xs font-semibold">
                    {userInitial}
                  </span>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">
                      Signed in as
                    </span>
                    <span className="truncate text-sm font-medium">
                      {user.email}
                    </span>
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut}>
                <LogOutIcon /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
};

export default AppHeader;
