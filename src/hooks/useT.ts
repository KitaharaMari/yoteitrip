import { useLangStore } from '@/store/useLangStore';
import { getT } from '@/lib/i18n';

/** Returns a translation function `t(key, params?)` scoped to the current language. */
export function useT() {
  const lang = useLangStore((s) => s.lang);
  return getT(lang);
}
