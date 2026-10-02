'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { RequireAuth } from '@/components/RequireAuth';

function Account() {
  const { user, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-3xl font-black">Account</h1>
      <div className="card space-y-2 text-sm">
        <p>
          <span className="text-muted">Name:</span> {user.name}
        </p>
        <p>
          <span className="text-muted">Email:</span> {user.email}
        </p>
        <p>
          <span className="text-muted">Experience:</span> {user.ageMode === 'TEEN' ? 'Teen (14–18, free)' : 'Standard'}
        </p>
        <p>
          <span className="text-muted">Plan:</span> Free
        </p>
      </div>
      <button
        className="btn-ghost w-full"
        onClick={async () => {
          await logout();
          router.replace('/');
        }}
      >
        Sign out
      </button>
    </div>
  );
}

export default function AccountPage() {
  return (
    <RequireAuth>
      <Account />
    </RequireAuth>
  );
}
