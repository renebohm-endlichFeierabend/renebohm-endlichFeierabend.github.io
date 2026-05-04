import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import { useStore } from './data/store';
import Home from './routes/Home';
import ClassesView from './routes/Grades/ClassesView';
import ClassOverview from './routes/Grades/ClassOverview';
import QuickEntryWizard from './routes/Grades/QuickEntryWizard';
import StudentDetail from './routes/Grades/StudentDetail';
import TodosView from './routes/Todos/TodosView';
import VideosView from './routes/Videos/VideosView';
import MeditationView from './routes/Meditation/MeditationView';
import DriveSyncSettings from './routes/Settings/DriveSync';

function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/grades" element={<ClassesView />} />
        <Route path="/grades/:classId" element={<ClassOverview />} />
        <Route path="/grades/:classId/quick-somi" element={<QuickEntryWizard type="somi" />} />
        <Route path="/grades/:classId/add-exam" element={<QuickEntryWizard type="exam" />} />
        <Route path="/grades/:classId/student/:studentId" element={<StudentDetail />} />
        <Route path="/todos" element={<TodosView />} />
        <Route path="/videos" element={<VideosView />} />
        <Route path="/meditation" element={<MeditationView />} />
        <Route path="/settings" element={<DriveSyncSettings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  const { init, loading } = useStore();

  useEffect(() => { init(); }, [init]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-stone-400 text-sm">Lädt…</div>
      </div>
    );
  }

  return (
    <HashRouter>
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
    </HashRouter>
  );
}
