import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CreditCard, Loader2, UserPlus, X } from 'lucide-react';
import { isFirebaseAuthUid, normalizeRfidUid } from '../firebase/config';
import { PendingStudentAccount, StudentRecord } from '../types/attendance';

export type StudentModalMode =
  | { kind: 'add' }
  | { kind: 'edit'; student: StudentRecord }
  | { kind: 'register_rfid'; student: StudentRecord }
  | { kind: 'complete_pending'; pending: PendingStudentAccount };

interface StudentFormModalProps {
  mode: StudentModalMode | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    existingStudent?: StudentRecord | null;
    name: string;
    rollNumber: string;
    email: string;
    authUid: string;
    rfidUid: string;
  }) => Promise<void>;
}

export function StudentFormModal({
  mode,
  saving,
  onClose,
  onSubmit,
}: StudentFormModalProps) {
  const [name, setName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [email, setEmail] = useState('');
  const [authUid, setAuthUid] = useState('');
  const [rfidUid, setRfidUid] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!mode) return;
    setFormError(null);
    if (mode.kind === 'add') {
      setName('');
      setRollNumber('');
      setEmail('');
      setAuthUid('');
      setRfidUid('');
    } else if (mode.kind === 'edit' || mode.kind === 'register_rfid') {
      setName(mode.student.name);
      setRollNumber(mode.student.rollNumber === '—' ? '' : mode.student.rollNumber);
      setEmail(mode.student.email === '—' ? '' : mode.student.email);
      setAuthUid(mode.student.authUid || '');
      setRfidUid(mode.student.rfidUid || '');
    } else if (mode.kind === 'complete_pending') {
      setName(mode.pending.existingName || '');
      setRollNumber(mode.pending.existingRollNumber || '');
      setEmail(mode.pending.email);
      setAuthUid(mode.pending.authUid);
      setRfidUid('');
    }
  }, [mode]);

  if (!mode) return null;

  const isRfidOnly = mode.kind === 'register_rfid';
  const title =
    mode.kind === 'add'
      ? 'Add Registered Student'
      : mode.kind === 'edit'
      ? 'Edit Student Profile'
      : mode.kind === 'register_rfid'
      ? 'Register RFID Card'
      : 'Complete Student Registration';

  const normalizedPreview = rfidUid.trim() ? normalizeRfidUid(rfidUid) : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim() || !rollNumber.trim()) {
      setFormError('Student Name and Roll Number are required.');
      return;
    }

    if (normalizedPreview && isFirebaseAuthUid(normalizedPreview)) {
      setFormError('Firebase Auth UID cannot be entered as an RFID Card UID.');
      return;
    }

    if (isRfidOnly && !normalizedPreview) {
      setFormError('Please enter the physical RFID Card UID (e.g. E6F22E06).');
      return;
    }

    try {
      await onSubmit({
        existingStudent:
          mode.kind === 'edit' || mode.kind === 'register_rfid'
            ? mode.student
            : null,
        name: name.trim(),
        rollNumber: rollNumber.trim(),
        email: email.trim(),
        authUid: authUid.trim(),
        rfidUid: normalizedPreview,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-modal-title"
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
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                {isRfidOnly ? <CreditCard className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
              </div>
              <div>
                <h3 id="student-modal-title" className="text-base font-semibold text-slate-900">
                  {title}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Saves directly to Firebase Realtime Database (/students).
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              aria-label="Close modal"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {formError && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700"
              >
                {formError}
              </div>
            )}

            {!isRfidOnly && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="stu-name"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Student Name
                    </label>
                    <input
                      id="stu-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Full student name"
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="stu-roll"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Roll Number
                    </label>
                    <input
                      id="stu-roll"
                      type="text"
                      required
                      value={rollNumber}
                      onChange={(e) => setRollNumber(e.target.value)}
                      placeholder="e.g. 4"
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="stu-email"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Email Address
                  </label>
                  <input
                    id="stu-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@gmail.com"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="stu-auth-uid"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Firebase Auth UID (optional)
                  </label>
                  <input
                    id="stu-auth-uid"
                    type="text"
                    value={authUid}
                    readOnly={mode.kind === 'complete_pending'}
                    onChange={(e) => setAuthUid(e.target.value)}
                    placeholder="28-character Firebase Authentication UID"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 read-only:bg-slate-50 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                  />
                </div>
              </>
            )}

            <div>
              <label
                htmlFor="stu-rfid"
                className="block text-xs font-semibold text-slate-700"
              >
                RFID Card UID {isRfidOnly ? `(for ${name})` : '(spaces removed automatically)'}
              </label>
              <input
                id="stu-rfid"
                type="text"
                value={rfidUid}
                onChange={(e) => setRfidUid(e.target.value)}
                placeholder="e.g. E6 F2 2E 06 or E6F22E06"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono uppercase text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
              />
              {normalizedPreview && (
                <p className="mt-1 text-xs text-slate-500">
                  Normalized RFID UID to store:{' '}
                  <strong className="font-mono text-sky-700">{normalizedPreview}</strong>
                </p>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {isRfidOnly ? 'Save RFID Card' : 'Save Student'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
