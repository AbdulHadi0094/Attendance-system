import { User } from 'firebase/auth';
import { AnimatePresence, motion } from 'motion/react';
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Radio,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { DetectedSchema, NavTab } from '../types/attendance';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  user: User;
  isSuperAdmin: boolean;
  schema: DetectedSchema | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenRulesModal: () => void;
  onSignOut: () => void;
}

const NAV_ITEMS: { id: NavTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'history', label: 'Attendance History', icon: CalendarDays },
  { id: 'students', label: 'Registered Students', icon: Users },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  user,
  isSuperAdmin,
  schema,
  mobileOpen,
  onCloseMobile,
  onOpenRulesModal,
  onSignOut,
}: SidebarProps) {
  const sidebarBody = (
    <div className="flex h-full flex-col justify-between bg-white border-r border-slate-200 px-4 py-5">
      <div>
        <div className="flex items-center justify-between px-2 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 border border-sky-200 text-sky-600">
              <Radio className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <span className="block truncate text-sm font-bold tracking-tight text-slate-900">
                RFID Attendance
              </span>
              <span className="block truncate text-xs text-slate-500">
                Admin Portal
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation menu"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="mt-5 space-y-1" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-sky-50 text-sky-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon
                  className={`h-4.5 w-4.5 shrink-0 ${
                    active ? 'text-sky-600' : 'text-slate-400'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {schema && (
          <div className="mt-6 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-xs">
            <p className="font-semibold text-slate-700">Connected Database</p>
            <div className="mt-2 space-y-1 text-slate-500">
              <div className="flex items-center justify-between gap-2">
                <span>Students</span>
                <span className="font-mono text-slate-700 truncate">
                  /{schema.studentsPath || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Attendance</span>
                <span className="font-mono text-slate-700 truncate">
                  /{schema.attendancePath ?? '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Layout</span>
                <span className="font-mono text-slate-700">
                  {schema.topology === 'date_nested'
                    ? 'Date-keyed'
                    : schema.topology === 'student_nested'
                    ? 'Student-keyed'
                    : 'Flat list'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 pt-4 space-y-2">
        <div className="px-2 pb-1">
          <p className="truncate text-xs font-semibold text-slate-900">
            {user.displayName || (isSuperAdmin ? 'Super Administrator' : 'Administrator')}
          </p>
          <p className="truncate text-xs text-slate-500">
            {isSuperAdmin ? 'Super Admin · ' : 'Admin · '}
            {user.email || user.uid}
          </p>
        </div>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => {
              onOpenRulesModal();
              onCloseMobile();
            }}
            className="flex w-full items-center gap-2.5 rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs font-semibold text-sky-800 transition-colors hover:bg-sky-100/70"
          >
            <ShieldCheck className="h-4 w-4 text-sky-600" />
            Database Rules &amp; Roles
          </button>
        )}
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <LogOut className="h-4 w-4 text-slate-400" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-64">
        {sidebarBody}
      </aside>

      {/* Mobile slide-over drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={onCloseMobile}
              className="fixed inset-0 bg-slate-900/35 backdrop-blur-[1px]"
            />
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 h-full w-64"
            >
              {sidebarBody}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
