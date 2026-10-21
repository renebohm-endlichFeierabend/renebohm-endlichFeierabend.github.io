import type { AppData } from '../types';

// Speicherung im Cockpit (eigener Server statt Google Drive). Nur aktiv, wenn mit
// COCKPIT=1 gebaut; die öffentliche Fassung auf GitHub Pages bleibt beim Drive-Abgleich.
// Der Server hält genau ein Dokument (bereich lehrertool, collection appdata, id main)
// und bewahrt ältere Stände auf.
export const COCKPIT = __COCKPIT__;

const URL_DOK = '/api/db/lehrertool/appdata';

export async function holeVomServer(): Promise<AppData | null> {
  const res = await fetch(URL_DOK, { credentials: 'same-origin', cache: 'no-store' });
  if (res.status === 401) { location.href = '/login?weiter=/lehrertool/'; throw new Error('nicht angemeldet'); }
  if (!res.ok) throw new Error(`Server: ${res.status}`);
  const j = await res.json();
  const doc = (j.docs ?? []).find((d: { id: string }) => d.id === 'main');
  return doc ? (doc.data as AppData) : null;
}

export async function schreibeAufServer(data: AppData): Promise<void> {
  const res = await fetch(`${URL_DOK}/main`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Cockpit': '1' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Server: ${res.status}`);
}

/** Hat der Stand echte Inhalte? Ein leerer Stand darf nie einen vollen überschreiben. */
export function hatInhalt(d: Partial<AppData> | null | undefined): boolean {
  if (!d) return false;
  return [d.classes, d.todos, d.videos, d.meditationSessions, d.plannedExams, d.feierabendLogs, d.yogaFlows]
    .some((liste) => Array.isArray(liste) && liste.length > 0);
}
