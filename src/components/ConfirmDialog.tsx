import React from 'react';
import { AlertTriangle, Calendar, Trash2, X } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  description: string;
  items?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary' | 'warning';
}

interface ConfirmDialogProps {
  open: boolean;
  options: ConfirmOptions | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  options,
  onConfirm,
  onCancel,
}) => {
  if (!open || !options) return null;

  const tone = options.tone || 'danger';
  const Icon = tone === 'primary' ? Calendar : tone === 'warning' ? AlertTriangle : Trash2;
  const iconWrapClass =
    tone === 'primary'
      ? 'bg-[#1A73E8]/10 text-[#1A73E8]'
      : tone === 'warning'
      ? 'bg-[#F9AB00]/15 text-[#B06000] dark:text-amber-400'
      : 'bg-[#D93025]/10 text-[#D93025]';

  const btnClass =
    tone === 'primary'
      ? 'bg-[#1A73E8] hover:bg-[#1557B0] text-white'
      : tone === 'warning'
      ? 'bg-[#B06000] hover:bg-[#8E4D00] text-white'
      : 'bg-[#D93025] hover:bg-[#B3261E] text-white';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden">
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-lg shrink-0 ${iconWrapClass}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <h3
                  id="confirm-dialog-title"
                  className="text-base font-semibold text-[#172B4D] dark:text-slate-100"
                >
                  {options.title}
                </h3>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {options.description}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close dialog"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {options.items && options.items.length > 0 && (
            <div className="mt-4 max-h-40 overflow-y-auto rounded-lg bg-[#F7F9FC] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                Affected items ({options.items.length})
              </p>
              <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                {options.items.slice(0, 12).map((item, idx) => (
                  <li key={idx} className="truncate">
                    · {item}
                  </li>
                ))}
                {options.items.length > 12 && (
                  <li className="text-slate-500 dark:text-slate-400">
                    + {options.items.length - 12} additional item(s)
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 bg-[#F7F9FC] dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            {options.cancelLabel || 'Cancel'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${btnClass}`}
          >
            {options.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};
