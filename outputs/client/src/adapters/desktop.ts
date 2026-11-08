export interface LocalBackup { id: string; createdAt: number; size: number; baseline?: boolean; sharedAttachments?: boolean }
export interface DesktopBridge {
  setLocale?: (locale: import('../i18n/locale').Locale) => void;
  onPrepareClose: (handler: () => Promise<void>, onCancel: () => void) => () => void;
  backups: {
    list: () => Promise<LocalBackup[]>;
    read: (id: string) => Promise<string>;
    write: (text: string) => Promise<LocalBackup>;
    baseline: (text: string) => Promise<LocalBackup>;
    remove?: (id: string) => Promise<{ cleanupPending: boolean }>;
    begin?: (input: { metadata: string; files: { documentId: string; size: number }[]; baseline?: boolean; upgrade?: boolean }) => Promise<string>;
    append?: (input: { id: string; index: number; bytes: Uint8Array }) => Promise<void>;
    finish?: (id: string) => Promise<LocalBackup>;
    abort?: (id?: string) => Promise<void>;
    upgradeNeeded?: () => Promise<boolean>;
  };
}
declare global { interface Window { learnSomething?: DesktopBridge } }
export const desktop = () => window.learnSomething;
