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

export function getTermData(student: Student, termKey: string): TermData {
  const somi = (student.somiGrades ?? []).filter((g) => g.termKey === termKey);
  const exams = (student.examGrades ?? []).filter((g) => g.termKey === termKey);
  const somiAvg = avg(somi.map((g) => g.value));
  const examAvg = avg(exams.map((g) => g.value));
  let finalGrade: number | null = null;
  if (somiAvg !== null && examAvg !== null) finalGrade = (somiAvg + examAvg) / 2;
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
