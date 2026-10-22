import type { Student, Grade } from '../../types';

export function getCurrentSchoolYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month >= 7) return `${year}/${String(year + 1).slice(2)}`;
  return `${year - 1}/${String(year).slice(2)}`;
}

export function getCurrentTerm(): 1 | 2 {
  const month = new Date().getMonth();
  return month >= 7 || month <= 0 ? 1 : 2;
}

export function getCurrentTermKey(): string {
  return `${getCurrentSchoolYear()}-${getCurrentTerm()}`;
}

export function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Gewichteter Schnitt; Einträge ohne Gewicht zählen 1. */
export function weightedAvg(grades: { value: number; weight?: number }[]): number | null {
  const sumW = grades.reduce((a, g) => a + (g.weight ?? 1), 0);
  if (sumW === 0) return null;
  return grades.reduce((a, g) => a + g.value * (g.weight ?? 1), 0) / sumW;
}

export function formatGrade(val: number | null | undefined): string {
  if (val === null || val === undefined) return '–';
  return val.toFixed(2);
}

export function gradeColorClass(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'text-stone-400 bg-stone-100';
  if (val <= 2) return 'text-emerald-700 bg-emerald-50';
  if (val <= 3) return 'text-amber-700 bg-amber-50';
  if (val <= 4) return 'text-orange-700 bg-orange-50';
  return 'text-red-700 bg-red-50';
}

export function btnGradeColor(val: number): string {
  if (val <= 2) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (val <= 3) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (val <= 4) return 'bg-orange-50 text-orange-700 border-orange-200';
  return 'bg-red-50 text-red-700 border-red-200';
}

export interface TermData {
  somi: Grade[];
  exams: Grade[];
  somiAvg: number | null;
  examAvg: number | null;
  finalGrade: number | null;
}

/** somiWeight: Anteil der SoMi an der Zeugnisnote in Prozent (Standard 50). */
export function getTermData(student: Student, termKey: string, somiWeight = 50): TermData {
  const somi = (student.somiGrades ?? []).filter((g) => g.termKey === termKey);
  const exams = (student.examGrades ?? []).filter((g) => g.termKey === termKey);
  const somiAvg = weightedAvg(somi);
  const examAvg = avg(exams.map((g) => g.value));
  let finalGrade: number | null = null;
  if (somiAvg !== null && examAvg !== null) {
    const w = Math.min(100, Math.max(0, somiWeight)) / 100;
    finalGrade = somiAvg * w + examAvg * (1 - w);
  }
  else if (somiAvg !== null) finalGrade = somiAvg;
  else if (examAvg !== null) finalGrade = examAvg;
  return { somi, exams, somiAvg, examAvg, finalGrade };
}

export const GRADE_BUTTONS = [
  { value: 1, display: '1' }, { value: 1.7, display: '1-' }, { value: 2.3, display: '2+' },
  { value: 2, display: '2' }, { value: 2.7, display: '2-' }, { value: 3.3, display: '3+' },
  { value: 3, display: '3' }, { value: 3.7, display: '3-' }, { value: 4.3, display: '4+' },
  { value: 4, display: '4' }, { value: 4.7, display: '4-' }, { value: 5.3, display: '5+' },
  { value: 5, display: '5' }, { value: 6, display: '6' },
];

/** Auf ganze Note runden; x,5 geht zur schlechteren Note. Nur ein Vorschlag, keine Rechtsvorgabe. */
export function roundToGrade(val: number | null): number | null {
  if (val === null) return null;
  return Math.min(6, Math.max(1, Math.round(val)));
}

export interface ExamGroup {
  key: string;
  label: string;
  date: string;
  grades: number[];
  avg: number;
  distribution: number[]; // Index 0 = Note 1 … 5 = Note 6
}

export function emptyDistribution(): number[] {
  return [0, 0, 0, 0, 0, 0];
}

export function distributionOf(values: number[]): number[] {
  const dist = emptyDistribution();
  values.forEach((v) => {
    const r = roundToGrade(v);
    if (r !== null) dist[r - 1] += 1;
  });
  return dist;
}

/** Klausuren einer Klasse gruppiert nach Bezeichnung und Eingabetag. */
export function getExamGroups(students: Student[], termKey: string): ExamGroup[] {
  const map = new Map<string, ExamGroup>();
  students.forEach((s) => {
    (s.examGrades ?? []).filter((g) => g.termKey === termKey).forEach((g) => {
      const day = g.date.slice(0, 10);
      const key = `${g.label}|${day}`;
      const grp = map.get(key) ?? { key, label: g.label, date: day, grades: [], avg: 0, distribution: emptyDistribution() };
      grp.grades.push(g.value);
      map.set(key, grp);
    });
  });
  return Array.from(map.values())
    .map((g) => ({ ...g, avg: g.grades.reduce((a, b) => a + b, 0) / g.grades.length, distribution: distributionOf(g.grades) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
