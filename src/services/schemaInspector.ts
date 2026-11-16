import {
  CONFIRMED_STUDENT_PROFILES,
  isEsp32DeviceEmail,
  isEsp32DeviceUid,
  isFirebaseAuthUid,
  normalizeRfidUid,
  PENDING_AUTH_ACCOUNTS,
} from '../firebase/config';
import {
  AttendanceRecord,
  AttendanceTopology,
  DetectedSchema,
  PendingStudentAccount,
  StudentRecord,
} from '../types/attendance';
import {
  combineISTDateAndTimeToMs,
  formatDateDDMMYYYY,
  formatTime12hFrom24,
  getISTTodayISO,
  parseAnyDateToISO,
  parseTimeTo24h,
} from '../utils/istDateTime';

const IGNORED_TOP_KEYS = new Set([
  'portal_history',
  'attendance_portal_history',
  'admins',
  'admin',
  'roles',
  'config',
  'settings',
  'system',
]);

const NAME_KEYS = [
  'studentName',
  'student_name',
  'name',
  'fullName',
  'full_name',
  'Name',
  'StudentName',
  'displayName',
  'display_name',
  'username',
  'user_name',
];
const ROLL_KEYS = [
  'rollNumber',
  'roll_number',
  'rollNo',
  'roll_no',
  'roll',
  'RollNo',
  'RollNumber',
  'Roll',
  'regNo',
  'reg_no',
  'registrationNumber',
  'usn',
  'USN',
  'studentId',
  'student_id',
];
const EMAIL_KEYS = [
  'email',
  'Email',
  'emailAddress',
  'email_address',
  'mail',
  'userEmail',
  'user_email',
  'studentEmail',
  'student_email',
];
const AUTH_UID_KEYS = [
  'authUid',
  'auth_uid',
  'firebaseUid',
  'firebase_uid',
  'accountUid',
  'account_uid',
  'userId',
  'user_id',
  'uid',
  'UID',
];
const RFID_KEYS = [
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
const DATE_KEYS = ['date', 'Date', 'attendanceDate', 'attendance_date', 'day', 'scanDate'];
const TIME_KEYS = [
  'checkInTime',
  'check_in_time',
  'checkinTime',
  'checkIn',
  'check_in',
  'time',
  'Time',
  'scanTime',
  'scan_time',
  'inTime',
  'in_time',
];
const TIMESTAMP_KEYS = ['timestamp', 'Timestamp', 'createdAt', 'created_at', 'updatedAt', 'epoch', 'ts'];
const STATUS_KEYS = ['status', 'Status', 'attendanceStatus', 'attendance_status', 'state', 'present'];

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isDateKey(key: string): boolean {
  return (
    /^\d{4}[-_/]\d{1,2}[-_/]\d{1,2}$/.test(key) ||
    /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(key)
  );
}

function detectDateKeyFormat(keys: string[]): 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'YYYY_MM_DD' {
  for (const k of keys) {
    if (/^\d{4}_\d{1,2}_\d{1,2}$/.test(k)) return 'YYYY_MM_DD';
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(k)) return 'DD-MM-YYYY';
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(k)) return 'YYYY-MM-DD';
  }
  return 'YYYY-MM-DD';
}

function pickFirstMatchingKey(
  objs: Record<string, unknown>[],
  candidates: string[],
  fallback: string
): string {
  for (const cand of candidates) {
    if (objs.some((o) => cand in o && o[cand] !== undefined && o[cand] !== null && o[cand] !== '')) {
      return cand;
    }
  }
  for (const cand of candidates) {
    if (objs.some((o) => cand in o)) {
      return cand;
    }
  }
  return fallback;
}

function readCandidate(obj: Record<string, unknown>, candidates: string[]): unknown {
  for (const key of candidates) {
    if (key in obj && obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') {
      return obj[key];
    }
  }
  return undefined;
}

function readRfidCandidate(obj: Record<string, unknown>): { value: string; keyUsed: string } | null {
  for (const key of RFID_KEYS) {
    if (key in obj && obj[key] !== undefined && obj[key] !== null) {
      const val = String(obj[key]).trim();
      if (!val) continue;
      if (isFirebaseAuthUid(val)) continue;
      return { value: normalizeRfidUid(val), keyUsed: key };
    }
  }
  return null;
}

function readAuthUidCandidate(obj: Record<string, unknown>, keyHint?: string): string | undefined {
  for (const key of AUTH_UID_KEYS) {
    if (key in obj && obj[key] !== undefined && obj[key] !== null) {
      const val = String(obj[key]).trim();
      if (!val) continue;
      if (key === 'uid' || key === 'UID') {
        if (isFirebaseAuthUid(val)) return val;
      } else {
        return val;
      }
    }
  }
  if (keyHint && isFirebaseAuthUid(keyHint)) {
    return keyHint;
  }
  return undefined;
}

function looksLikeHexOrNumericRfid(key: string): boolean {
  if (isFirebaseAuthUid(key)) return false;
  const clean = key.replace(/[\s:-]/g, '');
  return /^[0-9A-Fa-f]{6,16}$/.test(clean) || /^\d{6,14}$/.test(clean);
}

export function normalizeRfidKey(rfid: string): string {
  return rfid.trim().replace(/[\s:-]/g, '').toLowerCase();
}

export function inspectRootSnapshot(
  rootData: Record<string, unknown> | null,
  permissionDeniedPaths: string[] = []
): DetectedSchema {
  if (!rootData || !isPlainObject(rootData)) {
    return {
      studentsPath: 'students',
      allStudentPaths: [],
      attendancePath: 'attendance',
      allAttendancePaths: [],
      topology: 'date_nested',
      dateKeyFormat: 'YYYY-MM-DD',
      fieldMap: {
        nameKey: 'name',
        rollKey: 'rollNumber',
        uidKey: 'rfidUid',
        emailKey: 'email',
        dateKey: 'date',
        timeKey: 'time',
        statusKey: 'status',
        timestampKey: 'timestamp',
      },
      topLevelKeys: [],
      permissionDeniedPaths,
      inspectedAt: Date.now(),
    };
  }

  const topLevelKeys = Object.keys(rootData);
  const scoredStudentPaths: { key: string; score: number }[] = [];
  const scoredAttendancePaths: { key: string; score: number }[] = [];

  for (const key of topLevelKeys) {
    if (IGNORED_TOP_KEYS.has(key.toLowerCase())) continue;
    const node = rootData[key];
    if (!isPlainObject(node)) continue;

    const childKeys = Object.keys(node);
    const lowerKey = key.toLowerCase();
    const sampleChildren = childKeys.slice(0, 15).map((k) => node[k]).filter(isPlainObject);

    let sScore = 0;
    if (/student|user|member|card|rfid_user|enroll|profile|people/.test(lowerKey)) sScore += 5;
    if (lowerKey === 'students' || lowerKey === 'student' || lowerKey === 'users') sScore += 4;
    if (sampleChildren.some((c) => readCandidate(c, NAME_KEYS) !== undefined)) sScore += 4;
    if (sampleChildren.some((c) => readCandidate(c, ROLL_KEYS) !== undefined)) sScore += 4;
    if (sampleChildren.some((c) => readCandidate(c, EMAIL_KEYS) !== undefined)) sScore += 4;
    if (
      sampleChildren.some((c) => readRfidCandidate(c) !== null) ||
      childKeys.some(looksLikeHexOrNumericRfid) ||
      childKeys.some(isFirebaseAuthUid)
    ) {
      sScore += 4;
    }
    if (childKeys.some(isDateKey)) sScore -= 10;
    if (
      sampleChildren.some(
        (c) =>
          readCandidate(c, TIME_KEYS) !== undefined &&
          readCandidate(c, STATUS_KEYS) !== undefined &&
          readCandidate(c, EMAIL_KEYS) === undefined
      )
    ) {
      sScore -= 3;
    }

    if (sScore >= 3) {
      scoredStudentPaths.push({ key, score: sScore });
    }

    let aScore = 0;
    if (/attend|log|record|scan|checkin|check_in|history/.test(lowerKey)) aScore += 6;
    if (lowerKey === 'attendance' || lowerKey === 'attendance_logs') aScore += 4;
    if (childKeys.some(isDateKey)) aScore += 8;
    if (
      sampleChildren.some(
        (c) => readCandidate(c, TIME_KEYS) !== undefined || readCandidate(c, STATUS_KEYS) !== undefined
      )
    ) {
      aScore += 4;
    }
    if (sampleChildren.some((c) => isPlainObject(c) && Object.keys(c).some(isDateKey))) {
      aScore += 6;
    }

    if (aScore >= 3) {
      scoredAttendancePaths.push({ key, score: aScore });
    }
  }

  scoredStudentPaths.sort((a, b) => b.score - a.score);
  scoredAttendancePaths.sort((a, b) => b.score - a.score);

  const allStudentPaths = scoredStudentPaths.map((p) => p.key);
  let allAttendancePaths = scoredAttendancePaths.map((p) => p.key);

  if (allAttendancePaths.length === 0 && topLevelKeys.some(isDateKey)) {
    allAttendancePaths = [''];
  }

  const bestStudentsKey = allStudentPaths[0] ?? 'students';
  const bestAttendanceKey = allAttendancePaths[0] ?? 'attendance';

  let topology: AttendanceTopology = 'date_nested';
  let dateKeyFormat: 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'YYYY_MM_DD' = 'YYYY-MM-DD';
  const sampleObjects: Record<string, unknown>[] = [];

  const attNode =
    bestAttendanceKey === ''
      ? rootData
      : bestAttendanceKey && isPlainObject(rootData[bestAttendanceKey])
      ? (rootData[bestAttendanceKey] as Record<string, unknown>)
      : null;

  if (attNode) {
    const childKeys = Object.keys(attNode);
    const dateChildren = childKeys.filter(isDateKey);

    if (dateChildren.length > 0) {
      topology = 'date_nested';
      dateKeyFormat = detectDateKeyFormat(dateChildren);
      for (const dk of dateChildren.slice(0, 5)) {
        const inner = attNode[dk];
        if (isPlainObject(inner)) {
          for (const subKey of Object.keys(inner).slice(0, 10)) {
            const subVal = inner[subKey];
            if (isPlainObject(subVal)) {
              sampleObjects.push(subVal);
            }
          }
        }
      }
    } else {
      let foundStudentNested = false;
      for (const ck of childKeys.slice(0, 10)) {
        const inner = attNode[ck];
        if (isPlainObject(inner)) {
          const innerKeys = Object.keys(inner);
          if (innerKeys.some(isDateKey)) {
            foundStudentNested = true;
            dateKeyFormat = detectDateKeyFormat(innerKeys.filter(isDateKey));
            for (const dk of innerKeys.filter(isDateKey).slice(0, 5)) {
              if (isPlainObject(inner[dk])) sampleObjects.push(inner[dk] as Record<string, unknown>);
            }
          } else {
            sampleObjects.push(inner);
          }
        }
      }
      topology = foundStudentNested ? 'student_nested' : 'flat_list';
    }
  }

  const studentSamples: Record<string, unknown>[] = [];
  for (const sPath of allStudentPaths) {
    const sNode = rootData[sPath];
    if (isPlainObject(sNode)) {
      for (const k of Object.keys(sNode).slice(0, 15)) {
        if (isPlainObject(sNode[k])) studentSamples.push(sNode[k] as Record<string, unknown>);
      }
    }
  }

  const allSamples = [...sampleObjects, ...studentSamples];

  return {
    studentsPath: bestStudentsKey,
    allStudentPaths,
    attendancePath: bestAttendanceKey,
    allAttendancePaths,
    topology,
    dateKeyFormat,
    fieldMap: {
      nameKey: pickFirstMatchingKey(allSamples, NAME_KEYS, 'name'),
      rollKey: pickFirstMatchingKey(allSamples, ROLL_KEYS, 'rollNumber'),
      uidKey: pickFirstMatchingKey(allSamples, RFID_KEYS, 'rfidUid'),
      emailKey: pickFirstMatchingKey(studentSamples, EMAIL_KEYS, 'email'),
      dateKey: pickFirstMatchingKey(sampleObjects, DATE_KEYS, 'date'),
      timeKey: pickFirstMatchingKey(sampleObjects, TIME_KEYS, 'time'),
      statusKey: pickFirstMatchingKey(sampleObjects, STATUS_KEYS, 'status'),
      timestampKey: pickFirstMatchingKey(sampleObjects, TIMESTAMP_KEYS, 'timestamp'),
    },
    topLevelKeys,
    permissionDeniedPaths,
    inspectedAt: Date.now(),
  };
}

function looksLikeLeafStudentObject(obj: Record<string, unknown>): boolean {
  return (
    readCandidate(obj, NAME_KEYS) !== undefined ||
    readCandidate(obj, ROLL_KEYS) !== undefined ||
    readCandidate(obj, EMAIL_KEYS) !== undefined ||
    readRfidCandidate(obj) !== null
  );
}

function collectStudentEntries(
  node: unknown,
  currentPath: string,
  out: { key: string; rawPath: string; val: unknown }[],
  depth = 0
): void {
  if (!isPlainObject(node) || depth > 3) return;

  for (const [key, val] of Object.entries(node)) {
    const nextPath = `${currentPath}/${key}`;
    if (isPlainObject(val)) {
      if (looksLikeLeafStudentObject(val) || isFirebaseAuthUid(key) || looksLikeHexOrNumericRfid(key)) {
        out.push({ key, rawPath: nextPath, val });
      } else {
        collectStudentEntries(val, nextPath, out, depth + 1);
      }
    } else if (typeof val === 'string' && val.trim() !== '') {
      out.push({ key, rawPath: nextPath, val });
    }
  }
}

export function normalizeStudentsFromSources(
  sources: { path: string; node: unknown }[],
  currentAuthUser?: { uid: string; email?: string | null } | null
): { students: StudentRecord[]; pendingAccounts: PendingStudentAccount[] } {
  const rawEntries: { key: string; rawPath: string; val: unknown }[] = [];
  for (const src of sources) {
    if (src.node) {
      collectStudentEntries(src.node, src.path, rawEntries);
    }
  }

  const parsed: StudentRecord[] = [];

  for (const entry of rawEntries) {
    const { key, rawPath, val } = entry;

    if (isPlainObject(val)) {
      const rawName = readCandidate(val, NAME_KEYS);
      const rawRoll = readCandidate(val, ROLL_KEYS);
      const rawEmail = readCandidate(val, EMAIL_KEYS);
      const rfidMatch = readRfidCandidate(val);
      const authUidFromDb = readAuthUidCandidate(val, key);
      const dept = val.department ?? val.dept ?? val.branch ?? val.class ?? val.section;
      const createdAtVal = val.createdAt ?? val.created_at;

      const rfidUid = rfidMatch
        ? normalizeRfidUid(rfidMatch.value)
        : looksLikeHexOrNumericRfid(key)
        ? normalizeRfidUid(key)
        : '';

      const email = rawEmail ? String(rawEmail).trim() : '—';
      const rollNumber = rawRoll ? String(rawRoll).trim() : '—';
      const name = rawName ? String(rawName).trim() : '';

      const rfidAssigned =
        typeof val.rfidAssigned === 'boolean' ? val.rfidAssigned && Boolean(rfidUid) : Boolean(rfidUid);

      const isPendingByFlag =
        val.pending === true ||
        val.status === 'pending' ||
        val.registrationStatus === 'pending';

      parsed.push({
        id: key,
        rawPath,
        name: name || (email !== '—' ? email.split('@')[0] : `Student (${key})`),
        rollNumber,
        email,
        rfidUid,
        authUid: authUidFromDb,
        rfidAssigned,
        isPendingRegistration: isPendingByFlag || (!name && !rfidUid && rollNumber === '—'),
        createdAt:
          typeof createdAtVal === 'string' || typeof createdAtVal === 'number'
            ? createdAtVal
            : undefined,
        department: dept ? String(dept) : undefined,
        raw: val,
      });
    } else if (typeof val === 'string' && val.trim() !== '') {
      const keyIsAuth = isFirebaseAuthUid(key);
      const rfidUid = !keyIsAuth && looksLikeHexOrNumericRfid(key) ? normalizeRfidUid(key) : '';
      parsed.push({
        id: key,
        rawPath,
        name: val.trim(),
        rollNumber: '—',
        email: '—',
        rfidUid,
        authUid: keyIsAuth ? key : undefined,
        rfidAssigned: Boolean(rfidUid),
        raw: { name: val.trim() },
      });
    }
  }

  // Merge duplicates across multiple paths (preferring /students path over /users)
  const sortedRaw = [...parsed].sort((a, b) => {
    const aIsStudents = a.rawPath.toLowerCase().startsWith('students/') ? 0 : 1;
    const bIsStudents = b.rawPath.toLowerCase().startsWith('students/') ? 0 : 1;
    return aIsStudents - bIsStudents;
  });

  const merged: StudentRecord[] = [];
  for (const item of sortedRaw) {
    const itemNormRfid = item.rfidUid ? normalizeRfidKey(item.rfidUid) : '';
    const itemEmail = item.email !== '—' ? item.email.toLowerCase() : '';

    const existing = merged.find(
      (m) =>
        (item.authUid && m.authUid && m.authUid === item.authUid) ||
        (itemEmail && m.email !== '—' && m.email.toLowerCase() === itemEmail) ||
        (itemNormRfid && m.rfidUid && normalizeRfidKey(m.rfidUid) === itemNormRfid)
    );

    if (existing) {
      if (
        (existing.name.startsWith('Student (') || existing.isPendingRegistration) &&
        !item.name.startsWith('Student (')
      ) {
        existing.name = item.name;
      }
      if (existing.rollNumber === '—' && item.rollNumber !== '—') {
        existing.rollNumber = item.rollNumber;
      }
      if (existing.email === '—' && item.email !== '—') {
        existing.email = item.email;
      }
      if (!existing.rfidUid && item.rfidUid) {
        existing.rfidUid = item.rfidUid;
        existing.rfidAssigned = item.rfidAssigned;
      }
      if (!existing.authUid && item.authUid) {
        existing.authUid = item.authUid;
      }
      if (!existing.department && item.department) {
        existing.department = item.department;
      }
      if (existing.isPendingRegistration && !item.isPendingRegistration && item.rollNumber !== '—') {
        existing.isPendingRegistration = false;
      }
    } else {
      merged.push(item);
    }
  }

  // Enrich confirmed students with exact Firebase info if matched (never invent email!)
  for (const s of merged) {
    if (s.authUid) {
      const confirmed = CONFIRMED_STUDENT_PROFILES.find((c) => c.authUid === s.authUid);
      if (confirmed) {
        if (s.email === '—' && confirmed.email) s.email = confirmed.email;
        if (
          s.email === '—' &&
          currentAuthUser?.uid === s.authUid &&
          currentAuthUser.email
        ) {
          s.email = currentAuthUser.email;
        }
      }
    }
  }

  // Filter out ESP32 device account(s) and separate any pending student accounts
  const pendingAccounts: PendingStudentAccount[] = [];
  const confirmedStudents: StudentRecord[] = [];

  for (const s of merged) {
    // Never treat the ESP32 device account as a student or pending student registration
    if (
      isEsp32DeviceUid(s.authUid) ||
      isEsp32DeviceUid(s.id) ||
      (s.email !== '—' && isEsp32DeviceEmail(s.email))
    ) {
      continue;
    }

    const pendingDef = PENDING_AUTH_ACCOUNTS.find(
      (p) =>
        p.authUid === s.authUid ||
        (s.email !== '—' && s.email.toLowerCase() === p.email.toLowerCase())
    );

    const isStillPending =
      pendingDef &&
      (s.isPendingRegistration || s.rollNumber === '—' || !s.rfidAssigned);

    if (pendingDef && isStillPending) {
      pendingAccounts.push({
        authUid: pendingDef.authUid,
        email: s.email !== '—' ? s.email : pendingDef.email,
        statusLabel: 'Pending Student Registration',
        existingPath: s.rawPath,
        existingName: s.name.startsWith('Student (') ? undefined : s.name,
        existingRollNumber: s.rollNumber !== '—' ? s.rollNumber : undefined,
      });
    } else {
      confirmedStudents.push(s);
    }
  }

  // Ensure any PENDING_AUTH_ACCOUNTS not in DB at all still show up under Pending Student Registration
  for (const pendingDef of PENDING_AUTH_ACCOUNTS) {
    const alreadyHandled =
      pendingAccounts.some((p) => p.authUid === pendingDef.authUid) ||
      confirmedStudents.some((s) => s.authUid === pendingDef.authUid);
    if (!alreadyHandled) {
      pendingAccounts.push({
        authUid: pendingDef.authUid,
        email: pendingDef.email,
        statusLabel: 'Pending Student Registration',
      });
    }
  }

  confirmedStudents.sort((a, b) => {
    const rA = Number(a.rollNumber);
    const rB = Number(b.rollNumber);
    if (!Number.isNaN(rA) && !Number.isNaN(rB) && rA !== rB) return rA - rB;
    return a.name.localeCompare(b.name);
  });

  return { students: confirmedStudents, pendingAccounts };
}

function buildStudentLookup(students: StudentRecord[]) {
  const byRfid = new Map<string, StudentRecord>();
  const byAuthUid = new Map<string, StudentRecord>();
  const byId = new Map<string, StudentRecord>();
  const byRoll = new Map<string, StudentRecord>();
  const byEmail = new Map<string, StudentRecord>();

  for (const s of students) {
    const idIsStaleRfid =
      looksLikeHexOrNumericRfid(s.id) &&
      Boolean(s.rfidUid) &&
      normalizeRfidKey(s.id) !== normalizeRfidKey(s.rfidUid);
    if (!idIsStaleRfid) {
      byId.set(s.id.toLowerCase(), s);
    }
    if (s.rfidUid) {
      byRfid.set(normalizeRfidKey(s.rfidUid), s);
      byRfid.set(s.rfidUid.toLowerCase(), s);
    }
    if (s.authUid) {
      byAuthUid.set(s.authUid.toLowerCase(), s);
    }
    if (s.rollNumber && s.rollNumber !== '—') {
      byRoll.set(s.rollNumber.toLowerCase(), s);
    }
    if (s.email && s.email !== '—') {
      byEmail.set(s.email.toLowerCase(), s);
    }
  }

  return { byRfid, byAuthUid, byId, byRoll, byEmail };
}

function normalizeStatus(rawStatus: unknown, fallback: string = 'Present'): string {
  if (rawStatus === undefined || rawStatus === null || rawStatus === '') return fallback;
  if (typeof rawStatus === 'boolean') return rawStatus ? 'Present' : 'Absent';
  const s = String(rawStatus).trim();
  const lower = s.toLowerCase();
  if (lower === 'present' || lower === 'p' || lower === 'in' || lower === '1' || lower === 'true') {
    return 'Present';
  }
  if (lower === 'absent' || lower === 'a' || lower === '0' || lower === 'false') {
    return 'Absent';
  }
  if (lower === 'late' || lower === 'l') {
    return 'Late';
  }
  if (lower === 'excused' || lower === 'e' || lower === 'leave') {
    return 'Excused';
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildAttendanceItem(params: {
  id: string;
  rawPath: string;
  rawVal: unknown;
  fallbackDateISO?: string;
  fallbackKeyHint?: string;
  lookup: ReturnType<typeof buildStudentLookup>;
}): AttendanceRecord {
  const { id, rawPath, rawVal, fallbackDateISO, fallbackKeyHint, lookup } = params;

  if (isPlainObject(rawVal)) {
    const rawName = readCandidate(rawVal, NAME_KEYS);
    const rawRoll = readCandidate(rawVal, ROLL_KEYS);
    const rawEmail = readCandidate(rawVal, EMAIL_KEYS);
    const rfidMatch = readRfidCandidate(rawVal);
    const rawAuthInRecord = readAuthUidCandidate(rawVal, fallbackKeyHint);
    const authUidInRecord =
      rawAuthInRecord && !isEsp32DeviceUid(rawAuthInRecord)
        ? rawAuthInRecord
        : undefined;
    const rawDate = readCandidate(rawVal, DATE_KEYS);
    const rawTime = readCandidate(rawVal, TIME_KEYS);
    const rawTs = readCandidate(rawVal, TIMESTAMP_KEYS);
    const rawStatus = readCandidate(rawVal, STATUS_KEYS);

    const hintIsAuth = Boolean(fallbackKeyHint && isFirebaseAuthUid(fallbackKeyHint));
    const rfidCandidate = rfidMatch
      ? normalizeRfidUid(rfidMatch.value)
      : fallbackKeyHint && !isDateKey(fallbackKeyHint) && !hintIsAuth && !fallbackKeyHint.startsWith('-')
      ? normalizeRfidUid(fallbackKeyHint)
      : '';

    const normRfid = rfidCandidate ? normalizeRfidKey(rfidCandidate) : '';

    const matchedStudent: StudentRecord | undefined =
      (normRfid ? lookup.byRfid.get(normRfid) : undefined) ??
      (authUidInRecord ? lookup.byAuthUid.get(authUidInRecord.toLowerCase()) : undefined) ??
      (rawEmail !== undefined && rawEmail !== null
        ? lookup.byEmail.get(String(rawEmail).trim().toLowerCase())
        : undefined) ??
      (rawRoll !== undefined && rawRoll !== null
        ? lookup.byRoll.get(String(rawRoll).trim().toLowerCase())
        : undefined) ??
      (fallbackKeyHint ? lookup.byId.get(fallbackKeyHint.toLowerCase()) : undefined) ??
      lookup.byId.get(id.toLowerCase());

    const dateISO =
      parseAnyDateToISO(rawDate) ||
      (fallbackDateISO ? parseAnyDateToISO(fallbackDateISO) : null) ||
      parseAnyDateToISO(rawTs) ||
      getISTTodayISO();

    const checkInTime24 = parseTimeTo24h(rawTime) || parseTimeTo24h(rawTs) || '';

    const timestampMs =
      typeof rawTs === 'number' && Number.isFinite(rawTs)
        ? rawTs < 1e12
          ? rawTs * 1000
          : rawTs
        : combineISTDateAndTimeToMs(dateISO, checkInTime24 || '00:00:00');

    const studentName = matchedStudent?.name ?? (rawName ? String(rawName).trim() : rfidCandidate || 'Unmatched Student');
    const rollNumber = matchedStudent?.rollNumber !== '—' && matchedStudent?.rollNumber
      ? matchedStudent.rollNumber
      : rawRoll
      ? String(rawRoll).trim()
      : '—';

    const resolvedRfid =
      rfidCandidate || (matchedStudent?.rfidAssigned ? matchedStudent.rfidUid : '') || 'Unmatched';

    const status = normalizeStatus(rawStatus, 'Present');

    return {
      id,
      rawPath,
      studentKey: matchedStudent?.id ?? (rfidCandidate || authUidInRecord || id),
      studentName,
      rollNumber,
      email: matchedStudent?.email ?? (rawEmail ? String(rawEmail).trim() : undefined),
      rfidUid: resolvedRfid,
      dateISO,
      dateDisplay: formatDateDDMMYYYY(dateISO),
      checkInTime24,
      checkInTimeDisplay: formatTime12hFrom24(checkInTime24),
      timestampMs,
      status,
      raw: rawVal,
      isUnmatchedRfid: !matchedStudent && !rfidCandidate,
    };
  }

  const hint = fallbackKeyHint || id;
  const hintIsAuth = isFirebaseAuthUid(hint);
  const matchedStudent = hintIsAuth
    ? lookup.byAuthUid.get(hint.toLowerCase()) ?? lookup.byId.get(hint.toLowerCase())
    : lookup.byRfid.get(normalizeRfidKey(hint)) ?? lookup.byId.get(hint.toLowerCase());

  const dateISO =
    (fallbackDateISO ? parseAnyDateToISO(fallbackDateISO) : null) ||
    parseAnyDateToISO(rawVal) ||
    getISTTodayISO();

  const checkInTime24 = typeof rawVal === 'boolean' ? '' : parseTimeTo24h(rawVal);
  const status = typeof rawVal === 'boolean' ? (rawVal ? 'Present' : 'Absent') : 'Present';
  const resolvedRfid = !hintIsAuth
    ? normalizeRfidUid(hint)
    : matchedStudent?.rfidAssigned
    ? matchedStudent.rfidUid
    : 'Unmatched';

  return {
    id,
    rawPath,
    studentKey: matchedStudent?.id ?? hint,
    studentName: matchedStudent?.name ?? (hintIsAuth ? 'Unmatched Auth User' : hint),
    rollNumber: matchedStudent?.rollNumber ?? '—',
    email: matchedStudent?.email,
    rfidUid: resolvedRfid,
    dateISO,
    dateDisplay: formatDateDDMMYYYY(dateISO),
    checkInTime24,
    checkInTimeDisplay: formatTime12hFrom24(checkInTime24),
    timestampMs: combineISTDateAndTimeToMs(dateISO, checkInTime24 || '00:00:00'),
    status,
    raw: rawVal,
    isUnmatchedRfid: !matchedStudent && hintIsAuth,
  };
}

function isAttendanceLeafObject(obj: Record<string, unknown>): boolean {
  return (
    readCandidate(obj, TIME_KEYS) !== undefined ||
    readCandidate(obj, TIMESTAMP_KEYS) !== undefined ||
    readCandidate(obj, STATUS_KEYS) !== undefined ||
    readCandidate(obj, DATE_KEYS) !== undefined ||
    readRfidCandidate(obj) !== null ||
    readCandidate(obj, NAME_KEYS) !== undefined
  );
}

function walkAttendanceTree(params: {
  node: unknown;
  currentPath: string;
  contextDateISO?: string;
  contextKeyHint?: string;
  pathSegments: string[];
  lookup: ReturnType<typeof buildStudentLookup>;
  out: AttendanceRecord[];
  depth?: number;
}): void {
  const {
    node,
    currentPath,
    contextDateISO,
    contextKeyHint,
    pathSegments,
    lookup,
    out,
    depth = 0,
  } = params;

  if (!isPlainObject(node) || depth > 5) return;

  for (const [key, val] of Object.entries(node)) {
    const nextPath = currentPath ? `${currentPath}/${key}` : key;
    const nextSegments = [...pathSegments, key];

    let detectedDate = contextDateISO;
    if (isDateKey(key)) {
      detectedDate = key;
    } else if (nextSegments.length >= 3) {
      const len = nextSegments.length;
      const [y, m, d] = [nextSegments[len - 3], nextSegments[len - 2], nextSegments[len - 1]];
      if (/^20\d{2}$/.test(y) && /^(0?[1-9]|1[0-2])$/.test(m) && /^(0?[1-9]|[12]\d|3[01])$/.test(d)) {
        detectedDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }

    const nextHint =
      !isDateKey(key) && !/^(20\d{2}|0?[1-9]|1[0-2]|[12]\d|3[01])$/.test(key) && !key.startsWith('-')
        ? key
        : contextKeyHint;

    if (isPlainObject(val)) {
      if (isAttendanceLeafObject(val)) {
        out.push(
          buildAttendanceItem({
            id: nextSegments.join('_'),
            rawPath: nextPath,
            rawVal: val,
            fallbackDateISO: detectedDate,
            fallbackKeyHint: nextHint,
            lookup,
          })
        );
      } else {
        walkAttendanceTree({
          node: val,
          currentPath: nextPath,
          contextDateISO: detectedDate,
          contextKeyHint: nextHint,
          pathSegments: nextSegments,
          lookup,
          out,
          depth: depth + 1,
        });
      }
    } else if (val !== null && val !== undefined && (detectedDate || nextHint)) {
      out.push(
        buildAttendanceItem({
          id: nextSegments.join('_'),
          rawPath: nextPath,
          rawVal: val,
          fallbackDateISO: detectedDate,
          fallbackKeyHint: nextHint,
          lookup,
        })
      );
    }
  }
}

export function normalizeAttendanceFromSources(
  sources: { path: string; node: unknown }[],
  students: StudentRecord[]
): AttendanceRecord[] {
  const lookup = buildStudentLookup(students);
  const records: AttendanceRecord[] = [];

  for (const src of sources) {
    if (!src.node) continue;
    walkAttendanceTree({
      node: src.node,
      currentPath: src.path,
      pathSegments: [],
      lookup,
      out: records,
    });
  }

  return records.sort((a, b) => {
    if (a.dateISO !== b.dateISO) return b.dateISO.localeCompare(a.dateISO);
    return b.checkInTime24.localeCompare(a.checkInTime24);
  });
}
