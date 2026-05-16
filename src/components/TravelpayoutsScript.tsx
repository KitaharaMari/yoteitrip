'use client';

import { useEffect } from 'react';

// Loads the Travelpayouts affiliate tracking script exactly once per session.
// Placed in the root layout so it persists across client-side navigations.
export function TravelpayoutsScript() {
  useEffect(() => {
    // Guard: skip if already injected (handles HMR / StrictMode double-mount)
    if (document.querySelector('script[data-tp="529580"]')) return;
    const s = document.createElement('script');
    s.async = true;
    s.defer = true;
    s.src   = 'https://emrldtp.cc/NTI5NTgw.js?t=529580';
    s.setAttribute('data-tp', '529580');
    document.head.appendChild(s);
  }, []);

  return null;
}
