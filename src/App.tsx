import { useCallback, useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { AlertTriangle, Loader2, Menu, Radio } from 'lucide-react';
import {
  auth,
  AUTHORIZED_ADMIN_UIDS,
  googleProvider,
  isSuperAdminUid,
} from './firebase/config';
import {
  deleteAttendanceByDate,
  deleteSingleAttendanceRecord,
  deleteStudentProfile,
  editAttendanceRecord,
  forceRefreshDatabase,
  getTodaysRecordsCount,
  performRedoOperation,
  performUndoOperation,
  recordRfidAttendanceScan,
  saveStudentProfile,
  subscribeToDatabase,
  subscribeToPersistentHistory,
  syncConfirmedStudentsToDatabase,
} from './services/attendanceService';
import {
  AttendanceRecord,
  DetectedSchema,
  NavTab,
  PendingStudentAccount,
  PersistentHistoryState,
  StudentRecord,
  ToastMessage,
} from './types/attendance';
import { formatDateDDMMYYYY, getISTTodayISO } from './utils/istDateTime';
import { ConfirmModal } from './components/ConfirmModal';
import { DashboardView } from './components/DashboardView';
import { DeleteByDateModal } from './components/DeleteByDateModal';
import { EditAttendanceModal } from './components/EditAttendanceModal';
import { HistoryView } from './components/HistoryView';
import { LoginView } from './components/LoginView';
import { RfidScanModal } from './components/RfidScanModal';
import { Sidebar } from './components/Sidebar';
import { StudentFormModal, StudentModalMode } from './components/StudentFormModal';
import { StudentsView } from './components/StudentsView';
import { SuperAdminRulesModal } from './components/SuperAdminRulesModal';
import { ToastContainer } from './components/ToastContainer';

function getFriendlyFirebaseError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: string }).code)
      : '';
  const msg = err instanceof Error ? err.message : String(err);

  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Invalid email or password. Please verify your administrator credentials.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many failed sign-in attempts. Please wait a moment and try again.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Google sign-in window was closed before completion.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'This sign-in provider is not enabled in your Firebase project.';
  }
  if (msg.toLowerCase().includes('permission_denied') || msg.toLowerCase().includes('permission denied')) {
    return 'Permission denied by Firebase Database Security Rules.';
  }
  return msg || 'An unexpected Firebase error occurred.';
}

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [dbLoading, setDbLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [schema, setSchema] = useState<DetectedSchema | null>(null);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [pendingAccounts, setPendingAccounts] = useState<PendingStudentAccount[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);

  const [historyState, setHistoryState] = useState<PersistentHistoryState>({
    operations: [],
    cursor: -1,
  });

  const syncedAdminUidRef = useRef<string | null>(null);

  // Modals & action states
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [studentModalMode, setStudentModalMode] = useState<StudentModalMode | null>(null);
  const [savingStudent, setSavingStudent] = useState(false);
  const [deletingStudent, setDeletingStudent] = useState<StudentRecord | null>(null);

  const [rfidScanModalOpen, setRfidScanModalOpen] = useState(false);
  const [submittingRfidScan, setSubmittingRfidScan] = useState(false);

  const [deletingSingle, setDeletingSingle] = useState<AttendanceRecord | null>(null);
  const [confirmDeleteTodayOpen, setConfirmDeleteTodayOpen] = useState(false);
  const [deleteByDateModalOpen, setDeleteByDateModalOpen] = useState(false);
  const [pendingDateDelete, setPendingDateDelete] = useState<{
    dateISO: string;
    records: AttendanceRecord[];
  } | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const [undoing, setUndoing] = useState(false);
  const [redoing, setRedoing] = useState(false);

  const [historyStudentPreselect, setHistoryStudentPreselect] =
    useState<StudentRecord | null>(null);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback(
    (type: ToastMessage['type'], title: string, detail?: string) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, type, title, detail }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const isSuperAdmin = isSuperAdminUid(user?.uid);
  const isAuthorizedAdmin = Boolean(
    user && (isSuperAdmin || AUTHORIZED_ADMIN_UIDS.has(user.uid))
  );

  // Real-time Firebase RTDB & Persistent History listeners
  useEffect(() => {
    if (!user || !isAuthorizedAdmin) {
      setDbLoading(false);
      return;
    }

    let active = true;
    let unsubDb = () => {};
    setDbLoading(true);
    setDbError(null);

    const authSnapshot = { uid: user.uid, email: user.email };

    if (syncedAdminUidRef.current !== user.uid) {
      syncedAdminUidRef.current = user.uid;
      syncConfirmedStudentsToDatabase(authSnapshot)
        .then((res) => {
          if (!active) return;
          if (res.created > 0 || res.updated > 0) {
            addToast(
              'success',
              'Confirmed Students Synced',
              `${res.created} added, ${res.updated} updated in /students.`
            );
          }
        })
        .catch((err) => {
          if (!active) return;
          addToast('error', 'Student Profile Sync Notice', getFriendlyFirebaseError(err));
        });
    }

    subscribeToDatabase(
      (payload) => {
        if (!active) return;
        setSchema(payload.schema);
        setStudents(payload.students);
        setPendingAccounts(payload.pendingAccounts);
        setAttendance(payload.attendance);
        setDbLoading(false);
        setDbError(null);
      },
      (err) => {
        if (!active) return;
        setDbLoading(false);
        setDbError(getFriendlyFirebaseError(err));
      },
      authSnapshot
    ).then((sub) => {
      if (!active) {
        sub.unsubscribe();
      } else {
        unsubDb = sub.unsubscribe;
      }
    });

    const unsubHistory = subscribeToPersistentHistory(
      user.uid,
      (state) => {
        if (!active) return;
        setHistoryState(state);
      },
      (err) => {
        if (!active) return;
        addToast('error', 'Undo/Redo History Sync Notice', getFriendlyFirebaseError(err));
      }
    );

    return () => {
      active = false;
      unsubDb();
      unsubHistory();
    };
  }, [user, isAuthorizedAdmin, addToast]);

  const handleEmailSignIn = async (email: string, password: string) => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setAuthError(getFriendlyFirebaseError(err));
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(getFriendlyFirebaseError(err));
    }
  };

  const handleSignOut = async () => {
    syncedAdminUidRef.current = null;
    await signOut(auth);
    setSchema(null);
    setStudents([]);
    setPendingAccounts([]);
    setAttendance([]);
    setHistoryState({ operations: [], cursor: -1 });
    setAuthError(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const payload = await forceRefreshDatabase(
        user ? { uid: user.uid, email: user.email } : null
      );
      setSchema(payload.schema);
      setStudents(payload.students);
      setPendingAccounts(payload.pendingAccounts);
      setAttendance(payload.attendance);
      setDbError(null);
      addToast('success', 'Database Refreshed', 'Latest records synced from Firebase.');
    } catch (err) {
      const msg = getFriendlyFirebaseError(err);
      setDbError(msg);
      addToast('error', 'Refresh Failed', msg);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveEdit = async (payload: {
    record: AttendanceRecord;
    newDateISO: string;
    newTime24: string;
    newStatus: string;
  }) => {
    if (!user || !schema) return;
    setSavingEdit(true);
    try {
      await editAttendanceRecord({
        ...payload,
        schema,
        adminUid: user.uid,
        adminEmail: user.email || user.uid,
      });
      setEditingRecord(null);
      addToast(
        'success',
        'Attendance Updated',
        `${payload.record.studentName} updated for ${formatDateDDMMYYYY(payload.newDateISO)}.`
      );
    } catch (err) {
      addToast('error', 'Failed to Save Changes', getFriendlyFirebaseError(err));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveStudent = async (payload: {
    existingStudent?: StudentRecord | null;
    name: string;
    rollNumber: string;
    email: string;
    authUid: string;
    rfidUid: string;
  }) => {
    setSavingStudent(true);
    try {
      await saveStudentProfile({
        ...payload,
        allStudents: students,
      });
      setStudentModalMode(null);
      addToast(
        'success',
        payload.existingStudent ? 'Student Updated' : 'Student Registered',
        `${payload.name} (Roll ${payload.rollNumber}) saved to /students.`
      );
    } catch (err) {
      const friendly = getFriendlyFirebaseError(err);
      addToast('error', 'Student Save Failed', friendly);
      throw new Error(friendly);
    } finally {
      setSavingStudent(false);
    }
  };

  const handleConfirmDeleteStudent = async () => {
    if (!deletingStudent) return;
    setDeletingBusy(true);
    try {
      await deleteStudentProfile(deletingStudent);
      addToast(
        'success',
        'Student Removed',
        `${deletingStudent.name} was removed from /students.`
      );
      setDeletingStudent(null);
    } catch (err) {
      addToast('error', 'Delete Student Failed', getFriendlyFirebaseError(err));
    } finally {
      setDeletingBusy(false);
    }
  };

  const handleRfidScanSubmit = async (rawRfidUid: string) => {
    setSubmittingRfidScan(true);
    try {
      const result = await recordRfidAttendanceScan({
        rawRfidInput: rawRfidUid,
        students,
        existingAttendance: attendance,
        schema,
      });
      addToast(
        'success',
        'RFID Attendance Recorded',
        `${result.student.name} (Roll ${result.student.rollNumber}) marked Present on ${result.dateDisplay} at ${result.timeDisplay}.`
      );
    } catch (err) {
      const friendly = getFriendlyFirebaseError(err);
      addToast('error', 'RFID Scan Notice', friendly);
      throw new Error(friendly);
    } finally {
      setSubmittingRfidScan(false);
    }
  };

  const handleConfirmDeleteSingle = async () => {
    if (!deletingSingle || !user) return;
    setDeletingBusy(true);
    try {
      await deleteSingleAttendanceRecord({
        record: deletingSingle,
        adminUid: user.uid,
        adminEmail: user.email || user.uid,
      });
      addToast(
        'success',
        'Record Deleted',
        `Removed ${deletingSingle.studentName} (${deletingSingle.dateDisplay}). You can restore it anytime with Undo.`
      );
      setDeletingSingle(null);
    } catch (err) {
      addToast('error', 'Delete Failed', getFriendlyFirebaseError(err));
    } finally {
      setDeletingBusy(false);
    }
  };

  const todayISO = getISTTodayISO();
  const todaysCount = getTodaysRecordsCount(attendance);

  const handleConfirmDeleteToday = async () => {
    if (!user) return;
    setDeletingBusy(true);
    try {
      const deletedCount = await deleteAttendanceByDate({
        dateISO: todayISO,
        recordsForDate: attendance,
        isToday: true,
        adminUid: user.uid,
        adminEmail: user.email || user.uid,
      });
      setConfirmDeleteTodayOpen(false);
      if (deletedCount === 0) {
        addToast('info', 'No Records Found', `No attendance records exist for ${formatDateDDMMYYYY(todayISO)}.`);
      } else {
        addToast(
          'success',
          "Today's Attendance Deleted",
          `Deleted ${deletedCount} ${deletedCount === 1 ? 'record' : 'records'} for ${formatDateDDMMYYYY(todayISO)}. Previous days were untouched.`
        );
      }
    } catch (err) {
      addToast('error', "Failed to Delete Today's Attendance", getFriendlyFirebaseError(err));
    } finally {
      setDeletingBusy(false);
    }
  };

  const handleConfirmDeleteByDate = async (
    dateISO: string,
    matchingRecords: AttendanceRecord[]
  ) => {
    if (!user) return;
    setDeletingBusy(true);
    try {
      const deletedCount = await deleteAttendanceByDate({
        dateISO,
        recordsForDate: matchingRecords,
        isToday: dateISO === getISTTodayISO(),
        adminUid: user.uid,
        adminEmail: user.email || user.uid,
      });
      setDeleteByDateModalOpen(false);
      setPendingDateDelete(null);
      addToast(
        'success',
        'Date Attendance Deleted',
        `Deleted ${deletedCount} ${deletedCount === 1 ? 'record' : 'records'} for ${formatDateDDMMYYYY(dateISO)}.`
      );
    } catch (err) {
      addToast('error', 'Delete by Date Failed', getFriendlyFirebaseError(err));
    } finally {
      setDeletingBusy(false);
    }
  };

  const handleUndo = useCallback(async () => {
    if (!user || undoing || redoing) return;
    setUndoing(true);
    try {
      const op = await performUndoOperation(user.uid);
      addToast('success', 'Action Undone', `Restored: ${op.label}`);
    } catch (err) {
      addToast('error', 'Undo Failed', getFriendlyFirebaseError(err));
    } finally {
      setUndoing(false);
    }
  }, [user, undoing, redoing, addToast]);

  const handleRedo = useCallback(async () => {
    if (!user || undoing || redoing) return;
    setRedoing(true);
    try {
      const op = await performRedoOperation(user.uid);
      addToast('success', 'Action Redone', `Re-applied: ${op.label}`);
    } catch (err) {
      addToast('error', 'Redo Failed', getFriendlyFirebaseError(err));
    } finally {
      setRedoing(false);
    }
  }, [user, undoing, redoing, addToast]);

  // Keyboard shortcuts for Undo (Ctrl/Cmd+Z) and Redo (Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z)
  useEffect(() => {
    if (!isAuthorizedAdmin) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (historyState.cursor >= 0) {
          e.preventDefault();
          handleUndo();
        }
      } else if (
        e.key.toLowerCase() === 'y' ||
        (e.key.toLowerCase() === 'z' && e.shiftKey)
      ) {
        if (historyState.cursor < historyState.operations.length - 1) {
          e.preventDefault();
          handleRedo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAuthorizedAdmin, historyState, handleUndo, handleRedo]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-sky-500" />
          <p className="text-sm font-medium text-slate-600">
            Verifying administrator session...
          </p>
        </div>
      </div>
    );
  }

  if (!user || !isAuthorizedAdmin) {
    return (
      <>
        <LoginView
          unauthorizedUser={user && !isAuthorizedAdmin ? user : null}
          authError={authError}
          onEmailSignIn={handleEmailSignIn}
          onGoogleSignIn={handleGoogleSignIn}
          onSignOut={handleSignOut}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (tab !== 'history') setHistoryStudentPreselect(null);
          setActiveTab(tab);
        }}
        user={user}
        isSuperAdmin={isSuperAdmin}
        schema={schema}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onOpenRulesModal={() => setRulesModalOpen(true)}
        onSignOut={handleSignOut}
      />

      {/* Mobile Top Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 border border-sky-200 text-sky-600">
            <Radio className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold tracking-tight text-slate-900">
            RFID Attendance
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Main Content Viewport */}
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {dbError && (
            <div
              role="alert"
              className="mb-6 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-red-600" />
                <div>
                  <p className="font-semibold">Firebase Realtime Database Connection Error</p>
                  <p className="mt-0.5 text-xs text-red-700">{dbError}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => setRulesModalOpen(true)}
                    className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 whitespace-nowrap"
                  >
                    View RTDB Rules
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 whitespace-nowrap"
                >
                  Retry Connection
                </button>
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <DashboardView
              students={students}
              attendance={attendance}
              loading={dbLoading}
              refreshing={refreshing}
              historyState={historyState}
              undoing={undoing}
              redoing={redoing}
              onRefresh={handleRefresh}
              onEditRecord={setEditingRecord}
              onDeleteRecord={setDeletingSingle}
              onDeleteToday={() => setConfirmDeleteTodayOpen(true)}
              onOpenDeleteByDate={() => setDeleteByDateModalOpen(true)}
              onOpenRfidScan={() => setRfidScanModalOpen(true)}
              onUndo={handleUndo}
              onRedo={handleRedo}
            />
          )}

          {activeTab === 'history' && (
            <HistoryView
              students={students}
              attendance={attendance}
              loading={dbLoading}
              initialStudentFilter={historyStudentPreselect}
              onEditRecord={setEditingRecord}
              onDeleteRecord={setDeletingSingle}
              onDeleteSelectedDate={(dateISO, recs) =>
                setPendingDateDelete({ dateISO, records: recs })
              }
            />
          )}

          {activeTab === 'students' && (
            <StudentsView
              students={students}
              pendingAccounts={pendingAccounts}
              attendance={attendance}
              loading={dbLoading}
              onInspectStudentHistory={(student) => {
                setHistoryStudentPreselect(student);
                setActiveTab('history');
              }}
              onOpenStudentModal={setStudentModalMode}
              onDeleteStudent={setDeletingStudent}
            />
          )}
        </div>
      </main>

      {/* Modals */}
      <EditAttendanceModal
        record={editingRecord}
        saving={savingEdit}
        onClose={() => setEditingRecord(null)}
        onSave={handleSaveEdit}
      />

      <StudentFormModal
        mode={studentModalMode}
        saving={savingStudent}
        onClose={() => setStudentModalMode(null)}
        onSubmit={handleSaveStudent}
      />

      <RfidScanModal
        open={rfidScanModalOpen}
        submitting={submittingRfidScan}
        onClose={() => setRfidScanModalOpen(false)}
        onScanSubmit={handleRfidScanSubmit}
      />

      <ConfirmModal
        open={Boolean(deletingStudent)}
        title="Delete Student Profile"
        description={
          deletingStudent ? (
            <span>
              Remove{' '}
              <strong className="text-slate-900">{deletingStudent.name}</strong> (Roll{' '}
              <span className="font-mono">{deletingStudent.rollNumber}</span>) from{' '}
              <span className="font-mono">/students</span>? Past attendance logs will remain intact.
            </span>
          ) : null
        }
        confirmLabel="Delete Student"
        loading={deletingBusy}
        onConfirm={handleConfirmDeleteStudent}
        onCancel={() => setDeletingStudent(null)}
      />

      <ConfirmModal
        open={Boolean(deletingSingle)}
        title="Delete Attendance Record"
        description={
          deletingSingle ? (
            <span>
              Delete the attendance record for{' '}
              <strong className="text-slate-900">{deletingSingle.studentName}</strong> (Roll{' '}
              <span className="font-mono">{deletingSingle.rollNumber}</span>) on{' '}
              <span className="font-mono tabular-nums">{deletingSingle.dateDisplay}</span>? You can restore it anytime using Undo.
            </span>
          ) : null
        }
        confirmLabel="Delete Record"
        loading={deletingBusy}
        onConfirm={handleConfirmDeleteSingle}
        onCancel={() => setDeletingSingle(null)}
      />

      <ConfirmModal
        open={confirmDeleteTodayOpen}
        title="Delete Today's Attendance"
        description={
          todaysCount > 0 ? (
            <span>
              This will delete{' '}
              <strong className="font-mono tabular-nums text-red-600">
                {todaysCount}
              </strong>{' '}
              attendance {todaysCount === 1 ? 'record' : 'records'} recorded for today (
              <span className="font-mono tabular-nums">
                {formatDateDDMMYYYY(todayISO)}
              </span>
              ). Previous days&apos; records will never be affected, and you can undo this action later.
            </span>
          ) : (
            <span>
              There are currently <strong className="font-mono">0</strong> attendance records for today (
              <span className="font-mono tabular-nums">
                {formatDateDDMMYYYY(todayISO)}
              </span>
              ).
            </span>
          )
        }
        confirmLabel={`Delete ${todaysCount} Today's Records`}
        loading={deletingBusy}
        disabled={todaysCount === 0}
        onConfirm={handleConfirmDeleteToday}
        onCancel={() => setConfirmDeleteTodayOpen(false)}
      />

      <DeleteByDateModal
        open={deleteByDateModalOpen}
        records={attendance}
        deleting={deletingBusy}
        onClose={() => setDeleteByDateModalOpen(false)}
        onConfirmDelete={handleConfirmDeleteByDate}
      />

      <ConfirmModal
        open={Boolean(pendingDateDelete)}
        title="Delete Selected Date Attendance"
        description={
          pendingDateDelete ? (
            <span>
              Delete all{' '}
              <strong className="font-mono tabular-nums text-red-600">
                {pendingDateDelete.records.length}
              </strong>{' '}
              attendance records for{' '}
              <span className="font-mono tabular-nums font-medium">
                {formatDateDDMMYYYY(pendingDateDelete.dateISO)}
              </span>
              ? Other dates remain untouched and you can restore them via Undo.
            </span>
          ) : null
        }
        confirmLabel={
          pendingDateDelete
            ? `Delete ${pendingDateDelete.records.length} Records`
            : 'Delete'
        }
        loading={deletingBusy}
        onConfirm={() =>
          pendingDateDelete
            ? handleConfirmDeleteByDate(
                pendingDateDelete.dateISO,
                pendingDateDelete.records
              )
            : Promise.resolve()
        }
        onCancel={() => setPendingDateDelete(null)}
      />

      <SuperAdminRulesModal
        open={rulesModalOpen}
        onClose={() => setRulesModalOpen(false)}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
