import { useEffect, useMemo, useState } from 'react';
import {
  CalendarX2,
  CheckCircle2,
  Clock,
  Percent,
  Radio,
  Redo2,
  RefreshCw,
  Search,
  Trash2,
  Undo2,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';
import {
  AttendanceRecord,
  HistoryOperation,
  PersistentHistoryState,
  SortDirection,
  SortField,
  StudentRecord,
} from '../types/attendance';
import { normalizeRfidKey } from '../services/schemaInspector';
import { formatDateDDMMYYYY, getISTSnapshot } from '../utils/istDateTime';
import { AttendanceTable } from './AttendanceTable';

interface DashboardViewProps {
  students: StudentRecord[];
  attendance: AttendanceRecord[];
  loading: boolean;
  refreshing: boolean;
  historyState: PersistentHistoryState;
  undoing: boolean;
  redoing: boolean;
  onRefresh: () => void;
  onEditRecord: (record: AttendanceRecord) => void;
  onDeleteRecord: (record: AttendanceRecord) => void;
  onDeleteToday: () => void;
  onOpenDeleteByDate: () => void;
  onOpenRfidScan: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function DashboardView({
  students,
  attendance,
  loading,
  refreshing,
  historyState,
  undoing,
  redoing,
  onRefresh,
  onEditRecord,
  onDeleteRecord,
  onDeleteToday,
  onOpenDeleteByDate,
  onOpenRfidScan,
  onUndo,
  onRedo,
}: DashboardViewProps) {
  const [clock, setClock] = useState(() => getISTSnapshot());

  // Filters & sorting
  const [nameQuery, setNameQuery] = useState('');
  const [rollQuery, setRollQuery] = useState('');
  const [dateFilter, setDateFilter] = useState(() => getISTSnapshot().dateISO);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<SortField>('checkInTime24');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(getISTSnapshot());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const todayISO = clock.dateISO;

  // Today's metrics in IST
  const todayStats = useMemo(() => {
    const todaysRecords = attendance.filter(
      (r) => !r.isVirtualAbsent && r.dateISO === todayISO
    );

    const presentKeys = new Set<string>();
    const explicitAbsentKeys = new Set<string>();

    const recordMatchKey = (r: AttendanceRecord) => {
      if (r.rfidUid && r.rfidUid !== '—' && r.rfidUid !== 'Unmatched') {
        return normalizeRfidKey(r.rfidUid);
      }
      return r.studentKey.toLowerCase();
    };

    for (const r of todaysRecords) {
      const key = recordMatchKey(r);
      const s = r.status.toLowerCase();
      if (s === 'absent') {
        explicitAbsentKeys.add(key);
      } else {
        presentKeys.add(key);
      }
    }

    const confirmedStudents = students.filter((s) => !s.isPendingRegistration);

    const totalStudents =
      confirmedStudents.length > 0
        ? confirmedStudents.length
        : new Set(
            attendance
              .filter((r) => !r.isVirtualAbsent)
              .map(recordMatchKey)
          ).size;

    const presentCount = presentKeys.size;
    const absentCount =
      confirmedStudents.length > 0
        ? Math.max(0, totalStudents - presentCount)
        : explicitAbsentKeys.size;

    const percentage =
      totalStudents > 0 ? Math.min(100, Math.round((presentCount / totalStudents) * 1000) / 10) : 0;

    return {
      totalStudents,
      presentCount,
      absentCount,
      percentage,
      todaysRecordCount: todaysRecords.length,
    };
  }, [attendance, students, todayISO]);

  // Build table rows (including unrecorded registered students when viewing Absent for a specific date)
  const displayedRecords = useMemo(() => {
    let base: AttendanceRecord[] = attendance.filter((r) => !r.isVirtualAbsent);

    if (dateFilter) {
      base = base.filter((r) => r.dateISO === dateFilter);
    }

    if (statusFilter === 'Absent' && dateFilter && students.length > 0) {
      const recordedKeys = new Set<string>();
      for (const r of base) {
        if (r.rfidUid && r.rfidUid !== '—' && r.rfidUid !== 'Unmatched') {
          recordedKeys.add(normalizeRfidKey(r.rfidUid));
        }
        if (r.studentKey) recordedKeys.add(r.studentKey.toLowerCase());
        if (r.email) recordedKeys.add(r.email.toLowerCase());
      }

      const unrecordedAbsent: AttendanceRecord[] = students
        .filter((s) => {
          if (s.isPendingRegistration) return false;
          const kRfid = s.rfidUid ? normalizeRfidKey(s.rfidUid) : '';
          const kAuth = s.authUid ? s.authUid.toLowerCase() : '';
          const kId = s.id.toLowerCase();
          const kEmail = s.email !== '—' ? s.email.toLowerCase() : '';
          return (
            (!kRfid || !recordedKeys.has(kRfid)) &&
            (!kAuth || !recordedKeys.has(kAuth)) &&
            !recordedKeys.has(kId) &&
            (!kEmail || !recordedKeys.has(kEmail))
          );
        })
        .map((s) => ({
          id: `virtual_absent_${dateFilter}_${s.id}`,
          rawPath: '',
          studentKey: s.id,
          studentName: s.name,
          rollNumber: s.rollNumber,
          email: s.email,
          rfidUid: s.rfidAssigned && s.rfidUid ? s.rfidUid : 'No RFID Assigned',
          dateISO: dateFilter,
          dateDisplay: formatDateDDMMYYYY(dateFilter),
          checkInTime24: '',
          checkInTimeDisplay: '—',
          timestampMs: 0,
          status: 'Absent',
          raw: null,
          isVirtualAbsent: true,
        }));

      base = [
        ...base.filter((r) => r.status.toLowerCase() === 'absent'),
        ...unrecordedAbsent,
      ];
    } else if (statusFilter !== 'ALL') {
      base = base.filter(
        (r) => r.status.toLowerCase() === statusFilter.toLowerCase()
      );
    }

    const nq = nameQuery.trim().toLowerCase();
    if (nq) {
      base = base.filter(
        (r) =>
          r.studentName.toLowerCase().includes(nq) ||
          r.rfidUid.toLowerCase().includes(nq)
      );
    }

    const rq = rollQuery.trim().toLowerCase();
    if (rq) {
      base = base.filter((r) => r.rollNumber.toLowerCase().includes(rq));
    }

    return [...base].sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      const valA = a[sortField] ?? '';
      const valB = b[sortField] ?? '';
      if (valA < valB) return -1 * dir;
      if (valA > valB) return 1 * dir;
      return 0;
    });
  }, [
    attendance,
    students,
    dateFilter,
    statusFilter,
    nameQuery,
    rollQuery,
    sortField,
    sortDirection,
  ]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'dateISO' || field === 'checkInTime24' ? 'desc' : 'asc');
    }
  };

  const canUndo =
    historyState.operations.length > 0 && historyState.cursor >= 0;
  const canRedo =
    historyState.operations.length > 0 &&
    historyState.cursor < historyState.operations.length - 1;

  const nextUndoOp: HistoryOperation | undefined = canUndo
    ? historyState.operations[historyState.cursor]
    : undefined;
  const nextRedoOp: HistoryOperation | undefined = canRedo
    ? historyState.operations[historyState.cursor + 1]
    : undefined;

  const resetFilters = () => {
    setNameQuery('');
    setRollQuery('');
    setDateFilter(todayISO);
    setStatusFilter('ALL');
  };

  return (
    <div className="space-y-6">
      {/* Header & Live IST Clock */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Attendance Dashboard
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-slate-500">
            <span>{clock.weekday}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums font-medium text-slate-700">
              {clock.dateDisplay}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums font-semibold text-sky-700">
              <Clock className="h-3.5 w-3.5 text-sky-500" />
              {clock.time12} IST
            </span>
          </div>
        </div>

        {/* Action Toolbar: Undo / Redo / Refresh / Delete Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canUndo || undoing || redoing}
            onClick={onUndo}
            title={nextUndoOp ? `Undo: ${nextUndoOp.label}` : 'Nothing to undo'}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
          >
            <Undo2 className="h-3.5 w-3.5 text-slate-500" />
            {undoing ? 'Undoing...' : 'Undo'}
          </button>

          <button
            type="button"
            disabled={!canRedo || undoing || redoing}
            onClick={onRedo}
            title={nextRedoOp ? `Redo: ${nextRedoOp.label}` : 'Nothing to redo'}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
          >
            <Redo2 className="h-3.5 w-3.5 text-slate-500" />
            {redoing ? 'Redoing...' : 'Redo'}
          </button>

          <button
            type="button"
            disabled={refreshing}
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-60 whitespace-nowrap"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-sky-600' : 'text-slate-500'}`} />
            Refresh
          </button>

          <button
            type="button"
            onClick={onOpenRfidScan}
            className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 transition-colors hover:bg-sky-100 whitespace-nowrap"
          >
            <Radio className="h-3.5 w-3.5 text-sky-600" />
            Record RFID Scan
          </button>

          <button
            type="button"
            onClick={onOpenDeleteByDate}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 whitespace-nowrap"
          >
            <CalendarX2 className="h-3.5 w-3.5" />
            Delete by Date
          </button>

          <button
            type="button"
            onClick={onDeleteToday}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-bold tracking-wide text-white shadow-xs transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 whitespace-nowrap"
          >
            <Trash2 className="h-3.5 w-3.5" />
            DELETE TODAY&apos;S ATTENDANCE
          </button>
        </div>
      </div>

      {/* Subtle Undo/Redo Context Line (if available) */}
      {(nextUndoOp || nextRedoOp) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-2 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {nextUndoOp && (
              <span>
                Last saved action: <strong className="text-slate-800">{nextUndoOp.label}</strong>
              </span>
            )}
            {nextRedoOp && (
              <span>
                Available to redo: <strong className="text-sky-700">{nextRedoOp.label}</strong>
              </span>
            )}
          </div>
          <span className="font-mono tabular-nums text-slate-500">
            History synced in Firebase ({historyState.cursor + 1}/{historyState.operations.length})
          </span>
        </div>
      )}

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Registered Students</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold tracking-tight font-mono tabular-nums text-slate-900">
            {loading ? '—' : todayStats.totalStudents}
          </p>
          <p className="mt-1 text-xs text-slate-500">Confirmed student profiles</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Present Today</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold tracking-tight font-mono tabular-nums text-slate-900">
            {loading ? '—' : todayStats.presentCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Checked in on {clock.dateDisplay}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Absent Today</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <UserX className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold tracking-tight font-mono tabular-nums text-slate-900">
            {loading ? '—' : todayStats.absentCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">No check-in today</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Attendance Rate</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <Percent className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold tracking-tight font-mono tabular-nums text-slate-900">
            {loading ? '—' : `${todayStats.percentage.toFixed(1)}%`}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-sky-400 transition-all duration-300"
              style={{ width: `${todayStats.percentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
          {/* Search by Name */}
          <div className="relative xl:col-span-3">
            <label htmlFor="search-name" className="sr-only">
              Search by student name
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="search-name"
              type="search"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder="Search student name or UID..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
            />
          </div>

          {/* Search by Roll Number */}
          <div className="relative xl:col-span-2">
            <label htmlFor="search-roll" className="sr-only">
              Search by roll number
            </label>
            <input
              id="search-roll"
              type="search"
              value={rollQuery}
              onChange={(e) => setRollQuery(e.target.value)}
              placeholder="Roll number..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
            />
          </div>

          {/* Filter by Date */}
          <div className="flex items-center gap-2 xl:col-span-3">
            <input
              type="date"
              aria-label="Filter by date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
            />
            <button
              type="button"
              onClick={() => setDateFilter(dateFilter === todayISO ? '' : todayISO)}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                dateFilter === ''
                  ? 'border-sky-500 bg-sky-50 text-sky-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {dateFilter === '' ? 'All Dates' : 'Show All'}
            </button>
          </div>

          {/* Filter by Status */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 xl:col-span-4 overflow-x-auto">
            {['ALL', 'Present', 'Late', 'Absent'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'ALL' ? 'All Status' : st}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-sky-500" />
            <span>
              Showing <strong className="font-mono tabular-nums text-slate-800">{displayedRecords.length}</strong>{' '}
              {displayedRecords.length === 1 ? 'record' : 'records'}
              {dateFilter ? ` for ${formatDateDDMMYYYY(dateFilter)}` : ' across all dates'}
            </span>
            {dateFilter && displayedRecords.length === 0 && attendance.length > 0 && (
              <button
                type="button"
                onClick={() => setDateFilter('')}
                className="ml-1 font-semibold text-sky-700 underline underline-offset-2 hover:text-sky-800"
              >
                View all {attendance.length} records
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="sort-select" className="text-slate-500">
              Sort:
            </label>
            <select
              id="sort-select"
              value={`${sortField}:${sortDirection}`}
              onChange={(e) => {
                const [f, d] = e.target.value.split(':') as [SortField, SortDirection];
                setSortField(f);
                setSortDirection(d);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:border-sky-400 focus:outline-none"
            >
              <option value="checkInTime24:desc">Check-in Time (Latest)</option>
              <option value="checkInTime24:asc">Check-in Time (Earliest)</option>
              <option value="dateISO:desc">Date (Newest)</option>
              <option value="dateISO:asc">Date (Oldest)</option>
              <option value="studentName:asc">Student Name (A–Z)</option>
              <option value="rollNumber:asc">Roll Number (Asc)</option>
              <option value="status:asc">Status</option>
            </select>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <AttendanceTable
        records={displayedRecords}
        loading={loading}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        onEdit={onEditRecord}
        onDelete={onDeleteRecord}
        onResetFilters={
          nameQuery || rollQuery || statusFilter !== 'ALL' || dateFilter !== todayISO
            ? resetFilters
            : undefined
        }
      />
    </div>
  );
}
