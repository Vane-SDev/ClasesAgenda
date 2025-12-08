import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  Plus, Users, DollarSign, AlertCircle,
  Trash2, BookOpen, LogOut, MessageCircle, CheckCircle2, Clock, X,
  Calendar, Phone, ChevronLeft, ChevronRight, Loader2, Search,
  BarChart3, Download, TrendingUp, FileText, Bell, CheckSquare, Square,
  Sun, Moon
} from 'lucide-react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut,
  type User
} from 'firebase/auth';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  type Timestamp
} from 'firebase/firestore';

// Importamos la instancia configurada (seguridad)
import { auth, db } from './firebase';

// ---------- 2. UTILIDADES ----------
const generateId = () => Math.random().toString(36).substring(2, 9);

const currency = (v = 0) => new Intl.NumberFormat('es-AR', { 
  style: 'currency', 
  currency: 'ARS', 
  maximumFractionDigits: 0 
}).format(v);

const isPastDate = (dateStr: string) => {
  const today = new Date(); 
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr + 'T23:59:59') < today;
};

const formatDateHeader = (dateStr: string) => {
  const date = new Date(dateStr + 'T12:00:00');
  const today = new Date(); 
  const tomorrow = new Date(); 
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return 'Hoy';
  if (date.toDateString() === tomorrow.toDateString()) return 'Mañana';
  return date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
};

const withTimeout = <T,>(promise: Promise<T>, ms = 12000) => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error("Tiempo de espera agotado")), ms)
    )
  ]);
};

// Normaliza fechas (sin zona horaria UTC) usando mediodía local
const parseDateLocal = (dateStr: string) => new Date(`${dateStr}T12:00:00`);

// ---------- 3. TIPOS ----------
interface Student { 
  id: string; 
  name: string; 
  phone?: string; 
  level: string; 
  defaultPrice: number; 
  createdAt?: Timestamp;
}

interface ClassSession { 
  id: string; 
  studentId: string; 
  studentName: string; 
  topic: string; 
  date: string; 
  startTime: string; 
  price: number; 
  isPaid: boolean;
  isTrial?: boolean;
  createdAt?: Timestamp;
}

interface Reminder { 
  id: string; 
  studentId: string; 
  text: string; 
  completed: boolean; 
  createdAt?: Timestamp; 
  completedAt?: Timestamp;
}

interface FormData { 
  name?: string; 
  phone?: string; 
  level?: string; 
  studentId?: string; 
  topic?: string; 
  date?: string; 
  time?: string; 
  price?: string | number; 
  reminderText?: string;
  isTrial?: boolean;
}

type Toast = { id: string; text: string; kind?: 'info' | 'error' | 'success' };

// ---------- 4. HOOKS ----------
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = generateId();
    setToasts(prev => [...prev, { ...t, id }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(x => x.id !== id));
    }, 3500);
  }, []);
  
  return { toasts, push };
}

// ---------- 5. COMPONENTE DE ALUMNO ----------
interface StudentCardProps {
  student: Student;
  sessions: ClassSession[];
  reminders: Reminder[];
  onTogglePay: (session: ClassSession) => void;
  onDelete: (id: string) => void;
  onAddReminder: (studentId: string, text: string) => void;
  onToggleReminder: (reminderId: string, completed: boolean) => void;
  onDeleteReminder: (reminderId: string) => void;
}

function StudentCard({ 
  student, 
  sessions, 
  reminders, 
  onTogglePay, 
  onDelete, 
  onAddReminder, 
  onToggleReminder, 
  onDeleteReminder 
}: StudentCardProps) {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [showReminderInput, setShowReminderInput] = useState(false);
  const [reminderText, setReminderText] = useState('');
  
  const studentSessions = useMemo(() => 
    sessions.filter(s => s.studentId === student.id), 
    [sessions, student.id]
  );
  
  const studentReminders = useMemo(() => 
    reminders.filter(r => r.studentId === student.id && !r.completed),
    [reminders, student.id]
  );
  
  const completedReminders = useMemo(() => 
    reminders.filter(r => r.studentId === student.id && r.completed),
    [reminders, student.id]
  );
  
  const stats = useMemo(() => {
    const totalEarned = studentSessions.filter(s => s.isPaid).reduce((sum, s) => sum + s.price, 0);
    const totalPending = studentSessions.filter(s => !s.isPaid).reduce((sum, s) => sum + s.price, 0);
    return { totalEarned, totalPending };
  }, [studentSessions]);

  const nextSessions = useMemo(() => {
    return studentSessions
      .filter(s => !isPastDate(s.date))
      .sort((a, b) => parseDateLocal(a.date).getTime() - parseDateLocal(b.date).getTime())
      .slice(0, 2); 
  }, [studentSessions]);
  
  const recentSessions = useMemo(() => {
    const now = new Date();
    return studentSessions
      .filter(s => new Date(`${s.date}T${s.startTime}`).getTime() < now.getTime())
      .sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.startTime}`).getTime();
        const dateB = new Date(`${b.date}T${b.startTime}`).getTime();
        return dateB - dateA;
      })
      .slice(0, 4);
  }, [studentSessions]);
  
  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startingDay = new Date(year, month, 1).getDay();
  
  const sessionsByDate = useMemo(() => {
    const byDate: Record<string, ClassSession[]> = {};
    studentSessions.forEach(s => {
      if (!byDate[s.date]) byDate[s.date] = [];
      byDate[s.date].push(s);
    });
    return byDate;
  }, [studentSessions]);

  const handleAddReminder = useCallback(() => {
    if (reminderText.trim()) {
      onAddReminder(student.id, reminderText.trim());
      setReminderText('');
      setShowReminderInput(false);
    }
  }, [reminderText, onAddReminder, student.id]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddReminder();
    }
  }, [handleAddReminder]);
  
  return (
    <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl shadow-slate-200/60 dark:shadow-none border border-slate-100 dark:border-slate-700 overflow-hidden transition-all hover:shadow-2xl">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 p-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
        <div className="flex justify-between items-start relative z-10">
          <div>
            <h4 className="font-bold text-2xl tracking-tight">{student.name}</h4>
            <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-white/20 text-xs font-medium backdrop-blur-sm border border-white/10">
              {student.level}
            </span>
          </div>
          <button 
            onClick={() => onDelete(student.id)} 
            className="text-white/70 hover:text-white p-2 hover:bg-white/10 rounded-full transition"
          >
            <Trash2 size={18} />
          </button>
        </div>
        {student.phone && (
          <div className="flex items-center gap-2 text-sm text-indigo-100 mt-3 relative z-10">
            <div className="bg-white/20 p-1 rounded-full"><Phone size={12} /></div>
            <span>{student.phone}</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="p-6 grid grid-cols-2 gap-4">
        <div className="bg-green-50/50 dark:bg-green-900/20 p-4 rounded-2xl border border-green-100 dark:border-green-800">
          <p className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider mb-1">Cobrado</p>
          <p className="text-xl font-bold text-gray-800 dark:text-white">{currency(stats.totalEarned)}</p>
        </div>
        <div className="bg-red-50/50 dark:bg-red-900/20 p-4 rounded-2xl border border-red-100 dark:border-red-800">
          <p className="text-xs font-semibold text-red-500 dark:text-red-400 uppercase tracking-wider mb-1">Deuda</p>
          <p className="text-xl font-bold text-gray-800 dark:text-white">{currency(stats.totalPending)}</p>
        </div>
      </div>

      {/* Recordatorios */}
      <div className="px-6 pb-4">
        <div className="flex justify-between items-center mb-3">
          <h5 className="font-bold text-gray-800 dark:text-gray-200 text-sm flex items-center gap-2">
            <Bell size={16} className="text-indigo-500" /> Recordatorios
          </h5>
          <button
            onClick={() => setShowReminderInput(!showReminderInput)}
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1"
          >
            <Plus size={14} /> Agregar
          </button>
        </div>
        
        {showReminderInput && (
          <div className="mb-3 p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800">
            <input
              type="text"
              placeholder="Ej: Enviar ejercicios..."
              value={reminderText}
              onChange={(e) => setReminderText(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-3 py-2 bg-white dark:bg-slate-700 dark:text-white border border-indigo-200 dark:border-indigo-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              autoFocus
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAddReminder}
                className="flex-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition"
              >
                Guardar
              </button>
              <button
                onClick={() => {
                  setReminderText('');
                  setShowReminderInput(false);
                }}
                className="px-3 py-1.5 bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-lg hover:bg-gray-300 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        
        {studentReminders.length > 0 && (
          <div className="space-y-2 mb-3">
            {studentReminders.map(reminder => (
              <div key={reminder.id} className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
                <button
                  onClick={() => onToggleReminder(reminder.id, true)}
                  className="mt-0.5 text-yellow-600 dark:text-yellow-500 hover:text-yellow-700 transition"
                  title="Marcar como completado"
                >
                  <Square size={16} />
                </button>
                <div className="flex-1">
                  <p className="text-sm text-gray-800 dark:text-gray-200">{reminder.text}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {reminder.createdAt?.toDate ? 
                      new Date(reminder.createdAt.toDate()).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) :
                      'Reciente'
                    }
                  </p>
                </div>
                <button
                  onClick={() => onDeleteReminder(reminder.id)}
                  className="text-gray-400 hover:text-red-500 transition"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        
        {completedReminders.length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700">
              Completados ({completedReminders.length})
            </summary>
            <div className="space-y-2 mt-2">
              {completedReminders.slice(0, 5).map(reminder => (
                <div key={reminder.id} className="flex items-start gap-2 p-2 bg-gray-50 dark:bg-slate-700/50 border border-gray-100 dark:border-slate-700 rounded-lg opacity-60">
                  <button
                    onClick={() => onToggleReminder(reminder.id, false)}
                    className="mt-0.5 text-green-600 hover:text-green-700 transition"
                  >
                    <CheckSquare size={14} />
                  </button>
                  <div className="flex-1">
                    <p className="text-xs text-gray-600 dark:text-gray-400 line-through">{reminder.text}</p>
                  </div>
                  <button
                    onClick={() => onDeleteReminder(reminder.id)}
                    className="text-gray-300 hover:text-red-500 transition"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
        
        {studentReminders.length === 0 && !showReminderInput && (
          <p className="text-xs text-gray-400 text-center py-2">No hay recordatorios pendientes</p>
        )}
      </div>

      {/* Próximas Clases */}
      {nextSessions.length > 0 && (
        <div className="px-6 pb-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Próximas</p>
          <div className="space-y-2">
            {nextSessions.map(s => (
              <div key={s.id} className="flex justify-between items-center bg-gray-50 dark:bg-slate-700/50 p-3 rounded-xl text-sm border border-gray-100 dark:border-slate-700">
                <div>
                  <span className="font-bold text-gray-700 dark:text-gray-200">
                    {parseDateLocal(s.date).toLocaleDateString('es-AR', {day: '2-digit', month: '2-digit'})}
                  </span>
                  <span className="mx-2 text-gray-300">|</span>
                  <span className="text-gray-600 dark:text-gray-300">{s.startTime}hs</span>
                  <span className="ml-2 text-xs text-indigo-400 font-medium">{s.topic}</span>
                  {s.isTrial && (
                    <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">
                      Prueba
                    </span>
                  )}
                </div>
                <button 
                  onClick={() => !s.isTrial && onTogglePay(s)}
                  disabled={s.isTrial}
                  className={`p-2 rounded-full transition-colors ${
                    s.isTrial
                      ? 'text-green-600 bg-green-100 dark:bg-green-900/30 cursor-default'
                      : s.isPaid 
                        ? 'text-green-600 bg-green-100 dark:bg-green-900/30' 
                        : 'text-white bg-indigo-500 hover:bg-indigo-600 shadow-sm'
                  }`}
                  title={s.isTrial ? "Clase de prueba" : s.isPaid ? "Pagado" : "Marcar Pagado"}
                >
                  {s.isTrial ? 'Prueba' : <DollarSign size={14} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historial rápido */}
      {recentSessions.length > 0 && (
        <div className="px-6 pb-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Últimas clases</p>
          <div className="space-y-2">
            {recentSessions.map(s => (
              <div key={s.id} className="flex items-center justify-between text-sm bg-white dark:bg-slate-700/40 border border-gray-100 dark:border-slate-700 p-3 rounded-xl">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-indigo-500">{parseDateLocal(s.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}</span>
                    <span className="text-xs text-gray-400">{s.startTime}hs</span>
                  </div>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">{s.topic}</p>
                  <div className="flex gap-2 items-center">
                    {s.isTrial && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">
                        Prueba
                      </span>
                    )}
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${s.isPaid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {s.isTrial ? 'Gratis' : s.isPaid ? 'Pagada' : 'Pendiente'}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${s.isTrial ? 'text-green-600' : 'text-slate-800 dark:text-white'}`}>
                    {s.isTrial ? 'Gratis' : currency(s.price)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendario */}
      <div className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h5 className="font-bold text-gray-800 dark:text-gray-200 text-sm flex items-center gap-2">
            <Calendar size={16} className="text-indigo-500" /> Actividad
          </h5>
          <div className="flex gap-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-lg">
            <button 
              onClick={() => setSelectedMonth(new Date(year, month - 1))} 
              className="p-1 hover:bg-white dark:hover:bg-slate-600 rounded shadow-sm transition text-gray-600 dark:text-gray-300"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-bold text-gray-600 dark:text-gray-300 w-24 text-center leading-6 capitalize">
              {selectedMonth.toLocaleDateString('es-AR', { month: 'long' })}
            </span>
            <button 
              onClick={() => setSelectedMonth(new Date(year, month + 1))} 
              className="p-1 hover:bg-white dark:hover:bg-slate-600 rounded shadow-sm transition text-gray-600 dark:text-gray-300"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: startingDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const currentDay = new Date(year, month, day);
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const sessions = sessionsByDate[dateStr] || [];
            const hasPaid = sessions.some(s => s.isPaid);
            const hasDebt = sessions.some(s => !s.isPaid);
            const isToday = currentDay.toDateString() === new Date().toDateString();
            
            let bgClass = 'bg-gray-50 dark:bg-slate-700/50 text-gray-400 dark:text-slate-500';
            if (sessions.length > 0) {
              if (hasDebt) {
                bgClass = 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold ring-1 ring-red-200 dark:ring-red-900';
              } else if (hasPaid) {
                bgClass = 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 font-bold ring-1 ring-green-200 dark:ring-green-900';
              }
            }
            if (isToday) {
              bgClass += ' ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-800';
            }

            return (
              <div 
                key={day} 
                className={`aspect-square flex items-center justify-center text-xs rounded-lg transition-all ${bgClass}`}
              >
                {day}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- 6. COMPONENTE PRINCIPAL ----------
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'agenda' | 'students' | 'stats'>('agenda');
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add_class' | 'add_student'>('add_class');
  const [formData, setFormData] = useState<FormData>({});
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPaid, setFilterPaid] = useState<'all' | 'paid' | 'pending'>('all');
  const [filterStudent, setFilterStudent] = useState<string>('all');
  
  // Dark mode con manejo seguro de localStorage
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      return saved ? saved === 'true' : false;
    }
    return false;
  });
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  
  const { toasts, push } = useToasts();
  
  // Aplicar dark mode
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(darkMode));
    }
  }, [darkMode]);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  const openNewClassModal = useCallback(() => {
    if (students.length === 0) { 
      push({ text: 'Registrá un alumno antes', kind: 'info' }); 
      return; 
    }
    setModalMode('add_class'); 
    setFormData({ date: new Date().toISOString().split('T')[0], time: '17:00', isTrial: false }); 
    setIsModalOpen(true);
  }, [students.length, push]);

  const openNewStudentModal = useCallback(() => { 
    setModalMode('add_student'); 
    setFormData({}); 
    setIsModalOpen(true); 
  }, []);

  // --- EFECTO 1: Auth (Solo maneja el usuario) ---
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false); // Auth resuelto, dejamos de cargar estado inicial
    });
    return () => unsubAuth();
  }, []); // Solo se ejecuta al montar

  // --- EFECTO 2: Datos (Depende del usuario) ---
  useEffect(() => {
    // Si no hay usuario, limpiamos todo y no escuchamos nada
    if (!user) {
      setStudents([]);
      setSessions([]);
      setReminders([]);
      return;
    }

    setLoading(true);

    const studentsCollection = collection(db, 'users', user.uid, 'students');
    const sessionsCollection = collection(db, 'users', user.uid, 'sessions');
    const remindersCollection = collection(db, 'users', user.uid, 'reminders');
    const qStudents = query(studentsCollection, orderBy('name'));

    // Listeners
    const unsubStd = onSnapshot(qStudents, 
      (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
        setStudents(docs);
      },
      (error) => console.error("Error Alumnos:", error)
    );

    const unsubSess = onSnapshot(sessionsCollection,
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as ClassSession));
        data.sort((a, b) => {
          const dateA = new Date(a.date + 'T' + a.startTime).getTime();
          const dateB = new Date(b.date + 'T' + b.startTime).getTime();
          return dateB - dateA;
        });
        setSessions(data);
      },
      (error) => console.error("Error Clases:", error)
    );

    const unsubRem = onSnapshot(remindersCollection,
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Reminder));
        setReminders(data);
        setLoading(false); // Datos cargados
      },
      (error) => {
        console.error("Error Recordatorios:", error);
        setLoading(false);
      }
    );

    // Limpieza CRÍTICA: Se ejecuta si user cambia (logout) o componente desmonta
    return () => {
      unsubStd();
      unsubSess();
      unsubRem();
    };
  }, [user]); // <--- Dependencia clave: se recrea si cambia el usuario

  // Enfoque automático
  useEffect(() => {
    if (isModalOpen) {
      setTimeout(() => {
        if (modalMode === 'add_student') {
          inputRef.current?.focus();
        } else {
          selectRef.current?.focus();
        }
      }, 100);
    }
  }, [isModalOpen, modalMode]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLoginError('');
    
    try {
      if (email && password) {
        await withTimeout(signInWithEmailAndPassword(auth, email, password));
      } else {
        await withTimeout(signInAnonymously(auth));
      }
    } catch (error) {
      console.error('Error de login:', error);
      try { 
        await withTimeout(signInAnonymously(auth)); 
      } catch (anonError) { 
        console.error('Error anónimo:', anonError);
        setLoginError('Error de conexión. Intenta nuevamente.'); 
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveStudent = async () => {
    if (!user) {
      push({ text: 'Debes iniciar sesión', kind: 'error' });
      return;
    }
    
    const name = formData.name?.trim();
    if (!name || name.length === 0) {
      push({ text: 'El nombre es requerido', kind: 'error' });
      return;
    }
    
    const price = Number(formData.price);
    if (isNaN(price) || price <= 0) {
      push({ text: 'El precio debe ser un número mayor a 0', kind: 'error' });
      return;
    }
    
    setIsSubmitting(true);
    try {
      await withTimeout(addDoc(collection(db, 'users', user.uid, 'students'), {
        name: name,
        phone: formData.phone?.trim() || '',
        level: formData.level?.trim() || 'General',
        defaultPrice: price,
        createdAt: serverTimestamp()
      }));
      push({ text: 'Alumno creado!', kind: 'success' });
      setIsModalOpen(false);
      setFormData({});
    } catch (error) { 
      console.error('Error guardando alumno:', error);
      push({ text: 'Error al guardar. Verifica tu conexión.', kind: 'error' }); 
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveClass = async () => {
    if (!user) return;
    if (!formData.studentId) { 
      push({ text: 'Seleccioná un alumno', kind: 'error' }); 
      return; 
    }
    
    const student = students.find(s => s.id === formData.studentId);
    if (!student) { 
      push({ text: 'Alumno no encontrado', kind: 'error' }); 
      return; 
    }
    if (!formData.date || !formData.time) { 
      push({ text: 'Fecha y hora requeridas', kind: 'error' }); 
      return; 
    }
    const isTrial = Boolean(formData.isTrial);
    const price = isTrial ? 0 : Number(formData.price || student.defaultPrice || 0);
    
    setIsSubmitting(true);
    try {
      await withTimeout(addDoc(collection(db, 'users', user.uid, 'sessions'), {
        studentId: student.id,
        studentName: student.name,
        topic: formData.topic?.trim() || 'Clase Regular',
        date: formData.date,
        startTime: formData.time,
        price: price,
        isPaid: isTrial ? true : false,
        isTrial,
        createdAt: serverTimestamp()
      }));
      push({ text: 'Clase agendada!', kind: 'success' });
      setIsModalOpen(false);
      setFormData({});
    } catch (error) { 
      console.error('Error agendando clase:', error);
      push({ text: 'Error al agendar. Verifica tu conexión.', kind: 'error' }); 
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePay = async (session: ClassSession) => {
    if (!user) return;
    try {
      const ref = doc(db, 'users', user.uid, 'sessions', session.id);
      await updateDoc(ref, { isPaid: !session.isPaid });
      push({ 
        text: session.isPaid ? 'Pago marcado como pendiente' : '¡Pago recibido!', 
        kind: 'success' 
      });
    } catch (error) { 
      console.error('Error actualizando pago:', error); 
    }
  };

  const deleteItem = async (col: string, id: string) => {
    if (!user || !window.confirm('¿Estás segura de eliminar esto?')) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, col, id));
      push({ text: 'Elemento eliminado', kind: 'info' });
    } catch (error) { 
      console.error('Error eliminando:', error); 
    }
  };

  const sendWhatsApp = (session: ClassSession) => {
    const student = students.find(s => s.id === session.studentId);
    if (!student?.phone) { 
      push({ text: 'Sin teléfono', kind: 'error' }); 
      return; 
    }
    const msg = `Hola ${student.name.split(' ')[0]}! Te recuerdo nuestra clase de ${session.topic} el ${new Date(session.date).toLocaleDateString('es-AR')} a las ${session.startTime}hs.`;
    window.open(`https://wa.me/${student.phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const addReminder = async (studentId: string, text: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'reminders'), {
        studentId,
        text,
        completed: false,
        createdAt: serverTimestamp()
      });
      push({ text: 'Recordatorio agregado', kind: 'success' });
    } catch (error) {
      console.error('Error agregando recordatorio:', error);
      push({ text: 'Error al agregar recordatorio', kind: 'error' });
    }
  };

  const toggleReminder = async (reminderId: string, completed: boolean) => {
    if (!user) return;
    try {
      const ref = doc(db, 'users', user.uid, 'reminders', reminderId);
      await updateDoc(ref, { 
        completed,
        completedAt: completed ? serverTimestamp() : null
      });
    } catch (error) { 
      console.error('Error actualizando recordatorio:', error); 
    }
  };

  const deleteReminder = async (reminderId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'reminders', reminderId));
    } catch (error) { 
      console.error('Error eliminando recordatorio:', error); 
    }
  };

  const financials = useMemo(() => {
    return sessions.reduce((acc, curr) => {
      if (curr.isPaid) {
        acc.collected += curr.price;
      } else {
        acc.owed += curr.price;
      }
      return acc;
    }, { collected: 0, owed: 0 });
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    let filtered = sessions;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        s.studentName.toLowerCase().includes(query) ||
        s.topic.toLowerCase().includes(query)
      );
    }
    if (filterPaid === 'paid') {
      filtered = filtered.filter(s => s.isPaid);
    } else if (filterPaid === 'pending') {
      filtered = filtered.filter(s => !s.isPaid);
    }
    
    if (filterStudent !== 'all') {
      filtered = filtered.filter(s => s.studentId === filterStudent);
    }
    return filtered;
  }, [sessions, searchQuery, filterPaid, filterStudent]);

  const filteredStudents = useMemo(() => {
    if (!searchQuery) return students;
    const query = searchQuery.toLowerCase();
    return students.filter(s => 
      s.name.toLowerCase().includes(query) ||
      s.level.toLowerCase().includes(query) ||
      (s.phone || '').toLowerCase().includes(query)
    );
  }, [students, searchQuery]);

  const groupedSessions = useMemo(() => {
    const groups: Record<string, ClassSession[]> = {};
    filteredSessions.forEach(s => { 
      if (!groups[s.date]) groups[s.date] = [];
      groups[s.date].push(s);
    });
    return Object.keys(groups)
      .sort((a, b) => parseDateLocal(b).getTime() - parseDateLocal(a).getTime())
      .map(date => ({ 
        date, 
        items: groups[date].sort((a, b) => a.startTime.localeCompare(b.startTime))
      }));
  }, [filteredSessions]);

  const stats = useMemo(() => {
    const totalSessions = sessions.length;
    const paidSessions = sessions.filter(s => s.isPaid).length;
    const pendingSessions = totalSessions - paidSessions;
    const totalEarned = sessions.filter(s => s.isPaid).reduce((sum, s) => sum + s.price, 0);
    const totalPending = sessions.filter(s => !s.isPaid).reduce((sum, s) => sum + s.price, 0);
    const avgPrice = totalSessions > 0 ? sessions.reduce((sum, s) => sum + s.price, 0) / totalSessions : 0;
    
    const monthlyStats: Record<string, { total: number; earned: number; pending: number }> = {};
    const yearlyStats: Record<string, { total: number; earned: number; pending: number }> = {};
    sessions.forEach(s => {
      const monthKey = s.date.substring(0, 7);
      const yearKey = s.date.substring(0, 4);
      if (!monthlyStats[monthKey]) monthlyStats[monthKey] = { total: 0, earned: 0, pending: 0 };
      if (!yearlyStats[yearKey]) yearlyStats[yearKey] = { total: 0, earned: 0, pending: 0 };
      
      monthlyStats[monthKey].total++;
      yearlyStats[yearKey].total++;
      if (s.isPaid) {
        monthlyStats[monthKey].earned += s.price;
        yearlyStats[yearKey].earned += s.price;
      } else {
        monthlyStats[monthKey].pending += s.price;
        yearlyStats[yearKey].pending += s.price;
      }
    });
    
    const studentEarnings: Record<string, number> = {};
    sessions.filter(s => s.isPaid).forEach(s => {
      studentEarnings[s.studentId] = (studentEarnings[s.studentId] || 0) + s.price;
    });
    const topStudents = Object.entries(studentEarnings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, amount]) => ({
        student: students.find(s => s.id === id),
        amount
      }))
      .filter(item => item.student);
    
    return { 
      totalSessions, 
      paidSessions, 
      pendingSessions, 
      totalEarned, 
      totalPending, 
      avgPrice, 
      monthlyStats, 
      yearlyStats,
      topStudents 
    };
  }, [sessions, students]);

  const exportData = (format: 'csv' | 'json') => {
    if (format === 'csv') {
      const headers = ['Fecha', 'Hora', 'Alumno', 'Tema', 'Precio', 'Pagado'];
      const rows = sessions.map(s => [
        s.date, 
        s.startTime, 
        s.studentName, 
        s.topic, 
        s.price.toString(), 
        s.isPaid ? 'Sí' : 'No'
      ]);
      const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `clases_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      push({ text: 'Datos exportados a CSV', kind: 'success' });
    } else {
      const data = { 
        students, 
        sessions, 
        exportDate: new Date().toISOString(), 
        stats 
      };
      const jsonContent = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      push({ text: 'Datos exportados a JSON', kind: 'success' });
    }
  };

  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }
  
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-slate-900 to-black p-6">
        <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-8 w-full max-w-sm shadow-2xl text-white">
          <div className="text-center mb-8">
            <div className="bg-indigo-500 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/30">
              <BookOpen className="text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Infinitamente Matemático</h1>
            <p className="text-indigo-200 text-sm mt-1">Organización de mis clases</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-indigo-200 ml-1">Email</label>
              <input 
                type="email" 
                className="w-full p-4 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:border-indigo-400 focus:outline-none transition text-white placeholder-white/30" 
                placeholder="tu@email.com" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-indigo-200 ml-1">Contraseña</label>
              <input 
                type="password" 
                className="w-full p-4 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:border-indigo-400 focus:outline-none transition text-white placeholder-white/30" 
                placeholder="••••••••" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
              />
            </div>
            {loginError && (
              <div className="text-red-300 text-sm bg-red-500/20 p-3 rounded-lg border border-red-500/30 text-center">
                {loginError}
              </div>
            )}
            <button 
              disabled={isSubmitting} 
              className="w-full bg-indigo-500 hover:bg-indigo-400 text-white p-4 rounded-xl font-bold transition shadow-lg shadow-indigo-500/20 flex justify-center items-center gap-2"
            >
              {isSubmitting ? <Loader2 className="animate-spin" /> : 'Ingresar'}
            </button>
            <div className="text-center pt-4 border-t border-white/10">
               <button 
                 type="button" 
                 onClick={handleLogin} 
                 className="text-xs text-indigo-300 hover:text-white transition"
               >
                 Entrar como invitado (Demo)
               </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-900 text-gray-100' : 'bg-slate-50 text-gray-900'} font-sans pb-32 transition-colors`}>
      {/* Header */}
      <div className={`${darkMode ? 'bg-slate-800/80' : 'bg-white/80'} backdrop-blur-md sticky top-0 z-20 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200/50'}`}>
        <div className="px-4 py-4 flex justify-between items-center max-w-md mx-auto">
          <div>
            <h1 className="font-bold text-xl bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              Infinitamente Matemático Clases
            </h1>
            <p className={`text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {students.length} alumnos activos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setDarkMode(!darkMode)} 
              className={`p-2 rounded-full transition ${darkMode ? 'bg-slate-700 text-yellow-400 hover:bg-slate-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              title="Modo oscuro"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button 
              onClick={() => signOut(auth)} 
              className={`p-2 rounded-full transition ${darkMode ? 'bg-slate-700 hover:bg-red-900/30 hover:text-red-400' : 'bg-gray-100 hover:bg-red-50 hover:text-red-500'}`}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* Búsqueda y filtros */}
        {(view === 'agenda' || view === 'students') && (
          <div className="max-w-md mx-auto px-4 pb-3 space-y-2">
            <div className="relative">
              <Search className={`absolute left-3 top-3.5 ${darkMode ? 'text-gray-400' : 'text-gray-400'}`} size={18} />
              <input
                type="text"
                placeholder={view === 'agenda' ? "Buscar clases..." : "Buscar alumnos..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-gray-400' : 'bg-white border-gray-200 text-gray-900'} focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition`}
              />
            </div>
            
            {view === 'agenda' && (
              <div className="flex gap-2">
                <select
                  value={filterPaid}
                  onChange={(e) => setFilterPaid(e.target.value as 'all' | 'paid' | 'pending')}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-200'}`}
                >
                  <option value="all">Todos</option>
                  <option value="paid">Pagados</option>
                  <option value="pending">Pendientes</option>
                </select>
                <select
                  value={filterStudent}
                  onChange={(e) => setFilterStudent(e.target.value)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-200'}`}
                >
                  <option value="all">Todos los alumnos</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
        
        {/* Resumen financiero */}
        <div className="max-w-md mx-auto px-4 pb-4">
          <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'} rounded-2xl p-4 shadow-sm border grid grid-cols-2 gap-8 relative overflow-hidden`}>
            <div className={`absolute top-0 left-1/2 -ml-[1px] w-[1px] h-full ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}></div>
            <div className="text-center">
              <p className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-400'} uppercase tracking-wider mb-1`}>
                Por Cobrar
              </p>
              <p className={`text-2xl font-black ${darkMode ? 'text-red-400' : 'text-slate-800'}`}>
                {currency(financials.owed)}
              </p>
            </div>
            <div className="text-center">
              <p className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-400'} uppercase tracking-wider mb-1`}>
                Ingresos Mes
              </p>
              <p className="text-2xl font-black text-green-600">
                {currency(financials.collected)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido principal */}
      <main className="max-w-md mx-auto p-4 space-y-6">
        {view === 'agenda' && (
          <div className="space-y-8">
            {filteredSessions.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className={`${darkMode ? 'bg-slate-800' : 'bg-indigo-50'} w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4`}>
                  <Calendar className="text-indigo-400" size={32} />
                </div>
                <h3 className={`${darkMode ? 'text-gray-100' : 'text-gray-900'} font-bold text-lg`}>
                  {searchQuery || filterPaid !== 'all' || filterStudent !== 'all' 
                    ? 'No se encontraron clases' 
                    : 'Tu agenda está vacía'}
                </h3>
                <p className={`${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-2`}>
                  {searchQuery || filterPaid !== 'all' || filterStudent !== 'all' 
                    ? 'Intenta con otros filtros' 
                    : 'Presiona el botón + para programar tu primera clase.'}
                </p>
              </div>
            ) : (
              groupedSessions.map(group => {
                const past = isPastDate(group.date);
                return (
                  <div key={group.date} className={`relative ${past ? 'opacity-70 grayscale-[0.5]' : ''}`}>
                    <div className="sticky top-[140px] z-10 flex justify-center mb-4">
                      <span className={`${darkMode ? 'bg-slate-700' : 'bg-slate-800'} text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg`}>
                        {formatDateHeader(group.date)}
                      </span>
                    </div>
                    <div className={`space-y-3 pl-4 border-l-2 ${darkMode ? 'border-slate-700' : 'border-indigo-100'} ml-2`}>
                      {group.items.map(s => (
                        <div key={s.id} className="relative group">
                          <div className={`absolute -left-[21px] top-4 w-3 h-3 rounded-full border-2 ${darkMode ? 'border-slate-800' : 'border-white'} shadow-sm ${s.isPaid ? 'bg-green-500' : 'bg-indigo-500'}`}></div>
                          <article className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'} p-4 rounded-2xl shadow-sm border group-hover:shadow-md transition-all`}>
                            <div className="flex justify-between items-start mb-1">
                              <div>
                                <h4 className={`font-bold ${darkMode ? 'text-gray-100' : 'text-gray-800'} text-lg`}>
                                  {s.studentName}
                                </h4>
                                <div className="flex flex-wrap gap-2 mt-1">
                                  <span className={`text-xs font-medium px-2 py-0.5 ${darkMode ? 'bg-indigo-900/50 text-indigo-300' : 'bg-indigo-50 text-indigo-600'} rounded-md`}>
                                    {s.topic}
                                  </span>
                                  {s.isTrial && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                                      Prueba gratis
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className={`font-bold text-lg ${s.isTrial ? 'text-green-600' : s.isPaid ? 'text-green-600' : darkMode ? 'text-gray-300' : 'text-slate-700'}`}>
                                {s.isTrial ? 'Gratis' : currency(s.price)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-4">
                              <div className={`flex items-center gap-1.5 ${darkMode ? 'text-gray-300 bg-slate-700' : 'text-gray-500 bg-gray-50'} font-medium text-sm px-2 py-1 rounded-lg`}>
                                <Clock size={14} className={darkMode ? 'text-gray-200' : 'text-gray-400'} /> 
                                {s.startTime}
                              </div>
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => sendWhatsApp(s)} 
                                  className={`w-9 h-9 flex items-center justify-center rounded-full ${darkMode ? 'bg-green-900/30 text-green-400 hover:bg-green-900/50' : 'bg-green-50 text-green-600 hover:bg-green-100'} transition`}
                                >
                                  <MessageCircle size={18} />
                                </button>
                                <button 
                                  onClick={() => !s.isTrial && togglePay(s)} 
                                  disabled={s.isTrial}
                                  className={`h-9 px-3 rounded-full flex items-center gap-1 text-xs font-bold transition ${
                                    s.isTrial
                                      ? 'bg-green-50 text-green-600 border border-green-200 cursor-default'
                                      : s.isPaid 
                                      ? darkMode ? 'bg-slate-700 text-gray-200' : 'bg-gray-100 text-gray-500' 
                                        : 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                                  }`}
                                >
                                  {s.isTrial ? 'Prueba' : <><DollarSign size={14} /> {s.isPaid ? '' : 'Cobrar'}</>}
                                </button>
                                <button 
                                  onClick={() => deleteItem('sessions', s.id)} 
                                  className={`w-9 h-9 flex items-center justify-center rounded-full ${darkMode ? 'text-gray-500 hover:text-red-400' : 'text-gray-300 hover:text-red-500'} transition`}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          </article>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {view === 'students' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center px-2">
              <h3 className={`font-bold ${darkMode ? 'text-gray-100' : 'text-gray-800'} text-xl`}>
                Mis Alumnos
              </h3>
              <button 
                onClick={openNewStudentModal} 
                className={`text-xs font-bold ${darkMode ? 'bg-slate-700 border-slate-600 text-white hover:bg-slate-600' : 'bg-white border-gray-200 hover:bg-gray-50'} border shadow-sm px-3 py-1.5 rounded-lg transition`}
              >
                + Agregar Nuevo
              </button>
            </div>
            {filteredStudents.length === 0 ? (
              <div className="text-center py-12">
                <div className={`${darkMode ? 'bg-slate-800' : 'bg-indigo-50'} w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4`}>
                  <Users className={darkMode ? 'text-indigo-400' : 'text-indigo-400'} size={32} />
                </div>
                <p className={darkMode ? 'text-gray-200' : 'text-gray-500'}>
                  {searchQuery ? 'No se encontraron alumnos' : 'Aún no tienes alumnos.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-6">
                {filteredStudents.map(std => (
                  <StudentCard
                    key={std.id}
                    student={std}
                    sessions={sessions}
                    reminders={reminders}
                    onTogglePay={togglePay}
                    onDelete={(id) => deleteItem('students', id)}
                    onAddReminder={addReminder}
                    onToggleReminder={toggleReminder}
                    onDeleteReminder={deleteReminder}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'stats' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center px-2">
              <h3 className={`font-bold ${darkMode ? 'text-gray-100' : 'text-gray-800'} text-xl flex items-center gap-2`}>
                <BarChart3 size={24} />
                Estadísticas
              </h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => exportData('csv')} 
                  className={`p-2 rounded-lg ${darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-white border border-gray-200 hover:bg-gray-50'} transition`}
                  title="Exportar CSV"
                >
                  <Download size={18} />
                </button>
                <button 
                  onClick={() => exportData('json')} 
                  className={`p-2 rounded-lg ${darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-white border border-gray-200 hover:bg-gray-50'} transition`}
                  title="Exportar JSON"
                >
                  <FileText size={18} />
                </button>
              </div>
            </div>

            {/* Tarjetas resumen */}
            <div className="grid grid-cols-2 gap-4">
              <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'} p-4 rounded-2xl border shadow-sm`}>
                <p className={`text-xs font-bold ${darkMode ? 'text-gray-200' : 'text-gray-500'} uppercase mb-2`}>
                  Total Clases
                </p>
                <p className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {stats.totalSessions}
                </p>
              </div>
              <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'} p-4 rounded-2xl border shadow-sm`}>
                <p className={`text-xs font-bold ${darkMode ? 'text-gray-200' : 'text-gray-500'} uppercase mb-2`}>
                  Promedio
                </p>
                <p className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {currency(stats.avgPrice)}
                </p>
              </div>
            </div>

            {/* Resumen financiero */}
            <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'} p-6 rounded-2xl border shadow-sm`}>
              <h4 className={`font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'} mb-4 flex items-center gap-2`}>
                <TrendingUp size={20} />
                Resumen Financiero
              </h4>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
                    Total Cobrado
                  </span>
                  <span className="text-xl font-bold text-green-600">
                    {currency(stats.totalEarned)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
                    Por Cobrar
                  </span>
                  <span className="text-xl font-bold text-red-500">
                    {currency(stats.totalPending)}
                  </span>
                </div>
                <div className="pt-4 border-t border-gray-200 dark:border-slate-700 flex justify-between items-center">
                  <span className={`font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    Total
                  </span>
                  <span className="text-2xl font-black text-indigo-600">
                    {currency(stats.totalEarned + stats.totalPending)}
                  </span>
                </div>
              </div>
            </div>

            {/* Top alumnos */}
            {stats.topStudents.length > 0 && (
              <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'} p-6 rounded-2xl border shadow-sm`}>
                <h4 className={`font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'} mb-4`}>
                  Top Alumnos por Ingresos
                </h4>
                <div className="space-y-3">
                  {stats.topStudents.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                          idx === 1 ? 'bg-gray-100 text-gray-700' :
                          idx === 2 ? 'bg-orange-100 text-orange-700' :
                          'bg-indigo-100 text-indigo-700'
                        }`}>
                          {idx + 1}
                        </div>
                        <span className={darkMode ? 'text-gray-200' : 'text-gray-800'}>
                          {item.student?.name}
                        </span>
                      </div>
                      <span className="font-bold text-green-600">
                        {currency(item.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Balance por mes */}
            {Object.keys(stats.monthlyStats).length > 0 && (
              <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'} p-6 rounded-2xl border shadow-sm`}>
                <h4 className={`font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'} mb-4`}>
                  Balance por Mes
                </h4>
                <div className="space-y-3">
                  {Object.entries(stats.monthlyStats)
                    .sort((a, b) => b[0].localeCompare(a[0]))
                    .slice(0, 6)
                    .map(([month, data]) => {
                      const totalAmount = data.earned + data.pending;
                      return (
                        <div key={month}>
                          <div className="flex justify-between items-center mb-1">
                            <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
                              {new Date(month + '-01').toLocaleDateString('es-AR', { 
                                month: 'long', 
                                year: 'numeric' 
                              })}
                            </span>
                            <div className="text-right">
                              <p className="font-bold text-green-600">{currency(data.earned)}</p>
                              {data.pending > 0 && (
                                <p className="text-xs text-yellow-600">Pendiente: {currency(data.pending)}</p>
                              )}
                            </div>
                          </div>
                          <div className={`h-2 rounded-full ${darkMode ? 'bg-slate-700' : 'bg-gray-100'} overflow-hidden`}>
                            <div 
                              className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all"
                              style={{ 
                                width: `${Math.min(((data.earned) / (totalAmount || 1)) * 100, 100)}%` 
                              }}
                            />
                          </div>
                          <p className={`text-xs mt-1 ${darkMode ? 'text-gray-200' : 'text-gray-500'}`}>
                            {data.total} clases • Total {currency(totalAmount)}
                          </p>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Balance por año */}
            {Object.keys(stats.yearlyStats).length > 0 && (
              <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'} p-6 rounded-2xl border shadow-sm`}>
                <h4 className={`font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'} mb-4`}>
                  Balance por Año
                </h4>
                <div className="space-y-3">
                  {Object.entries(stats.yearlyStats)
                    .sort((a, b) => b[0].localeCompare(a[0]))
                    .map(([year, data]) => {
                      const totalAmount = data.earned + data.pending;
                      return (
                        <div key={year}>
                          <div className="flex justify-between items-center mb-1">
                            <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
                              {year}
                            </span>
                            <div className="text-right">
                              <p className="font-bold text-green-600">{currency(data.earned)}</p>
                              {data.pending > 0 && (
                                <p className="text-xs text-yellow-600">Pendiente: {currency(data.pending)}</p>
                              )}
                            </div>
                          </div>
                          <div className={`h-2 rounded-full ${darkMode ? 'bg-slate-700' : 'bg-gray-100'} overflow-hidden`}>
                            <div 
                              className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all"
                              style={{ 
                                width: `${Math.min(((data.earned) / (totalAmount || 1)) * 100, 100)}%` 
                              }}
                            />
                          </div>
                          <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {data.total} clases • Total {currency(totalAmount)}
                          </p>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Botones flotantes */}
      <div className="fixed bottom-24 right-4 z-20 flex flex-col gap-4 items-end pointer-events-none">
        {view === 'agenda' && (
          <button 
            onClick={openNewClassModal} 
            className="pointer-events-auto bg-gradient-to-r from-indigo-600 to-violet-600 text-white w-14 h-14 rounded-2xl shadow-xl shadow-indigo-500/40 hover:scale-110 hover:rotate-90 transition-all duration-300 flex items-center justify-center active:scale-95"
          >
            <Plus size={32} strokeWidth={2.5} />
          </button>
        )}
        {(view === 'students' || students.length === 0) && (
          <button 
            onClick={openNewStudentModal} 
            className="pointer-events-auto bg-gray-900 text-white w-14 h-14 rounded-2xl shadow-xl hover:scale-110 transition-all duration-300 flex items-center justify-center"
          >
            <Users size={28} />
          </button>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsModalOpen(false)} 
          />
          <div className={`relative ${darkMode ? 'bg-slate-800/95' : 'bg-white/90'} backdrop-blur-xl rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in slide-in-from-bottom-10 border ${darkMode ? 'border-slate-700' : 'border-white/20'}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                {modalMode === 'add_class' ? 'Nueva Clase' : 'Nuevo Alumno'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className={`p-2 rounded-full ${darkMode ? 'bg-slate-700 text-gray-300 hover:bg-slate-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'} transition`}
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {modalMode === 'add_student' ? (
                <>
                  <div className="space-y-1">
                    <label className={`text-xs font-bold ${darkMode ? 'text-gray-200' : 'text-gray-500'} ml-1 uppercase`}>
                      Nombre
                    </label>
                    <input 
                      ref={inputRef} 
                      autoFocus 
                      className={`w-full p-4 ${darkMode ? 'bg-slate-700 text-white border-slate-600' : 'bg-white border-gray-200'} border rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition font-medium text-lg`}
                      onChange={e => setFormData({ ...formData, name: e.target.value })} 
                    />
                  </div>
                  <div className="flex gap-3">
                    <div className="space-y-1 flex-1">
                      <label className={`text-xs font-bold ${darkMode ? 'text-gray-200' : 'text-gray-500'} ml-1 uppercase`}>
                        Teléfono
                      </label>
                      <input 
                        placeholder="549..." 
                        className={`w-full p-3 ${darkMode ? 'bg-slate-700 text-white border-slate-600 placeholder-gray-400' : 'bg-white border-gray-200'} border rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition`}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })} 
                      />
                    </div>
                    <div className="space-y-1 w-1/3">
                      <label className={`text-xs font-bold ${darkMode ? 'text-gray-200' : 'text-gray-500'} ml-1 uppercase`}>
                        Precio
                      </label>
                      <input 
                        type="number" 
                        placeholder="$" 
                        className={`w-full p-3 ${darkMode ? 'bg-slate-700 text-white border-slate-600 placeholder-gray-400' : 'bg-white border-gray-200'} border rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition font-bold`}
                        onChange={e => setFormData({ ...formData, price: e.target.value })} 
                      />
                    </div>
                  </div>
                  <button 
                    onClick={saveStudent} 
                    disabled={isSubmitting} 
                    className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold text-lg hover:bg-black transition shadow-lg flex justify-center items-center gap-2 mt-2"
                  >
                    {isSubmitting ? <Loader2 className="animate-spin" /> : 'Guardar Alumno'}
                  </button>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className={`text-xs font-bold ${darkMode ? 'text-gray-200' : 'text-gray-500'} ml-1 uppercase`}>
                      Alumno
                    </label>
                    <select 
                      ref={selectRef} 
                      className={`w-full p-4 ${darkMode ? 'bg-slate-700 text-white border-slate-600' : 'bg-white border-gray-200'} border rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition font-medium text-lg appearance-none`}
                      onChange={e => { 
                        const s = students.find(st => st.id === e.target.value); 
                        setFormData({ ...formData, studentId: s?.id, price: s?.defaultPrice }); 
                      }}
                    >
                      <option value="">Seleccionar...</option>
                      {students.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="space-y-1">
                    <label className={`text-xs font-bold ${darkMode ? 'text-gray-200' : 'text-gray-500'} ml-1 uppercase`}>
                      Tema
                    </label>
                    <input 
                      placeholder="Ej. Funciones Cuadráticas" 
                      className={`w-full p-3 ${darkMode ? 'bg-slate-700 text-white border-slate-600 placeholder-gray-400' : 'bg-white border-gray-200'} border rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition`}
                      onChange={e => setFormData({ ...formData, topic: e.target.value })} 
                    />
                  </div>

                  <div className="flex gap-3">
                    <div className="space-y-1 flex-1">
                      <label className={`text-xs font-bold ${darkMode ? 'text-gray-200' : 'text-gray-500'} ml-1 uppercase`}>
                        Fecha
                      </label>
                      <input 
                        type="date" 
                        className={`w-full p-3 ${darkMode ? 'bg-slate-700 text-white border-slate-600' : 'bg-white border-gray-200'} border rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition`}
                        value={formData.date || ''} 
                        onChange={e => setFormData({ ...formData, date: e.target.value })} 
                      />
                    </div>
                    <div className="space-y-1 w-1/3">
                      <label className={`text-xs font-bold ${darkMode ? 'text-gray-200' : 'text-gray-500'} ml-1 uppercase`}>
                        Hora
                      </label>
                      <input 
                        type="time" 
                        className={`w-full p-3 ${darkMode ? 'bg-slate-700 text-white border-slate-600' : 'bg-white border-gray-200'} border rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition`}
                        value={formData.time || ''} 
                        onChange={e => setFormData({ ...formData, time: e.target.value })} 
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <label className={`text-xs font-bold ${darkMode ? 'text-gray-200' : 'text-gray-500'} ml-1 uppercase`}>
                      Precio
                    </label>
                    <div className={`flex items-center justify-between mb-2 text-xs font-semibold ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={Boolean(formData.isTrial)} 
                          onChange={(e) => {
                            const isTrial = e.target.checked;
                            const selected = students.find(st => st.id === formData.studentId);
                            const defaultPrice = selected?.defaultPrice ?? '';
                            setFormData(prev => ({
                              ...prev, 
                              isTrial, 
                              price: isTrial ? 0 : (prev.price ?? defaultPrice)
                            }));
                          }} 
                          className="accent-indigo-600"
                        />
                        Clase de prueba (sin costo)
                      </label>
                      {formData.isTrial && (
                        <span className={`px-2 py-0.5 rounded-full ${darkMode ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-700'} uppercase`}>Gratis</span>
                      )}
                    </div>
                    <div className="relative">
                      <span className={`absolute left-4 top-3.5 font-bold ${darkMode ? 'text-gray-300' : 'text-gray-400'}`}>$</span>
                      <input 
                        type="number" 
                        className={`w-full p-3 pl-8 ${darkMode ? 'bg-slate-700 text-white border-slate-600 disabled:bg-slate-800 disabled:text-gray-400' : 'bg-white border-gray-200'} border rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition font-bold text-lg`}
                        value={formData.price ?? ''} 
                        disabled={Boolean(formData.isTrial)}
                        onChange={e => setFormData({ ...formData, price: e.target.value })} 
                      />
                    </div>
                  </div>

                  <button 
                    onClick={saveClass} 
                    disabled={isSubmitting} 
                    className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 transition shadow-lg shadow-indigo-500/30 flex justify-center items-center gap-2 mt-4"
                  >
                    {isSubmitting ? <Loader2 className="animate-spin" /> : 'Agendar Clase'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Navegación inferior */}
      <nav className={`fixed bottom-0 w-full ${darkMode ? 'bg-slate-800/90 border-slate-700' : 'bg-white/90 border-gray-200'} backdrop-blur-lg border-t z-30 pb-safe shadow-[0_-5px_20px_-5px_rgba(0,0,0,0.05)]`}>
        <div className="max-w-md mx-auto grid grid-cols-3">
          <button 
            onClick={() => setView('agenda')} 
            className={`p-4 flex flex-col items-center transition-colors ${
              view === 'agenda' 
                ? 'text-indigo-600' 
                : darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <BookOpen size={24} strokeWidth={view === 'agenda' ? 2.5 : 2} /> 
            <span className="text-[10px] font-bold mt-1">Agenda</span>
          </button>
          <button 
            onClick={() => setView('students')} 
            className={`p-4 flex flex-col items-center transition-colors ${
              view === 'students' 
                ? 'text-indigo-600' 
                : darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Users size={24} strokeWidth={view === 'students' ? 2.5 : 2} /> 
            <span className="text-[10px] font-bold mt-1">Alumnos</span>
          </button>
          <button 
            onClick={() => setView('stats')} 
            className={`p-4 flex flex-col items-center transition-colors ${
              view === 'stats' 
                ? 'text-indigo-600' 
                : darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <BarChart3 size={24} strokeWidth={view === 'stats' ? 2.5 : 2} /> 
            <span className="text-[10px] font-bold mt-1">Stats</span>
          </button>
        </div>
      </nav>

      {/* Toasts */}
      <div className="fixed top-4 left-0 right-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className={`px-4 py-3 rounded-full shadow-xl text-sm font-bold animate-in slide-in-from-top-5 fade-in duration-300 flex items-center gap-2 ${
              t.kind === 'error' 
                ? 'bg-red-500 text-white' 
                : t.kind === 'success'
                ? 'bg-green-600 text-white'
                : 'bg-indigo-600 text-white'
            }`}
          >
            {t.kind === 'success' && <CheckCircle2 size={16} />}
            {t.kind === 'error' && <AlertCircle size={16} />}
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}