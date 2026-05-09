'use client';

import { useState } from 'react';

const PRESETS = [
  { label: '15m', minutes: 15  },
  { label: '30m', minutes: 30  },
  { label: '45m', minutes: 45  },
  { label: '1h',  minutes: 60  },
  { label: '2h',  minutes: 120 },
  { label: '3h',  minutes: 180 },
  { label: '4h',  minutes: 240 },
  { label: '6h',  minutes: 360 },
  { label: '过夜', minutes: 480 },
];

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

interface Props {
  value: number;
  onChange: (minutes: number) => void;
}

export function DurationPicker({ value, onChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  // Derive hours and remainder minutes from current value — no extra state needed
  const h = Math.floor(value / 60);
  const m = value % 60;

  const adjustH = (delta: number) => {
    const newH = Math.max(0, Math.min(23, h + delta));
    onChange(Math.max(5, newH * 60 + m));
  };

  // Adjusts minutes in 5-minute steps, wrapping at 0 and 55
  const adjustM = (delta: number) => {
    const step = 5;
    const newM = ((m + delta) % 60 + 60) % 60;   // wrap 0–55
    const hourCarry = delta > 0 ? (m + delta >= 60 ? 1 : 0) : (m + delta < 0 ? -1 : 0);
    const newH = Math.max(0, Math.min(23, h + hourCarry));
    const total = newH * 60 + newM;
    // round to nearest step
    onChange(Math.max(step, total));
  };

  return (
    <div className="relative flex-none">
      <button
        onClick={() => setIsOpen((v) => !v)}
        title="点击调整停留时长"
        className="text-xs text-gray-400 hover:text-blue-500 tabular-nums transition-colors"
      >
        {fmt(value)}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)} />

          {/* Picker panel — opens above the button */}
          <div className="absolute bottom-7 right-0 z-30 bg-white rounded-2xl border border-gray-100 shadow-xl p-2 w-[168px]">

            {/* ── Preset grid ── */}
            <div className="grid grid-cols-3 gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p.minutes}
                  onClick={() => { onChange(p.minutes); setIsOpen(false); }}
                  className={`text-[11px] px-1 py-1.5 rounded-xl text-center transition-colors ${
                    value === p.minutes
                      ? 'bg-gray-900 text-white font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* ── Custom spinner ── */}
            <div className="border-t border-gray-100 mt-2 pt-2">
              <p className="text-[9px] text-gray-400 text-center uppercase tracking-widest mb-2">
                自定义
              </p>
              <div className="flex items-center justify-center gap-1.5">
                {/* Hours */}
                <button
                  onClick={() => adjustH(-1)}
                  className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[11px] hover:bg-gray-200 transition-colors flex items-center justify-center leading-none"
                >
                  −
                </button>
                <span className="w-5 text-center text-xs font-mono text-gray-800">{h}</span>
                <button
                  onClick={() => adjustH(1)}
                  className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[11px] hover:bg-gray-200 transition-colors flex items-center justify-center leading-none"
                >
                  +
                </button>
                <span className="text-[10px] text-gray-400">h</span>

                <span className="text-gray-200 mx-0.5">|</span>

                {/* Minutes (5-min steps) */}
                <button
                  onClick={() => adjustM(-5)}
                  className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[11px] hover:bg-gray-200 transition-colors flex items-center justify-center leading-none"
                >
                  −
                </button>
                <span className="w-5 text-center text-xs font-mono text-gray-800">{String(m).padStart(2, '0')}</span>
                <button
                  onClick={() => adjustM(5)}
                  className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[11px] hover:bg-gray-200 transition-colors flex items-center justify-center leading-none"
                >
                  +
                </button>
                <span className="text-[10px] text-gray-400">m</span>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}
