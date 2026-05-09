'use client';

import { useState } from 'react';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { motion } from 'framer-motion';
import { getFirebaseApp, isFirebaseConfigured } from '@/lib/firebase';

interface Props {
  onClose: () => void;
}

type Mode = 'login' | 'register';

export function AuthModal({ onClose }: Props) {
  const [mode, setMode]       = useState<Mode>('login');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]       = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  if (!isFirebaseConfigured()) {
    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-black/40"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl flex flex-col gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold text-gray-900">Firebase 未配置</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            在 <code className="bg-gray-100 px-1 rounded text-xs">.env.local</code> 中填入 Firebase 配置项后，云同步功能即可启用。
          </p>
          <code className="bg-gray-50 rounded-xl p-3 text-[10px] text-gray-500 leading-relaxed block">
            NEXT_PUBLIC_FIREBASE_API_KEY=<br />
            NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<br />
            NEXT_PUBLIC_FIREBASE_PROJECT_ID=<br />
            NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<br />
            NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<br />
            NEXT_PUBLIC_FIREBASE_APP_ID=
          </code>
          <button onClick={onClose} className="w-full py-3 rounded-2xl text-sm text-gray-500 border border-gray-100 hover:border-gray-300 transition-colors">
            关闭
          </button>
        </motion.div>
      </motion.div>
    );
  }

  const auth = getAuth(getFirebaseApp());

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      onClose();
    } catch (e: unknown) {
      if ((e as { code?: string }).code !== 'auth/popup-closed-by-user') {
        setError('Google 登录失败，请稍后再试');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
      }
      onClose();
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential')
        setError('邮箱或密码不正确');
      else if (code === 'auth/email-already-in-use')
        setError('该邮箱已注册，请直接登录');
      else if (code === 'auth/weak-password')
        setError('密码至少需要 6 位');
      else if (code === 'auth/invalid-email')
        setError('邮箱格式不正确');
      else
        setError('操作失败，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-6 bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full sm:max-w-sm bg-white sm:rounded-3xl rounded-t-3xl p-6 shadow-2xl flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logoyt.jpeg" alt="" className="h-9 w-9 rounded-xl object-cover flex-none" aria-hidden />
            <div>
              <h3 className="text-base font-bold">
                <span style={{ color: '#3D5568' }}>Yotei</span>
                <span style={{ color: '#47BB8E' }}>trip</span>
                <span className="text-gray-900 font-semibold ml-1">
                  {mode === 'login' ? '· 登录' : '· 注册'}
                </span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {mode === 'login' ? '行程数据云端同步，多设备共享' : '创建账号开启云同步'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors">✕</button>
        </div>

        {/* Google */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-3 rounded-2xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {/* Google "G" logo */}
          <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          使用 Google 登录
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-[11px] text-gray-300">或</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        {/* Email form */}
        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
          {mode === 'register' && (
            <input
              type="text" placeholder="昵称（可选）" value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-colors"
            />
          )}
          <input
            type="email" placeholder="邮箱" value={email} required
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-colors"
          />
          <input
            type="password" placeholder="密码（至少 6 位）" value={password} required
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-gray-400 transition-colors"
          />
          {error && <p className="text-xs text-red-400 -mt-1">{error}</p>}
          <button
            type="submit" disabled={loading}
            className="w-full py-3 rounded-2xl text-sm font-medium bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {loading ? '处理中…' : mode === 'login' ? '邮箱登录' : '注册'}
          </button>
        </form>

        {/* Mode toggle */}
        <p className="text-center text-xs text-gray-400">
          {mode === 'login' ? '还没有账号？' : '已有账号？'}
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            className="ml-1 text-gray-700 font-medium hover:underline"
          >
            {mode === 'login' ? '注册' : '登录'}
          </button>
        </p>

        {/* Guest mode */}
        <button
          onClick={onClose}
          className="text-xs text-gray-300 hover:text-gray-500 transition-colors text-center -mt-2"
        >
          以游客身份继续（本地存储）
        </button>
      </motion.div>
    </motion.div>
  );
}
