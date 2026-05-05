import { openDB, type IDBPDatabase } from 'idb';
import type { AppData, DriveConfig } from '../types';

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

export async function loadAppData(): Promise<AppData | null> {
  const db = await getDb();
  return (await db.get('appData', 'main')) ?? null;
}

export async function saveAppData(data: AppData): Promise<void> {
  const db = await getDb();
  await db.put('appData', { ...data, lastModified: new Date().toISOString() }, 'main');
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
