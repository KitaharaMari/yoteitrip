'use client';

import { useEffect, useState } from 'react';
import { useTripStore } from '@/store/useTripStore';

export function StoreHydration({ children }: { children: React.ReactNode }) {
  // useState(false) ensures server and client start with identical output,
  // preventing a hydration mismatch while localStorage is loading.
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (useTripStore.persist.hasHydrated()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsHydrated(true);
      return;
    }
    const unsubscribe = useTripStore.persist.onFinishHydration(() => setIsHydrated(true));
    useTripStore.persist.rehydrate();
    return unsubscribe;
  }, []);

  if (!isHydrated) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return <>{children}</>;
}
