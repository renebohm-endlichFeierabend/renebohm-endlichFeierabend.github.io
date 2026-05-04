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

export interface AppData {
  version: number;
  lastModified: string;
  classes: Class[];
  todos: Todo[];
  videos: Video[];
  meditationSessions: MeditationSession[];
}

export interface DriveConfig {
  clientId: string;
  accessToken?: string;
  tokenExpiry?: number;
  userEmail?: string;
  fileId?: string;
}
