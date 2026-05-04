import { create } from 'zustand';
import type { AppData, Class, Todo, Video, MeditationSession, DriveConfig } from '../types';
import { loadAppData, saveAppData, loadDriveConfig, saveDriveConfig, clearDriveConfig } from './db';
import { syncToDrive, loadFromDrive } from './driveSync';

interface AppStore extends AppData {
  loading: boolean;
  driveConfig: DriveConfig | null;
  syncStatus: 'idle' | 'syncing' | 'error' | 'offline';
  pendingSync: boolean;

  init: () => Promise<void>;
  setClasses: (classes: Class[]) => void;
  setTodos: (todos: Todo[]) => void;
  setVideos: (videos: Video[]) => void;
  setMeditationSessions: (sessions: MeditationSession[]) => void;
  saveData: (data: Partial<AppData>) => Promise<void>;
  connectDrive: (config: DriveConfig) => Promise<void>;
  disconnectDrive: () => Promise<void>;
  syncNow: () => Promise<void>;
}

let syncTimeout: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<AppStore>((set, get) => ({
  loading: true,
  version: 1,
  lastModified: new Date().toISOString(),
  classes: [],
  todos: [],
  videos: [],
  meditationSessions: [],
  driveConfig: null,
  syncStatus: 'idle',
  pendingSync: false,

  init: async () => {
    const [data, driveConfig] = await Promise.all([loadAppData(), loadDriveConfig()]);
    set({ ...data, driveConfig: driveConfig ?? null, loading: false });

    if (driveConfig?.accessToken && navigator.onLine) {
      get().syncNow();
    }
  },

  setClasses: (classes) => get().saveData({ classes }),
  setTodos: (todos) => get().saveData({ todos }),
  setVideos: (videos) => get().saveData({ videos }),
  setMeditationSessions: (sessions) => get().saveData({ meditationSessions: sessions }),

  saveData: async (partial) => {
    const current = get();
    const updated: AppData = {
      version: current.version,
      lastModified: new Date().toISOString(),
      classes: partial.classes ?? current.classes,
      todos: partial.todos ?? current.todos,
      videos: partial.videos ?? current.videos,
      meditationSessions: partial.meditationSessions ?? current.meditationSessions,
    };
    set(updated);
    await saveAppData(updated);

    if (get().driveConfig?.accessToken) {
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(() => get().syncNow(), 5000);
    }
  },

  connectDrive: async (config) => {
    await saveDriveConfig(config);
    set({ driveConfig: config });
    get().syncNow();
  },

  disconnectDrive: async () => {
    await clearDriveConfig();
    set({ driveConfig: null, syncStatus: 'idle' });
  },

  syncNow: async () => {
    const { driveConfig } = get();
    if (!driveConfig?.accessToken || !navigator.onLine) {
      set({ syncStatus: 'offline' });
      return;
    }

    set({ syncStatus: 'syncing' });
    try {
      const remoteData = await loadFromDrive(driveConfig);
      const localData: AppData = {
        version: get().version,
        lastModified: get().lastModified,
        classes: get().classes,
        todos: get().todos,
        videos: get().videos,
        meditationSessions: get().meditationSessions,
      };

      if (remoteData && remoteData.lastModified > localData.lastModified) {
        const useRemote = window.confirm(
          `Die Drive-Daten sind neuer (${new Date(remoteData.lastModified).toLocaleString('de-DE')}).\n` +
          `Lokale Daten: ${new Date(localData.lastModified).toLocaleString('de-DE')}\n\n` +
          `Drive-Version übernehmen?`
        );
        if (useRemote) {
          set(remoteData);
          await saveAppData(remoteData);
        } else {
          await syncToDrive(driveConfig, localData);
        }
      } else {
        await syncToDrive(driveConfig, localData);
      }
      set({ syncStatus: 'idle' });
    } catch {
      set({ syncStatus: 'error' });
    }
  },
}));
