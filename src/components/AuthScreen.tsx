import React, { useState } from 'react';
import {
  Calendar,
  FileSpreadsheet,
  GitBranch,
  Layers,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const AuthScreen: React.FC = () => {
  const { signIn, theme, toggleTheme } = useApp();
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await signIn(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#0B1120] flex flex-col">
      <header className="w-full max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#172B4D] dark:bg-[#1A73E8] flex items-center justify-center text-white font-display font-bold text-sm">
            TM
          </div>
          <span className="font-display font-bold text-lg tracking-tight text-[#172B4D] dark:text-slate-100 whitespace-nowrap">
            Task Master
          </span>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-6">
            <p className="text-xs font-semibold text-[#1A73E8] dark:text-blue-400">
              Enterprise Strategic Execution Platform
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#172B4D] dark:text-white leading-tight [text-wrap:balance]">
              Unified Project Control, RACI Governance &amp; Calendar Synchronization
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
              Monitor Balanced Scorecard initiatives, operational transformations, executive meetings,
              weighted Gantt timelines, and Excel project plans in one real-time workspace backed by
              Cloud Firestore and Google Calendar.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {[
                {
                  icon: Layers,
                  title: 'Weighted Portfolio Tracking',
                  desc: 'Planned vs actual variance across unlimited strategic projects.',
                },
                {
                  icon: Calendar,
                  title: 'Google Calendar Two-Way Sync',
                  desc: 'Consolidated multi-project calendar with drag-and-drop scheduling.',
                },
                {
                  icon: FileSpreadsheet,
                  title: 'Excel Plan Import Engine',
                  desc: 'Map columns, validate dates, prevent duplicates, and generate timelines.',
                },
                {
                  icon: GitBranch,
                  title: 'RACI & Governance Validation',
                  desc: 'Spreadsheet matrix flagging missing Accountable owners automatically.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800"
                >
                  <item.icon className="w-4 h-4 text-[#1A73E8] dark:text-blue-400 mb-2" />
                  <h3 className="text-sm font-semibold text-[#172B4D] dark:text-slate-100">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-7 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">
                <ShieldCheck className="w-4 h-4 text-[#188038] dark:text-emerald-400" />
                <span>Role-Based Enterprise Access</span>
              </div>
              <h2 className="font-display text-xl font-bold text-[#172B4D] dark:text-white">
                Sign in to your workspace
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Authenticate with your Google account to access persistent Cloud Firestore records
                and enable optional Google Calendar synchronization.
              </p>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleLogin}
                  disabled={loading}
                  className="gsi-material-button w-full"
                >
                  <div className="gsi-material-button-content-wrapper">
                    <div className="gsi-material-button-icon">
                      <svg
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        style={{ display: 'block' }}
                      >
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        />
                        <path fill="none" d="M0 0h48v48H0z" />
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">
                      {loading ? 'Signing in...' : 'Sign in with Google'}
                    </span>
                  </div>
                </button>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                <p>
                  Includes 12 pre-loaded Balanced Scorecard demonstration projects (P01–P20) that
                  can be edited or cleared at any time.
                </p>
                <p>
                  Google Calendar updates always require your explicit confirmation before syncing.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
