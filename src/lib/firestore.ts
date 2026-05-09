import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { getFirebaseApp } from './firebase';
import type { Trip, WishlistItem } from '@/types';

export interface CloudData {
  trips:         Trip[];
  currentTripId: string | null;
  wishlist:      WishlistItem[];
  savedAt:       string;
}

function db() {
  return getFirestore(getFirebaseApp());
}

export async function loadCloudData(uid: string): Promise<CloudData | null> {
  try {
    const snap = await getDoc(doc(db(), 'users', uid));
    return snap.exists() ? (snap.data() as CloudData) : null;
  } catch {
    return null;
  }
}

export async function saveCloudData(uid: string, data: CloudData): Promise<void> {
  await setDoc(doc(db(), 'users', uid), data);
}
