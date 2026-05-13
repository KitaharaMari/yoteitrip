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

/** Returns true if the local store has any user-generated content (trips OR wishlist). */
function hasLocalContent(): boolean {
  const { trips, wishlist } = useTripStore.getState();
  return (
    wishlist.length > 0 ||
    trips.some((t) => t.days.some((d) => d.activities.length > 0 || !!d.originPlace))
  );
}

/** Returns true if the cloud snapshot contains any user-generated content. */
function cloudHasAnyContent(cloud: CloudData): boolean {
  return (
    (cloud.wishlist?.length ?? 0) > 0 ||
    cloud.trips.some((t) => t.days.some((d) => d.activities.length > 0 || !!d.originPlace))
  );
}

/** Merge two wishlists by placeId — no item is lost from either side. */
function mergeWishlists(
  primary: CloudData['wishlist'],
  secondary: CloudData['wishlist'],
): CloudData['wishlist'] {
  const seen = new Set(primary.map((i) => i.placeId));
  return [...primary, ...secondary.filter((i) => !seen.has(i.placeId))];
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser       = useAuthStore((s) => s.setUser);
  const setAuthReady  = useAuthStore((s) => s.setAuthReady);
  const setSyncReady  = useAuthStore((s) => s.setSyncReady);
  const loadFromCloud = useTripStore((s) => s.loadFromCloud);
  const setWishlist   = useTripStore((s) => s.setWishlist);

  const [conflict, setConflict] = useState<{
    cloud:             CloudData;
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
      const { trips: localTrips, currentTripId, wishlist: localWishlist, lastManualSave } = useTripStore.getState();

      if (!cloud) {
        await saveCloudData(user.uid, {
          trips: localTrips, currentTripId, wishlist: localWishlist,
          savedAt: new Date().toISOString(),
          manualSavedAt: lastManualSave ?? undefined,
        });
        setSyncReady(true);
        return;
      }

      // ── Manual-save priority ────────────────────────────────────────────────
      const cloudManualTs = cloud.manualSavedAt ? new Date(cloud.manualSavedAt).getTime() : 0;
      const localManualTs = lastManualSave       ? new Date(lastManualSave).getTime()       : 0;

      if (cloudManualTs > 0 || localManualTs > 0) {
        if (cloudManualTs >= localManualTs) {
          // Cloud is the authoritative save — load it, then merge in any local-only wishlist items
          const merged = mergeWishlists(cloud.wishlist ?? [], localWishlist);
          loadFromCloud({ ...cloud, wishlist: merged });
        } else {
          // Local is newer — upload, merging any cloud-only wishlist items
          const merged = mergeWishlists(localWishlist, cloud.wishlist ?? []);
          setWishlist(merged);
          await saveCloudData(user.uid, {
            trips: localTrips, currentTripId, wishlist: merged,
            savedAt: new Date().toISOString(),
            manualSavedAt: lastManualSave ?? undefined,
          });
        }
        setSyncReady(true);
        return;
      }

      // ── Content-based fallback ──────────────────────────────────────────────
      const cloudHasContent = cloudHasAnyContent(cloud);

      if (cloudHasContent && hasLocal) {
        setConflict({
          cloud,
          localTripCount:    localTrips.length,
          localWishlistCount: localWishlist.length,
          uid:               user.uid,
        });
      } else if (cloudHasContent) {
        // Cloud has data, local is empty — load cloud (no local items to preserve)
        loadFromCloud(cloud);
        setSyncReady(true);
      } else if (hasLocal) {
        // Local has data, cloud is empty — upload local
        await saveCloudData(user.uid, {
          trips: localTrips, currentTripId, wishlist: localWishlist,
          savedAt: new Date().toISOString(),
        });
        setSyncReady(true);
      } else {
        setSyncReady(true);
      }
    });

    return unsub;
  }, [setUser, setAuthReady, setSyncReady, loadFromCloud, setWishlist]);

  const handleUseCloud = () => {
    if (!conflict) return;
    const { wishlist: localWishlist } = useTripStore.getState();
    // Use cloud trips but merge both wishlists so nothing is lost
    const merged = mergeWishlists(conflict.cloud.wishlist ?? [], localWishlist);
    loadFromCloud({ ...conflict.cloud, wishlist: merged });
    setSyncReady(true);
    setConflict(null);
  };

  const handleUseLocal = async () => {
    if (!conflict) return;
    const { trips, currentTripId, wishlist: localWishlist } = useTripStore.getState();
    // Keep local trips but merge both wishlists so nothing is lost
    const merged = mergeWishlists(localWishlist, conflict.cloud.wishlist ?? []);
    setWishlist(merged);
    await saveCloudData(conflict.uid, {
      trips, currentTripId, wishlist: merged,
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
