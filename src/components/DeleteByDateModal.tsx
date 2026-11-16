import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarX2, Loader2, X } from 'lucide-react';
import { AttendanceRecord } from '../types/attendance';
import { formatDateDDMMYYYY, getISTTodayISO } from '../utils/istDateTime';

interface DeleteByDateModalProps {
  open: boolean;
  records: AttendanceRecord[];
  deleting: boolean;
  initialDateISO?: string;
  onClose: () => void;
  onConfirmDelete: (dateISO: string, matchingRecords: AttendanceRecord[]) => Promise<void>;
}

export function DeleteByDateModal({
  open,
  records,
  deleting,
  initialDateISO,
  onClose,
  onConfirmDelete,
}: DeleteByDateModalProps) {
  const [selectedDateISO, setSelectedDateISO] = useState(
    initialDateISO || getISTTodayISO()
  );

  const matchingRecords = useMemo(
    () => records.filter((r) => !r.isVirtualAbsent && r.dateISO === selectedDateISO),
    [records, selectedDateISO]
  );

  const displayDate = formatDateDDMMYYYY(selectedDateISO);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-date-modal-title"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={deleting ? undefined : onClose}
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <CalendarX2 className="h-5 w-5" />
                </div>
                <div>
                  <h3
                    id="delete-date-modal-title"
                    className="text-base font-semibold text-slate-900"
                  >
                    Delete Attendance by Date
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Select a date to delete its attendance records only. Other dates remain untouched.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={deleting}
                onClick={onClose}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="delete-by-date-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Select Date (Selected: {displayDate})
                </label>
                <input
                  id="delete-by-date-input"
                  type="date"
                  value={selectedDateISO}
                  onChange={(e) => setSelectedDateISO(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                {matchingRecords.length > 0 ? (
                  <p className="text-slate-700">
                    <strong className="font-mono tabular-nums text-red-600">
                      {matchingRecords.length}
                    </strong>{' '}
                    attendance {matchingRecords.length === 1 ? 'record' : 'records'} found on{' '}
                    <span className="font-mono tabular-nums font-medium">{displayDate}</span> will be deleted.
                  </p>
                ) : (
                  <p className="text-slate-500">
                    No attendance records found for{' '}
                    <span className="font-mono tabular-nums">{displayDate}</span>.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={deleting}
                onClick={onClose}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting || matchingRecords.length === 0}
                onClick={() => onConfirmDelete(selectedDateISO, matchingRecords)}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete {matchingRecords.length > 0 ? `${matchingRecords.length} Records` : 'Records'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
