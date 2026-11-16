const IST_TIMEZONE = 'Asia/Kolkata';

export interface ISTClockSnapshot {
  dateISO: string;       // YYYY-MM-DD
  dateDisplay: string;   // DD-MM-YYYY
  time24: string;        // HH:mm:ss
  time12: string;        // hh:mm:ss AM/PM
  weekday: string;       // Monday, etc.
  fullDateDisplay: string; // 16 Nov 2026
}

export function getISTSnapshot(date: Date = new Date()): ISTClockSnapshot {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'long',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  const year = get('year');
  const month = get('month');
  const day = get('day');
  const rawHour = get('hour');
  const hourNum = rawHour === '24' ? 0 : parseInt(rawHour, 10);
  const hour24 = String(hourNum).padStart(2, '0');
  const minute = get('minute');
  const second = get('second');
  const weekday = get('weekday');

  const dateISO = `${year}-${month}-${day}`;
  const dateDisplay = `${day}-${month}-${year}`;
  const time24 = `${hour24}:${minute}:${second}`;
  const time12 = formatTime12hFrom24(time24);

  const fullDateDisplay = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);

  return {
    dateISO,
    dateDisplay,
    time24,
    time12,
    weekday,
    fullDateDisplay,
  };
}

export function getISTTodayISO(): string {
  return getISTSnapshot().dateISO;
}

export function formatDateDDMMYYYY(isoDate: string): string {
  if (!isoDate) return '—';
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function formatDateWithFormat(
  isoDate: string,
  format: 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'YYYY_MM_DD'
): string {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;
  const [, y, m, d] = match;
  if (format === 'DD-MM-YYYY') return `${d}-${m}-${y}`;
  if (format === 'YYYY_MM_DD') return `${y}_${m}_${d}`;
  return `${y}-${m}-${d}`;
}

export function parseAnyDateToISO(input: unknown): string | null {
  if (input === null || input === undefined) return null;

  if (typeof input === 'number' && Number.isFinite(input)) {
    const ms = input < 1e12 ? input * 1000 : input;
    return getISTSnapshot(new Date(ms)).dateISO;
  }

  const str = String(input).trim();
  if (!str) return null;

  // Numeric timestamp string
  if (/^\d{10,13}$/.test(str)) {
    const num = Number(str);
    const ms = num < 1e12 ? num * 1000 : num;
    return getISTSnapshot(new Date(ms)).dateISO;
  }

  // YYYY-MM-DD or YYYY/MM/DD or YYYY_MM_DD
  const ymd = str.match(/^(\d{4})[-/_](\d{1,2})[-/_](\d{1,2})/);
  if (ymd) {
    const y = ymd[1];
    const m = ymd[2].padStart(2, '0');
    const d = ymd[3].padStart(2, '0');
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      // Check if full ISO timestamp with timezone (e.g. 2026-11-16T18:45:00Z)
      if (str.includes('T') && (str.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(str))) {
        const parsed = new Date(str);
        if (!Number.isNaN(parsed.getTime())) {
          return getISTSnapshot(parsed).dateISO;
        }
      }
      return `${y}-${m}-${d}`;
    }
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    const y = dmy[3];
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return `${y}-${m}-${d}`;
    }
  }

  // Fallback JS Date parsing converted to IST
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return getISTSnapshot(parsed).dateISO;
  }

  return null;
}

export function parseTimeTo24h(input: unknown): string {
  if (input === null || input === undefined) return '';

  if (typeof input === 'number' && Number.isFinite(input)) {
    const ms = input < 1e12 ? input * 1000 : input;
    return getISTSnapshot(new Date(ms)).time24;
  }

  const str = String(input).trim();
  if (!str) return '';

  // Numeric epoch string
  if (/^\d{10,13}$/.test(str)) {
    const num = Number(str);
    const ms = num < 1e12 ? num * 1000 : num;
    return getISTSnapshot(new Date(ms)).time24;
  }

  // ISO datetime string
  if (str.includes('T')) {
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      return getISTSnapshot(parsed).time24;
    }
  }

  // 12-hour format: hh:mm(:ss) AM/PM
  const match12 = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = match12[2];
    const s = (match12[3] ?? '00').padStart(2, '0');
    const period = match12[4].toUpperCase();
    if (period === 'PM' && h < 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}:${s}`;
  }

  // 24-hour format: HH:mm(:ss)
  const match24 = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match24) {
    const h = Math.min(23, Math.max(0, parseInt(match24[1], 10)));
    const m = match24[2];
    const s = (match24[3] ?? '00').padStart(2, '0');
    return `${String(h).padStart(2, '0')}:${m}:${s}`;
  }

  return '';
}

export function formatTime12hFrom24(time24: string): string {
  if (!time24) return '—';
  const match = time24.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return time24;
  const h24 = parseInt(match[1], 10);
  const m = match[2];
  const s = match[3] ?? '00';
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:${m}:${s} ${period}`;
}

export function to12hParts(time24: string): {
  hour: string;
  minute: string;
  second: string;
  period: 'AM' | 'PM';
} {
  const clean = time24 || '09:00:00';
  const match = clean.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return { hour: '09', minute: '00', second: '00', period: 'AM' };
  }
  const h24 = parseInt(match[1], 10);
  const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return {
    hour: String(h12).padStart(2, '0'),
    minute: match[2],
    second: (match[3] ?? '00').padStart(2, '0'),
    period,
  };
}

export function from12hParts(
  hour12: string,
  minute: string,
  second: string,
  period: 'AM' | 'PM'
): string {
  let h = Math.min(12, Math.max(1, parseInt(hour12, 10) || 12));
  if (period === 'PM' && h < 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  const m = String(Math.min(59, Math.max(0, parseInt(minute, 10) || 0))).padStart(2, '0');
  const s = String(Math.min(59, Math.max(0, parseInt(second, 10) || 0))).padStart(2, '0');
  return `${String(h).padStart(2, '0')}:${m}:${s}`;
}

export function combineISTDateAndTimeToMs(dateISO: string, time24: string): number {
  const safeDate = dateISO || getISTTodayISO();
  const safeTime = time24 || '00:00:00';
  const normalizedTime = safeTime.length === 5 ? `${safeTime}:00` : safeTime;
  const dt = new Date(`${safeDate}T${normalizedTime}+05:30`);
  return Number.isNaN(dt.getTime()) ? Date.now() : dt.getTime();
}
