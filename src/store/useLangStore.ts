import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Lang } from '@/lib/i18n';

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      lang: 'zh-CN',
      setLang: (lang) => set({ lang }),
    }),
    { name: 'yoteitrip-lang' },
  ),
);
