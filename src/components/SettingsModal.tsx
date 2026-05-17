'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useLangStore } from '@/store/useLangStore';
import { useT } from '@/hooks/useT';
import { LANGS } from '@/lib/i18n';

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const { lang, setLang } = useLangStore();
  const t = useT();

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="w-full max-w-[480px] bg-white rounded-t-3xl overflow-hidden"
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
            <h2 className="text-base font-semibold text-gray-900">{t('settings.title')}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Language section */}
          <div className="px-5 pt-4 pb-2">
            <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-2">
              {t('settings.language')}
            </p>
            <div className="flex flex-col gap-0.5">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  onClick={() => { setLang(l.code); onClose(); }}
                  className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-sm text-left transition-colors ${
                    lang === l.code
                      ? 'bg-gray-100 text-gray-900 font-semibold'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span>{l.label}</span>
                  {lang === l.code && <span className="text-[#47BB8E] text-xs">✓</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="h-8" />
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
