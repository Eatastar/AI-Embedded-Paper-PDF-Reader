import { useSyncExternalStore } from 'react';
import { localeStore } from './locale';
export function useLocale() { return useSyncExternalStore(localeStore.subscribe, localeStore.get, () => 'zh-CN' as const); }
