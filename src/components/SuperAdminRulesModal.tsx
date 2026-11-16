import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy, ShieldCheck, X } from 'lucide-react';
import {
  AUTHORIZED_ADMIN_UIDS,
  ESP32_DEVICE_ACCOUNTS,
  SUPER_ADMIN_UIDS,
} from '../firebase/config';

interface SuperAdminRulesModalProps {
  open: boolean;
  onClose: () => void;
}

const RTDB_RULES_JSON = JSON.stringify(
  {
    rules: {
      '.read':
        "auth != null && (auth.uid === 'EwIVr4YbJoYz5nbzzavpqQqBywt2' || auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')",
      '.write':
        "auth != null && (auth.uid === 'EwIVr4YbJoYz5nbzzavpqQqBywt2' || auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82')",
      attendance: {
        '.read':
          "auth != null && (auth.uid === 'EwIVr4YbJoYz5nbzzavpqQqBywt2' || auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82' || auth.uid === '1LpJhzhc8zZa9IRNe4YWD2p7jbp1')",
        '.write':
          "auth != null && (auth.uid === 'EwIVr4YbJoYz5nbzzavpqQqBywt2' || auth.uid === 'bi3c890VUXhVE0JFxroYfnlQwea2' || auth.uid === 'MdwxcdNtLgZp3cnYoqXBNkin8C82' || auth.uid === '1LpJhzhc8zZa9IRNe4YWD2p7jbp1')",
      },
      students: {
        $uid: {
          '.read': 'auth != null && auth.uid === $uid',
        },
      },
      users: {
        $uid: {
          '.read': 'auth != null && auth.uid === $uid',
        },
      },
    },
  },
  null,
  2
);

export function SuperAdminRulesModal({ open, onClose }: SuperAdminRulesModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(RTDB_RULES_JSON);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="super-admin-rules-title"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3
                    id="super-admin-rules-title"
                    className="text-base font-semibold text-slate-900"
                  >
                    Super Admin &amp; Firebase RTDB Rules
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Non-public Realtime Database rules preserving student self-read while granting administrator access.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs space-y-1.5">
                <p className="font-semibold text-slate-700">Authorized UIDs &amp; Device Roles</p>
                {Array.from(AUTHORIZED_ADMIN_UIDS).map((uid) => (
                  <div key={uid} className="flex items-center justify-between gap-2">
                    <span className="font-mono text-slate-800 break-all">{uid}</span>
                    <span className="text-slate-500 whitespace-nowrap shrink-0">
                      {SUPER_ADMIN_UIDS.has(uid) ? 'Super Admin' : 'Admin'}
                    </span>
                  </div>
                ))}
                {ESP32_DEVICE_ACCOUNTS.map((dev) => (
                  <div
                    key={dev.authUid}
                    className="flex items-center justify-between gap-2 border-t border-slate-200/70 pt-1.5"
                  >
                    <span className="font-mono text-sky-800 break-all">{dev.authUid}</span>
                    <span className="text-sky-700 font-medium whitespace-nowrap shrink-0">
                      ESP32 Device (/attendance write only)
                    </span>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Firebase Console → Realtime Database → Rules
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy Rules JSON
                      </>
                    )}
                  </button>
                </div>
                <pre className="mt-2 max-h-60 overflow-auto rounded-xl border border-slate-200 bg-slate-900 p-4 font-mono text-xs leading-relaxed text-sky-100">
                  {RTDB_RULES_JSON}
                </pre>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
