export type ActivityType = 'TRANSPORT' | 'STAY' | 'MEAL' | 'ACCOMMODATION' | 'LONG_DISTANCE';

export type WishlistCategory = 'RESTAURANT' | 'ATTRACTION' | 'BACKUP';

export interface WishlistItem {
  id: string;
  placeId: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  category: WishlistCategory;
  note?: string;
  addedAt?: string;  // ISO timestamp for sort-by-time
}

export type SceneTag = 'INDOOR' | 'REST' | 'LATE_START';

export interface PlaceHoursPeriodTime {
  day:  number;   // 0 = Sunday … 6 = Saturday
  time: string;   // "HHMM" (local time, e.g. "0930")
}

export interface PlaceHoursPeriod {
  open:   PlaceHoursPeriodTime;
  close?: PlaceHoursPeriodTime;  // undefined = open 24 h
}

export interface PlaceOpeningHours {
  periods: PlaceHoursPeriod[];
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  editorialSummary?: string;     // AI short description from Places API
  photoUrl?: string;             // first cover photo URL (getUrl() result)
  openingHours?: PlaceOpeningHours;
  rating?: number;               // Google Places star rating (1–5)
  googleMapsUrl?: string;        // Canonical Google Maps place page URL (from Places API `url` field)
}

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;           // auto-synced to place.name; kept for export compatibility
  place?: PlaceDetails;
  startTime: string;       // "HH:mm"
  duration: number;        // minutes
  description?: string;    // optional user note shown below the place name
  transitFare?: number;          // fare amount auto-filled from Directions API
  transitFareCurrency?: string;  // currency label (e.g. "¥", "JPY") from Directions API fare text
  commuteDrivingMeters?: number; // meters driven for the commute TO this activity (DRIVING mode only)
  commutePolyline?: string;     // encoded polyline for the route TO this activity (for static map)
  notes?: string;
  isManualTime?: boolean;
  estimatedCost?: number;
  isBackup?: boolean;
  linkedToId?: string;
  sceneTags?: SceneTag[];
}

export interface CarSettings {
  consumption: number;   // L/100km
  fuelPrice: number;     // per litre in trip currency
}

export interface Day {
  id: string;
  label: string;
  date?: string;                // ISO "YYYY-MM-DD"
  originPlace?: PlaceDetails;   // day's departure location
  originTime?: string;          // "HH:mm" — when the user leaves the origin
  carSettings?: CarSettings;    // per-day fuel overrides (falls back to currency-based defaults)
  travelMode?: 'TRANSIT' | 'DRIVING';  // day-level commute mode (default TRANSIT)
  activities: Activity[];
}

export interface BaseLocation {
  name: string;   // city / region display name
  lat: number;
  lng: number;
}

export interface Trip {
  id: string;
  name: string;
  days: Day[];
  currency?: string;
  baseLocation?: BaseLocation;   // target city / region anchor for geofencing
  coverPhotoUrl?: string;        // Google Maps photo used as card cover
  createdAt: string;
  updatedAt: string;
  pinnedAt?: string;             // ISO timestamp when pinned; absent = not pinned
}
