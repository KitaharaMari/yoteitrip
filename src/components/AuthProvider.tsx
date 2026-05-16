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
  const { trips, wishlist } = useTripStore.getState();
  return (
    wishlist.length > 0 ||
    trips.some((t) => t.days.some((d) => d.activities.length > 0 || !!d.originPlace))
  );
}

function cloudHasAnyContent(cloud: CloudData): boolean {
  return (
    (cloud.wishlist?.length ?? 0) > 0 ||
    cloud.trips.some((t) => t.days.some((d) => d.activities.length > 0 || !!d.originPlace))
  );
}

function mergeWishlists(
  primary: CloudData['wishlist'],
  secondary: CloudData['wishlist'],
): CloudData['wishlist'] {
  const seen = new Set(primary.map((i) => i.placeId));
  return [...primary, ...secondary.filter((i) => !seen.has(i.placeId))];
}

/**
 * Returns true when local state has changes that would be silently lost
 * if we loaded the cloud snapshot without asking the user first.
 *
 * Checks two cases:
 *   1. Local trips that have never been saved to cloud (no matching trip ID).
 *   2. Local trips that were edited AFTER the cloud's last manual save.
 */
function localHasUnsavedWork(
  localTrips: ReturnType<typeof useTripStore.getState>['trips'],
  cloud: CloudData,
  cloudManualTs: number,
): boolean {
  const cloudIds = new Set(cloud.trips.map((t) => t.id));

  // Case 1: new local trips cloud has never seen
  const neverSynced = localTrips.some(
    (t) =>
      !cloudIds.has(t.id) &&
      t.days.some((d) => d.activities.length > 0 || !!d.originPlace),
  );
  if (neverSynced) return true;

  // Case 2: existing trips that were modified locally after cloud's save
  const editedAfterSave = localTrips.some(
    (t) =>
      cloudIds.has(t.id) &&
      !!t.updatedAt &&
      new Date(t.updatedAt).getTime() > cloudManualTs,
  );
  return editedAfterSave;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser           = useAuthStore((s) => s.setUser);
  const setAuthReady      = useAuthStore((s) => s.setAuthReady);
  const setSyncReady      = useAuthStore((s) => s.setSyncReady);
  const loadFromCloud     = useTripStore((s) => s.loadFromCloud);
  const setWishlist       = useTripStore((s) => s.setWishlist);
  const setLastManualSave = useTripStore((s) => s.setLastManualSave);

  const [conflict, setConflict] = useState<{
    cloud:              CloudData;
    localTripCount:    number;
    localWishlistCount: number;
    uid:               string;
  } | null>(null);

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
        setSyncReady(true);
        return;
      }

      const cloud    = await loadCloudData(user.uid);
      const hasLocal = hasLocalContent();
      const {
        trips: localTrips, currentTripId, wishlist: localWishlist, lastManualSave,
      } = useTripStore.getState();

      // ── No cloud record yet — upload local, always set syncReady ───────────
      if (!cloud) {
        try {
          await saveCloudData(user.uid, {
            trips: localTrips, currentTripId, wishlist: localWishlist,
            savedAt: new Date().toISOString(),
            ...(lastManualSave != null ? { manualSavedAt: lastManualSave } : {}),
          });
        } catch {
          // Upload failed — local data is safe in localStorage; auto-sync will retry
          console.warn('[AuthProvider] Initial cloud upload failed — local data preserved');
        }
        setSyncReady(true);
        return;
      }

      // ── Manual-save priority ───────────────────────────────────────────────
      const cloudManualTs = cloud.manualSavedAt ? new Date(cloud.manualSavedAt).getTime() : 0;
      const localManualTs = lastManualSave       ? new Date(lastManualSave).getTime()       : 0;

      if (cloudManualTs > 0 || localManualTs > 0) {
        if (cloudManualTs >= localManualTs) {
          // Cloud save timestamp is newer or equal — but first check whether
          // local has unsaved work that would be silently overwritten.
          if (localHasUnsavedWork(localTrips, cloud, cloudManualTs)) {
            // Surface a conflict so the user decides what to keep.
            setConflict({
              cloud,
              localTripCount:     localTrips.length,
              localWishlistCount: localWishlist.length,
              uid:                user.uid,
            });
          } else {
            const merged = mergeWishlists(cloud.wishlist ?? [], localWishlist);
            loadFromCloud({ trips: cloud.trips, currentTripId: cloud.currentTripId, wishlist: merged });
            if (cloud.manualSavedAt) setLastManualSave(cloud.manualSavedAt);
          }
        } else {
          // Local is explicitly newer — upload local, preserving wishlist additions
          const merged = mergeWishlists(localWishlist, cloud.wishlist ?? []);
          setWishlist(merged);
          try {
            await saveCloudData(user.uid, {
              trips: localTrips, currentTripId, wishlist: merged,
              savedAt: new Date().toISOString(),
              ...(lastManualSave != null ? { manualSavedAt: lastManualSave } : {}),
            });
          } catch {
            console.warn('[AuthProvider] Upload of newer-local data failed — will retry on next change');
          }
        }
        setSyncReady(true);
        return;
      }

      // ── Content-based fallback (no manual timestamps at all) ───────────────
      const cloudHasContent = cloudHasAnyContent(cloud);

      if (cloudHasContent && hasLocal) {
        setConflict({
          cloud,
          localTripCount:     localTrips.length,
          localWishlistCount: localWishlist.length,
          uid:                user.uid,
        });
      } else if (cloudHasContent) {
        loadFromCloud({ trips: cloud.trips, currentTripId: cloud.currentTripId, wishlist: cloud.wishlist ?? [] });
        if (cloud.manualSavedAt) setLastManualSave(cloud.manualSavedAt);
      } else if (hasLocal) {
        try {
          await saveCloudData(user.uid, {
            trips: localTrips, currentTripId, wishlist: localWishlist,
            savedAt: new Date().toISOString(),
          });
        } catch {
          console.warn('[AuthProvider] Upload of local data failed — will retry on next change');
        }
      }
      setSyncReady(true);  // always reached — no more missing setSyncReady paths
    });

    return unsub;
  }, [setUser, setAuthReady, setSyncReady, loadFromCloud, setWishlist, setLastManualSave]);

  const handleUseCloud = () => {
    if (!conflict) return;
    const { wishlist: localWishlist } = useTripStore.getState();
    const merged = mergeWishlists(conflict.cloud.wishlist ?? [], localWishlist);
    loadFromCloud({ trips: conflict.cloud.trips, currentTripId: conflict.cloud.currentTripId, wishlist: merged });
    if (conflict.cloud.manualSavedAt) setLastManualSave(conflict.cloud.manualSavedAt);
    setSyncReady(true);
    setConflict(null);
  };

  const handleUseLocal = async () => {
    if (!conflict) return;
    const { trips, currentTripId, wishlist: localWishlist, lastManualSave } = useTripStore.getState();
    const merged = mergeWishlists(localWishlist, conflict.cloud.wishlist ?? []);
    setWishlist(merged);
    try {
      await saveCloudData(conflict.uid, {
        trips, currentTripId, wishlist: merged,
        savedAt: new Date().toISOString(),
        ...(lastManualSave != null ? { manualSavedAt: lastManualSave } : {}),
      });
    } catch {
      console.warn('[AuthProvider] handleUseLocal upload failed');
    }
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
            localTripCount={conflict.localTripCount}
            localWishlistCount={conflict.localWishlistCount}
            onUseCloud={handleUseCloud}
            onUseLocal={handleUseLocal}
          />
        )}
      </AnimatePresence>
    </>
  );
}
