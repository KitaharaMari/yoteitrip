'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore } from '@/store/useTripStore';
import { saveCloudData } from '@/lib/firestore';

/**
 * Watches the trip store and debounce-saves to Firestore whenever the user
 * is signed in AND the initial cloud/local sync decision has been resolved
 * (syncReady = true). This prevents overwriting cloud data before we've had
 * a chance to read it on login.
 */
export function useFirestoreSync() {
  const user          = useAuthStore((s) => s.user);
  const syncReady     = useAuthStore((s) => s.syncReady);
  const trips         = useTripStore((s) => s.trips);
  const currentTripId = useTripStore((s) => s.currentTripId);
  const wishlist      = useTripStore((s) => s.wishlist);
  const lastManualSave = useTripStore((s) => s.lastManualSave);

  useEffect(() => {
    if (!user || !syncReady) return;
    const timer = setTimeout(() => {
      saveCloudData(user.uid, {
        trips,
        currentTripId,
        wishlist,
        savedAt: new Date().toISOString(),
        manualSavedAt: lastManualSave ?? undefined,
      }).catch(() => { /* will retry on next change */ });
    }, 2000);
    return () => clearTimeout(timer);
  }, [user, syncReady, trips, currentTripId, wishlist, lastManualSave]);
}
