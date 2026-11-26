import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'Si è verificato un errore imprevisto.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0E14] text-[#F1F5F9] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#121822] border border-white/10 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h2 className="text-lg font-semibold">Errore nell&apos;applicazione</h2>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              Si è verificato un problema durante il caricamento o il salvataggio dei dati.
            </p>
            <div className="bg-[#0A0E14] border border-white/10 rounded-lg p-3 text-xs font-mono text-slate-400 overflow-x-auto">
              {this.state.errorMessage.slice(0, 320)}
            </div>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#F97316] hover:bg-[#EA580C] text-white rounded-lg transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              Ricarica piattaforma
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
