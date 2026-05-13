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

function hasLocalContent(): boolean {
  const { trips } = useTripStore.getState();
  return trips.some((t) =>
    t.days.some((d) => d.activities.length > 0 || !!d.originPlace),
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser       = useAuthStore((s) => s.setUser);
  const setAuthReady  = useAuthStore((s) => s.setAuthReady);
  const setSyncReady  = useAuthStore((s) => s.setSyncReady);
  const loadFromCloud = useTripStore((s) => s.loadFromCloud);

  const [conflict, setConflict] = useState<{
    cloud:      CloudData;
    localCount: number;
    uid:        string;
  } | null>(null);

  // Auto-save hook — only fires after syncReady = true (set below)
  useFirestoreSync();

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setAuthReady(true);
      setSyncReady(true);
      return;
    }

    const auth = getAuth(getFirebaseApp());
    const unsub = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setAuthReady(true);

      if (!user) {
        // Not logged in — local mode, auto-sync not needed
        setSyncReady(true);
        return;
      }

      const cloud    = await loadCloudData(user.uid);
      const hasLocal = hasLocalContent();
      const { trips: localTrips, currentTripId, wishlist, lastManualSave } = useTripStore.getState();

      if (!cloud) {
        // No cloud record yet — upload local data and start syncing
        await saveCloudData(user.uid, {
          trips: localTrips, currentTripId, wishlist,
          savedAt: new Date().toISOString(),
          manualSavedAt: lastManualSave ?? undefined,
        });
        setSyncReady(true);
        return;
      }

      // ── Manual-save priority ────────────────────────────────────────────────
      // If either side has an explicit save, the newer one wins without a
      // conflict modal. This is the "Save" button's guarantee.
      const cloudManualTs = cloud.manualSavedAt ? new Date(cloud.manualSavedAt).getTime() : 0;
      const localManualTs = lastManualSave       ? new Date(lastManualSave).getTime()       : 0;

      if (cloudManualTs > 0 || localManualTs > 0) {
        if (cloudManualTs >= localManualTs) {
          loadFromCloud(cloud);
        } else {
          await saveCloudData(user.uid, {
            trips: localTrips, currentTripId, wishlist,
            savedAt: new Date().toISOString(),
            manualSavedAt: lastManualSave ?? undefined,
          });
        }
        setSyncReady(true);
        return;
      }

      // ── Content-based fallback ──────────────────────────────────────────────
      const cloudHasContent = cloud.trips.some((t) =>
        t.days.some((d) => d.activities.length > 0 || !!d.originPlace),
      );

      if (cloudHasContent && hasLocal) {
        // Both sides have real data — let user choose (syncReady set on choice)
        setConflict({ cloud, localCount: localTrips.length, uid: user.uid });
      } else if (cloudHasContent) {
        loadFromCloud(cloud);
        setSyncReady(true);
      } else if (hasLocal) {
        // Cloud is empty but local has data — upload local, don't overwrite it
        await saveCloudData(user.uid, {
          trips: localTrips, currentTripId, wishlist,
          savedAt: new Date().toISOString(),
        });
        setSyncReady(true);
      } else {
        setSyncReady(true);
      }
    });

    return unsub;
  }, [setUser, setAuthReady, setSyncReady, loadFromCloud]);

  const handleUseCloud = () => {
    if (!conflict) return;
    loadFromCloud(conflict.cloud);
    setSyncReady(true);
    setConflict(null);
  };

  const handleUseLocal = async () => {
    if (!conflict) return;
    const { trips, currentTripId, wishlist } = useTripStore.getState();
    await saveCloudData(conflict.uid, {
      trips, currentTripId, wishlist,
      savedAt: new Date().toISOString(),
    });
    setSyncReady(true);
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
