import { UEBUNGEN } from '../../data/yoga/uebungen';
import { BLOECKE, TEMPO, UEBERGANG_SEKUNDEN, type Tempo } from '../../data/yoga/bloecke';
import type { YogaUebung } from '../../types';

export interface Schritt {
  uebung: YogaUebung;
  seite: 'rechts' | 'links' | null;
  sekunden: number;
}

/** Haltedauer einer Übung im gewählten Tempo, auf 5 Sekunden gerundet. */
export function haltedauer(u: YogaUebung, tempo: Tempo): number {
  return Math.max(15, Math.round((u.sekunden * TEMPO[tempo].faktor) / 5) * 5);
}

/** Die ausgewählten Übungen in Blockreihenfolge, beidseitige als zwei Schritte. */
export function baueSchritte(auswahl: Set<string>, tempo: Tempo): Schritt[] {
  const schritte: Schritt[] = [];
  for (const block of BLOECKE) {
    for (const u of UEBUNGEN) {
      if (u.block !== block.name || !auswahl.has(u.id)) continue;
      const sek = haltedauer(u, tempo);
      if (u.beidseitig) {
        schritte.push({ uebung: u, seite: 'rechts', sekunden: sek });
        schritte.push({ uebung: u, seite: 'links', sekunden: sek });
      } else {
        schritte.push({ uebung: u, seite: null, sekunden: sek });
      }
    }
  }
  return schritte;
}

/** Gesamtdauer in Sekunden, mit Übergangszeit vor jeder Haltung. */
export function gesamtdauer(schritte: Schritt[]): number {
  return schritte.reduce((s, x) => s + x.sekunden + UEBERGANG_SEKUNDEN, 0);
}

export function minuten(sekunden: number): string {
  const m = Math.round(sekunden / 60);
  return m < 1 ? 'unter 1 Min.' : `${m} Min.`;
}

export const STANDARD_AUSWAHL = UEBUNGEN.filter((u) => u.standard).map((u) => u.id);
