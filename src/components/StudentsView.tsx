import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  History,
  Pencil,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import {
  AttendanceRecord,
  PendingStudentAccount,
  StudentRecord,
} from '../types/attendance';
import { normalizeRfidKey } from '../services/schemaInspector';
import { getISTTodayISO } from '../utils/istDateTime';
import { StudentModalMode } from './StudentFormModal';

interface StudentsViewProps {
  students: StudentRecord[];
  pendingAccounts: PendingStudentAccount[];
  attendance: AttendanceRecord[];
  loading: boolean;
  onInspectStudentHistory: (student: StudentRecord) => void;
  onOpenStudentModal: (mode: StudentModalMode) => void;
  onDeleteStudent: (student: StudentRecord) => void;
}

function TodayStatusCell({ status }: { status: string }) {
  const lower = status.toLowerCase();
  if (lower === 'present') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        Present
      </span>
    );
  }
  if (lower === 'late') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
        <Clock className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        Late
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
      <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
      Absent
    </span>
  );
}

export function StudentsView({
  students,
  pendingAccounts,
  attendance,
  loading,
  onInspectStudentHistory,
  onOpenStudentModal,
  onDeleteStudent,
}: StudentsViewProps) {
  const [query, setQuery] = useState('');
  const [rfidFilter, setRfidFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const todayISO = getISTTodayISO();

  const { countByKey, todayStatusByKey } = useMemo(() => {
    const counts = new Map<string, Set<string>>();
    const todayStatus = new Map<string, string>();

    for (const rec of attendance) {
      if (rec.isVirtualAbsent) continue;
      const keys = new Set<string>();
      if (rec.rfidUid && rec.rfidUid !== '—' && rec.rfidUid !== 'Unmatched') {
        keys.add(normalizeRfidKey(rec.rfidUid));
      }
      if (rec.studentKey) keys.add(rec.studentKey.toLowerCase());
      if (rec.email) keys.add(rec.email.toLowerCase());

      if (rec.dateISO === todayISO) {
        for (const k of keys) {
          if (!todayStatus.has(k) || rec.status.toLowerCase() !== 'absent') {
            todayStatus.set(k, rec.status);
          }
        }
      }

      if (rec.status.toLowerCase() !== 'absent') {
        for (const k of keys) {
          const daySet = counts.get(k) ?? new Set<string>();
          daySet.add(rec.dateISO);
          counts.set(k, daySet);
        }
      }
    }

    return { countByKey: counts, todayStatusByKey: todayStatus };
  }, [attendance, todayISO]);

  const filtered = useMemo(() => {
    let list = students;
    if (rfidFilter === 'assigned') {
      list = list.filter((s) => s.rfidAssigned && Boolean(s.rfidUid));
    } else if (rfidFilter === 'unassigned') {
      list = list.filter((s) => !s.rfidAssigned || !s.rfidUid);
    }

    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.rollNumber.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.rfidUid.toLowerCase().includes(q) ||
        (s.authUid && s.authUid.toLowerCase().includes(q))
    );
  }, [students, query, rfidFilter]);

  const getStudentKeys = (s: StudentRecord) => {
    const keys: string[] = [];
    if (s.rfidUid) keys.push(normalizeRfidKey(s.rfidUid));
    if (s.authUid) keys.push(s.authUid.toLowerCase());
    if (s.id) keys.push(s.id.toLowerCase());
    if (s.email && s.email !== '—') keys.push(s.email.toLowerCase());
    return keys;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Registered Students
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Confirmed students linked to Firebase Authentication accounts and physical RFID cards.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, roll, email, UID..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
            />
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            {[
              { id: 'all', label: 'All' },
              { id: 'assigned', label: 'RFID Assigned' },
              { id: 'unassigned', label: 'No RFID' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRfidFilter(tab.id as 'all' | 'assigned' | 'unassigned')}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  rfidFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onOpenStudentModal({ kind: 'add' })}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-700 whitespace-nowrap"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add Student
          </button>
        </div>
      </div>

      {/* 8-Column Registered Students Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                <th className="px-4 py-3">Student Name</th>
                <th className="px-4 py-3">Roll Number</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Firebase Auth UID</th>
                <th className="px-4 py-3">RFID Card UID</th>
                <th className="px-4 py-3">Today&apos;s Attendance</th>
                <th className="px-4 py-3">Days Present</th>
                <th className="px-4 py-3 text-right">Attendance History &amp; Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3.5"><div className="h-4 w-36 rounded bg-slate-100" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-12 rounded bg-slate-100" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-40 rounded bg-slate-100" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-44 rounded bg-slate-100" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-24 rounded bg-slate-100" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-16 rounded bg-slate-100" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-10 rounded bg-slate-100" /></td>
                    <td className="px-4 py-3.5 text-right"><div className="ml-auto h-4 w-32 rounded bg-slate-100" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Users className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      No students matched
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {students.length === 0
                        ? 'No confirmed student profiles are currently loaded from Firebase Realtime Database.'
                        : 'Try clearing your search or filter criteria.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((student) => {
                  const keys = getStudentKeys(student);
                  const mergedDaySet = new Set<string>();
                  for (const k of keys) {
                    const ds = countByKey.get(k);
                    if (ds) ds.forEach((d) => mergedDaySet.add(d));
                  }
                  const daysPresent = mergedDaySet.size;

                  let status = 'Absent';
                  for (const k of keys) {
                    const s = todayStatusByKey.get(k);
                    if (s) {
                      status = s;
                      break;
                    }
                  }

                  return (
                    <tr key={student.rawPath} className="transition-colors hover:bg-sky-50/40">
                      <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                        {student.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                        {student.rollNumber}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">
                        {student.email !== '—' ? (
                          student.email
                        ) : (
                          <span className="text-slate-400">Not set in RTDB</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                        {student.authUid || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums whitespace-nowrap">
                        {student.rfidAssigned && student.rfidUid ? (
                          <span className="font-semibold text-slate-900">
                            {student.rfidUid}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenStudentModal({ kind: 'register_rfid', student })
                            }
                            className="inline-flex items-center gap-1 font-sans text-xs font-semibold text-sky-700 underline underline-offset-2 hover:text-sky-800"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            Register RFID Card
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <TodayStatusCell status={status} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                        {daysPresent}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onInspectStudentHistory(student)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-sky-700 transition-colors hover:border-sky-300 hover:bg-sky-50"
                          >
                            <History className="h-3.5 w-3.5" />
                            History
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenStudentModal({ kind: 'edit', student })}
                            aria-label={`Edit ${student.name}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteStudent(student)}
                            aria-label={`Delete ${student.name}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:border-red-200 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Student Registration Section */}
      {!loading && pendingAccounts.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3.5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Pending Student Registration ({pendingAccounts.length})
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Firebase Authentication accounts awaiting student name, roll number, and RFID card assignment. Not counted in confirmed student totals.
              </p>
            </div>
          </div>

          <div className="mt-3 divide-y divide-slate-100">
            {pendingAccounts.map((acct) => (
              <div
                key={acct.authUid}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                    <span>{acct.statusLabel}</span>
                    <span className="text-slate-300">·</span>
                    <span className="font-normal text-slate-700">{acct.email}</span>
                  </div>
                  <p className="font-mono text-xs text-slate-500">
                    Firebase Auth UID: {acct.authUid}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onOpenStudentModal({ kind: 'complete_pending', pending: acct })
                  }
                  className="inline-flex items-center gap-1.5 self-start rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2 text-xs font-semibold text-sky-800 transition-colors hover:bg-sky-100 sm:self-auto whitespace-nowrap"
                >
                  <UserCheck className="h-3.5 w-3.5 text-sky-600" />
                  Complete Registration
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
