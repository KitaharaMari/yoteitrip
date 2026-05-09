'use client';

import { useState, useRef, useEffect } from 'react';
import { getAuth, signOut } from 'firebase/auth';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '@/store/useAuthStore';
import { getFirebaseApp } from '@/lib/firebase';

interface Props {
  onOpenAuth: () => void;
}

export function UserMenu({ onOpenAuth }: Props) {
  const user    = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
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

  // Not logged in — show login button
  if (!user) {
    return (
      <button
        onClick={onOpenAuth}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 text-xs font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors"
      >
        <span>☁️</span>
        登录
      </button>
    );
  }

  // Logged in — show avatar
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

            {/* Actions */}
            <div className="py-1">
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
