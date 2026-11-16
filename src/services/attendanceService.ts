import {
  get,
  onValue,
  push,
  ref,
  runTransaction,
  set,
  update,
  Unsubscribe,
} from 'firebase/database';
import {
  CONFIRMED_STUDENT_PROFILES,
  db,
  isEsp32DeviceUid,
  isFirebaseAuthUid,
  normalizeRfidUid,
} from '../firebase/config';
import {
  AttendanceRecord,
  DetectedSchema,
  HistoryOperation,
  PendingStudentAccount,
  PersistentHistoryState,
  StudentRecord,
  UndoPathMutation,
} from '../types/attendance';
import {
  combineISTDateAndTimeToMs,
  formatDateDDMMYYYY,
  formatDateWithFormat,
  formatTime12hFrom24,
  getISTSnapshot,
  getISTTodayISO,
} from '../utils/istDateTime';
import {
  inspectRootSnapshot,
  normalizeAttendanceFromSources,
  normalizeRfidKey,
  normalizeStudentsFromSources,
} from './schemaInspector';

const HISTORY_NODE_CANDIDATES = ['portal_history', 'attendance_portal_history'];
const MAX_HISTORY_OPERATIONS = 60;

function deepClone<T>(val: T): T {
  if (val === null || val === undefined) return null as T;
  return JSON.parse(JSON.stringify(val));
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export interface LiveDatabaseSubscription {
  unsubscribe: () => void;
}

export interface DatabaseSnapshotPayload {
  schema: DetectedSchema;
  students: StudentRecord[];
  pendingAccounts: PendingStudentAccount[];
  attendance: AttendanceRecord[];
}

const CANDIDATE_STUDENT_PATHS = [
  'students',
  'Students',
  'users',
  'Users',
  'student_profiles',
  'studentProfiles',
  'registered_students',
  'registeredStudents',
  'rfid_students',
  'rfidStudents',
  'cards',
  'rfid_cards',
  'rfidCards',
  'profiles',
  'members',
];

const CANDIDATE_ATTENDANCE_PATHS = [
  'attendance',
  'Attendance',
  'attendance_logs',
  'attendanceLogs',
  'attendance_records',
  'attendanceRecords',
  'rfid_attendance',
  'rfidAttendance',
  'rfid_logs',
  'rfidLogs',
  'daily_attendance',
  'logs',
  'records',
  'scans',
  'checkins',
];

function isPermissionDeniedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.toLowerCase().includes('permission_denied') ||
    msg.toLowerCase().includes('permission denied')
  );
}

async function discoverPathsWithoutRootRead(): Promise<{
  studentPaths: string[];
  attendancePaths: string[];
  permissionDeniedPaths: string[];
}> {
  const studentPaths: string[] = [];
  const attendancePaths: string[] = [];
  const permissionDeniedPaths: string[] = [];

  await Promise.all([
    ...CANDIDATE_STUDENT_PATHS.map(async (p) => {
      try {
        const snap = await get(ref(db, p));
        if (snap.exists()) studentPaths.push(p);
      } catch (err) {
        if (isPermissionDeniedError(err)) permissionDeniedPaths.push(`/${p}`);
      }
    }),
    ...CANDIDATE_ATTENDANCE_PATHS.map(async (p) => {
      try {
        const snap = await get(ref(db, p));
        if (snap.exists()) attendancePaths.push(p);
      } catch (err) {
        if (isPermissionDeniedError(err)) permissionDeniedPaths.push(`/${p}`);
      }
    }),
  ]);

  return { studentPaths, attendancePaths, permissionDeniedPaths };
}

function buildPayloadFromRoot(
  rootVal: Record<string, unknown> | null,
  permissionDeniedPaths: string[] = [],
  currentAuthUser?: { uid: string; email?: string | null } | null
): DatabaseSnapshotPayload {
  const schema = inspectRootSnapshot(rootVal, permissionDeniedPaths);

  const studentSources =
    rootVal && schema.allStudentPaths.length > 0
      ? schema.allStudentPaths.map((p) => ({ path: p, node: rootVal[p] }))
      : [];

  const { students, pendingAccounts } = normalizeStudentsFromSources(
    studentSources,
    currentAuthUser
  );

  const attendanceSources =
    rootVal && schema.allAttendancePaths.length > 0
      ? schema.allAttendancePaths.map((p) => ({
          path: p,
          node: p === '' ? rootVal : rootVal[p],
        }))
      : [];

  const attendance = normalizeAttendanceFromSources(attendanceSources, students);

  return {
    schema,
    students,
    pendingAccounts,
    attendance,
  };
}

/**
 * Safely syncs the 3 confirmed student profiles into /students without creating duplicates
 * or overwriting existing information. Retrieves Student 2's email only from existing Firebase data.
 */
export async function syncConfirmedStudentsToDatabase(
  currentAuthUser?: { uid: string; email?: string | null } | null
): Promise<{ created: number; updated: number }> {
  const studentsRef = ref(db, 'students');
  const studentsSnap = await get(studentsRef);
  const existingStudentsNode = studentsSnap.exists()
    ? (studentsSnap.val() as Record<string, unknown>)
    : {};

  // Check /users node as well (if it exists) to retrieve exact email for Mohammed Faizaan Khatheeb
  let usersNode: Record<string, unknown> = {};
  try {
    const usersSnap = await get(ref(db, 'users'));
    if (usersSnap.exists() && isPlainObject(usersSnap.val())) {
      usersNode = usersSnap.val() as Record<string, unknown>;
    }
  } catch {
    // Ignore if /users is absent or restricted
  }

  const findEmailInDb = (authUid: string): string => {
    // Check /users/{authUid}/email
    const uEntry = usersNode[authUid];
    if (isPlainObject(uEntry) && typeof uEntry.email === 'string' && uEntry.email.trim()) {
      return uEntry.email.trim();
    }
    // Search all /users entries for matching authUid
    for (const val of Object.values(usersNode)) {
      if (isPlainObject(val)) {
        const valUid = String(val.authUid ?? val.uid ?? val.userId ?? '').trim();
        if (valUid === authUid && typeof val.email === 'string' && val.email.trim()) {
          return val.email.trim();
        }
      }
    }
    // Check /students entries for matching authUid
    for (const [key, val] of Object.entries(existingStudentsNode)) {
      if (isPlainObject(val)) {
        const valUid = String(val.authUid ?? val.uid ?? val.userId ?? key).trim();
        if (valUid === authUid && typeof val.email === 'string' && val.email.trim()) {
          return val.email.trim();
        }
      }
    }
    // Check current signed-in Firebase Auth user
    if (currentAuthUser?.uid === authUid && currentAuthUser.email) {
      return currentAuthUser.email.trim();
    }
    return '';
  };

  const RFID_FIELD_ALIASES = [
    'rfidUid',
    'rfid_uid',
    'rfidTag',
    'rfid_tag',
    'rfidNumber',
    'rfid_number',
    'rfidNo',
    'rfid_no',
    'rfidCode',
    'rfid_code',
    'rfidId',
    'rfid_id',
    'rfid',
    'RFID',
    'cardUid',
    'card_uid',
    'cardNumber',
    'card_number',
    'cardNo',
    'card_no',
    'cardId',
    'card_id',
    'tagUid',
    'tag_uid',
    'tagId',
    'tag_id',
    'tag',
    'card',
    'uid',
    'UID',
  ];

  let created = 0;
  let updated = 0;
  const multiUpdates: Record<string, unknown> = {};
  const userUpdates: Record<string, unknown> = {};

  for (const profile of CONFIRMED_STUDENT_PROFILES) {
    const targetRfid = normalizeRfidUid(profile.rfidUid);
    const replacedSet = new Set(
      (profile.replacedRfidUids ?? []).map((r) => normalizeRfidUid(r))
    );
    const resolvedEmail = profile.email || findEmailInDb(profile.authUid);

    // Search existing /students: prefer authUid match first, then RFID / replaced RFID / email
    let matchedKey: string | null = null;
    let matchedObj: Record<string, unknown> | null = null;

    for (const [key, rawVal] of Object.entries(existingStudentsNode)) {
      if (!isPlainObject(rawVal)) continue;

      const entryAuthUid = String(
        rawVal.authUid ??
          rawVal.auth_uid ??
          rawVal.firebaseUid ??
          rawVal.userId ??
          (isFirebaseAuthUid(key) ? key : '')
      ).trim();

      if (key === profile.authUid || entryAuthUid === profile.authUid) {
        matchedKey = key;
        matchedObj = rawVal;
        break;
      }
    }

    if (!matchedKey) {
      for (const [key, rawVal] of Object.entries(existingStudentsNode)) {
        if (!isPlainObject(rawVal)) continue;

        const rawRfid = String(
          rawVal.rfidUid ??
            rawVal.rfid_uid ??
            rawVal.rfid ??
            rawVal.cardUid ??
            rawVal.cardNumber ??
            ''
        ).trim();
        const entryNormRfid =
          rawRfid && !isFirebaseAuthUid(rawRfid) ? normalizeRfidUid(rawRfid) : '';

        const entryEmail = String(rawVal.email ?? rawVal.Email ?? '')
          .trim()
          .toLowerCase();

        const keyNorm = !isFirebaseAuthUid(key) ? normalizeRfidUid(key) : '';

        if (
          (entryNormRfid &&
            (entryNormRfid === targetRfid || replacedSet.has(entryNormRfid))) ||
          (keyNorm && replacedSet.has(keyNorm)) ||
          (resolvedEmail && entryEmail && entryEmail === resolvedEmail.toLowerCase())
        ) {
          matchedKey = key;
          matchedObj = rawVal;
          break;
        }
      }
    }

    if (matchedKey && matchedObj) {
      // Non-destructive in-place patch: preserve existing fields while replacing legacy RFID UIDs
      const patch: Record<string, unknown> = {};
      if (!matchedObj.name && !matchedObj.studentName) patch.name = profile.name;
      if (!matchedObj.rollNumber && !matchedObj.rollNo && !matchedObj.roll) {
        patch.rollNumber = profile.rollNumber;
      }
      if (!matchedObj.email && resolvedEmail) patch.email = resolvedEmail;
      if (!matchedObj.authUid) patch.authUid = profile.authUid;

      let replacedLegacyField = false;
      for (const field of RFID_FIELD_ALIASES) {
        const rawFieldVal = matchedObj[field];
        if (rawFieldVal === undefined || rawFieldVal === null) continue;
        const strVal = String(rawFieldVal).trim();
        if (!strVal || isFirebaseAuthUid(strVal)) continue;

        const normVal = normalizeRfidUid(strVal);
        if (replacedSet.has(normVal)) {
          if (field === 'rfidUid') {
            patch.rfidUid = targetRfid;
          } else {
            // Update legacy alias or remove old value while keeping canonical rfidUid updated
            patch[field] = targetRfid;
            patch.rfidUid = targetRfid;
          }
          replacedLegacyField = true;
        }
      }

      const existingRawRfid = String(
        matchedObj.rfidUid ?? matchedObj.rfid ?? matchedObj.cardUid ?? ''
      ).trim();
      const existingNormRfid =
        existingRawRfid && !isFirebaseAuthUid(existingRawRfid)
          ? normalizeRfidUid(existingRawRfid)
          : '';

      if (!existingRawRfid || isFirebaseAuthUid(existingRawRfid) || replacedLegacyField) {
        patch.rfidUid = targetRfid;
      } else if (existingNormRfid === targetRfid && existingRawRfid !== targetRfid) {
        patch.rfidUid = targetRfid;
      }

      if (matchedObj.rfidAssigned !== true) patch.rfidAssigned = true;
      if (!matchedObj.createdAt) patch.createdAt = new Date().toISOString();

      if (Object.keys(patch).length > 0) {
        for (const [k, v] of Object.entries(patch)) {
          multiUpdates[`students/${matchedKey}/${k}`] = v;
        }
        updated += 1;
      }
    } else {
      // Create missing confirmed student profile deterministically under /students/{authUid}
      const newRecord: Record<string, unknown> = {
        name: profile.name,
        rollNumber: profile.rollNumber,
        authUid: profile.authUid,
        rfidUid: targetRfid,
        rfidAssigned: true,
        createdAt: new Date().toISOString(),
      };
      if (resolvedEmail) {
        newRecord.email = resolvedEmail;
      }
      multiUpdates[`students/${profile.authUid}`] = newRecord;
      created += 1;
    }

    // Also update /users/{key} if it exists and still holds the replaced legacy RFID UID
    if (replacedSet.size > 0) {
      for (const [uKey, uVal] of Object.entries(usersNode)) {
        if (!isPlainObject(uVal)) continue;
        const uAuthUid = String(
          uVal.authUid ?? uVal.uid ?? uVal.userId ?? (isFirebaseAuthUid(uKey) ? uKey : '')
        ).trim();
        if (uKey !== profile.authUid && uAuthUid !== profile.authUid) continue;

        for (const field of RFID_FIELD_ALIASES) {
          const rawFieldVal = uVal[field];
          if (rawFieldVal === undefined || rawFieldVal === null) continue;
          const strVal = String(rawFieldVal).trim();
          if (!strVal || isFirebaseAuthUid(strVal)) continue;
          if (replacedSet.has(normalizeRfidUid(strVal))) {
            userUpdates[`users/${uKey}/${field}`] = targetRfid;
            if (field !== 'rfidUid') {
              userUpdates[`users/${uKey}/rfidUid`] = targetRfid;
            }
          }
        }
      }
    }
  }

  if (Object.keys(multiUpdates).length > 0) {
    await update(ref(db), multiUpdates);
  }

  if (Object.keys(userUpdates).length > 0) {
    try {
      await update(ref(db), userUpdates);
    } catch {
      // Ignore if /users is read-only under security rules
    }
  }

  return { created, updated };
}

export async function subscribeToDatabase(
  onData: (payload: DatabaseSnapshotPayload) => void,
  onError: (error: Error) => void,
  currentAuthUser?: { uid: string; email?: string | null } | null
): Promise<LiveDatabaseSubscription> {
  try {
    await get(ref(db, '/'));

    const unsubRoot = onValue(
      ref(db, '/'),
      (snapshot) => {
        const rootVal = snapshot.val() as Record<string, unknown> | null;
        onData(buildPayloadFromRoot(rootVal, [], currentAuthUser));
      },
      (err) => {
        onError(err);
      }
    );

    return { unsubscribe: unsubRoot };
  } catch (rootErr) {
    const discovered = await discoverPathsWithoutRootRead();

    if (discovered.studentPaths.length === 0 && discovered.attendancePaths.length === 0) {
      const deniedSummary =
        discovered.permissionDeniedPaths.length > 0
          ? `Permission denied on root "/" and paths (${discovered.permissionDeniedPaths.slice(0, 5).join(', ')}). Update Firebase Realtime Database Rules to grant read access to your administrator UID.`
          : rootErr instanceof Error
          ? rootErr.message
          : 'Unable to read Firebase Realtime Database. Check security rules and administrator permissions.';

      onError(new Error(deniedSummary));
      return { unsubscribe: () => {} };
    }

    const rawNodes: Record<string, unknown> = {};
    const unsubs: Unsubscribe[] = [];

    const emitMerged = () => {
      onData(
        buildPayloadFromRoot(
          rawNodes,
          discovered.permissionDeniedPaths,
          currentAuthUser
        )
      );
    };

    const allDiscovered = Array.from(
      new Set([...discovered.studentPaths, ...discovered.attendancePaths])
    );

    for (const p of allDiscovered) {
      unsubs.push(
        onValue(
          ref(db, p),
          (snap) => {
            rawNodes[p] = snap.val();
            emitMerged();
          },
          onError
        )
      );
    }

    return {
      unsubscribe: () => {
        unsubs.forEach((u) => u());
      },
    };
  }
}

export async function forceRefreshDatabase(
  currentAuthUser?: { uid: string; email?: string | null } | null
): Promise<DatabaseSnapshotPayload> {
  try {
    const snap = await get(ref(db, '/'));
    const rootVal = snap.val() as Record<string, unknown> | null;
    return buildPayloadFromRoot(rootVal, [], currentAuthUser);
  } catch (rootErr) {
    const discovered = await discoverPathsWithoutRootRead();
    if (discovered.studentPaths.length === 0 && discovered.attendancePaths.length === 0) {
      throw rootErr instanceof Error ? rootErr : new Error('Permission denied reading database.');
    }

    const rawNodes: Record<string, unknown> = {};
    const allDiscovered = Array.from(
      new Set([...discovered.studentPaths, ...discovered.attendancePaths])
    );

    await Promise.all(
      allDiscovered.map(async (p) => {
        const snap = await get(ref(db, p));
        rawNodes[p] = snap.val();
      })
    );

    return buildPayloadFromRoot(rawNodes, discovered.permissionDeniedPaths, currentAuthUser);
  }
}

// ---------------- Student Profile CRUD & RFID Registration ----------------

export async function saveStudentProfile(params: {
  existingStudent?: StudentRecord | null;
  name: string;
  rollNumber: string;
  email: string;
  authUid: string;
  rfidUid: string;
  allStudents: StudentRecord[];
}): Promise<void> {
  const { existingStudent, name, rollNumber, email, authUid, rfidUid, allStudents } = params;

  const cleanName = name.trim();
  const cleanRoll = rollNumber.trim();
  const cleanEmail = email.trim();
  const cleanAuthUid = authUid.trim();
  const cleanRfid = rfidUid.trim() ? normalizeRfidUid(rfidUid) : '';

  if (!cleanName || !cleanRoll) {
    throw new Error('Student Name and Roll Number are required.');
  }

  if (cleanRfid && isFirebaseAuthUid(cleanRfid)) {
    throw new Error('Firebase Authentication UID cannot be used as an RFID card UID.');
  }

  if (cleanAuthUid && isEsp32DeviceUid(cleanAuthUid)) {
    throw new Error(
      'This Firebase Auth UID belongs to the ESP32 RFID scanner device and cannot be registered as a student.'
    );
  }

  // Prevent duplicate RFID card assignment across different students
  if (cleanRfid) {
    const conflict = allStudents.find(
      (s) =>
        s.rfidUid &&
        normalizeRfidKey(s.rfidUid) === normalizeRfidKey(cleanRfid) &&
        s.rawPath !== existingStudent?.rawPath
    );
    if (conflict) {
      throw new Error(
        `RFID card ${cleanRfid} is already assigned to ${conflict.name} (Roll ${conflict.rollNumber}).`
      );
    }
  }

  // Prevent duplicate Auth UID assignment
  if (cleanAuthUid) {
    const authConflict = allStudents.find(
      (s) =>
        s.authUid &&
        s.authUid === cleanAuthUid &&
        s.rawPath !== existingStudent?.rawPath
    );
    if (authConflict) {
      throw new Error(
        `Firebase Auth UID ${cleanAuthUid} is already linked to ${authConflict.name}.`
      );
    }
  }

  if (existingStudent?.rawPath) {
    const baseObj: Record<string, unknown> = isPlainObject(existingStudent.raw)
      ? deepClone(existingStudent.raw)
      : {};

    baseObj.name = cleanName;
    baseObj.rollNumber = cleanRoll;
    if (cleanEmail) baseObj.email = cleanEmail;
    else delete baseObj.email;
    if (cleanAuthUid) baseObj.authUid = cleanAuthUid;
    else delete baseObj.authUid;

    if (cleanRfid) {
      baseObj.rfidUid = cleanRfid;
      baseObj.rfidAssigned = true;
    } else {
      delete baseObj.rfidUid;
      baseObj.rfidAssigned = false;
    }
    if (!baseObj.createdAt) {
      baseObj.createdAt = new Date().toISOString();
    }

    await set(ref(db, existingStudent.rawPath), baseObj);
    return;
  }

  // Creating a new student profile in /students
  const newPayload: Record<string, unknown> = {
    name: cleanName,
    rollNumber: cleanRoll,
    rfidAssigned: Boolean(cleanRfid),
    createdAt: new Date().toISOString(),
  };
  if (cleanEmail) newPayload.email = cleanEmail;
  if (cleanAuthUid) newPayload.authUid = cleanAuthUid;
  if (cleanRfid) newPayload.rfidUid = cleanRfid;

  if (cleanAuthUid) {
    await set(ref(db, `students/${cleanAuthUid}`), newPayload);
  } else {
    const newRef = push(ref(db, 'students'));
    await set(newRef, newPayload);
  }
}

export async function deleteStudentProfile(student: StudentRecord): Promise<void> {
  if (!student.rawPath) {
    throw new Error('Cannot delete student: missing database path.');
  }
  await update(ref(db), {
    [student.rawPath]: null,
  });
}

// ---------------- ESP32 / RFID Scan Pipeline ----------------

export async function recordRfidAttendanceScan(params: {
  rawRfidInput: string;
  students: StudentRecord[];
  existingAttendance: AttendanceRecord[];
  schema: DetectedSchema | null;
}): Promise<{ student: StudentRecord; dateDisplay: string; timeDisplay: string }> {
  const { rawRfidInput, students, existingAttendance, schema } = params;

  // 1-2. Receive & normalize RFID UID (uppercase, no spaces)
  const normalizedRfid = normalizeRfidUid(rawRfidInput);
  if (!normalizedRfid) {
    throw new Error('Please enter or scan a valid RFID card UID.');
  }
  if (isFirebaseAuthUid(normalizedRfid)) {
    throw new Error('Firebase Authentication UID cannot be scanned as an RFID card.');
  }

  // 3-4. Search /students to identify matching student
  const matchedStudent = students.find(
    (s) => s.rfidUid && normalizeRfidKey(s.rfidUid) === normalizeRfidKey(normalizedRfid)
  );
  if (!matchedStudent) {
    throw new Error(
      `No registered student found for RFID card ${normalizedRfid}. Assign this card on the Registered Students page first.`
    );
  }

  // 5-6. Check today's IST date & prevent duplicate attendance for repeated scans
  const istNow = getISTSnapshot();
  const duplicateToday = existingAttendance.find(
    (r) =>
      !r.isVirtualAbsent &&
      r.dateISO === istNow.dateISO &&
      ((r.rfidUid && normalizeRfidKey(r.rfidUid) === normalizeRfidKey(normalizedRfid)) ||
        r.studentKey === matchedStudent.id)
  );

  if (duplicateToday) {
    throw new Error(
      `Duplicate scan prevented: ${matchedStudent.name} (Roll ${matchedStudent.rollNumber}) is already marked ${duplicateToday.status} today (${istNow.dateDisplay}) at ${duplicateToday.checkInTimeDisplay}.`
    );
  }

  // 7. Record attendance in Firebase using existing attendance path & topology
  const attendanceBase = schema?.attendancePath || 'attendance';
  const dateKey = formatDateWithFormat(
    istNow.dateISO,
    schema?.dateKeyFormat ?? 'YYYY-MM-DD'
  );

  const recordPayload: Record<string, unknown> = {
    name: matchedStudent.name,
    rollNumber: matchedStudent.rollNumber,
    rfidUid: normalizedRfid,
    date: istNow.dateISO,
    time: istNow.time12,
    timestamp: Date.now(),
    status: 'Present',
  };
  if (matchedStudent.authUid) {
    recordPayload.authUid = matchedStudent.authUid;
  }

  if (schema?.topology === 'flat_list') {
    const newRef = push(ref(db, attendanceBase));
    await set(newRef, recordPayload);
  } else if (schema?.topology === 'student_nested') {
    await set(ref(db, `${attendanceBase}/${normalizedRfid}/${dateKey}`), recordPayload);
  } else {
    // Default date_nested: /attendance/{YYYY-MM-DD}/{RFID_UID}
    await set(ref(db, `${attendanceBase}/${dateKey}/${normalizedRfid}`), recordPayload);
  }

  return {
    student: matchedStudent,
    dateDisplay: istNow.dateDisplay,
    timeDisplay: istNow.time12,
  };
}

// ---------------- Persistent Undo / Redo History in Firebase ----------------

function getHistoryDbPath(adminUid: string): string {
  return `${HISTORY_NODE_CANDIDATES[0]}/${adminUid}`;
}

export function subscribeToPersistentHistory(
  adminUid: string,
  onHistory: (state: PersistentHistoryState) => void,
  onHistoryError?: (err: Error) => void
): Unsubscribe {
  const histRef = ref(db, getHistoryDbPath(adminUid));
  return onValue(
    histRef,
    (snap) => {
      const val = snap.val() as Partial<PersistentHistoryState> | null;
      if (!val || !Array.isArray(val.operations)) {
        onHistory({ operations: [], cursor: -1 });
        return;
      }
      const ops = val.operations.filter(Boolean) as HistoryOperation[];
      const rawCursor = typeof val.cursor === 'number' ? val.cursor : ops.length - 1;
      const safeCursor = Math.min(ops.length - 1, Math.max(-1, rawCursor));
      onHistory({ operations: ops, cursor: safeCursor });
    },
    (err) => {
      if (onHistoryError) onHistoryError(err);
    }
  );
}

async function appendOperationWithTransaction(
  adminUid: string,
  operation: HistoryOperation
): Promise<void> {
  const histRef = ref(db, getHistoryDbPath(adminUid));
  await runTransaction(histRef, (current: PersistentHistoryState | null) => {
    const prevOps = Array.isArray(current?.operations) ? current.operations : [];
    const prevCursor =
      typeof current?.cursor === 'number' ? current.cursor : prevOps.length - 1;

    const truncated = prevOps.slice(0, Math.max(0, prevCursor + 1));
    const nextOps = [...truncated, operation].slice(-MAX_HISTORY_OPERATIONS);
    return {
      operations: nextOps,
      cursor: nextOps.length - 1,
    };
  });
}

function buildUpdatedRawObject(
  record: AttendanceRecord,
  schema: DetectedSchema,
  newDateISO: string,
  newTime24: string,
  newStatus: string
): Record<string, unknown> {
  const baseObj: Record<string, unknown> = isPlainObject(record.raw)
    ? deepClone(record.raw)
    : {};

  const { fieldMap } = schema;
  const formattedDate = formatDateWithFormat(newDateISO, schema.dateKeyFormat);
  const formattedTime12 = formatTime12hFrom24(newTime24);
  const newTimestampMs = combineISTDateAndTimeToMs(newDateISO, newTime24);

  if (fieldMap.dateKey in baseObj || schema.topology === 'flat_list') {
    baseObj[fieldMap.dateKey] = formattedDate;
  }

  baseObj[fieldMap.timeKey] = formattedTime12;

  if (fieldMap.timestampKey in baseObj) {
    const prevTs = baseObj[fieldMap.timestampKey];
    if (typeof prevTs === 'number') {
      baseObj[fieldMap.timestampKey] =
        prevTs < 1e12 ? Math.floor(newTimestampMs / 1000) : newTimestampMs;
    } else {
      baseObj[fieldMap.timestampKey] = newTimestampMs;
    }
  }

  baseObj[fieldMap.statusKey] = newStatus;

  if (!isPlainObject(record.raw)) {
    baseObj[fieldMap.nameKey] = record.studentName;
    if (record.rollNumber !== '—') baseObj[fieldMap.rollKey] = record.rollNumber;
    if (record.rfidUid !== '—' && record.rfidUid !== 'Unmatched') {
      baseObj[fieldMap.uidKey] = record.rfidUid;
    }
  }

  return baseObj;
}

function computeTargetPathForDateChange(
  record: AttendanceRecord,
  schema: DetectedSchema,
  newDateISO: string
): string {
  if (newDateISO === record.dateISO) return record.rawPath;

  const formattedTargetDate = formatDateWithFormat(newDateISO, schema.dateKeyFormat);
  const parts = record.rawPath.split('/').filter(Boolean);

  if (parts.length >= 2) {
    const parentSeg = parts[parts.length - 2];
    const leafSeg = parts[parts.length - 1];

    if (
      /^\d{4}[-_/]\d{1,2}[-_/]\d{1,2}$/.test(parentSeg) ||
      /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(parentSeg)
    ) {
      const prefix = parts.slice(0, -2);
      return [...prefix, formattedTargetDate, leafSeg].join('/');
    }

    if (
      /^\d{4}[-_/]\d{1,2}[-_/]\d{1,2}$/.test(leafSeg) ||
      /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(leafSeg)
    ) {
      const prefix = parts.slice(0, -1);
      return [...prefix, formattedTargetDate].join('/');
    }
  }

  return record.rawPath;
}

export async function editAttendanceRecord(params: {
  record: AttendanceRecord;
  schema: DetectedSchema;
  newDateISO: string;
  newTime24: string;
  newStatus: string;
  adminUid: string;
  adminEmail: string;
}): Promise<void> {
  const { record, schema, newDateISO, newTime24, newStatus, adminUid, adminEmail } = params;

  const targetPath = computeTargetPathForDateChange(record, schema, newDateISO);
  const updatedObj = buildUpdatedRawObject(record, schema, newDateISO, newTime24, newStatus);
  const mutations: UndoPathMutation[] = [];
  const multiUpdate: Record<string, unknown> = {};

  if (targetPath !== record.rawPath) {
    const destSnap = await get(ref(db, targetPath));
    const destBefore = destSnap.exists() ? destSnap.val() : null;

    multiUpdate[record.rawPath] = null;
    multiUpdate[targetPath] = updatedObj;

    mutations.push(
      { path: record.rawPath, beforeValue: deepClone(record.raw), afterValue: null },
      { path: targetPath, beforeValue: deepClone(destBefore), afterValue: deepClone(updatedObj) }
    );
  } else {
    multiUpdate[record.rawPath] = updatedObj;
    mutations.push({
      path: record.rawPath,
      beforeValue: deepClone(record.raw),
      afterValue: deepClone(updatedObj),
    });
  }

  await update(ref(db), multiUpdate);

  const nowSnap = getISTSnapshot();
  const op: HistoryOperation = {
    id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'edit',
    label: `Edited ${record.studentName} (${formatDateDDMMYYYY(newDateISO)} · ${newStatus})`,
    recordCount: 1,
    createdAtISO: nowSnap.dateISO,
    createdAtDisplay: `${nowSnap.dateDisplay} ${nowSnap.time12}`,
    adminUid,
    adminEmail,
    mutations,
  };

  await appendOperationWithTransaction(adminUid, op);
}

export async function deleteSingleAttendanceRecord(params: {
  record: AttendanceRecord;
  adminUid: string;
  adminEmail: string;
}): Promise<void> {
  const { record, adminUid, adminEmail } = params;

  const snap = await get(ref(db, record.rawPath));
  const exactBefore = snap.exists() ? snap.val() : deepClone(record.raw);

  await update(ref(db), {
    [record.rawPath]: null,
  });

  const nowSnap = getISTSnapshot();
  const op: HistoryOperation = {
    id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'delete_single',
    label: `Deleted ${record.studentName} (${record.dateDisplay})`,
    recordCount: 1,
    createdAtISO: nowSnap.dateISO,
    createdAtDisplay: `${nowSnap.dateDisplay} ${nowSnap.time12}`,
    adminUid,
    adminEmail,
    mutations: [
      {
        path: record.rawPath,
        beforeValue: deepClone(exactBefore),
        afterValue: null,
      },
    ],
  };

  await appendOperationWithTransaction(adminUid, op);
}

export async function deleteAttendanceByDate(params: {
  dateISO: string;
  recordsForDate: AttendanceRecord[];
  isToday: boolean;
  adminUid: string;
  adminEmail: string;
}): Promise<number> {
  const { dateISO, recordsForDate, isToday, adminUid, adminEmail } = params;

  const targetRecords = recordsForDate.filter(
    (r) => !r.isVirtualAbsent && r.dateISO === dateISO && Boolean(r.rawPath)
  );

  if (targetRecords.length === 0) {
    return 0;
  }

  const mutations: UndoPathMutation[] = [];
  const multiUpdate: Record<string, null> = {};

  await Promise.all(
    targetRecords.map(async (rec) => {
      const snap = await get(ref(db, rec.rawPath));
      const exactVal = snap.exists() ? snap.val() : deepClone(rec.raw);
      multiUpdate[rec.rawPath] = null;
      mutations.push({
        path: rec.rawPath,
        beforeValue: deepClone(exactVal),
        afterValue: null,
      });
    })
  );

  await update(ref(db), multiUpdate);

  const nowSnap = getISTSnapshot();
  const displayDate = formatDateDDMMYYYY(dateISO);
  const op: HistoryOperation = {
    id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: isToday ? 'delete_today' : 'delete_by_date',
    label: isToday
      ? `Deleted today's attendance (${targetRecords.length} records · ${displayDate})`
      : `Deleted attendance for ${displayDate} (${targetRecords.length} records)`,
    recordCount: targetRecords.length,
    createdAtISO: nowSnap.dateISO,
    createdAtDisplay: `${nowSnap.dateDisplay} ${nowSnap.time12}`,
    adminUid,
    adminEmail,
    mutations,
  };

  await appendOperationWithTransaction(adminUid, op);
  return targetRecords.length;
}

export async function performUndoOperation(adminUid: string): Promise<HistoryOperation> {
  const histRef = ref(db, getHistoryDbPath(adminUid));
  const snap = await get(histRef);
  const state = snap.val() as PersistentHistoryState | null;

  if (!state || !Array.isArray(state.operations) || state.operations.length === 0) {
    throw new Error('Nothing to undo.');
  }

  const cursor = typeof state.cursor === 'number' ? state.cursor : state.operations.length - 1;
  if (cursor < 0 || cursor >= state.operations.length) {
    throw new Error('No earlier operations available to undo.');
  }

  const targetOp = state.operations[cursor];
  const restoreUpdates: Record<string, unknown> = {};

  for (const m of targetOp.mutations) {
    restoreUpdates[m.path] = deepClone(m.beforeValue);
  }

  await update(ref(db), restoreUpdates);

  await runTransaction(histRef, (curr: PersistentHistoryState | null) => {
    if (!curr || !Array.isArray(curr.operations)) return curr;
    return {
      ...curr,
      cursor: Math.max(-1, cursor - 1),
    };
  });

  return targetOp;
}

export async function performRedoOperation(adminUid: string): Promise<HistoryOperation> {
  const histRef = ref(db, getHistoryDbPath(adminUid));
  const snap = await get(histRef);
  const state = snap.val() as PersistentHistoryState | null;

  if (!state || !Array.isArray(state.operations) || state.operations.length === 0) {
    throw new Error('Nothing to redo.');
  }

  const cursor = typeof state.cursor === 'number' ? state.cursor : -1;
  const nextIndex = cursor + 1;
  if (nextIndex < 0 || nextIndex >= state.operations.length) {
    throw new Error('No undone operations available to redo.');
  }

  const targetOp = state.operations[nextIndex];
  const reapplyUpdates: Record<string, unknown> = {};

  for (const m of targetOp.mutations) {
    reapplyUpdates[m.path] = deepClone(m.afterValue);
  }

  await update(ref(db), reapplyUpdates);

  await runTransaction(histRef, (curr: PersistentHistoryState | null) => {
    if (!curr || !Array.isArray(curr.operations)) return curr;
    return {
      ...curr,
      cursor: Math.min(curr.operations.length - 1, nextIndex),
    };
  });

  return targetOp;
}

export function getTodaysRecordsCount(records: AttendanceRecord[]): number {
  const todayISO = getISTTodayISO();
  return records.filter((r) => !r.isVirtualAbsent && r.dateISO === todayISO).length;
}
