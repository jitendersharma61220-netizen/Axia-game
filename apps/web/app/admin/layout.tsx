'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';

const items = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/games', label: 'Games & Difficulty' },
  { href: '/admin/challenges', label: 'Challenges' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/invites', label: 'Invite codes' },
  { href: '/admin/feedback', label: 'Feedback' },
  { href: '/admin/audit', label: 'Audit log' },
];
const soon = ['Missions', 'Rewards', 'Subscriptions', 'Campaigns', 'AI Content'];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireAuth admin>
      <div className="flex flex-col gap-6 md:flex-row">
        <aside className="md:w-56 md:shrink-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Control center</p>
          <nav className="flex flex-wrap gap-1 md:flex-col">
            {items.map((i) => {
              const active = i.href === '/admin' ? pathname === '/admin' : pathname.startsWith(i.href);
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  className={`rounded-lg px-3 py-2 text-sm ${active ? 'bg-brand text-white' : 'text-muted hover:bg-white/5 hover:text-white'}`}
                >
                  {i.label}
                </Link>
              );
            })}
            {soon.map((s) => (
              <span key={s} className="hidden rounded-lg px-3 py-2 text-sm text-muted/50 md:block">
                {s} <span className="text-[10px] uppercase">soon</span>
              </span>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </RequireAuth>
  );
}
