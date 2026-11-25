// WebUntis-Zugriff des Notenbuchs.
// Cockpit-Fassung: der Cockpit-Server spricht mit WebUntis (Konto der Lehrkraft dort hinterlegt).
// Öffentliche Fassung: die Brücke auf dem Webspace der Schule (relay/webuntis.php). Benutzername und Passwort
// fragt die Seite einmal je Sitzung ab und hält sie nur im Arbeitsspeicher dieses Tabs; die Brücke speichert nichts.
import { COCKPIT } from './serverSync';

export const WEBUNTIS_BRUECKE = 'https://lfs-muelhausen.de/notenbuch/webuntis.php';

export interface Kurs { lsId: number; klassen: string; gruppe: string; fach: string; fachname: string }
export interface WuSchueler { id: number; nachname: string; vorname: string; klasse: string; austritt: string }

let zugang: { benutzer: string; passwort: string } | null = null;

export const brauchtAnmeldung = () => !COCKPIT && !zugang;
export const angemeldetAls = () => zugang?.benutzer ?? '';
export function abmelden() { zugang = null; }

async function bruecke<T>(auftrag: Record<string, unknown>): Promise<T> {
  if (!zugang) throw new Error('Bitte zuerst bei WebUntis anmelden.');
  let r: Response;
  try {
    r = await fetch(WEBUNTIS_BRUECKE, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
      body: JSON.stringify({ ...auftrag, ...zugang }),
    });
  } catch {
    throw new Error('Die WebUntis-Brücke der Schule ist nicht erreichbar.');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.fehler || `WebUntis-Brücke: Fehler ${r.status}`);
  return j as T;
}

async function cockpit<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', ...init });
  if (r.status === 401) { location.href = '/login?weiter=/lehrertool/'; throw new Error('nicht angemeldet'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.fehler || j.detail || `Server: ${r.status}`);
  return j as T;
}

/** Prüft die Anmeldung an der Brücke und merkt sie sich für diese Sitzung. */
export async function anmelden(benutzer: string, passwort: string): Promise<void> {
  const alt = zugang;
  zugang = { benutzer: benutzer.trim(), passwort };
  try {
    await bruecke({ aktion: 'pruefen' });
  } catch (e) {
    zugang = alt;
    throw e;
  }
}

export const wuKurse = () =>
  COCKPIT ? cockpit<{ kurse: Kurs[] }>('/api/webuntis/kurse') : bruecke<{ kurse: Kurs[] }>({ aktion: 'kurse' });

export const wuSchueler = (lsId: number) =>
  COCKPIT ? cockpit<{ schueler: WuSchueler[] }>(`/api/webuntis/schueler/${lsId}`)
    : bruecke<{ schueler: WuSchueler[] }>({ aktion: 'schueler', lsId });

export const wuMatrix = <T,>(lsId: number) =>
  COCKPIT ? cockpit<T>(`/api/webuntis/matrix/${lsId}`) : bruecke<T>({ aktion: 'matrix', lsId });

export const wuEintragen = <T,>(lsId: number, eintraege: unknown[]) =>
  COCKPIT
    ? cockpit<T>(`/api/webuntis/eintragen/${lsId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cockpit': '1' },
      body: JSON.stringify({ eintraege }),
    })
    : bruecke<T>({ aktion: 'eintragen', lsId, eintraege });
