import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

export const firebaseConfig = {
  apiKey: "AIzaSyBmkxVy6RVQHCegd3UZkdJaKW8SLJfJiU0",
  authDomain: "rfid-attendance-system-1f0ea.firebaseapp.com",
  databaseURL: "https://rfid-attendance-system-1f0ea-default-rtdb.firebaseio.com",
  projectId: "rfid-attendance-system-1f0ea",
  storageBucket: "rfid-attendance-system-1f0ea.firebasestorage.app",
  messagingSenderId: "719223259559",
  appId: "1:719223259559:web:fbdfa230914eb9e7ff7682"
};

// Super administrator UIDs with unrestricted portal and database access
export const SUPER_ADMIN_UIDS: ReadonlySet<string> = new Set([
  'EwIVr4YbJoYz5nbzzavpqQqBywt2',
]);

// Authorized administrator UIDs matching Firebase Database security rules
export const AUTHORIZED_ADMIN_UIDS: ReadonlySet<string> = new Set([
  'EwIVr4YbJoYz5nbzzavpqQqBywt2',
  'bi3c890VUXhVE0JFxroYfnlQwea2',
  'MdwxcdNtLgZp3cnYoqXBNkin8C82',
]);

export interface ConfirmedStudentSeed {
  name: string;
  rollNumber: string;
  email: string; // Empty string if email must be retrieved from existing Firebase account/DB
  authUid: string;
  rfidUid: string; // Uppercase without spaces
  replacedRfidUids?: string[]; // Legacy RFID UIDs that should be migrated in-place to rfidUid
}

// Three confirmed students linked to their Firebase Authentication UIDs and physical RFID cards
export const CONFIRMED_STUDENT_PROFILES: readonly ConfirmedStudentSeed[] = [
  {
    name: 'Abdul Hadi Ali',
    rollNumber: '1',
    email: '4623hadi@gmail.com',
    authUid: 'EwIVr4YbJoYz5nbzzavpqQqBywt2',
    rfidUid: 'E6F22E06',
    replacedRfidUids: ['DA7EA424'],
  },
  {
    name: 'Mohammed Faizaan Khatheeb',
    rollNumber: '2',
    email: '', // Retrieved strictly from existing Firebase account / RTDB data if present
    authUid: 'HIrsl3PC00ei6yMdmYo5a5mVjX03',
    rfidUid: '1AC2B124',
  },
  {
    name: 'T. Sai Vinay',
    rollNumber: '3',
    email: 'vinay@gmail.com',
    authUid: 'Ve6UDKss7NakdkkLFEHf53JZrBB2',
    rfidUid: '8ACBA824',
  },
];

// ESP32 RFID attendance scanner device account(s) — NOT student or administrator accounts
export const ESP32_DEVICE_ACCOUNTS: readonly {
  authUid: string;
  email: string;
  label: string;
}[] = [
  {
    authUid: '1LpJhzhc8zZa9IRNe4YWD2p7jbp1',
    email: 'haditacky4623@gmail.com',
    label: 'ESP32 RFID Scanner Device',
  },
];

export const ESP32_DEVICE_UIDS: ReadonlySet<string> = new Set(
  ESP32_DEVICE_ACCOUNTS.map((d) => d.authUid)
);

export const ESP32_DEVICE_EMAILS: ReadonlySet<string> = new Set(
  ESP32_DEVICE_ACCOUNTS.map((d) => d.email.toLowerCase())
);

// Accounts explicitly awaiting student registration (empty — device UID is excluded from students)
export const PENDING_AUTH_ACCOUNTS: readonly {
  authUid: string;
  email: string;
}[] = [];

const KNOWN_AUTH_UID_SET: ReadonlySet<string> = new Set([
  ...AUTHORIZED_ADMIN_UIDS,
  ...CONFIRMED_STUDENT_PROFILES.map((s) => s.authUid),
  ...ESP32_DEVICE_UIDS,
  ...PENDING_AUTH_ACCOUNTS.map((p) => p.authUid),
]);

export function normalizeRfidUid(raw: string): string {
  return raw.trim().replace(/[\s:-]/g, '').toUpperCase();
}

export function isFirebaseAuthUid(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (KNOWN_AUTH_UID_SET.has(trimmed)) return true;
  // Standard Firebase Auth UIDs are 24-36 alphanumeric chars containing non-hex letters [g-zG-Z]
  return /^[A-Za-z0-9]{24,36}$/.test(trimmed) && /[g-zG-Z]/.test(trimmed);
}

export function isSuperAdminUid(uid?: string | null): boolean {
  return Boolean(uid && SUPER_ADMIN_UIDS.has(uid));
}

export function isEsp32DeviceUid(uid?: string | null): boolean {
  return Boolean(uid && ESP32_DEVICE_UIDS.has(uid.trim()));
}

export function isEsp32DeviceEmail(email?: string | null): boolean {
  return Boolean(email && ESP32_DEVICE_EMAILS.has(email.trim().toLowerCase()));
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getDatabase(app);
