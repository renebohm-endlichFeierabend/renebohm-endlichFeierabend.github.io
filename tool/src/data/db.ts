import { openDB, type IDBPDatabase } from 'idb';
import type { AppData, AppSettings, DriveConfig } from '../types';
import { COCKPIT } from './serverSync';

const DB_NAME = 'lehrer-tool';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('appData')) {
          db.createObjectStore('appData');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      },
    });
  }
  return dbPromise;
}

export const DEFAULT_SETTINGS: AppSettings = { somiWeight: 50 };

/** Ergänzt fehlende Felder älterer Datenstände (lokal, Drive oder Import). */
export function normalizeAppData(raw: Partial<AppData> | null | undefined): AppData {
  const d = raw ?? {};
  return {
    version: d.version ?? 1,
    lastModified: d.lastModified ?? new Date().toISOString(),
    classes: d.classes ?? [],
    todos: d.todos ?? [],
    videos: d.videos ?? [],
    meditationSessions: d.meditationSessions ?? [],
    plannedExams: d.plannedExams ?? [],
    feierabendLogs: d.feierabendLogs ?? [],
    settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) },
  };
}

export async function loadAppData(): Promise<AppData> {
  const db = await getDb();
  const data = await db.get('appData', 'main');
  return normalizeAppData(data);
}

export async function saveAppData(data: AppData): Promise<void> {
  const db = await getDb();
  // Im Cockpit bleibt der Zeitstempel des Stands erhalten: Er entscheidet beim Abgleich mit
  // dem Server, welcher Stand neuer ist. Ein Neustempeln beim bloßen Zwischenspeichern
  // ließe jeden vom Server geholten Stand wieder als „lokal neuer“ erscheinen.
  const lastModified = COCKPIT && data.lastModified ? data.lastModified : new Date().toISOString();
  await db.put('appData', { ...data, lastModified }, 'main');
}

export async function loadDriveConfig(): Promise<DriveConfig | null> {
  const db = await getDb();
  return db.get('settings', 'driveConfig') ?? null;
}

export async function saveDriveConfig(config: DriveConfig): Promise<void> {
  const db = await getDb();
  await db.put('settings', config, 'driveConfig');
}

export async function clearDriveConfig(): Promise<void> {
  const db = await getDb();
  await db.delete('settings', 'driveConfig');
}
