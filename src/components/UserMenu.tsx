'use client';

import { useState, useRef, useEffect } from 'react';
import { getAuth, signOut } from 'firebase/auth';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '@/store/useAuthStore';
import { useT } from '@/hooks/useT';
import { getFirebaseApp } from '@/lib/firebase';

interface Props {
  onOpenAuth: () => void;
}

// Width of the wider dropdown (w-52 = 208px) used to clamp the position
const DROPDOWN_W = 208;

export function UserMenu({ onOpenAuth }: Props) {
  const user = useAuthStore((s) => s.user);
  const t    = useT();
  const [open, setOpen]    = useState(false);
  // Fixed screen-space position calculated when the menu opens
  const [dropPos, setDropPos] = useState<{ top: number; right: number }>({ top: 56, right: 16 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef    = useRef<HTMLDivElement>(null);

  // Close on click-outside (checks both trigger and menu)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const openMenu = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Align dropdown's right edge with trigger's right edge; clamp within viewport.
      const rawRight   = window.innerWidth - rect.right;
      const safeRight  = Math.max(8, Math.min(rawRight, window.innerWidth - DROPDOWN_W - 8));
      setDropPos({ top: rect.bottom + 6, right: safeRight });
    }
    setOpen(true);
  };

  const toggleMenu = () => { if (open) setOpen(false); else openMenu(); };

  const handleSignOut = async () => {
    await signOut(getAuth(getFirebaseApp()));
    setOpen(false);
  };

  // Shared dropdown animation props
  const motionProps = {
    initial:    { opacity: 0, scale: 0.93, y: -6 },
    animate:    { opacity: 1, scale: 1,    y: 0   },
    exit:       { opacity: 0, scale: 0.93, y: -6  },
    transition: { duration: 0.14 },
  };

  // Shared dropdown style (fixed so it's never clipped by any ancestor overflow)
  const dropStyle: React.CSSProperties = {
    position: 'fixed',
    top:      dropPos.top,
    right:    dropPos.right,
    zIndex:   200,
  };

  // ── Not logged in ─────────────────────────────────────────────────────────
  if (!user) {
    return (
      <>
        <button
          ref={triggerRef}
          onClick={toggleMenu}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 text-xs font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors"
        >
          <span>☁️</span>
          <span>{t('user.signIn')}</span>
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              ref={menuRef}
              style={{ ...dropStyle, width: 176 /* w-44 */ }}
              {...motionProps}
              className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
            >
              <div className="py-1">
                <button
                  onClick={() => { onOpenAuth(); setOpen(false); }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span>☁️</span>
                  <span>{t('user.signInRegister')}</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  // ── Logged in ─────────────────────────────────────────────────────────────
  const initials = user.displayName
    ? user.displayName.slice(0, 2).toUpperCase()
    : user.email?.slice(0, 2).toUpperCase() ?? '?';

  return (
    <>
      <button
        ref={triggerRef}
        onClick={toggleMenu}
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
            ref={menuRef}
            style={{ ...dropStyle, width: DROPDOWN_W }}
            {...motionProps}
            className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
          >
            {/* User info */}
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user.displayName ?? t('user.guest')}
              </p>
              <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
              <p className="text-[10px] text-emerald-500 mt-0.5">{t('user.cloudSyncOn')}</p>
            </div>

            {/* Sign out */}
            <div className="py-1 border-t border-gray-50">
              <button
                onClick={handleSignOut}
                className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 transition-colors"
              >
                {t('user.signOut')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
