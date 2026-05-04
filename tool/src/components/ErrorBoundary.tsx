import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[LeherTool] Render-Fehler:', error.message);
    console.error('[LeherTool] Stack:', info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center px-5">
          <div className="max-w-sm w-full p-6 bg-red-50 rounded-2xl border border-red-200">
            <h2 className="text-lg font-medium text-red-800 mb-2">Fehler</h2>
            <p className="text-sm text-red-700 font-mono break-all">{this.state.error.message}</p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.hash = '/'; }}
              className="mt-4 px-4 py-2 bg-red-700 text-white rounded-lg text-sm"
            >
              Zurück zur Startseite
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
