import type { AppData, DriveConfig } from '../types';

const FOLDER_NAME = 'Lehrer-Tool-Daten';
const FILE_NAME = 'app-data.json';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

async function apiFetch(url: string, config: DriveConfig, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
  return res;
}

async function getOrCreateFolder(config: DriveConfig): Promise<string> {
  const search = await apiFetch(
    `${API}/files?q=name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
    config
  );
  const data = await search.json();
  if (data.files?.length > 0) return data.files[0].id;

  const create = await apiFetch(`${API}/files`, config, {
    method: 'POST',
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  const folder = await create.json();
  return folder.id;
}

async function findFile(config: DriveConfig, folderId: string): Promise<string | null> {
  const search = await apiFetch(
    `${API}/files?q=name='${FILE_NAME}' and '${folderId}' in parents and trashed=false&fields=files(id)`,
    config
  );
  const data = await search.json();
  return data.files?.[0]?.id ?? null;
}

export async function loadFromDrive(config: DriveConfig): Promise<AppData | null> {
  try {
    const folderId = await getOrCreateFolder(config);
    const fileId = config.fileId ?? (await findFile(config, folderId));
    if (!fileId) return null;

    const res = await apiFetch(`${API}/files/${fileId}?alt=media`, config);
    return res.json();
  } catch {
    return null;
  }
}

export async function syncToDrive(config: DriveConfig, data: AppData): Promise<string> {
  const folderId = await getOrCreateFolder(config);
  const existingId = config.fileId ?? (await findFile(config, folderId));
  const body = JSON.stringify(data);

  if (existingId) {
    await fetch(`${UPLOAD_API}/files/${existingId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    return existingId;
  }

  const meta = JSON.stringify({ name: FILE_NAME, parents: [folderId] });
  const form = new FormData();
  form.append('metadata', new Blob([meta], { type: 'application/json' }));
  form.append('media', new Blob([body], { type: 'application/json' }));

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.accessToken}` },
    body: form,
  });
  const created = await res.json();
  return created.id;
}
