import { doc, setDoc, getDoc } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { getFirebaseApp, isFirebaseConfigured } from './firebase';
import type { Trip } from '@/types';

interface SharedTripRecord {
  trip:      Trip;
  createdAt: string;
  createdBy: string | null;
}

function db() {
  return getFirestore(getFirebaseApp());
}

/** 10-character random alphanumeric ID (no confusable chars like 0/O, 1/I/l). */
function makeShareId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/**
 * Saves the trip to the `sharedTrips` Firestore collection and returns the
 * share ID. Anyone with the resulting URL can read the trip — no login needed.
 */
export async function createShareLink(trip: Trip, uid: string | null): Promise<string> {
  if (!isFirebaseConfigured()) throw new Error('Firebase not configured');
  const id = makeShareId();
  await setDoc(doc(db(), 'sharedTrips', id), {
    trip,
    createdAt: new Date().toISOString(),
    createdBy: uid,
  } satisfies SharedTripRecord);
  return id;
}

/** Fetches a shared trip by ID. Returns null if not found or on error. */
export async function loadSharedTrip(shareId: string): Promise<Trip | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const snap = await getDoc(doc(db(), 'sharedTrips', shareId));
    if (!snap.exists()) return null;
    return (snap.data() as SharedTripRecord).trip;
  } catch {
    return null;
  }
}
