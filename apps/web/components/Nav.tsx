'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from './AuthProvider';

const links = [
  { href: '/games', label: 'Games' },
  { href: '/daily', label: 'Daily Challenge' },
  { href: '/missions', label: 'Missions' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/rewards', label: 'Rewards' },
  { href: '/pricing', label: 'Pricing' },
];

export function Nav() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const linkClass = (href: string) =>
    `rounded-lg px-3 py-2 text-sm ${pathname.startsWith(href) ? 'bg-white/10 text-white' : 'text-muted hover:text-white'}`;

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ink/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="text-xl font-black tracking-tight">
          <span className="text-brand">A</span>XIA
        </Link>
        <nav className="hidden flex-1 gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass(l.href)}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user?.role === 'ADMIN' && (
            <Link href="/admin" className="btn-ghost text-sm">
              Admin
            </Link>
          )}
          {user ? (
            <Link href="/profile" className="flex items-center gap-2 text-sm">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
              ) : (
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand font-bold">{user.name[0]}</span>
              )}
            </Link>
          ) : (
            <Link href="/login" className="btn-primary text-sm">
              Sign in
            </Link>
          )}
          <button className="btn-ghost px-3 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            ☰
          </button>
        </div>
      </div>
      {open && (
        <nav className="flex flex-col gap-1 border-t border-line px-4 py-2 md:hidden" onClick={() => setOpen(false)}>
          {[...links, { href: '/profile', label: 'Skill Profile' }, { href: '/referral', label: 'Referral' }, { href: '/account', label: 'Account' }].map((l) => (
            <Link key={l.href} href={l.href} className={linkClass(l.href)}>
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
