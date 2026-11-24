import type { AppSettings, Class, Grade, Student } from '../../types';

// SoMi-Schnitt mit Arten und Gewichten je Kurs, Quartale und Notenstufen.

export const basisLabel = (l: string) => l.replace(/\s*\(.*\)\s*$/, '').trim();
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export const SOMI_VORSCHLAEGE = ['Mitarbeit', 'Test', 'Erklärvideo', 'Hausaufgaben', 'Referat', 'Heft/Mappe', 'Projekt', 'Protokoll', 'Präsentation'];

/** Zu welcher SoMi-Art gehört eine Note? Bezeichnung beginnt mit dem Namen der Art (längster Treffer). */
export function artVon(label: string, arten: { name: string }[]): string | null {
  const l = norm(label);
  const treffer = arten.filter((a) => l.startsWith(norm(a.name))).sort((a, b) => b.name.length - a.name.length);
  return treffer.length ? treffer[0].name : null;
}

function gewichteterSchnitt(gs: { value: number; weight?: number }[]): number | null {
  const w = gs.reduce((a, g) => a + (g.weight ?? 1), 0);
  return w ? gs.reduce((a, g) => a + g.value * (g.weight ?? 1), 0) / w : null;
}

/** SoMi-Schnitt einer Person. Ohne eingerichtete Arten zählt jede Note gleich (Beobachtungen halb).
 *  Mit Arten: erst Schnitt je Art, dann gewichtet nach den Schiebereglern. Arten ohne Note fallen heraus,
 *  die übrigen Gewichte werden hochgerechnet. Noten, die zu keiner Art passen, zählen mit dem
 *  mittleren Gewicht als eigene Art. */
export function somiSchnitt(grades: Grade[], arten?: { name: string; gewicht: number }[]): number | null {
  if (!grades.length) return null;
  if (!arten || !arten.length) return gewichteterSchnitt(grades);
  const mittel = arten.reduce((a, x) => a + x.gewicht, 0) / arten.length;
  const gruppen = new Map<string, Grade[]>();
  for (const g of grades) {
    const k = artVon(g.label, arten) ?? `?${basisLabel(g.label)}`;
    gruppen.set(k, [...(gruppen.get(k) ?? []), g]);
  }
  let summe = 0, gewichte = 0;
  for (const [k, gs] of gruppen) {
    const w = k.startsWith('?') ? mittel : arten.find((a) => a.name === k)!.gewicht;
    const v = gewichteterSchnitt(gs);
    if (v == null || w <= 0) continue;
    summe += v * w; gewichte += w;
  }
  return gewichte ? summe / gewichte : null;
}

// ---------------------------------------------------------------- Quartale

export function schuljahrVon(termKey: string): string { return termKey.split('-')[0]; }

/** Vorschlag, solange nichts eingestellt ist: Quartal 2 ab 16.11., Quartal 4 ab 19.04. */
export function quartalsgrenzen(settings: AppSettings, schuljahr: string): { q2: string; q4: string; geschaetzt: boolean } {
  const g = settings.quartale?.[schuljahr];
  if (g) return { ...g, geschaetzt: false };
  const start = Number(schuljahr.slice(0, 4));
  return { q2: `${start}-11-16`, q4: `${start + 1}-04-19`, geschaetzt: true };
}

/** Quartal 1–4 einer Note (aus Halbjahr der Note und Datum). */
export function quartalVon(g: Grade, settings: AppSettings): number {
  const [sj, hj] = g.termKey.split('-');
  const grenzen = quartalsgrenzen(settings, sj);
  const tag = g.date.slice(0, 10);
  if (hj === '2') return tag >= grenzen.q4 ? 4 : 3;
  return tag >= grenzen.q2 ? 2 : 1;
}

export type Zeitraum = 'hj' | 'q1' | 'q2';
/** Filter für ein Halbjahr bzw. dessen erstes oder zweites Quartal. */
export function imZeitraum(g: Grade, termKey: string, zeitraum: Zeitraum, settings: AppSettings): boolean {
  if (g.termKey !== termKey) return false;
  if (zeitraum === 'hj') return true;
  const q = quartalVon(g, settings);
  return zeitraum === 'q1' ? q % 2 === 1 : q % 2 === 0;
}
export function zeitraumName(termKey: string, zeitraum: Zeitraum): string {
  const hj = termKey.split('-')[1];
  if (zeitraum === 'hj') return `${hj}. Halbjahr`;
  const q = hj === '2' ? (zeitraum === 'q1' ? 3 : 4) : (zeitraum === 'q1' ? 1 : 2);
  return `Quartal ${q}`;
}

// ---------------------------------------------------------------- Notenstufen

export const SKALA: [number, string][] = [
  [0.7, '1+'], [1, '1'], [1.3, '1-'], [1.7, '2+'], [2, '2'], [2.3, '2-'], [2.7, '3+'], [3, '3'], [3.3, '3-'],
  [3.7, '4+'], [4, '4'], [4.3, '4-'], [4.7, '5+'], [5, '5'], [5.3, '5-'], [6, '6'],
];

/** Nächste Notenstufe. Liegt der Wert genau zwischen zwei Stufen, gibt es keinen Vorschlag,
 *  sondern beide Möglichkeiten; die Lehrkraft entscheidet. */
export function zuStufe(v: number): { note: string | null; wahl: [string, string] | null } {
  const sortiert = [...SKALA].sort((a, b) => Math.abs(a[0] - v) - Math.abs(b[0] - v));
  const [a, b] = sortiert;
  if (Math.abs(Math.abs(a[0] - v) - Math.abs(b[0] - v)) < 1e-6) {
    const [besser, schlechter] = a[0] < b[0] ? [a, b] : [b, a];
    return { note: null, wahl: [besser[1], schlechter[1]] };
  }
  return { note: a[1], wahl: null };
}

export function klasseSomi(s: Student, cls: Class, filter: (g: Grade) => boolean): number | null {
  return somiSchnitt((s.somiGrades ?? []).filter(filter), cls.somiArten);
}
