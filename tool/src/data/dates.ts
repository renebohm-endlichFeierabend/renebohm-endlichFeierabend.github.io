/** Lokales Datum als YYYY-MM-DD (nicht UTC, damit „heute“ abends stimmt). */
export function toDateKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function dayDiff(dateKey: string, from: Date = new Date()): number {
  const a = new Date(`${dateKey}T00:00:00`);
  const b = new Date(from);
  b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

export function formatDateDe(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit',
  });
}

export function relativeDay(dateKey: string): string {
  const diff = dayDiff(dateKey);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  if (diff < 0) return `Vor ${-diff} Tagen`;
  if (diff < 7) return `In ${diff} Tagen`;
  return formatDateDe(dateKey);
}

/** Montag der Woche, in der d liegt. */
export function startOfWeek(d: Date = new Date()): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const wd = (r.getDay() + 6) % 7;
  r.setDate(r.getDate() - wd);
  return r;
}

/** Fälligkeit einer Aufgabe als Datumsschlüssel. */
export function dueKey(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}
