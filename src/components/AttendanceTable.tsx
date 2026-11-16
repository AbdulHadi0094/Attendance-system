import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  MinusCircle,
  Pencil,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  AttendanceRecord,
  SortDirection,
  SortField,
} from '../types/attendance';

interface AttendanceTableProps {
  records: AttendanceRecord[];
  loading: boolean;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  onEdit: (record: AttendanceRecord) => void;
  onDelete: (record: AttendanceRecord) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  onResetFilters?: () => void;
}

function StatusCell({ status }: { status: string }) {
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
  if (lower === 'absent') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
        <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
        Absent
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
      <MinusCircle className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      {status}
    </span>
  );
}

export function AttendanceTable({
  records,
  loading,
  sortField,
  sortDirection,
  onSort,
  onEdit,
  onDelete,
  emptyTitle = 'No attendance records found',
  emptyDescription = 'Adjust your search or date filters, or wait for new RFID card scans from the reader.',
  onResetFilters,
}: AttendanceTableProps) {
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-sky-600" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-sky-600" />
    );
  };

  const columns: { label: string; field?: SortField; align?: 'left' | 'right' }[] = [
    { label: 'Student Name', field: 'studentName' },
    { label: 'Roll Number', field: 'rollNumber' },
    { label: 'RFID UID', field: 'rfidUid' },
    { label: 'Date', field: 'dateISO' },
    { label: 'Check-in Time', field: 'checkInTime24' },
    { label: 'Attendance Status', field: 'status' },
    { label: 'Actions', align: 'right' },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              {columns.map((col) => (
                <th
                  key={col.label}
                  scope="col"
                  className={`px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.field ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.field!)}
                      className="inline-flex items-center gap-1.5 rounded-md py-0.5 text-xs font-semibold text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                      <span>{col.label}</span>
                      {renderSortIcon(col.field)}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-sm">
            {loading ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  <td className="px-4 py-3.5">
                    <div className="h-4 w-36 rounded bg-slate-100" />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="h-4 w-20 rounded bg-slate-100" />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="h-4 w-24 rounded bg-slate-100" />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="h-4 w-24 rounded bg-slate-100" />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="h-4 w-24 rounded bg-slate-100" />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="h-4 w-16 rounded bg-slate-100" />
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="ml-auto h-4 w-16 rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center">
                  <p className="text-sm font-semibold text-slate-900">{emptyTitle}</p>
                  <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                    {emptyDescription}
                  </p>
                  {onResetFilters && (
                    <button
                      type="button"
                      onClick={onResetFilters}
                      className="mt-4 inline-flex items-center rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      Clear Filters
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              records.map((rec) => (
                <tr
                  key={`${rec.rawPath}_${rec.id}`}
                  className="transition-colors hover:bg-sky-50/40"
                >
                  <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                    {rec.studentName}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                    {rec.rollNumber}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
                    {rec.rfidUid}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                    {rec.dateDisplay}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                    {rec.checkInTimeDisplay}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusCell status={rec.status} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {rec.isVirtualAbsent ? (
                      <span className="text-xs text-slate-400">No scan entry</span>
                    ) : (
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onEdit(rec)}
                          aria-label={`Edit attendance for ${rec.studentName}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(rec)}
                          aria-label={`Delete attendance for ${rec.studentName}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:border-red-200 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
