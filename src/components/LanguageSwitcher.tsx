'use client';

import { useState } from 'react';
import { useLangStore } from '@/store/useLangStore';
import { LANGS } from '@/lib/i18n';

export function LanguageSwitcher() {
  const { lang, setLang } = useLangStore();
  const [open, setOpen]   = useState(false);
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  return (
    <div className="fixed bottom-6 right-4 z-[999]">
      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0" onClick={() => setOpen(false)} />
          <div className="absolute bottom-12 right-0 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden min-w-[160px]">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => { setLang(l.code); setOpen(false); }}
                className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left transition-colors ${
                  lang === l.code
                    ? 'bg-gray-50 font-semibold text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="text-base leading-none">{l.flag}</span>
                <span>{l.label}</span>
                {lang === l.code && (
                  <span className="ml-auto text-[#47BB8E] text-xs">✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Change language / 切换语言"
        className="w-10 h-10 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center text-lg hover:shadow-xl hover:border-gray-300 active:scale-95 transition-all"
      >
        {current.flag}
      </button>
    </div>
  );
}
