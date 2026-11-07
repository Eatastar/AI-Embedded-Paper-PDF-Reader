export interface LocalBackup { id: string; createdAt: number; size: number; baseline?: boolean }
export interface DesktopBridge {
  setLocale?: (locale: import('../i18n/locale').Locale) => void;
  onPrepareClose: (handler: () => Promise<void>, onCancel: () => void) => () => void;
  backups: {
    list: () => Promise<LocalBackup[]>;
    read: (id: string) => Promise<string>;
    write: (text: string) => Promise<LocalBackup>;
    baseline: (text: string) => Promise<LocalBackup>;
  };
}
declare global { interface Window { learnSomething?: DesktopBridge } }
export const desktop = () => window.learnSomething;
