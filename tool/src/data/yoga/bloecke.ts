// Reihenfolge der Blöcke im Flow. Sie folgt einer klassischen Hatha-Stunde: ankommen, den Körper
// vorbereiten, aufbauen (Stand, Gleichgewicht), Rückbeugen und danach ausgleichende Vorbeugen und
// Drehungen, zum Schluss Umkehrhaltungen und Entspannung.
export const BLOECKE = [
  { name: 'Ankommen', text: 'Zur Ruhe kommen, den Atem finden.' },
  { name: 'Mobilisieren', text: 'Wirbelsäule und Gelenke sanft bewegen.' },
  { name: 'Erwärmen', text: 'Den ganzen Körper aufwecken.' },
  { name: 'Stehhaltungen', text: 'Kraft und Stabilität in den Beinen.' },
  { name: 'Gleichgewicht', text: 'Fokus und Balance.' },
  { name: 'Rückbeugen', text: 'Die Vorderseite öffnen.' },
  { name: 'Hüftöffner', text: 'Hüften weit und weich werden lassen.' },
  { name: 'Vorbeugen', text: 'Die Rückseite dehnen, zur Ruhe kommen.' },
  { name: 'Drehungen', text: 'Ausgleichen und die Wirbelsäule neutralisieren.' },
  { name: 'Umkehrhaltungen', text: 'Beine hoch, das Nervensystem beruhigen.' },
  { name: 'Entspannung', text: 'Nachspüren und loslassen.' },
] as const;

export type BlockName = (typeof BLOECKE)[number]['name'];

/** Haltedauer je Tempo als Faktor auf die Grunddauer der Übung. */
export const TEMPO = {
  kurz: { label: 'Kürzer', faktor: 0.7 },
  normal: { label: 'Normal', faktor: 1 },
  lang: { label: 'Länger', faktor: 1.4 },
} as const;

export type Tempo = keyof typeof TEMPO;

/** Zeit zum Einnehmen einer Haltung, bevor die Haltezeit läuft. */
export const UEBERGANG_SEKUNDEN = 8;
