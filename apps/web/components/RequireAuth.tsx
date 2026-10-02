'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

/** Redirects to /login (or /onboarding) until the user can use the page. */
export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const blocked = !user || !user.onboarded || (admin && user.role !== 'ADMIN');

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (!user.onboarded) router.replace(`/onboarding?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  if (loading) return <p className="text-muted">Loading…</p>;
  if (user && user.onboarded && admin && user.role !== 'ADMIN') {
    return <p className="text-bad">This area is for admins only.</p>;
  }
  if (blocked) return null;
  return <>{children}</>;
}
