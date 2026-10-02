import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import { Nav } from '@/components/Nav';

export const metadata: Metadata = {
  title: 'Axia — Skill Games',
  description: 'Short, sharp skill games. Daily challenges, leaderboards, and bragging rights.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b1020' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <AuthProvider>
          <Nav />
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-muted">
            <div className="flex flex-wrap gap-4">
              <Link href="/pricing">Pricing</Link>
              <Link href="/referral">Referral</Link>
              <Link href="/account">Account</Link>
              <span>Terms · Privacy · Refunds (pending legal review)</span>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
