import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, Check, Loader2, X } from 'lucide-react';
import { AttendanceRecord } from '../types/attendance';
import {
  formatDateDDMMYYYY,
  formatTime12hFrom24,
  from12hParts,
  to12hParts,
} from '../utils/istDateTime';

interface EditAttendanceModalProps {
  record: AttendanceRecord | null;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: {
    record: AttendanceRecord;
    newDateISO: string;
    newTime24: string;
    newStatus: string;
  }) => Promise<void>;
}

const STATUS_OPTIONS = ['Present', 'Late', 'Absent', 'Excused'];

export function EditAttendanceModal({
  record,
  saving,
  onClose,
  onSave,
}: EditAttendanceModalProps) {
  const [dateISO, setDateISO] = useState('');
  const [hour, setHour] = useState('09');
  const [minute, setMinute] = useState('00');
  const [second, setSecond] = useState('00');
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  const [status, setStatus] = useState('Present');
  const [confirmStep, setConfirmStep] = useState(false);

  useEffect(() => {
    if (!record) return;
    setDateISO(record.dateISO);
    const parts = to12hParts(record.checkInTime24 || '09:00:00');
    setHour(parts.hour);
    setMinute(parts.minute);
    setSecond(parts.second);
    setPeriod(parts.period);
    setStatus(record.status || 'Present');
    setConfirmStep(false);
  }, [record]);

  if (!record) return null;

  const newTime24 = from12hParts(hour, minute, second, period);
  const newTimeDisplay = formatTime12hFrom24(newTime24);
  const newDateDisplay = formatDateDDMMYYYY(dateISO);

  const hasChanges =
    dateISO !== record.dateISO ||
    newTime24 !== (record.checkInTime24 || '09:00:00') ||
    status !== record.status;

  const handleReviewSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dateISO) return;
    setConfirmStep(true);
  };

  const handleConfirmedSubmit = async () => {
    await onSave({
      record,
      newDateISO: dateISO,
      newTime24,
      newStatus: status,
    });
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-modal-title"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={saving ? undefined : onClose}
          className="fixed inset-0 bg-slate-900/35 backdrop-blur-[2px]"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 id="edit-modal-title" className="text-lg font-semibold text-slate-900">
                Edit Attendance Record
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {record.studentName} · Roll {record.rollNumber} · UID{' '}
                <span className="font-mono">{record.rfidUid}</span>
              </p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              aria-label="Close modal"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {!confirmStep ? (
            <form onSubmit={handleReviewSave} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="edit-attendance-date"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Attendance Date (IST · Selected: {newDateDisplay})
                </label>
                <input
                  id="edit-attendance-date"
                  type="date"
                  required
                  value={dateISO}
                  onChange={(e) => setDateISO(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
              </div>

              <div>
                <span className="block text-xs font-semibold text-slate-700">
                  Check-in Time (12-Hour IST Format)
                </span>
                <div className="mt-1.5 grid grid-cols-4 gap-2">
                  <div>
                    <label htmlFor="edit-hour" className="sr-only">
                      Hour
                    </label>
                    <select
                      id="edit-hour"
                      value={hour}
                      onChange={(e) => setHour(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                    >
                      {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(
                        (h) => (
                          <option key={h} value={h}>
                            {h} hr
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="edit-minute" className="sr-only">
                      Minute
                    </label>
                    <select
                      id="edit-minute"
                      value={minute}
                      onChange={(e) => setMinute(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                    >
                      {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(
                        (m) => (
                          <option key={m} value={m}>
                            {m} min
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="edit-second" className="sr-only">
                      Second
                    </label>
                    <select
                      id="edit-second"
                      value={second}
                      onChange={(e) => setSecond(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                    >
                      {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(
                        (s) => (
                          <option key={s} value={s}>
                            {s} sec
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    {(['AM', 'PM'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPeriod(p)}
                        className={`flex-1 rounded-md text-xs font-semibold transition-colors ${
                          period === p
                            ? 'bg-sky-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <span className="block text-xs font-semibold text-slate-700">
                  Attendance Status
                </span>
                <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setStatus(opt)}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                        status === opt
                          ? 'border-sky-500 bg-sky-50 text-sky-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!hasChanges}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
                >
                  Review &amp; Save Changes
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-sky-700" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Confirm Firebase Attendance Update
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      This change will sync immediately to Firebase Realtime Database and can be reversed with Undo.
                    </p>
                  </div>
                </div>

                <div className="mt-3.5 space-y-2 border-t border-sky-200/70 pt-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Date</span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {record.dateDisplay} → <strong>{newDateDisplay}</strong>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Check-in Time</span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {record.checkInTimeDisplay} → <strong>{newTimeDisplay}</strong>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Status</span>
                    <span className="text-slate-900">
                      {record.status} → <strong>{status}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setConfirmStep(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                >
                  Back to Edit
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleConfirmedSubmit}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Confirm &amp; Save
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
