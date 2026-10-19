import { create } from 'zustand';
import type { AppData, Class, Todo, Video, MeditationSession, DriveConfig, PlannedExam, FeierabendEntry, AppSettings } from '../types';
import { loadAppData, saveAppData, loadDriveConfig, saveDriveConfig, clearDriveConfig, normalizeAppData, DEFAULT_SETTINGS } from './db';
import { syncToDrive, loadFromDrive } from './driveSync';
import { COCKPIT, holeVomServer, schreibeAufServer, hatInhalt } from './serverSync';

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
  setPlannedExams: (plannedExams: PlannedExam[]) => void;
  setFeierabendLogs: (logs: FeierabendEntry[]) => void;
  setSettings: (settings: AppSettings) => void;
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
  plannedExams: [],
  feierabendLogs: [],
  settings: DEFAULT_SETTINGS,
  driveConfig: null,
  syncStatus: 'idle',
  pendingSync: false,

  init: async () => {
    const [data, driveConfig] = await Promise.all([loadAppData(), loadDriveConfig()]);
    if (COCKPIT) {
      // Der Server ist die Quelle. Lokal (IndexedDB) bleibt nur Zwischenspeicher für
      // den Fall, dass der Server gerade nicht erreichbar ist.
      set({ ...data, driveConfig: null });
      await get().syncNow();
      set({ loading: false });
      const nachholen = () => { if (document.visibilityState === 'visible') get().syncNow(); };
      document.addEventListener('visibilitychange', nachholen);
      window.addEventListener('online', nachholen);
      return;
    }
    set({ ...data, driveConfig: driveConfig ?? null, loading: false });

    if (driveConfig?.accessToken && navigator.onLine) {
      get().syncNow();
    }
  },

  setClasses: (classes) => get().saveData({ classes }),
  setTodos: (todos) => get().saveData({ todos }),
  setVideos: (videos) => get().saveData({ videos }),
  setMeditationSessions: (sessions) => get().saveData({ meditationSessions: sessions }),
  setPlannedExams: (plannedExams) => get().saveData({ plannedExams }),
  setFeierabendLogs: (feierabendLogs) => get().saveData({ feierabendLogs }),
  setSettings: (settings) => get().saveData({ settings }),

  saveData: async (partial) => {
    const current = get();
    const updated: AppData = {
      version: current.version,
      lastModified: new Date().toISOString(),
      classes: partial.classes ?? current.classes,
      todos: partial.todos ?? current.todos,
      videos: partial.videos ?? current.videos,
      meditationSessions: partial.meditationSessions ?? current.meditationSessions,
      plannedExams: partial.plannedExams ?? current.plannedExams,
      feierabendLogs: partial.feierabendLogs ?? current.feierabendLogs,
      settings: partial.settings ?? current.settings,
    };
    set(updated);
    await saveAppData(updated);

    if (COCKPIT) {
      set({ pendingSync: true });
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(() => get().syncNow(), 1500);
      return;
    }
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
    if (COCKPIT) {
      set({ syncStatus: 'syncing' });
      try {
        const lokal = aktuellerStand(get());
        const server = await holeVomServer();
        if (hatInhalt(lokal) && (!server || lokal.lastModified > server.lastModified)) {
          // Lokal neuer (auch nach einem Schließen vor dem Hochladen): hochladen.
          await schreibeAufServer(lokal);
        } else if (server && (server.lastModified > lokal.lastModified || !hatInhalt(lokal))) {
          // Server neuer, oder dieses Gerät ist leer: Ein leerer Stand ersetzt nie den Server.
          const neu = normalizeAppData(server);
          set(neu);
          await saveAppData(neu);
        }
        set({ syncStatus: 'idle', pendingSync: false });
      } catch {
        set({ syncStatus: navigator.onLine ? 'error' : 'offline' });
      }
      return;
    }
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
        plannedExams: get().plannedExams,
        feierabendLogs: get().feierabendLogs,
        settings: get().settings,
      };

      if (remoteData && remoteData.lastModified > localData.lastModified) {
        const useRemote = window.confirm(
          `Die Drive-Daten sind neuer (${new Date(remoteData.lastModified).toLocaleString('de-DE')}).\n` +
          `Lokale Daten: ${new Date(localData.lastModified).toLocaleString('de-DE')}\n\n` +
          `Drive-Version übernehmen?`
        );
        if (useRemote) {
          const normalized = normalizeAppData(remoteData);
          set(normalized);
          await saveAppData(normalized);
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

function aktuellerStand(s: AppStore): AppData {
  return {
    version: s.version,
    lastModified: s.lastModified,
    classes: s.classes,
    todos: s.todos,
    videos: s.videos,
    meditationSessions: s.meditationSessions,
    plannedExams: s.plannedExams,
    feierabendLogs: s.feierabendLogs,
    settings: s.settings,
  };
}
