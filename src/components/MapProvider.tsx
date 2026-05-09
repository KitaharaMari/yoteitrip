'use client';

import { createContext, useContext, useState } from 'react';
import Script from 'next/script';

// Using next/script instead of @react-google-maps/api — more reliable with React 19
// and gives us direct control over load/error events.
const MapsContext = createContext(false);

export function MapProvider({ children }: { children: React.ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  return (
    <MapsContext.Provider value={isLoaded}>
      {apiKey && (
        <Script
          id="google-maps-script"
          src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`}
          strategy="afterInteractive"
          onLoad={() => {
            setIsLoaded(true);
            console.info('[Maps] Google Maps loaded ✓');
          }}
          onError={() => {
            console.error(
              '[Maps] Failed to load — verify API key and that these APIs are enabled:\n' +
              '  • Maps JavaScript API\n  • Places API\n  • Distance Matrix API'
            );
          }}
        />
      )}
      {children}
    </MapsContext.Provider>
  );
}

export const useMapsLoaded = () => useContext(MapsContext);
