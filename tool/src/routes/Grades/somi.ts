import type { Class, Grade, Quartalsnote, Student } from '../../types';

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

/** Gehört die Note zum ersten Quartal ihres Halbjahres? Grenze ist das Quartalsende der Klasse:
 *  Datum (ganzer Tag zählt mit) oder genauer Zeitpunkt. Ohne Grenze: ja. */
export function imErstenQuartal(g: Grade, cls: Class): boolean {
  const ende = cls.quartalsende?.[g.termKey];
  if (!ende) return true;
  return ende.length === 10 ? g.date.slice(0, 10) <= ende : g.date <= ende;
}

export type Zeitraum = 'hj' | 'q1' | 'q2';
/** Filter für ein Halbjahr bzw. dessen erstes oder zweites Quartal. */
export function imZeitraum(g: Grade, termKey: string, zeitraum: Zeitraum, cls: Class): boolean {
  if (g.termKey !== termKey) return false;
  if (zeitraum === 'hj') return true;
  return imErstenQuartal(g, cls) === (zeitraum === 'q1');
}
export function zeitraumName(termKey: string, zeitraum: Zeitraum): string {
  const hj = termKey.split('-')[1];
  if (zeitraum === 'hj') return `${hj}. Halbjahr`;
  const q = hj === '2' ? (zeitraum === 'q1' ? 3 : 4) : (zeitraum === 'q1' ? 1 : 2);
  return `Quartal ${q}`;
}
export function endeText(ende: string | undefined): string {
  if (!ende) return 'noch offen';
  const d = new Date(ende.length === 10 ? ende + 'T12:00:00' : ende);
  const tag = d.toLocaleDateString('de-DE');
  return ende.length === 10 ? `${tag} (einschließlich)` : `${tag}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
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

// ---------------------------------------------------------------- SoMi-Quartalsnoten (Anzeige)

export interface SomiQuartal { zeitraum: 'q1' | 'q2'; name: string; wert: number; stufe: string }

/** SoMi-Quartalsnoten einer Person im Halbjahr: erstes Quartal immer (sofern Noten da sind), zweites
 *  nur, wenn das Quartalsende der Klasse gesetzt ist. Stufe wie beim Übertragen; liegt der Wert genau
 *  zwischen zwei Stufen, stehen beide da („2/2-“) und die Lehrkraft entscheidet. */
export function somiQuartale(s: Student, cls: Class, termKey: string): SomiQuartal[] {
  const zeitraeume: ('q1' | 'q2')[] = cls.quartalsende?.[termKey] ? ['q1', 'q2'] : ['q1'];
  const out: SomiQuartal[] = [];
  for (const z of zeitraeume) {
    const wert = klasseSomi(s, cls, (g) => imZeitraum(g, termKey, z, cls));
    if (wert == null) continue;
    const { note, wahl } = zuStufe(wert);
    out.push({ zeitraum: z, name: zeitraumName(termKey, z), wert, stufe: note ?? (wahl ? wahl.join('/') : '') });
  }
  return out;
}

// ---------------------------------------------------------------- Quartalsnoten

/** Entschiedene SoMi-Quartalsnote (Quartal 1 bzw. 3) eines Halbjahres, falls vorhanden. */
export function quartalsnote(s: Student, termKey: string): Quartalsnote | null {
  return s.quartalsnoten?.[termKey] ?? null;
}

/** Zahlenwert einer Notenstufe („2-“ → 2,3), sonst null. */
export function notenwert(note: string): number | null {
  const t = SKALA.find(([, n]) => n === note.trim());
  return t ? t[0] : null;
}

/** Quartalsnoten in die Klasse schreiben (je Schüler-ID eine Note; leere Note löscht). */
export function mitQuartalsnoten(cls: Class, termKey: string, noten: Record<string, { note: string; schnitt: number | null }>): Class {
  const jetzt = new Date().toISOString();
  return {
    ...cls,
    students: cls.students.map((s) => {
      if (!(s.id in noten)) return s;
      const q = { ...(s.quartalsnoten ?? {}) };
      const n = noten[s.id];
      if (n.note) q[termKey] = { note: n.note, schnitt: n.schnitt, datum: jetzt }; else delete q[termKey];
      return { ...s, quartalsnoten: q };
    }),
  };
}
