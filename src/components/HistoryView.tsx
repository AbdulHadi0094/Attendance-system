import { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Search,
  Trash2,
  User,
} from 'lucide-react';
import {
  AttendanceRecord,
  SortDirection,
  SortField,
  StudentRecord,
} from '../types/attendance';
import { normalizeRfidKey } from '../services/schemaInspector';
import {
  exportAttendanceToCSV,
  exportAttendanceToExcel,
} from '../utils/exportAttendance';
import { formatDateDDMMYYYY, getISTTodayISO } from '../utils/istDateTime';
import { AttendanceTable } from './AttendanceTable';

interface HistoryViewProps {
  students: StudentRecord[];
  attendance: AttendanceRecord[];
  loading: boolean;
  initialStudentFilter?: StudentRecord | null;
  onEditRecord: (record: AttendanceRecord) => void;
  onDeleteRecord: (record: AttendanceRecord) => void;
  onDeleteSelectedDate: (dateISO: string, matchingRecords: AttendanceRecord[]) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function HistoryView({
  students,
  attendance,
  loading,
  initialStudentFilter,
  onEditRecord,
  onDeleteRecord,
  onDeleteSelectedDate,
}: HistoryViewProps) {
  const todayISO = getISTTodayISO();
  const [todayYear, todayMonth] = todayISO.split('-').map(Number);

  const [viewMode, setViewMode] = useState<'date' | 'student'>(
    initialStudentFilter ? 'student' : 'date'
  );
  const [selectedDateISO, setSelectedDateISO] = useState<string>(todayISO);
  const [calYear, setCalYear] = useState<number>(todayYear);
  const [calMonth, setCalMonth] = useState<number>(todayMonth - 1); // 0-indexed

  const [studentSearch, setStudentSearch] = useState<string>(
    initialStudentFilter ? initialStudentFilter.name : ''
  );
  const [selectedStudentKey, setSelectedStudentKey] = useState<string>(
    initialStudentFilter
      ? initialStudentFilter.rfidUid
        ? normalizeRfidKey(initialStudentFilter.rfidUid)
        : initialStudentFilter.id.toLowerCase()
      : ''
  );

  const [sortField, setSortField] = useState<SortField>('dateISO');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Map of dateISO -> record count for calendar indicators
  const countsByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of attendance) {
      if (r.isVirtualAbsent) continue;
      map.set(r.dateISO, (map.get(r.dateISO) ?? 0) + 1);
    }
    return map;
  }, [attendance]);

  // Unique list of recent dates with summaries
  const dailySummaries = useMemo(() => {
    const grouped = new Map<
      string,
      { dateISO: string; present: number; late: number; absent: number; totalRecords: number }
    >();

    for (const r of attendance) {
      if (r.isVirtualAbsent) continue;
      const entry = grouped.get(r.dateISO) ?? {
        dateISO: r.dateISO,
        present: 0,
        late: 0,
        absent: 0,
        totalRecords: 0,
      };
      entry.totalRecords += 1;
      const st = r.status.toLowerCase();
      if (st === 'late') entry.late += 1;
      else if (st === 'absent') entry.absent += 1;
      else entry.present += 1;
      grouped.set(r.dateISO, entry);
    }

    return Array.from(grouped.values()).sort((a, b) =>
      b.dateISO.localeCompare(a.dateISO)
    );
  }, [attendance]);

  // Calendar grid cells
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells: { day: number | null; dateISO: string | null }[] = [];

    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push({ day: null, dateISO: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const mStr = String(calMonth + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      cells.push({ day: d, dateISO: `${calYear}-${mStr}-${dStr}` });
    }
    return cells;
  }, [calYear, calMonth]);

  const monthLabel = new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(calYear, calMonth, 1));

  const shiftMonth = (delta: number) => {
    const next = new Date(calYear, calMonth + delta, 1);
    setCalYear(next.getFullYear());
    setCalMonth(next.getMonth());
  };

  // Filtered student options for Individual Student History
  const studentOptions = useMemo(() => {
    if (students.length > 0) return students;
    // Derive unique students from attendance if /students is empty
    const map = new Map<string, StudentRecord>();
    for (const r of attendance) {
      const k =
        r.rfidUid && r.rfidUid !== '—' && r.rfidUid !== 'Unmatched'
          ? normalizeRfidKey(r.rfidUid)
          : r.studentKey.toLowerCase();
      if (!map.has(k)) {
        map.set(k, {
          id: r.studentKey,
          rawPath: '',
          name: r.studentName,
          rollNumber: r.rollNumber,
          email: r.email || '—',
          rfidUid: r.rfidUid !== 'Unmatched' ? r.rfidUid : '',
          rfidAssigned: Boolean(r.rfidUid && r.rfidUid !== '—' && r.rfidUid !== 'Unmatched'),
          raw: {},
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [students, attendance]);

  const matchingStudentOptions = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return studentOptions;
    return studentOptions.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.rollNumber.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.rfidUid.toLowerCase().includes(q)
    );
  }, [studentOptions, studentSearch]);

  // Active table records based on mode
  const selectedStudentObj = useMemo(() => {
    if (!selectedStudentKey) return null;
    return (
      studentOptions.find((s) => {
        const key = s.rfidUid ? normalizeRfidKey(s.rfidUid) : s.id.toLowerCase();
        return key === selectedStudentKey || s.id.toLowerCase() === selectedStudentKey;
      }) ?? null
    );
  }, [studentOptions, selectedStudentKey]);

  const activeRecords = useMemo(() => {
    let list = attendance.filter((r) => !r.isVirtualAbsent);

    if (viewMode === 'date') {
      list = list.filter((r) => r.dateISO === selectedDateISO);
    } else if (selectedStudentKey) {
      list = list.filter((r) => {
        const uidKey = r.rfidUid ? normalizeRfidKey(r.rfidUid) : '';
        const sKey = r.studentKey.toLowerCase();
        if (uidKey === selectedStudentKey || sKey === selectedStudentKey) return true;
        if (selectedStudentObj) {
          if (sKey === selectedStudentObj.id.toLowerCase()) return true;
          if (selectedStudentObj.authUid && sKey === selectedStudentObj.authUid.toLowerCase()) {
            return true;
          }
          if (
            selectedStudentObj.email !== '—' &&
            r.email &&
            r.email.toLowerCase() === selectedStudentObj.email.toLowerCase()
          ) {
            return true;
          }
        }
        return false;
      });
    } else if (studentSearch.trim()) {
      const q = studentSearch.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.studentName.toLowerCase().includes(q) ||
          r.rollNumber.toLowerCase().includes(q) ||
          r.rfidUid.toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      const valA = a[sortField] ?? '';
      const valB = b[sortField] ?? '';
      if (valA < valB) return -1 * dir;
      if (valA > valB) return 1 * dir;
      return 0;
    });
  }, [
    attendance,
    viewMode,
    selectedDateISO,
    selectedStudentKey,
    selectedStudentObj,
    studentSearch,
    sortField,
    sortDirection,
  ]);

  const selectedDateSummary = useMemo(() => {
    const dayRecords = attendance.filter(
      (r) => !r.isVirtualAbsent && r.dateISO === selectedDateISO
    );
    const present = dayRecords.filter(
      (r) => r.status.toLowerCase() !== 'absent'
    ).length;
    const explicitAbsent = dayRecords.filter(
      (r) => r.status.toLowerCase() === 'absent'
    ).length;
    const totalStudents = students.length > 0 ? students.length : dayRecords.length;
    const absent =
      students.length > 0 ? Math.max(0, totalStudents - present) : explicitAbsent;
    const rate =
      totalStudents > 0 ? Math.min(100, Math.round((present / totalStudents) * 1000) / 10) : 0;

    return {
      totalStudents,
      present,
      absent,
      rate,
      recordCount: dayRecords.length,
      dayRecords,
    };
  }, [attendance, students, selectedDateISO]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'dateISO' || field === 'checkInTime24' ? 'desc' : 'asc');
    }
  };

  const exportFileBase =
    viewMode === 'date'
      ? `attendance_${formatDateDDMMYYYY(selectedDateISO)}`
      : `student_attendance_history`;

  return (
    <div className="space-y-6">
      {/* Header & Mode Switch + Export */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Attendance History
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Inspect previous attendance dates, individual student histories, and export reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setViewMode('date')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                viewMode === 'date'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              By Calendar Date
            </button>
            <button
              type="button"
              onClick={() => setViewMode('student')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                viewMode === 'student'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              By Student
            </button>
          </div>

          <button
            type="button"
            disabled={activeRecords.length === 0}
            onClick={() => exportAttendanceToCSV(activeRecords, exportFileBase)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>

          <button
            type="button"
            disabled={activeRecords.length === 0}
            onClick={() =>
              exportAttendanceToExcel(
                activeRecords,
                exportFileBase,
                viewMode === 'date' ? formatDateDDMMYYYY(selectedDateISO) : 'Student History'
              )
            }
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export Excel
          </button>
        </div>
      </div>

      {viewMode === 'date' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Interactive Calendar + Daily Summary */}
          <div className="space-y-4 lg:col-span-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">{monthLabel}</h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    aria-label="Previous month"
                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCalYear(todayYear);
                      setCalMonth(todayMonth - 1);
                      setSelectedDateISO(todayISO);
                    }}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    aria-label="Next month"
                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="py-1">
                    {w}
                  </div>
                ))}
              </div>

              <div className="mt-1 grid grid-cols-7 gap-1">
                {calendarDays.map((cell, idx) => {
                  if (!cell.day || !cell.dateISO) {
                    return <div key={`empty_${idx}`} className="h-9" />;
                  }
                  const count = countsByDate.get(cell.dateISO) ?? 0;
                  const isSelected = cell.dateISO === selectedDateISO;
                  const isToday = cell.dateISO === todayISO;

                  return (
                    <button
                      key={cell.dateISO}
                      type="button"
                      onClick={() => setSelectedDateISO(cell.dateISO!)}
                      className={`relative flex h-9 flex-col items-center justify-center rounded-lg text-xs font-mono tabular-nums transition-colors ${
                        isSelected
                          ? 'bg-sky-600 font-semibold text-white'
                          : isToday
                          ? 'border border-sky-300 bg-sky-50 font-semibold text-sky-800'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span>{cell.day}</span>
                      {count > 0 && (
                        <span
                          className={`mt-0.5 h-1 w-1 rounded-full ${
                            isSelected ? 'bg-white' : 'bg-sky-500'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Daily Summary Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Daily Summary
                  </h3>
                  <p className="font-mono text-xs tabular-nums text-slate-500">
                    {formatDateDDMMYYYY(selectedDateISO)}
                  </p>
                </div>
                {selectedDateSummary.recordCount > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      onDeleteSelectedDate(
                        selectedDateISO,
                        selectedDateSummary.dayRecords
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Day
                  </button>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-slate-500">Present</span>
                  <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-emerald-700">
                    {selectedDateSummary.present}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Absent</span>
                  <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-red-600">
                    {selectedDateSummary.absent}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Total Records</span>
                  <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-slate-900">
                    {selectedDateSummary.recordCount}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Attendance Rate</span>
                  <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-sky-700">
                    {selectedDateSummary.rate.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>

            {/* Recent Dates Quick List */}
            {dailySummaries.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <h3 className="text-sm font-semibold text-slate-900">
                  Recorded Dates Summary
                </h3>
                <div className="mt-3 max-h-56 divide-y divide-slate-100 overflow-y-auto pr-1">
                  {dailySummaries.slice(0, 15).map((ds) => (
                    <button
                      key={ds.dateISO}
                      type="button"
                      onClick={() => {
                        setSelectedDateISO(ds.dateISO);
                        const [y, m] = ds.dateISO.split('-').map(Number);
                        setCalYear(y);
                        setCalMonth(m - 1);
                      }}
                      className={`flex w-full items-center justify-between py-2.5 text-left text-xs transition-colors hover:text-sky-700 ${
                        selectedDateISO === ds.dateISO
                          ? 'font-semibold text-sky-700'
                          : 'text-slate-700'
                      }`}
                    >
                      <span className="font-mono tabular-nums">
                        {formatDateDDMMYYYY(ds.dateISO)}
                      </span>
                      <span className="font-mono tabular-nums text-slate-500">
                        {ds.present} present · {ds.totalRecords} logs
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Records Table for Selected Date */}
          <div className="lg:col-span-8">
            <AttendanceTable
              records={activeRecords}
              loading={loading}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              onEdit={onEditRecord}
              onDelete={onDeleteRecord}
              emptyTitle={`No attendance logs on ${formatDateDDMMYYYY(selectedDateISO)}`}
              emptyDescription="Select a highlighted date on the calendar to inspect previous attendance records."
            />
          </div>
        </div>
      ) : (
        /* Individual Student History View */
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={studentSearch}
                  onChange={(e) => {
                    setStudentSearch(e.target.value);
                    setSelectedStudentKey('');
                  }}
                  placeholder="Search student by name, roll number, or RFID UID..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
              </div>

              <select
                aria-label="Select individual student"
                value={selectedStudentKey}
                onChange={(e) => setSelectedStudentKey(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
              >
                <option value="">All matching students ({activeRecords.length} records)</option>
                {matchingStudentOptions.map((s) => {
                  const key = s.rfidUid ? normalizeRfidKey(s.rfidUid) : s.id.toLowerCase();
                  return (
                    <option key={`${s.id}_${s.rawPath}`} value={key}>
                      {s.name} · Roll {s.rollNumber} ({s.rfidAssigned && s.rfidUid ? s.rfidUid : 'No RFID'})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <AttendanceTable
            records={activeRecords}
            loading={loading}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
            onEdit={onEditRecord}
            onDelete={onDeleteRecord}
            emptyTitle="No student attendance records found"
            emptyDescription="Select a student from the dropdown or enter a student name, roll number, or RFID UID."
          />
        </div>
      )}
    </div>
  );
}
