'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore } from '@/store/useTripStore';
import { saveCloudData } from '@/lib/firestore';

/**
 * Watches the trip store and debounce-saves to Firestore whenever the
 * user is signed in. Mount this once inside AuthProvider.
 */
export function useFirestoreSync() {
  const user          = useAuthStore((s) => s.user);
  const trips         = useTripStore((s) => s.trips);
  const currentTripId = useTripStore((s) => s.currentTripId);
  const wishlist      = useTripStore((s) => s.wishlist);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      saveCloudData(user.uid, {
        trips,
        currentTripId,
        wishlist,
        savedAt: new Date().toISOString(),
      }).catch(() => { /* silent — will retry on next change */ });
    }, 2000);
    return () => clearTimeout(timer);
  }, [user, trips, currentTripId, wishlist]);
}
