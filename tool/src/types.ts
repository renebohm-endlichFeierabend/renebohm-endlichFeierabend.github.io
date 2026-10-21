export interface Grade {
  id: string;
  value: number;
  label: string;
  date: string;
  termKey: string;
}

export interface Student {
  id: string;
  name: string;
  somiGrades: Grade[];
  examGrades: Grade[];
  notes?: string;
  observations?: Observation[];
}

export interface Observation {
  id: string;
  date: string; // YYYY-MM-DD
  text: string;
  tag: 'positiv' | 'neutral' | 'hinweis';
}

export interface Class {
  id: string;
  name: string;
  students: Student[];
  createdAt: number;
}

export interface Todo {
  id: string;
  text: string;
  category: 'school' | 'business';
  priority: 'high' | 'medium' | 'low';
  dueDate: string | null;
  withReminder: boolean;
  done: boolean;
  doneAt: number | null;
  createdAt: number;
  source?: string;
}

export interface Video {
  id: string;
  url: string;
  title: string;
  category: 'yoga' | 'meditation' | 'andere';
  thumbnail?: string;
  duration?: string;
  notes?: string;
  watchedCount: number;
  lastWatched?: number;
  addedAt: number;
}

export interface MeditationSession {
  id: string;
  durationSeconds: number;
  type: 'silent' | 'guided';
  intervalBells?: number[];
  startedAt: number;
  completedAt: number | null;
  notes?: string;
}

export interface PlannedExam {
  id: string;
  classId: string;
  title: string;
  date: string; // YYYY-MM-DD, Termin der Arbeit
  correctionDue: string | null; // YYYY-MM-DD
  todoId?: string; // verknüpfte Korrektur-Aufgabe
}

export interface FeierabendEntry {
  id: string;
  date: string; // YYYY-MM-DD
  highlight: string;
  note: string;
  tomorrowTodoIds: string[];
}

export interface YogaUebung {
  id: string;
  block: string;
  name: string;
  sanskrit: string;
  sekunden: number; // Grunddauer der Haltung (je Seite, wenn beidseitig)
  beidseitig: boolean;
  standard: boolean; // im Grund-Flow vorausgewählt
  anleitung: string;
  bild: string; // relativ zur App, z. B. yoga/tadasana.webp
  quelle: { urheber: string; lizenz: string; lizenzUrl: string; seite: string };
}

export interface YogaFlow {
  id: string;
  name: string;
  uebungen: string[]; // ausgewählte Übungs-IDs
  tempo: 'kurz' | 'normal' | 'lang';
  erstellt: number;
  zuletzt?: number;
}

export interface AppSettings {
  somiWeight: number; // Anteil SoMi an der Zeugnisnote, 0–100
}

export interface AppData {
  version: number;
  lastModified: string;
  classes: Class[];
  todos: Todo[];
  videos: Video[];
  meditationSessions: MeditationSession[];
  plannedExams: PlannedExam[];
  feierabendLogs: FeierabendEntry[];
  yogaFlows: YogaFlow[];
  settings: AppSettings;
}

export interface DriveConfig {
  clientId: string;
  accessToken?: string;
  tokenExpiry?: number;
  userEmail?: string;
  fileId?: string;
}
