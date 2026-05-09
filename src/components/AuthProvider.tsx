'use client';

import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { AnimatePresence } from 'framer-motion';
import { getFirebaseApp, isFirebaseConfigured } from '@/lib/firebase';
import { loadCloudData, saveCloudData, type CloudData } from '@/lib/firestore';
import { useAuthStore } from '@/store/useAuthStore';
import { useTripStore } from '@/store/useTripStore';
import { useFirestoreSync } from '@/hooks/useFirestoreSync';
import { SyncConflictModal } from './SyncConflictModal';

/** Returns true if the local store has trips with real user content. */
function hasLocalContent(): boolean {
  const { trips } = useTripStore.getState();
  return trips.some((t) =>
    t.days.some((d) => d.activities.length > 0 || !!d.originPlace),
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser      = useAuthStore((s) => s.setUser);
  const setAuthReady = useAuthStore((s) => s.setAuthReady);
  const loadFromCloud = useTripStore((s) => s.loadFromCloud);

  const [conflict, setConflict] = useState<{
    cloud:      CloudData;
    localCount: number;
    uid:        string;
  } | null>(null);

  // Activate debounced Firestore auto-save
  useFirestoreSync();

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setAuthReady(true);
      return;
    }

    const auth = getAuth(getFirebaseApp());
    const unsub = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setAuthReady(true);

      if (!user) return;

      const cloud   = await loadCloudData(user.uid);
      const hasLocal = hasLocalContent();
      const { trips: localTrips, currentTripId, wishlist } = useTripStore.getState();

      if (!cloud) {
        // New user — push local data to cloud immediately
        await saveCloudData(user.uid, {
          trips: localTrips, currentTripId, wishlist,
          savedAt: new Date().toISOString(),
        });
        return;
      }

      const cloudHasContent = cloud.trips.some((t) =>
        t.days.some((d) => d.activities.length > 0 || !!d.originPlace),
      );

      if (cloudHasContent && hasLocal) {
        // Both sides have meaningful data — let user choose
        setConflict({ cloud, localCount: localTrips.length, uid: user.uid });
      } else {
        // Cloud has data, local is empty (or vice-versa) — auto-load cloud
        loadFromCloud(cloud);
      }
    });

    return unsub;
  }, [setUser, setAuthReady, loadFromCloud]);

  const handleUseCloud = () => {
    if (!conflict) return;
    loadFromCloud(conflict.cloud);
    setConflict(null);
  };

  const handleUseLocal = async () => {
    if (!conflict) return;
    const { trips, currentTripId, wishlist } = useTripStore.getState();
    await saveCloudData(conflict.uid, {
      trips, currentTripId, wishlist,
      savedAt: new Date().toISOString(),
    });
    setConflict(null);
  };

  return (
    <>
      {children}
      <AnimatePresence>
        {conflict && (
          <SyncConflictModal
            cloudData={conflict.cloud}
            localTrips={conflict.localCount}
            onUseCloud={handleUseCloud}
            onUseLocal={handleUseLocal}
          />
        )}
      </AnimatePresence>
    </>
  );
}
