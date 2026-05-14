'use client';

import { useState, useRef, useEffect } from 'react';
import { getAuth, signOut } from 'firebase/auth';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '@/store/useAuthStore';
import { useLangStore } from '@/store/useLangStore';
import { getFirebaseApp } from '@/lib/firebase';
import { LANGS } from '@/lib/i18n';

interface Props {
  onOpenAuth: () => void;
}

export function UserMenu({ onOpenAuth }: Props) {
  const user             = useAuthStore((s) => s.user);
  const { lang, setLang } = useLangStore();
  const [open, setOpen]  = useState(false);
  const menuRef          = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSignOut = async () => {
    await signOut(getAuth(getFirebaseApp()));
    setOpen(false);
  };

  const currentLangLabel = LANGS.find((l) => l.code === lang)?.label ?? lang;

  // ── Language section (shared by both logged-in and not-logged-in dropdowns) ──
  const LangSection = () => (
    <div className="py-1 border-t border-gray-50">
      <p className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-widest text-gray-300">Language</p>
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => { setLang(l.code); setOpen(false); }}
          className={`flex items-center justify-between w-full px-4 py-2 text-sm text-left transition-colors ${
            lang === l.code
              ? 'font-semibold text-gray-900 bg-gray-50'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          {l.label}
          {lang === l.code && <span className="text-[#47BB8E] text-xs">✓</span>}
        </button>
      ))}
    </div>
  );

  // ── Not logged in ─────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 text-xs font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors"
        >
          <span>☁️</span>
          <span>登录</span>
          <span className="text-gray-300 text-[10px] ml-0.5">{currentLangLabel}</span>
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute right-0 top-10 w-44 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50"
            >
              <div className="py-1">
                <button
                  onClick={() => { onOpenAuth(); setOpen(false); }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span>☁️</span> 登录 / 注册
                </button>
              </div>
              <LangSection />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── Logged in ────────────────────────────────────────────────────────────────
  const initials = user.displayName
    ? user.displayName.slice(0, 2).toUpperCase()
    : user.email?.slice(0, 2).toUpperCase() ?? '?';

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-full overflow-hidden flex-none ring-2 ring-white shadow-sm"
        title={user.displayName ?? user.email ?? ''}
      >
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="w-full h-full bg-indigo-500 flex items-center justify-center text-white text-[11px] font-bold">
            {initials}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-10 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50"
          >
            {/* User info */}
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user.displayName ?? '用户'}
              </p>
              <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
              <p className="text-[10px] text-emerald-500 mt-0.5">☁️ 云同步已启用</p>
            </div>

            {/* Language */}
            <LangSection />

            {/* Sign out */}
            <div className="py-1 border-t border-gray-50">
              <button
                onClick={handleSignOut}
                className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 transition-colors"
              >
                退出登录
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
