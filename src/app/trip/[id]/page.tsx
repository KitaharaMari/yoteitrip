'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import { useTripStore } from '@/store/useTripStore';
import { TripView } from '@/components/TripView';

interface Props {
  params: Promise<{ id: string }>;
}

export default function TripPage({ params }: Props) {
  const { id } = use(params);
  const setCurrentTrip = useTripStore((s) => s.setCurrentTrip);
  const trips          = useTripStore((s) => s.trips);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCurrentTrip(id);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, [id, setCurrentTrip]);

  if (!ready) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  const found = trips.find((t) => t.id === id);
  if (!found) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">行程不存在</p>
      </div>
    );
  }

  return <TripView />;
}
