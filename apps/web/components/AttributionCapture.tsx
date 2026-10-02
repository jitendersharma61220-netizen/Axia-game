'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { captureFromUrl } from '@/lib/attribution';

/** Saves ?invite= and utm_* from whatever page a visitor lands on. */
export function AttributionCapture() {
  const pathname = usePathname();
  useEffect(() => {
    captureFromUrl(new URLSearchParams(window.location.search));
  }, [pathname]);
  return null;
}
