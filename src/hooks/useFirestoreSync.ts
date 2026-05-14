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
      // Never write manualSavedAt: undefined — setDoc does a full replace and
      // undefined fields are stripped, which would silently DELETE manualSavedAt
      // from Firestore and break the manual-save priority on next login.
      const payload = {
        trips,
        currentTripId,
        wishlist,
        savedAt: new Date().toISOString(),
        ...(lastManualSave != null ? { manualSavedAt: lastManualSave } : {}),
      };
      saveCloudData(user.uid, payload).catch(() => { /* will retry on next change */ });
    }, 2000);
    return () => clearTimeout(timer);
  }, [user, syncReady, trips, currentTripId, wishlist, lastManualSave]);
}
