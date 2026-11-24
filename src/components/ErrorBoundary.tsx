import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
  details?: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    let message = error.message || 'An unexpected application error occurred.';
    let details: string | undefined;
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && parsed.operationType && parsed.error) {
        message = `Database ${parsed.operationType} error on ${parsed.path || 'record'}: ${parsed.error}`;
        details = JSON.stringify(parsed, null, 2);
      }
    } catch {
      // standard Error message
    }
    return { hasError: true, message, details };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Task Master ErrorBoundary:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '', details: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F7F9FC] dark:bg-[#0B1120] p-6">
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-[#D93025]/10 text-[#D93025]">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-[#172B4D] dark:text-slate-100">
                  Something went wrong
                </h2>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 break-words">
                  {this.state.message}
                </p>
                {this.state.details && (
                  <pre className="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto max-h-48">
                    {this.state.details}
                  </pre>
                )}
                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={this.handleReset}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1A73E8] text-white text-sm font-medium hover:bg-[#1557B0] transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Try Again
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Reload Application
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
