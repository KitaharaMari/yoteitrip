import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Activity, ActivityType, BaseLocation, Day, PlaceDetails, Trip, WishlistItem } from '@/types';

interface TripState {
  // ── Multi-trip data ───────────────────────────────────────────────────────
  trips: Trip[];
  currentTripId: string | null;
  // Denormalized view of trips[currentTripId] — kept for backward compat with
  // existing components so they don't need to change their selectors.
  trip: Trip;

  wishlist: WishlistItem[];

  // ── Trip management ───────────────────────────────────────────────────────
  createTrip: (title: string, baseLocation?: BaseLocation, coverPhotoUrl?: string) => string;
  setCoverPhoto: (id: string, url: string) => void;
  deleteTrip: (id: string) => void;
  renameTrip: (id: string, title: string) => void;
  setCurrentTrip: (id: string) => void;

  // ── Per-trip operations (all act on currentTripId) ────────────────────────
  addDay: () => void;
  deleteDay: (dayId: string) => void;
  updateDay: (dayId: string, updates: Partial<Omit<Day, 'id' | 'activities'>>) => void;
  addActivity: (dayId: string, type: ActivityType) => void;
  insertActivity: (dayId: string, afterId: string | null, type: ActivityType, place?: PlaceDetails) => void;
  updateActivity: (dayId: string, activityId: string, updates: Partial<Activity>) => void;
  deleteActivity: (dayId: string, activityId: string) => void;
  reorderActivities: (dayId: string, fromPrimaryIdx: number, toPrimaryIdx: number) => void;
  loadTrip: (trip: Trip) => void;
  loadFromCloud: (data: { trips: Trip[]; currentTripId: string | null; wishlist: WishlistItem[] }) => void;
  addBackupActivity: (dayId: string, primaryId: string, type: ActivityType) => void;
  setPreferred: (dayId: string, primaryId: string, backupId: string) => void;
  removeBackupActivity: (dayId: string, backupId: string) => void;

  // ── Wishlist (trip-agnostic) ───────────────────────────────────────────────
  addToWishlist: (item: Omit<WishlistItem, 'id'>) => void;
  removeFromWishlist: (id: string) => void;
  updateWishlistItem: (id: string, updates: Partial<Omit<WishlistItem, 'id'>>) => void;
}

// ── Utilities ──────────────────────────────────────────────────────────────
function uid(): string { return crypto.randomUUID(); }
function timestamp(): string { return new Date().toISOString(); }

function createDay(index: number): Day {
  return { id: uid(), label: `Day ${index}`, activities: [] };
}

function createActivity(type: ActivityType): Activity {
  const base = { id: uid(), type, title: '', startTime: '09:00', duration: 60 };
  if (type === 'TRANSPORT' || type === 'LONG_DISTANCE') {
    return { ...base, duration: type === 'LONG_DISTANCE' ? 120 : 60, isManualTime: true };
  }
  return base;
}

function createTripObject(title: string, baseLocation?: BaseLocation, coverPhotoUrl?: string): Trip {
  return {
    id: uid(), name: title,
    days: [createDay(1)],
    ...(baseLocation    ? { baseLocation }    : {}),
    ...(coverPhotoUrl   ? { coverPhotoUrl }   : {}),
    createdAt: timestamp(), updatedAt: timestamp(),
  };
}

function groupByPrimary(activities: Activity[]): Activity[][] {
  const groups: Activity[][] = [];
  for (const a of activities) {
    if (!a.isBackup) groups.push([a]);
    else groups[groups.length - 1]?.push(a);
  }
  return groups;
}

// Applies fn to the current trip and returns the updated trips + trip slice.
// Returns {} (no change) if no currentTripId is set.
function patchCurrent(
  s: Pick<TripState, 'trips' | 'currentTripId'>,
  fn: (t: Trip) => Trip,
): { trips: Trip[]; trip: Trip } | Record<never, never> {
  if (!s.currentTripId) return {};
  const cur = s.trips.find((t) => t.id === s.currentTripId);
  if (!cur) return {};
  const updated = fn(cur);
  return {
    trips: s.trips.map((t) => (t.id === s.currentTripId ? updated : t)),
    trip: updated,
  };
}

// ── Default initial trip ───────────────────────────────────────────────────
const INITIAL_TRIP = createTripObject('My Trip');

export const useTripStore = create<TripState>()(
  persist(
    (set) => ({
      trips:         [INITIAL_TRIP],
      currentTripId: INITIAL_TRIP.id,
      trip:          INITIAL_TRIP,
      wishlist:      [],

      // ── Trip management ────────────────────────────────────────────────────
      createTrip: (title, baseLocation, coverPhotoUrl) => {
        const newTrip = createTripObject(title, baseLocation, coverPhotoUrl);
        set((s) => ({
          trips: [...s.trips, newTrip],
          currentTripId: newTrip.id,
          trip: newTrip,
        }));
        return newTrip.id;
      },

      setCoverPhoto: (id, url) =>
        set((s) => {
          const updated = s.trips.map((t) =>
            t.id === id ? { ...t, coverPhotoUrl: url, updatedAt: timestamp() } : t,
          );
          const isActive = s.currentTripId === id;
          const updatedCur = isActive ? updated.find((t) => t.id === id) : undefined;
          return { trips: updated, ...(updatedCur ? { trip: updatedCur } : {}) };
        }),

      deleteTrip: (id) =>
        set((s) => {
          const trips = s.trips.filter((t) => t.id !== id);
          const isActive = s.currentTripId === id;
          const fallback = trips[0];
          return {
            trips,
            ...(isActive && fallback
              ? { currentTripId: fallback.id, trip: fallback }
              : isActive
              ? { currentTripId: null }
              : {}),
          };
        }),

      renameTrip: (id, title) =>
        set((s) => {
          const updated = s.trips.map((t) =>
            t.id === id ? { ...t, name: title, updatedAt: timestamp() } : t,
          );
          const isActive = s.currentTripId === id;
          const updatedCur = isActive ? updated.find((t) => t.id === id) : undefined;
          return { trips: updated, ...(updatedCur ? { trip: updatedCur } : {}) };
        }),

      setCurrentTrip: (id) =>
        set((s) => {
          const found = s.trips.find((t) => t.id === id);
          if (!found) return {};
          return { currentTripId: id, trip: found };
        }),

      // ── Per-trip operations ────────────────────────────────────────────────
      addDay: () =>
        set((s) =>
          patchCurrent(s, (trip) => {
            const lastDay = trip.days[trip.days.length - 1];
            let nextDate: string | undefined;
            if (lastDay?.date) {
              const [y, mo, d] = lastDay.date.split('-').map(Number);
              const next = new Date(y, mo - 1, d + 1);
              nextDate = [
                String(next.getFullYear()),
                String(next.getMonth() + 1).padStart(2, '0'),
                String(next.getDate()).padStart(2, '0'),
              ].join('-');
            }
            const newDay = createDay(trip.days.length + 1);
            return {
              ...trip,
              days: [...trip.days, nextDate ? { ...newDay, date: nextDate } : newDay],
              updatedAt: timestamp(),
            };
          }),
        ),

      deleteDay: (dayId) =>
        set((s) =>
          patchCurrent(s, (trip) => ({
            ...trip,
            days: trip.days.filter((d) => d.id !== dayId),
            updatedAt: timestamp(),
          })),
        ),

      updateDay: (dayId, updates) =>
        set((s) =>
          patchCurrent(s, (trip) => {
            const dayIdx = trip.days.findIndex((d) => d.id === dayId);
            if (dayIdx === -1) return trip;

            if (updates.date !== undefined) {
              const days = trip.days.map((d, i) => {
                if (i === dayIdx) return { ...d, ...updates };
                if (updates.date) {
                  const [y, mo, dy] = updates.date.split('-').map(Number);
                  const next = new Date(y, mo - 1, dy + (i - dayIdx));
                  const iso = [
                    next.getFullYear(),
                    String(next.getMonth() + 1).padStart(2, '0'),
                    String(next.getDate()).padStart(2, '0'),
                  ].join('-');
                  return { ...d, date: iso };
                }
                return { ...d, date: undefined };
              });
              return { ...trip, days, updatedAt: timestamp() };
            }

            return {
              ...trip,
              days: trip.days.map((d) => (d.id === dayId ? { ...d, ...updates } : d)),
              updatedAt: timestamp(),
            };
          }),
        ),

      addActivity: (dayId, type) =>
        set((s) =>
          patchCurrent(s, (trip) => ({
            ...trip,
            days: trip.days.map((d) =>
              d.id === dayId
                ? { ...d, activities: [...d.activities, createActivity(type)] }
                : d,
            ),
            updatedAt: timestamp(),
          })),
        ),

      insertActivity: (dayId, afterId, type, place) =>
        set((s) =>
          patchCurrent(s, (trip) => ({
            ...trip,
            days: trip.days.map((d) => {
              if (d.id !== dayId) return d;
              const newAct: Activity = {
                ...createActivity(type),
                ...(place ? { place, title: place.name } : {}),
              };
              if (!afterId) return { ...d, activities: [...d.activities, newAct] };
              const primaryIdx = d.activities.findIndex((a) => a.id === afterId);
              if (primaryIdx === -1) return { ...d, activities: [...d.activities, newAct] };
              let insertAt = primaryIdx + 1;
              while (
                insertAt < d.activities.length &&
                d.activities[insertAt].isBackup &&
                d.activities[insertAt].linkedToId === afterId
              ) insertAt++;
              const acts = [...d.activities];
              acts.splice(insertAt, 0, newAct);
              return { ...d, activities: acts };
            }),
            updatedAt: timestamp(),
          })),
        ),

      updateActivity: (dayId, activityId, updates) =>
        set((s) =>
          patchCurrent(s, (trip) => ({
            ...trip,
            days: trip.days.map((d) =>
              d.id !== dayId
                ? d
                : {
                    ...d,
                    activities: d.activities.map((a) =>
                      a.id === activityId ? { ...a, ...updates } : a,
                    ),
                  },
            ),
            updatedAt: timestamp(),
          })),
        ),

      deleteActivity: (dayId, activityId) =>
        set((s) =>
          patchCurrent(s, (trip) => ({
            ...trip,
            days: trip.days.map((d) =>
              d.id !== dayId
                ? d
                : {
                    ...d,
                    activities: d.activities.filter(
                      (a) => a.id !== activityId && a.linkedToId !== activityId,
                    ),
                  },
            ),
            updatedAt: timestamp(),
          })),
        ),

      reorderActivities: (dayId, fromPrimaryIdx, toPrimaryIdx) =>
        set((s) =>
          patchCurrent(s, (trip) => ({
            ...trip,
            days: trip.days.map((d) => {
              if (d.id !== dayId) return d;
              const groups = groupByPrimary(d.activities);
              const [moved] = groups.splice(fromPrimaryIdx, 1);
              groups.splice(toPrimaryIdx, 0, moved);
              return { ...d, activities: groups.flat() };
            }),
            updatedAt: timestamp(),
          })),
        ),

      // Imports a trip: adds to list if new, replaces if same id, sets as current.
      loadTrip: (imported) =>
        set((s) => {
          const exists = s.trips.some((t) => t.id === imported.id);
          const trips = exists
            ? s.trips.map((t) => (t.id === imported.id ? imported : t))
            : [...s.trips, imported];
          return { trips, currentTripId: imported.id, trip: imported };
        }),

      loadFromCloud: ({ trips, currentTripId, wishlist }) =>
        set(() => {
          const activeTripId = currentTripId ?? trips[0]?.id ?? null;
          const trip = trips.find((t) => t.id === activeTripId) ?? trips[0] ?? INITIAL_TRIP;
          return { trips: trips.length > 0 ? trips : [INITIAL_TRIP], currentTripId: activeTripId, trip, wishlist };
        }),

      addBackupActivity: (dayId, primaryId, type) =>
        set((s) =>
          patchCurrent(s, (trip) => ({
            ...trip,
            days: trip.days.map((d) => {
              if (d.id !== dayId) return d;
              const backup: Activity = {
                ...createActivity(type),
                isBackup: true,
                linkedToId: primaryId,
              };
              let idx = d.activities.findIndex((a) => a.id === primaryId) + 1;
              while (
                idx < d.activities.length &&
                d.activities[idx].isBackup &&
                d.activities[idx].linkedToId === primaryId
              ) idx++;
              const acts = [...d.activities];
              acts.splice(idx, 0, backup);
              return { ...d, activities: acts };
            }),
            updatedAt: timestamp(),
          })),
        ),

      setPreferred: (dayId, primaryId, backupId) =>
        set((s) =>
          patchCurrent(s, (trip) => ({
            ...trip,
            days: trip.days.map((d) => {
              if (d.id !== dayId) return d;
              const acts = d.activities.map((a) => {
                if (a.id === primaryId) return { ...a, isBackup: true, linkedToId: backupId };
                if (a.id === backupId) return { ...a, isBackup: false, linkedToId: undefined };
                if (a.isBackup && a.linkedToId === primaryId) return { ...a, linkedToId: backupId };
                return a;
              });
              const primaryIdx = acts.findIndex((a) => a.id === primaryId);
              const backupIdx  = acts.findIndex((a) => a.id === backupId);
              if (primaryIdx === -1 || backupIdx === -1) return d;
              const [backupAct] = acts.splice(backupIdx, 1);
              acts.splice(backupIdx < primaryIdx ? primaryIdx - 1 : primaryIdx, 0, backupAct);
              return { ...d, activities: acts };
            }),
            updatedAt: timestamp(),
          })),
        ),

      removeBackupActivity: (dayId, backupId) =>
        set((s) =>
          patchCurrent(s, (trip) => ({
            ...trip,
            days: trip.days.map((d) =>
              d.id !== dayId
                ? d
                : { ...d, activities: d.activities.filter((a) => a.id !== backupId) },
            ),
            updatedAt: timestamp(),
          })),
        ),

      // ── Wishlist ───────────────────────────────────────────────────────────
      addToWishlist: (item) =>
        set((s) => ({ wishlist: [...s.wishlist, { ...item, id: uid() }] })),

      removeFromWishlist: (id) =>
        set((s) => ({ wishlist: s.wishlist.filter((i) => i.id !== id) })),

      updateWishlistItem: (id, updates) =>
        set((s) => ({
          wishlist: s.wishlist.map((i) => (i.id === id ? { ...i, ...updates } : i)),
        })),
    }),
    {
      name: 'yoteitrip-trip',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      version: 1,
      // Migrate from v0 (single trip) → v1 (trips array)
      migrate(raw, version) {
        if (version < 1) {
          const old = raw as { trip?: Trip; wishlist?: WishlistItem[] };
          const existing = old.trip;
          if (existing) {
            return {
              trips:         [existing],
              currentTripId: existing.id,
              trip:          existing,
              wishlist:      old.wishlist ?? [],
            };
          }
        }
        return raw as TripState;
      },
    },
  ),
);
