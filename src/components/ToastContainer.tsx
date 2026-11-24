import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-20 md:bottom-5 right-4 z-[90] flex flex-col gap-2.5 max-w-sm w-[calc(100vw-2rem)]"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Icon =
          t.type === 'success' ? CheckCircle2 : t.type === 'error' ? AlertCircle : Info;
        const iconColor =
          t.type === 'success'
            ? 'text-[#188038] dark:text-emerald-400'
            : t.type === 'error'
            ? 'text-[#D93025] dark:text-red-400'
            : 'text-[#1A73E8] dark:text-blue-400';

        return (
          <div
            key={t.id}
            className="flex items-start gap-3 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg"
          >
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#172B4D] dark:text-slate-100">{t.title}</p>
              {t.message && (
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 leading-snug">
                  {t.message}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss notification"
              className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
