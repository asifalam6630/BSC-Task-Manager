import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  auth,
  clearCalendarAccessToken,
  db,
  getCalendarAccessToken,
  handleFirestoreError,
  logoutUser,
  OperationType,
  signInWithGoogle,
} from '../lib/firebase';
import {
  ensureUserProfile,
  seedDemoDataset,
  updateUserProfile,
} from '../lib/firestoreService';
import {
  AppNotification,
  Employee,
  Meeting,
  NavSection,
  Project,
  RaciEntry,
  ROLE_PERMISSIONS,
  Task,
  UserProfile,
} from '../types';
import { ConfirmDialog, ConfirmOptions } from '../components/ConfirmDialog';
import { ToastContainer, ToastItem } from '../components/ToastContainer';
import {
  BSC_ROLE_CAPABILITIES,
  BscActingRole,
  BscGovernanceConfig,
  BscKra,
  BscRoleCapabilities,
  BscTask,
  CalendarSyncLog,
  DateChangeRequest,
  DEFAULT_BSC_CONFIG,
  ProjectCharter,
  ReviewMeeting,
  TaskFollowUp,
} from '../types/bsc';
import { clearTuragBscDemo, seedTuragBscDemo } from '../lib/bscService';

interface AppContextValue {
  user: User | null;
  profile: UserProfile | null;
  authReady: boolean;
  dataLoading: boolean;
  calendarToken: string | null;
  projects: Project[];
  tasks: Task[];
  meetings: Meeting[];
  raciEntries: RaciEntry[];
  employees: Employee[];
  notifications: AppNotification[];
  activeNav: NavSection;
  setActiveNav: (nav: NavSection) => void;
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  globalSearch: string;
  setGlobalSearch: (s: string) => void;
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  viewMode: 'desktop' | 'mobile';
  setViewMode: (m: 'desktop' | 'mobile') => void;
  permissions: (typeof ROLE_PERMISSIONS)[keyof typeof ROLE_PERMISSIONS];
  signIn: (requestCalendar?: boolean) => Promise<void>;
  connectGoogleCalendar: () => Promise<string | null>;
  signOut: () => Promise<void>;
  notify: (type: ToastItem['type'], title: string, message?: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  seedDemo: () => Promise<void>;
  refreshProfile: (updates: Partial<UserProfile>) => Promise<void>;
  // Turag BSC Follow-up & Task Management state (additive)
  bscKras: BscKra[];
  projectCharters: ProjectCharter[];
  bscTasks: BscTask[];
  bscFollowUps: TaskFollowUp[];
  dateChangeRequests: DateChangeRequest[];
  reviewMeetings: ReviewMeeting[];
  calendarSyncLogs: CalendarSyncLog[];
  bscConfig: Omit<BscGovernanceConfig, 'ownerId' | 'id' | 'updatedAt'>;
  bscSimulatedDate: string;
  setBscSimulatedDate: (d: string) => void;
  bscActingRole: BscActingRole;
  setBscActingRole: (r: BscActingRole) => void;
  bscCapabilities: BscRoleCapabilities;
  activeBscTaskId: string | null;
  setActiveBscTaskId: (id: string | null) => void;
  seedTuragBsc: () => Promise<void>;
  clearTuragBsc: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [calendarToken, setCalendarToken] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [raciEntries, setRaciEntries] = useState<RaciEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');

  // Turag BSC Follow-up module state
  const [bscKras, setBscKras] = useState<BscKra[]>([]);
  const [projectCharters, setProjectCharters] = useState<ProjectCharter[]>([]);
  const [bscTasks, setBscTasks] = useState<BscTask[]>([]);
  const [bscFollowUps, setBscFollowUps] = useState<TaskFollowUp[]>([]);
  const [dateChangeRequests, setDateChangeRequests] = useState<DateChangeRequest[]>([]);
  const [reviewMeetings, setReviewMeetings] = useState<ReviewMeeting[]>([]);
  const [calendarSyncLogs, setCalendarSyncLogs] = useState<CalendarSyncLog[]>([]);
  const [bscConfig, setBscConfig] = useState<Omit<BscGovernanceConfig, 'ownerId' | 'id' | 'updatedAt'>>(DEFAULT_BSC_CONFIG);
  const [bscSimulatedDate, setBscSimulatedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [bscActingRole, setBscActingRole] = useState<BscActingRole>('Admin');
  const [activeBscTaskId, setActiveBscTaskId] = useState<string | null>(null);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    options: ConfirmOptions | null;
  }>({ open: false, options: null });
  const confirmResolverRef = useRef<((val: boolean) => void) | null>(null);
  const autoSeededUidRef = useRef<string | null>(null);

  // Sync Tailwind v4 dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const notify = useCallback((type: ToastItem['type'], title: string, message?: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmState({ open: true, options });
    });
  }, []);

  const handleConfirmResolve = (val: boolean) => {
    setConfirmState({ open: false, options: null });
    if (confirmResolverRef.current) {
      confirmResolverRef.current(val);
      confirmResolverRef.current = null;
    }
  };

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (fbUser) {
        setCalendarToken(getCalendarAccessToken());
        try {
          const prof = await ensureUserProfile(
            fbUser.uid,
            fbUser.email || 'user@example.com',
            fbUser.displayName || 'Executive User',
            fbUser.photoURL || undefined
          );
          setProfile(prof);
          if (prof.theme === 'dark' || prof.theme === 'light') {
            setTheme(prof.theme);
          }
        } catch (err) {
          console.error('Failed to ensure profile:', err);
        }
      } else {
        setProfile(null);
        setCalendarToken(null);
        clearCalendarAccessToken();
        setProjects([]);
        setTasks([]);
        setMeetings([]);
        setRaciEntries([]);
        setEmployees([]);
        setNotifications([]);
        setBscKras([]);
        setProjectCharters([]);
        setBscTasks([]);
        setBscFollowUps([]);
        setDateChangeRequests([]);
        setReviewMeetings([]);
        setCalendarSyncLogs([]);
        setBscConfig(DEFAULT_BSC_CONFIG);
        setActiveBscTaskId(null);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Real-time Firestore listeners (strictly gated on authReady && user)
  useEffect(() => {
    if (!authReady || !user) return;
    setDataLoading(true);
    const uid = user.uid;

    let loadedFlags = { p: false, t: false, m: false, r: false, e: false, n: false };
    const checkLoaded = () => {
      if (
        loadedFlags.p &&
        loadedFlags.t &&
        loadedFlags.m &&
        loadedFlags.r &&
        loadedFlags.e &&
        loadedFlags.n
      ) {
        setDataLoading(false);
      }
    };

    const unsubProjects = onSnapshot(
      query(collection(db, 'projects'), where('ownerId', '==', uid)),
      (snap) => {
        const list: Project[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Project, 'id'>) }));
        list.sort((a, b) => a.projectCode.localeCompare(b.projectCode));
        setProjects(list);
        loadedFlags.p = true;
        checkLoaded();

        // Automatically seed demo dataset once on a brand-new empty workspace
        if (list.length === 0 && autoSeededUidRef.current !== uid) {
          autoSeededUidRef.current = uid;
          seedDemoDataset(uid)
            .then(() => {
              notify(
                'info',
                'Demo portfolio loaded',
                '12 sample BSC & Governance projects were loaded for demonstration. You can clear demo data anytime in Settings.'
              );
            })
            .catch((e) => console.error('Auto demo seed error:', e));
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'projects')
    );

    const unsubTasks = onSnapshot(
      query(collection(db, 'tasks'), where('ownerId', '==', uid)),
      (snap) => {
        const list: Task[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Task, 'id'>) }));
        list.sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
        setTasks(list);
        loadedFlags.t = true;
        checkLoaded();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'tasks')
    );

    const unsubMeetings = onSnapshot(
      query(collection(db, 'meetings'), where('ownerId', '==', uid)),
      (snap) => {
        const list: Meeting[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Meeting, 'id'>) }));
        list.sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
        setMeetings(list);
        loadedFlags.m = true;
        checkLoaded();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'meetings')
    );

    const unsubRaci = onSnapshot(
      query(collection(db, 'raciEntries'), where('ownerId', '==', uid)),
      (snap) => {
        const list: RaciEntry[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<RaciEntry, 'id'>) }));
        list.sort((a, b) => a.projectCode.localeCompare(b.projectCode));
        setRaciEntries(list);
        loadedFlags.r = true;
        checkLoaded();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'raciEntries')
    );

    const unsubEmployees = onSnapshot(
      query(collection(db, 'employees'), where('ownerId', '==', uid)),
      (snap) => {
        const list: Employee[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Employee, 'id'>) }));
        list.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
        setEmployees(list);
        loadedFlags.e = true;
        checkLoaded();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'employees')
    );

    const unsubNotifs = onSnapshot(
      query(collection(db, 'notifications'), where('ownerId', '==', uid)),
      (snap) => {
        const list: AppNotification[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<AppNotification, 'id'>) }));
        list.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() || 0;
          const tb = b.createdAt?.toMillis?.() || 0;
          return tb - ta;
        });
        setNotifications(list);
        loadedFlags.n = true;
        checkLoaded();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    const unsubBscKras = onSnapshot(
      query(collection(db, 'bscKras'), where('ownerId', '==', uid)),
      (snap) => {
        const list: BscKra[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<BscKra, 'id'>) }));
        list.sort((a, b) => a.refCode.localeCompare(b.refCode));
        setBscKras(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bscKras')
    );

    const unsubCharters = onSnapshot(
      query(collection(db, 'projectCharters'), where('ownerId', '==', uid)),
      (snap) => {
        const list: ProjectCharter[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<ProjectCharter, 'id'>) }));
        list.sort((a, b) => a.charterCode.localeCompare(b.charterCode));
        setProjectCharters(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'projectCharters')
    );

    const unsubBscTasks = onSnapshot(
      query(collection(db, 'bscTasks'), where('ownerId', '==', uid)),
      (snap) => {
        const list: BscTask[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<BscTask, 'id'>) }));
        list.sort((a, b) => a.taskCode.localeCompare(b.taskCode));
        setBscTasks(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bscTasks')
    );

    const unsubBscFollowUps = onSnapshot(
      query(collection(db, 'bscFollowUps'), where('ownerId', '==', uid)),
      (snap) => {
        const list: TaskFollowUp[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<TaskFollowUp, 'id'>) }));
        list.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() || 0;
          const tb = b.createdAt?.toMillis?.() || 0;
          if (tb !== ta) return tb - ta;
          return b.date.localeCompare(a.date);
        });
        setBscFollowUps(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bscFollowUps')
    );

    const unsubDateChanges = onSnapshot(
      query(collection(db, 'dateChangeRequests'), where('ownerId', '==', uid)),
      (snap) => {
        const list: DateChangeRequest[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<DateChangeRequest, 'id'>) }));
        list.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() || 0;
          const tb = b.createdAt?.toMillis?.() || 0;
          return tb - ta;
        });
        setDateChangeRequests(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'dateChangeRequests')
    );

    const unsubReviewMeetings = onSnapshot(
      query(collection(db, 'reviewMeetings'), where('ownerId', '==', uid)),
      (snap) => {
        const list: ReviewMeeting[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<ReviewMeeting, 'id'>) }));
        list.sort((a, b) => b.date.localeCompare(a.date));
        setReviewMeetings(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'reviewMeetings')
    );

    const unsubBscConfig = onSnapshot(
      query(collection(db, 'bscGovernanceConfig'), where('ownerId', '==', uid)),
      (snap) => {
        if (!snap.empty) {
          const d = snap.docs[0].data() as BscGovernanceConfig;
          setBscConfig({
            reminderDaysBeforeDue: d.reminderDaysBeforeDue ?? DEFAULT_BSC_CONFIG.reminderDaysBeforeDue,
            escalationL1Days: d.escalationL1Days ?? DEFAULT_BSC_CONFIG.escalationL1Days,
            escalationL2Days: d.escalationL2Days ?? DEFAULT_BSC_CONFIG.escalationL2Days,
            escalationL3Days: d.escalationL3Days ?? DEFAULT_BSC_CONFIG.escalationL3Days,
            escalationL4Days: d.escalationL4Days ?? DEFAULT_BSC_CONFIG.escalationL4Days,
            blockedEscalationDays: d.blockedEscalationDays ?? DEFAULT_BSC_CONFIG.blockedEscalationDays,
            followUpComplianceTarget: d.followUpComplianceTarget ?? DEFAULT_BSC_CONFIG.followUpComplianceTarget,
            dailyDigestTime: d.dailyDigestTime || DEFAULT_BSC_CONFIG.dailyDigestTime,
            dailyDigestTimezone: d.dailyDigestTimezone || DEFAULT_BSC_CONFIG.dailyDigestTimezone,
            channels: d.channels || DEFAULT_BSC_CONFIG.channels,
          });
        } else {
          setBscConfig(DEFAULT_BSC_CONFIG);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bscGovernanceConfig')
    );

    const unsubCalendarSyncLogs = onSnapshot(
      query(collection(db, 'calendarSyncLogs'), where('ownerId', '==', uid)),
      (snap) => {
        const list: CalendarSyncLog[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<CalendarSyncLog, 'id'>) }));
        list.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() || 0;
          const tb = b.createdAt?.toMillis?.() || 0;
          if (tb !== ta) return tb - ta;
          return b.syncedAt.localeCompare(a.syncedAt);
        });
        setCalendarSyncLogs(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'calendarSyncLogs')
    );

    return () => {
      unsubProjects();
      unsubTasks();
      unsubMeetings();
      unsubRaci();
      unsubEmployees();
      unsubNotifs();
      unsubBscKras();
      unsubCharters();
      unsubBscTasks();
      unsubBscFollowUps();
      unsubDateChanges();
      unsubReviewMeetings();
      unsubBscConfig();
      unsubCalendarSyncLogs();
    };
  }, [authReady, user, notify]);

  const signIn = useCallback(
    async (requestCalendar = true) => {
      try {
        const { accessToken } = await signInWithGoogle(requestCalendar);
        setCalendarToken(accessToken);
        notify('success', 'Signed in to Task Master', 'Your strategic workspace is synchronized.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Sign-in cancelled or failed.';
        notify('error', 'Authentication failed', msg);
      }
    },
    [notify]
  );

  const connectGoogleCalendar = useCallback(async (): Promise<string | null> => {
    try {
      const { accessToken } = await signInWithGoogle(true);
      if (!accessToken) {
        notify('error', 'Calendar token unavailable', 'Please approve Google Calendar permission in the sign-in window.');
        return null;
      }
      setCalendarToken(accessToken);
      notify('success', 'Google Calendar connected', 'Two-way synchronization is ready for this session.');
      return accessToken;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not authorize Google Calendar.';
      notify('error', 'Google Calendar authorization failed', msg);
      return null;
    }
  }, [notify]);

  const signOut = useCallback(async () => {
    await logoutUser();
    setCalendarToken(null);
    notify('info', 'Signed out', 'Your session and calendar token have been cleared.');
  }, [notify]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      if (user) {
        updateUserProfile(user.uid, { theme: next }).catch(console.error);
      }
      return next;
    });
  }, [user]);

  const seedDemo = useCallback(async () => {
    if (!user) return;
    try {
      await seedDemoDataset(user.uid);
      notify('success', 'Demo data restored', 'All 12 strategic sample projects and schedules have been loaded.');
    } catch (err) {
      notify('error', 'Failed to load demo data', err instanceof Error ? err.message : 'Unknown error');
    }
  }, [user, notify]);

  const refreshProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!user) return;
      await updateUserProfile(user.uid, updates);
      setProfile((prev) => (prev ? { ...prev, ...updates } : prev));
    },
    [user]
  );

  const seedTuragBsc = useCallback(async () => {
    if (!user) return;
    try {
      const res = await seedTuragBscDemo(user.uid);
      notify(
        'success',
        'TG-BSC05 seed data loaded',
        `Seeded ${res.charters} charters (TG-BSC05 Approved + TG-BSC01 Draft), ${res.kras} KRAs across 5 perspectives, and ${res.tasks} mixed-state tasks.`
      );
    } catch (err) {
      notify('error', 'Failed to seed TG-BSC05 data', err instanceof Error ? err.message : 'Unknown error');
    }
  }, [user, notify]);

  const clearTuragBsc = useCallback(async () => {
    if (!user) return;
    try {
      await clearTuragBscDemo(user.uid);
      setActiveBscTaskId(null);
      notify('info', 'TG-BSC05 seed data cleared', 'Demo BSC seed records removed. Live records and existing Task Master data remain intact.');
    } catch (err) {
      notify('error', 'Failed to clear TG-BSC05 seed', err instanceof Error ? err.message : 'Unknown error');
    }
  }, [user, notify]);

  const permissions = ROLE_PERMISSIONS[profile?.role || 'Super Admin'];
  const bscCapabilities = BSC_ROLE_CAPABILITIES[bscActingRole];

  return (
    <AppContext.Provider
      value={{
        user,
        profile,
        authReady,
        dataLoading,
        calendarToken,
        projects,
        tasks,
        meetings,
        raciEntries,
        employees,
        notifications,
        activeNav,
        setActiveNav,
        selectedProjectId,
        setSelectedProjectId,
        globalSearch,
        setGlobalSearch,
        selectedDate,
        setSelectedDate,
        theme,
        toggleTheme,
        viewMode,
        setViewMode,
        permissions,
        signIn,
        connectGoogleCalendar,
        signOut,
        notify,
        confirm,
        seedDemo,
        refreshProfile,
        bscKras,
        projectCharters,
        bscTasks,
        bscFollowUps,
        dateChangeRequests,
        reviewMeetings,
        calendarSyncLogs,
        bscConfig,
        bscSimulatedDate,
        setBscSimulatedDate,
        bscActingRole,
        setBscActingRole,
        bscCapabilities,
        activeBscTaskId,
        setActiveBscTaskId,
        seedTuragBsc,
        clearTuragBsc,
      }}
    >
      {children}
      <ConfirmDialog
        open={confirmState.open}
        options={confirmState.options}
        onConfirm={() => handleConfirmResolve(true)}
        onCancel={() => handleConfirmResolve(false)}
      />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </AppContext.Provider>
  );
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
