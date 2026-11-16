import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Radio, X } from 'lucide-react';
import { normalizeRfidUid } from '../firebase/config';

interface RfidScanModalProps {
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onScanSubmit: (rawRfidUid: string) => Promise<void>;
}

export function RfidScanModal({
  open,
  submitting,
  onClose,
  onScanSubmit,
}: RfidScanModalProps) {
  const [rfidInput, setRfidInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const normalized = rfidInput.trim() ? normalizeRfidUid(rfidInput) : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!normalized) {
      setError('Enter an RFID Card UID (e.g. E6 F2 2E 06 or E6F22E06).');
      return;
    }
    try {
      await onScanSubmit(rfidInput);
      setRfidInput('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rfid-scan-modal-title"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={submitting ? undefined : onClose}
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                  <Radio className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="rfid-scan-modal-title" className="text-base font-semibold text-slate-900">
                    Record RFID Card Scan
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Matches /students by normalized RFID UID and prevents duplicate same-day scans.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={onClose}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700"
                >
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="scan-rfid-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  RFID Card UID (from RC522 / Serial Monitor)
                </label>
                <input
                  id="scan-rfid-input"
                  type="text"
                  autoFocus
                  value={rfidInput}
                  onChange={(e) => setRfidInput(e.target.value)}
                  placeholder="e.g. E6 F2 2E 06 or 1AC2B124"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono uppercase text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
                {normalized && (
                  <p className="mt-1 text-xs text-slate-500">
                    Normalized UID:{' '}
                    <strong className="font-mono text-sky-700">{normalized}</strong>
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Record Check-In
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
