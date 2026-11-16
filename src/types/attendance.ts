export type AttendanceStatus = 'Present' | 'Late' | 'Absent' | 'Excused' | string;

export interface StudentRecord {
  id: string;
  rawPath: string;
  name: string;
  rollNumber: string;
  email: string;
  rfidUid: string; // Uppercase without spaces; empty string if not yet assigned
  authUid?: string;
  rfidAssigned: boolean;
  isPendingRegistration?: boolean;
  createdAt?: string | number;
  department?: string;
  raw: Record<string, unknown>;
}

export interface PendingStudentAccount {
  authUid: string;
  email: string;
  statusLabel: 'Pending Student Registration';
  existingPath?: string;
  existingName?: string;
  existingRollNumber?: string;
}

export interface AttendanceRecord {
  id: string;
  rawPath: string;
  studentKey: string;
  studentName: string;
  rollNumber: string;
  email?: string;
  rfidUid: string;
  dateISO: string; // YYYY-MM-DD in IST
  dateDisplay: string; // DD-MM-YYYY
  checkInTime24: string; // HH:mm:ss (24h normalized for sorting/editing)
  checkInTimeDisplay: string; // hh:mm:ss AM/PM
  timestampMs: number;
  status: AttendanceStatus;
  raw: unknown;
  isVirtualAbsent?: boolean;
  isUnmatchedRfid?: boolean;
}

export type AttendanceTopology = 'date_nested' | 'flat_list' | 'student_nested' | 'unknown';

export interface DetectedSchema {
  studentsPath: string | null;
  allStudentPaths: string[];
  attendancePath: string | null;
  allAttendancePaths: string[];
  topology: AttendanceTopology;
  dateKeyFormat: 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'YYYY_MM_DD';
  fieldMap: {
    nameKey: string;
    rollKey: string;
    uidKey: string;
    emailKey: string;
    dateKey: string;
    timeKey: string;
    statusKey: string;
    timestampKey: string;
  };
  topLevelKeys: string[];
  permissionDeniedPaths: string[];
  inspectedAt: number;
}

export interface UndoPathMutation {
  path: string;
  beforeValue: unknown; // null means node did not exist
  afterValue: unknown;  // null means node was deleted
}

export interface HistoryOperation {
  id: string;
  type: 'edit' | 'delete_single' | 'delete_today' | 'delete_by_date' | 'mark_attendance';
  label: string;
  recordCount: number;
  createdAtISO: string;
  createdAtDisplay: string;
  adminUid: string;
  adminEmail: string;
  mutations: UndoPathMutation[];
}

export interface PersistentHistoryState {
  operations: HistoryOperation[];
  cursor: number; // -1 means nothing applied / at start; 0..operations.length-1
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  detail?: string;
}

export type SortField = 'studentName' | 'rollNumber' | 'rfidUid' | 'dateISO' | 'checkInTime24' | 'status';
export type SortDirection = 'asc' | 'desc';

export type NavTab = 'dashboard' | 'history' | 'students';
