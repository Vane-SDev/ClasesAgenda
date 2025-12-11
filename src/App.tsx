import { useEffect, useMemo, useState, useRef, useCallback, type FormEvent } from 'react';
import {
  Plus, Users, DollarSign, AlertCircle,
  Trash2, BookOpen, LogOut, MessageCircle, CheckCircle2, Clock, X,
  Loader2, Search,
  BarChart3, Download, TrendingUp, FileText, Bell, Square,
  Sun, Moon, Pencil, Contact, Phone, Video, ExternalLink, StickyNote
} from 'lucide-react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
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

import { auth, db } from './firebase';

// ---------- UTILIDADES ----------
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

const withTimeout = <T,>(promise: Promise<T>, ms = 15000) => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error("Tiempo de espera agotado. Verifica tu conexión.")), ms)
    )
  ]);
};

const parseDateLocal = (dateStr: string) => new Date(`${dateStr}T12:00:00`);

// ---------- TIPOS ----------
interface Student { 
  id: string; 
  name: string; 
  phone?: string; 
  parentPhone?: string; 
  level: string; 
  defaultPrice: number;
  meetLink?: string;
  additionalNotes?: string;
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
  id?: string;
  name?: string; 
  phone?: string; 
  parentPhone?: string;
  level?: string; 
  studentId?: string; 
  topic?: string; 
  date?: string; 
  time?: string; 
  price?: string | number; 
  reminderText?: string;
  isTrial?: boolean;
  meetLink?: string;
  additionalNotes?: string;
}

type Toast = { id: string; text: string; kind?: 'info' | 'error' | 'success' };

// ---------- HOOKS ----------
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = generateId();
    setToasts(prev => [...prev, { ...t, id }]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 3500);
  }, []);
  return { toasts, push };
}

// ---------- COMPONENTE ALUMNO ----------
// Eliminé onTogglePay porque no se usa dentro de este componente
interface StudentCardProps {
  student: Student;
  sessions: ClassSession[];
  reminders: Reminder[];
  onDelete: (id: string) => void;
  onEdit: (student: Student) => void;
  onAddReminder: (studentId: string, text: string) => void;
  onToggleReminder: (reminderId: string, completed: boolean) => void;
  onDeleteReminder: (reminderId: string) => void;
}

function StudentCard({ student, sessions, reminders, onDelete, onEdit, onAddReminder, onToggleReminder, onDeleteReminder }: StudentCardProps) {
  const [showReminderInput, setShowReminderInput] = useState(false);
  const [reminderText, setReminderText] = useState('');
  
  const studentSessions = useMemo(() => sessions.filter(s => s.studentId === student.id), [sessions, student.id]);
  const studentReminders = useMemo(() => reminders.filter(r => r.studentId === student.id && !r.completed), [reminders, student.id]);
  
  const stats = useMemo(() => {
    const totalEarned = studentSessions.filter(s => s.isPaid).reduce((sum, s) => sum + s.price, 0);
    const totalPending = studentSessions.filter(s => !s.isPaid).reduce((sum, s) => sum + s.price, 0);
    return { totalEarned, totalPending };
  }, [studentSessions]);

  const handleAddReminder = useCallback(() => {
    if (reminderText.trim()) {
      onAddReminder(student.id, reminderText.trim());
      setReminderText('');
      setShowReminderInput(false);
    }
  }, [reminderText, onAddReminder, student.id]);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl shadow-slate-200/60 dark:shadow-slate-900/50 border border-slate-100 dark:border-slate-700 overflow-hidden transition-all hover:shadow-2xl">
      <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 p-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
        <div className="flex justify-between items-start relative z-10">
          <div>
            <h4 className="font-bold text-2xl tracking-tight text-white">{student.name}</h4>
            <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-white/20 text-xs font-medium backdrop-blur-sm border border-white/10 text-white">{student.level}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onEdit(student)} className="text-white/80 hover:text-white p-2 hover:bg-white/20 rounded-full transition"><Pencil size={18} /></button>
            <button onClick={() => onDelete(student.id)} className="text-white/80 hover:text-white p-2 hover:bg-white/20 rounded-full transition"><Trash2 size={18} /></button>
          </div>
        </div>
        <div className="flex flex-col gap-1 mt-3 relative z-10">
          {student.phone && (
            <div className="flex items-center gap-2 text-sm text-white/90">
              <div className="bg-white/20 p-1 rounded-full"><Phone size={12} /></div>
              <span>{student.phone}</span>
            </div>
          )}
          {student.parentPhone && (
            <div className="flex items-center gap-2 text-sm text-white/90">
              <div className="bg-white/20 p-1 rounded-full"><Contact size={12} /></div>
              <span>Resp: {student.parentPhone}</span>
            </div>
          )}
          {student.meetLink && (
            <a href={student.meetLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-white/90 hover:text-white transition">
              <div className="bg-white/20 p-1 rounded-full"><Video size={12} /></div>
              <span className="underline">Link de Meet</span>
              <ExternalLink size={10} />
            </a>
          )}
        </div>
      </div>

      <div className="p-6 grid grid-cols-2 gap-4">
        <div className="bg-green-50 dark:bg-green-950/40 p-4 rounded-2xl border border-green-200 dark:border-green-800/50">
          <p className="text-xs font-semibold text-green-700 dark:text-green-300 uppercase tracking-wider mb-1">Cobrado</p>
          <p className="text-xl font-bold text-gray-900 dark:text-green-100">{currency(stats.totalEarned)}</p>
        </div>
        <div className="bg-red-50 dark:bg-red-950/40 p-4 rounded-2xl border border-red-200 dark:border-red-800/50">
          <p className="text-xs font-semibold text-red-600 dark:text-red-300 uppercase tracking-wider mb-1">Deuda</p>
          <p className="text-xl font-bold text-gray-900 dark:text-red-100">{currency(stats.totalPending)}</p>
        </div>
      </div>

      <div className="px-6 pb-4">
        <div className="flex justify-between items-center mb-3">
          <h5 className="font-bold text-gray-900 dark:text-gray-100 text-sm flex items-center gap-2"><Bell size={16} className="text-indigo-600 dark:text-indigo-400" /> Recordatorios</h5>
          <button onClick={() => setShowReminderInput(!showReminderInput)} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1"><Plus size={14} /> Agregar</button>
        </div>
        {showReminderInput && (
          <div className="mb-3 p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800/50">
            <input type="text" placeholder="Ej: Enviar ejercicios..." value={reminderText} onChange={(e) => setReminderText(e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-slate-800 dark:text-gray-100 border border-indigo-200 dark:border-indigo-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400" autoFocus />
            <button onClick={handleAddReminder} className="mt-2 w-full px-3 py-1.5 bg-indigo-600 dark:bg-indigo-500 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition">Guardar</button>
          </div>
        )}
        <div className="space-y-2 mb-3">
            {studentReminders.map(reminder => (
              <div key={reminder.id} className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-800/50 rounded-xl">
                <button onClick={() => onToggleReminder(reminder.id, true)} className="mt-0.5 text-yellow-700 dark:text-yellow-300 hover:text-yellow-800 dark:hover:text-yellow-200"><Square size={16} /></button>
                <div className="flex-1"><p className="text-sm text-gray-900 dark:text-gray-100">{reminder.text}</p></div>
                <button onClick={() => onDeleteReminder(reminder.id)} className="text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"><Trash2 size={14} /></button>
              </div>
            ))}
        </div>
        {student.additionalNotes && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 rounded-xl">
            <div className="flex items-start gap-2">
              <StickyNote size={16} className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase mb-1">Notas Adicionales</p>
                <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{student.additionalNotes}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- APP PRINCIPAL ----------
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'agenda' | 'students' | 'stats'>('agenda');
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add_class' | 'add_student'>('add_class');
  const [formData, setFormData] = useState<FormData>({});
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPaid, setFilterPaid] = useState<'all' | 'paid' | 'pending'>('all');
  const [filterStudent, setFilterStudent] = useState<string>('all');
  
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('darkMode') === 'true';
    return false;
  });
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  
  const { toasts, push } = useToasts();
  
  // Eliminado selectRef que no se usaba
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  // Auth
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubAuth();
  }, []);

  // Data Sync
  useEffect(() => {
    if (!user) { setStudents([]); setSessions([]); setReminders([]); return; }

    const unsubStd = onSnapshot(query(collection(db, 'users', user.uid, 'students'), orderBy('name')), 
      (snap) => setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Student))),
      (err) => console.error(err)
    );

    const unsubSess = onSnapshot(collection(db, 'users', user.uid, 'sessions'),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as ClassSession));
        data.sort((a, b) => new Date(b.date + 'T' + b.startTime).getTime() - new Date(a.date + 'T' + a.startTime).getTime());
        setSessions(data);
      },
      (err) => console.error(err)
    );

    const unsubRem = onSnapshot(collection(db, 'users', user.uid, 'reminders'),
      (snap) => setReminders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reminder))),
      (err) => console.error(err)
    );

    return () => { unsubStd(); unsubSess(); unsubRem(); };
  }, [user]);

  // --- CÁLCULOS ESTADÍSTICOS (Recuperados) ---
  const stats = useMemo(() => {
    const totalSessions = sessions.length;
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
    
    return { totalSessions, totalEarned, totalPending, avgPrice, monthlyStats, yearlyStats, topStudents };
  }, [sessions, students]);

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

  // Exportar Data
  const exportData = (format: 'csv' | 'json') => {
    if (format === 'csv') {
      const headers = ['Fecha', 'Hora', 'Alumno', 'Tema', 'Precio', 'Pagado'];
      const rows = sessions.map(s => [s.date, s.startTime, s.studentName, s.topic, s.price.toString(), s.isPaid ? 'Sí' : 'No']);
      const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `clases_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      push({ text: 'Exportado a CSV', kind: 'success' });
    } else {
      const data = { students, sessions, exportDate: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      push({ text: 'Exportado a JSON', kind: 'success' });
    }
  };

  // Modales
  const openNewClassModal = useCallback(() => {
    if (students.length === 0) { push({ text: 'Registrá un alumno antes', kind: 'info' }); return; }
    setModalMode('add_class'); 
    setFormData({ date: new Date().toISOString().split('T')[0], time: '17:00', isTrial: false }); 
    setIsModalOpen(true);
  }, [students.length, push]);

  const openEditClassModal = useCallback((session: ClassSession) => {
    setModalMode('add_class');
    setFormData({ id: session.id, studentId: session.studentId, topic: session.topic, date: session.date, time: session.startTime, price: session.price, isTrial: session.isTrial });
    setIsModalOpen(true);
  }, []);

  const openNewStudentModal = useCallback(() => { setModalMode('add_student'); setFormData({}); setIsModalOpen(true); }, []);
  const openEditStudentModal = useCallback((student: Student) => {
    setModalMode('add_student');
    setFormData({ id: student.id, name: student.name, phone: student.phone, parentPhone: student.parentPhone, level: student.level, price: student.defaultPrice, meetLink: student.meetLink, additionalNotes: student.additionalNotes });
    setIsModalOpen(true);
  }, []);

  // Handlers
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault(); setIsSubmitting(true); setLoginError('');
    try { await withTimeout(signInWithEmailAndPassword(auth, email, password)); }
    catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error de credenciales o conexión.';
      if (errorMessage.includes('user-not-found') || errorMessage.includes('wrong-password')) {
        setLoginError('Email o contraseña incorrectos.');
      } else if (errorMessage.includes('invalid-email')) {
        setLoginError('Email inválido.');
      } else {
        setLoginError('Error de conexión. Intenta nuevamente.');
      }
    }
    finally { setIsSubmitting(false); }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault(); setIsSubmitting(true); setLoginError('');
    
    if (password.length < 6) {
      setLoginError('La contraseña debe tener al menos 6 caracteres.');
      setIsSubmitting(false);
      return;
    }
    
    if (password !== confirmPassword) {
      setLoginError('Las contraseñas no coinciden.');
      setIsSubmitting(false);
      return;
    }
    
    try { 
      await withTimeout(createUserWithEmailAndPassword(auth, email, password));
      push({ text: 'Cuenta creada exitosamente', kind: 'success' });
    } 
    catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error al crear la cuenta.';
      if (errorMessage.includes('email-already-in-use')) {
        setLoginError('Este email ya está registrado.');
      } else if (errorMessage.includes('invalid-email')) {
        setLoginError('Email inválido.');
      } else if (errorMessage.includes('weak-password')) {
        setLoginError('La contraseña es muy débil.');
      } else {
        setLoginError('Error al crear la cuenta. Intenta nuevamente.');
      }
    }
    finally { setIsSubmitting(false); }
  };

  const saveStudent = async () => {
    if (!user) return;
    if (!formData.name?.trim()) { push({ text: 'Nombre requerido', kind: 'error' }); return; }
    setIsSubmitting(true);
    try {
      const data = { 
        name: formData.name, 
        phone: formData.phone || '', 
        parentPhone: formData.parentPhone || '', 
        level: formData.level || 'General', 
        defaultPrice: Number(formData.price) || 0,
        meetLink: formData.meetLink || '',
        additionalNotes: formData.additionalNotes || ''
      };
      if (formData.id) { await updateDoc(doc(db, 'users', user.uid, 'students', formData.id), data); push({ text: 'Actualizado', kind: 'success' }); }
      else { await addDoc(collection(db, 'users', user.uid, 'students'), { ...data, createdAt: serverTimestamp() }); push({ text: 'Creado', kind: 'success' }); }
      setIsModalOpen(false);
    } catch { push({ text: 'Error al guardar', kind: 'error' }); }
    finally { setIsSubmitting(false); }
  };

  const saveClass = async () => {
    if (!user || !formData.studentId) return;
    const student = students.find(s => s.id === formData.studentId);
    setIsSubmitting(true);
    try {
      const isTrial = Boolean(formData.isTrial);
      const data = { studentId: formData.studentId, studentName: student?.name || '', topic: formData.topic || 'Clase', date: formData.date || '', startTime: formData.time || '', price: isTrial ? 0 : Number(formData.price), isPaid: isTrial, isTrial };
      if (formData.id) { await updateDoc(doc(db, 'users', user.uid, 'sessions', formData.id), data); push({ text: 'Clase actualizada', kind: 'success' }); }
      else { await addDoc(collection(db, 'users', user.uid, 'sessions'), { ...data, createdAt: serverTimestamp() }); push({ text: 'Clase agendada', kind: 'success' }); }
      setIsModalOpen(false);
    } catch { push({ text: 'Error al agendar', kind: 'error' }); }
    finally { setIsSubmitting(false); }
  };

  const togglePay = async (s: ClassSession) => { if (!user) return; await updateDoc(doc(db, 'users', user.uid, 'sessions', s.id), { isPaid: !s.isPaid }); };
  const deleteItem = async (col: string, id: string) => { if (!user || !window.confirm('¿Eliminar?')) return; await deleteDoc(doc(db, 'users', user.uid, col, id)); };
  const sendWhatsApp = (s: ClassSession) => {
    const std = students.find(st => st.id === s.studentId);
    const phone = std?.phone || std?.parentPhone;
    if (!phone) { push({ text: 'Sin teléfono', kind: 'error' }); return; }
    window.open(`https://wa.me/${phone.replace(/\D/g,'')}?text=${encodeURIComponent(`Hola! Recuerdo la clase de ${s.topic} el ${new Date(s.date).toLocaleDateString()} a las ${s.startTime}`)}`, '_blank');
  };
  const addReminder = async (sid: string, text: string) => { if (user) await addDoc(collection(db, 'users', user.uid, 'reminders'), { studentId: sid, text, completed: false, createdAt: serverTimestamp() }); };
  const toggleReminder = async (id: string, c: boolean) => { if (user) await updateDoc(doc(db, 'users', user.uid, 'reminders', id), { completed: c, completedAt: c ? serverTimestamp() : null }); };
  const onDeleteReminder = async (id: string) => { if (user) await deleteDoc(doc(db, 'users', user.uid, 'reminders', id)); };

  const filteredSessions = useMemo(() => {
    let f = sessions;
    if (searchQuery) f = f.filter(s => s.studentName.toLowerCase().includes(searchQuery.toLowerCase()) || s.topic.toLowerCase().includes(searchQuery.toLowerCase()));
    if (filterPaid !== 'all') f = f.filter(s => filterPaid === 'paid' ? s.isPaid : !s.isPaid);
    if (filterStudent !== 'all') f = f.filter(s => s.studentId === filterStudent);
    return f;
  }, [sessions, searchQuery, filterPaid, filterStudent]);

  const groupedSessions = useMemo(() => {
    const g: Record<string, ClassSession[]> = {};
    filteredSessions.forEach(s => { if (!g[s.date]) g[s.date] = []; g[s.date].push(s); });
    return Object.keys(g).sort((a, b) => parseDateLocal(b).getTime() - parseDateLocal(a).getTime())
      .map(date => ({ date, items: g[date].sort((a, b) => a.startTime.localeCompare(b.startTime)) }));
  }, [filteredSessions]);

  // LOGIN UI
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950"><Loader2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" /></div>;
  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-slate-900 to-black p-6">
      <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-8 w-full max-w-sm shadow-2xl text-white">
        <div className="text-center mb-6">
          <div className="bg-indigo-500 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg"><BookOpen /></div>
          <h1 className="text-3xl font-bold">Infinitamente Matemático</h1>
          <p className="text-sm text-white/70 mt-2">{isRegisterMode ? 'Crea tu cuenta' : 'Inicia sesión'}</p>
        </div>
        
        <form onSubmit={isRegisterMode ? handleRegister : handleLogin} className="space-y-4">
          <div>
            <input 
              type="email" 
              className="w-full p-4 bg-white/5 border border-white/10 rounded-xl outline-none text-white placeholder-white/50 focus:border-indigo-400 transition" 
              placeholder="Email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required
            />
          </div>
          <div>
            <input 
              type="password" 
              className="w-full p-4 bg-white/5 border border-white/10 rounded-xl outline-none text-white placeholder-white/50 focus:border-indigo-400 transition" 
              placeholder="Contraseña" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required
            />
          </div>
          {isRegisterMode && (
            <div>
              <input 
                type="password" 
                className="w-full p-4 bg-white/5 border border-white/10 rounded-xl outline-none text-white placeholder-white/50 focus:border-indigo-400 transition" 
                placeholder="Confirmar contraseña" 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                required
              />
            </div>
          )}
          {loginError && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-200 text-sm p-3 rounded-xl">
              {loginError}
            </div>
          )}
          <button 
            disabled={isSubmitting} 
            className="w-full bg-indigo-500 hover:bg-indigo-600 p-4 rounded-xl font-bold flex justify-center items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" />
            ) : (
              isRegisterMode ? 'Crear cuenta' : 'Ingresar'
            )}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsRegisterMode(!isRegisterMode);
              setLoginError('');
              setPassword('');
              setConfirmPassword('');
            }}
            className="text-sm text-white/70 hover:text-white transition underline"
          >
            {isRegisterMode ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-950 text-gray-50' : 'bg-slate-50 text-gray-900'} font-sans pb-32 transition-colors`}>
      <div className={`${darkMode ? 'bg-slate-900/95' : 'bg-white/95'} backdrop-blur-md sticky top-0 z-20 border-b ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
        <div className="px-4 py-4 flex justify-between items-center max-w-md mx-auto">
          <div><h1 className="font-bold text-xl text-indigo-600 dark:text-indigo-400">Infinitamente Matemático</h1><p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{students.length} alumnos</p></div>
          <div className="flex gap-2">
            <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-full transition ${darkMode ? 'bg-slate-800 text-yellow-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button onClick={() => signOut(auth)} className={`p-2 rounded-full transition ${darkMode ? 'bg-slate-800 text-gray-300 hover:bg-slate-700 hover:text-red-400' : 'bg-slate-100 text-gray-700 hover:bg-slate-200 hover:text-red-600'}`}><LogOut size={18} /></button>
          </div>
        </div>
        {(view === 'agenda' || view === 'students') && (
          <div className="max-w-md mx-auto px-4 pb-3 space-y-2">
            <div className="relative"><Search className={`absolute left-3 top-3.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} size={18} /><input className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${darkMode ? 'bg-slate-800 border-slate-700 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'} focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400`} placeholder="Buscar..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
            {view === 'agenda' && (
              <div className="flex gap-2">
                <select className={`flex-1 px-3 py-2 rounded-lg border ${darkMode ? 'bg-slate-800 border-slate-700 text-gray-100' : 'bg-white border-gray-200 text-gray-900'} focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400`} onChange={e => setFilterPaid(e.target.value as 'all' | 'paid' | 'pending')}><option value="all">Todos</option><option value="paid">Pagados</option><option value="pending">Pendientes</option></select>
                <select className={`flex-1 px-3 py-2 rounded-lg border ${darkMode ? 'bg-slate-800 border-slate-700 text-gray-100' : 'bg-white border-gray-200 text-gray-900'} focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400`} onChange={e => setFilterStudent(e.target.value)}><option value="all">Alumnos</option>{students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </div>
            )}
          </div>
        )}
        {view === 'agenda' && financials.collected > 0 && (
          <div className="max-w-md mx-auto px-4 pb-4">
            <div className={`rounded-2xl p-4 shadow-sm border grid grid-cols-2 gap-8 ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'}`}>
              <div className="text-center"><p className={`text-xs font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Por Cobrar</p><p className="text-2xl font-black text-red-600 dark:text-red-400">{currency(financials.owed)}</p></div>
              <div className="text-center"><p className={`text-xs font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Ingresos</p><p className="text-2xl font-black text-green-600 dark:text-green-400">{currency(financials.collected)}</p></div>
            </div>
          </div>
        )}
      </div>

      <main className="max-w-md mx-auto p-4 space-y-6">
        {view === 'agenda' && (
          <div className="space-y-8">
            {groupedSessions.map(g => (
              <div key={g.date} className={isPastDate(g.date) ? 'opacity-60 grayscale' : ''}>
                <div className="sticky top-[140px] z-10 flex justify-center mb-4"><span className={`${darkMode ? 'bg-slate-800 text-gray-100' : 'bg-slate-800 text-white'} text-xs font-bold px-3 py-1 rounded-full shadow-lg`}>{formatDateHeader(g.date)}</span></div>
                <div className={`space-y-3 pl-4 border-l-2 ${darkMode ? 'border-indigo-800/50' : 'border-indigo-200'} ml-2`}>
                  {g.items.map(s => (
                    <div key={s.id} className={`p-4 rounded-2xl shadow-sm border ${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-gray-200'}`}>
                      <div className="flex justify-between items-start">
                        <div><h4 className={`font-bold text-lg ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{s.studentName}</h4><p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{s.topic}</p></div>
                        <span className={`font-bold ${s.isPaid || s.isTrial ? 'text-green-600 dark:text-green-400' : darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{s.isTrial ? 'Gratis' : currency(s.price)}</span>
                      </div>
                      <div className="flex justify-between items-center mt-4">
                        <span className={`text-sm font-bold flex gap-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}><Clock size={14} />{s.startTime}</span>
                        <div className="flex gap-2">
                          <button onClick={() => openEditClassModal(s)} className={`p-2 rounded-full transition ${darkMode ? 'bg-slate-700 text-gray-300 hover:bg-slate-600' : 'bg-slate-100 text-gray-700 hover:bg-slate-200'}`}><Pencil size={16} /></button>
                          <button onClick={() => sendWhatsApp(s)} className={`p-2 rounded-full transition ${darkMode ? 'bg-green-900/40 text-green-400 hover:bg-green-900/60' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}><MessageCircle size={18} /></button>
                          <button onClick={() => !s.isTrial && togglePay(s)} disabled={s.isTrial} className={`h-9 px-3 rounded-full text-xs font-bold transition ${s.isPaid ? darkMode ? 'bg-green-900/40 text-green-300' : 'bg-green-100 text-green-700' : 'bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-700 dark:hover:bg-indigo-600'}`}>{s.isTrial ? 'Prueba' : <DollarSign size={14} />}</button>
                          <button onClick={() => deleteItem('sessions', s.id)} className={`p-2 rounded-full transition ${darkMode ? 'bg-slate-700 text-gray-300 hover:bg-red-900/40 hover:text-red-400' : 'bg-slate-100 text-gray-700 hover:bg-red-50 hover:text-red-600'}`}><Trash2 size={16} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'students' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center px-2">
              <h3 className={`font-bold text-xl ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>Mis Alumnos</h3>
              <button onClick={openNewStudentModal} className={`text-xs font-bold border px-3 py-1.5 rounded-lg transition ${darkMode ? 'border-slate-700 text-gray-200 bg-slate-800 hover:bg-slate-700' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'}`}>+ Agregar</button>
            </div>
            {/* onTogglePay removido de props */}
            {students.map(s => <StudentCard key={s.id} student={s} sessions={sessions} reminders={reminders} onDelete={id => deleteItem('students', id)} onEdit={openEditStudentModal} onAddReminder={addReminder} onToggleReminder={toggleReminder} onDeleteReminder={onDeleteReminder} />)}
          </div>
        )}

        {/* --- SECCIÓN ESTADÍSTICAS COMPLETA --- */}
        {view === 'stats' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center px-2">
              <h3 className={`font-bold text-xl flex items-center gap-2 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}><BarChart3 size={24} className={darkMode ? 'text-indigo-400' : 'text-indigo-600'} /> Estadísticas</h3>
              <div className="flex gap-2">
                <button onClick={() => exportData('csv')} className={`p-2 rounded-lg transition ${darkMode ? 'bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`} title="CSV"><Download size={18} /></button>
                <button onClick={() => exportData('json')} className={`p-2 rounded-lg transition ${darkMode ? 'bg-slate-800 text-gray-300 hover:bg-slate-700 border border-slate-700' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`} title="JSON"><FileText size={18} /></button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className={`p-4 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-gray-200'}`}>
                <p className={`text-xs font-bold uppercase mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total Clases</p>
                <p className={`text-2xl font-black ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{stats.totalSessions}</p>
              </div>
              <div className={`p-4 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-gray-200'}`}>
                <p className={`text-xs font-bold uppercase mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Promedio</p>
                <p className={`text-2xl font-black ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{currency(stats.avgPrice)}</p>
              </div>
            </div>

            <div className={`p-6 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-gray-200'}`}>
              <h4 className={`font-bold mb-4 flex items-center gap-2 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}><TrendingUp size={20} className={darkMode ? 'text-indigo-400' : 'text-indigo-600'} /> Resumen Financiero</h4>
              <div className="space-y-4">
                <div className="flex justify-between"><span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Total Cobrado</span><span className="text-xl font-bold text-green-600 dark:text-green-400">{currency(stats.totalEarned)}</span></div>
                <div className="flex justify-between"><span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Por Cobrar</span><span className="text-xl font-bold text-red-600 dark:text-red-400">{currency(stats.totalPending)}</span></div>
                <div className={`pt-4 border-t flex justify-between ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}><span className={`font-bold ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>Total</span><span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{currency(stats.totalEarned + stats.totalPending)}</span></div>
              </div>
            </div>

            {stats.topStudents.length > 0 && (
              <div className={`p-6 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-gray-200'}`}>
                <h4 className={`font-bold mb-4 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>Top Alumnos</h4>
                <div className="space-y-3">
                  {stats.topStudents.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${darkMode ? 'bg-indigo-900/50 text-indigo-300' : 'bg-indigo-100 text-indigo-700'}`}>{idx + 1}</div>
                        <span className={darkMode ? 'text-gray-200' : 'text-gray-900'}>{item.student?.name}</span>
                      </div>
                      <span className="font-bold text-green-600 dark:text-green-400">{currency(item.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(stats.monthlyStats).length > 0 && (
              <div className={`p-6 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-gray-200'}`}>
                <h4 className={`font-bold mb-4 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>Balance Mensual</h4>
                <div className="space-y-4">
                  {Object.entries(stats.monthlyStats).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6).map(([month, data]) => (
                    <div key={month}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className={`capitalize ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{new Date(month + '-01').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</span>
                        <span className="font-bold text-green-600 dark:text-green-400">{currency(data.earned)}</span>
                      </div>
                      <div className={`h-2 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}`}>
                        <div className="h-full bg-green-500 dark:bg-green-600" style={{ width: `${Math.min(((data.earned) / (data.earned + data.pending || 1)) * 100, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <div className="fixed bottom-24 right-4 z-20 flex flex-col gap-4">
        {view === 'agenda' && <button onClick={openNewClassModal} className="bg-indigo-600 text-white w-14 h-14 rounded-2xl shadow-xl flex items-center justify-center"><Plus size={32} /></button>}
        {view === 'students' && <button onClick={openNewStudentModal} className="bg-gray-900 text-white w-14 h-14 rounded-2xl shadow-xl flex items-center justify-center"><Users size={28} /></button>}
      </div>

      <nav className={`fixed bottom-0 w-full ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} border-t pb-safe`}>
        <div className="grid grid-cols-3 max-w-md mx-auto">
          <button onClick={() => setView('agenda')} className={`p-4 flex flex-col items-center transition ${view === 'agenda' ? darkMode ? 'text-indigo-400' : 'text-indigo-600' : darkMode ? 'text-gray-500' : 'text-gray-400'}`}><BookOpen /><span className="text-[10px] font-bold">Agenda</span></button>
          <button onClick={() => setView('students')} className={`p-4 flex flex-col items-center transition ${view === 'students' ? darkMode ? 'text-indigo-400' : 'text-indigo-600' : darkMode ? 'text-gray-500' : 'text-gray-400'}`}><Users /><span className="text-[10px] font-bold">Alumnos</span></button>
          <button onClick={() => setView('stats')} className={`p-4 flex flex-col items-center transition ${view === 'stats' ? darkMode ? 'text-indigo-400' : 'text-indigo-600' : darkMode ? 'text-gray-500' : 'text-gray-400'}`}><BarChart3 /><span className="text-[10px] font-bold">Stats</span></button>
        </div>
      </nav>

      {/* Modal UNIFICADO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className={`relative rounded-3xl w-full max-w-sm p-6 shadow-2xl ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200'}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-2xl font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{formData.id ? 'Editar' : 'Nueva'} {modalMode === 'add_class' ? 'Clase' : 'Alumno'}</h3>
              <button onClick={() => setIsModalOpen(false)} className={`p-2 rounded-full transition ${darkMode ? 'bg-slate-700 text-gray-300 hover:bg-slate-600' : 'bg-slate-100 text-gray-700 hover:bg-slate-200'}`}><X size={20} /></button>
            </div>
            <div className="space-y-4">
              {modalMode === 'add_student' ? (
                <>
                  <div><label className={`text-xs font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Nombre</label><input ref={inputRef} className={`w-full p-4 rounded-xl border ${darkMode ? 'bg-slate-700 border-slate-600 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'} focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400`} value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
                  <div><label className={`text-xs font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Celular Alumno</label><input className={`w-full p-3 rounded-xl border ${darkMode ? 'bg-slate-700 border-slate-600 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'} focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400`} value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} /></div>
                  <div><label className={`text-xs font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Celular Responsable</label><input className={`w-full p-3 rounded-xl border ${darkMode ? 'bg-slate-700 border-slate-600 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'} focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400`} value={formData.parentPhone || ''} onChange={e => setFormData({ ...formData, parentPhone: e.target.value })} /></div>
                  <div><label className={`text-xs font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Link de Meet</label><input type="url" placeholder="https://meet.google.com/..." className={`w-full p-3 rounded-xl border ${darkMode ? 'bg-slate-700 border-slate-600 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'} focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400`} value={formData.meetLink || ''} onChange={e => setFormData({ ...formData, meetLink: e.target.value })} /></div>
                  <div><label className={`text-xs font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Precio Default</label><input type="number" className={`w-full p-3 rounded-xl border ${darkMode ? 'bg-slate-700 border-slate-600 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'} focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400`} value={formData.price || ''} onChange={e => setFormData({ ...formData, price: e.target.value })} /></div>
                  <div><label className={`text-xs font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Notas Adicionales</label><textarea rows={3} placeholder="Información adicional sobre el alumno..." className={`w-full p-3 rounded-xl border ${darkMode ? 'bg-slate-700 border-slate-600 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'} focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 resize-none`} value={formData.additionalNotes || ''} onChange={e => setFormData({ ...formData, additionalNotes: e.target.value })} /></div>
                  <button onClick={saveStudent} disabled={isSubmitting} className="w-full bg-indigo-600 dark:bg-indigo-500 text-white p-4 rounded-xl font-bold mt-2 hover:bg-indigo-700 dark:hover:bg-indigo-600 transition disabled:opacity-50">{isSubmitting ? <Loader2 className="animate-spin mx-auto" /> : 'Guardar'}</button>
                </>
              ) : (
                <>
                  <div><label className={`text-xs font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Alumno</label><select disabled={!!formData.id} className={`w-full p-4 rounded-xl border ${darkMode ? 'bg-slate-700 border-slate-600 text-gray-100' : 'bg-white border-gray-200 text-gray-900'} focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 disabled:opacity-50`} value={formData.studentId || ''} onChange={e => { const s = students.find(st => st.id === e.target.value); setFormData({ ...formData, studentId: s?.id, price: s?.defaultPrice }); }}><option value="">Seleccionar...</option>{students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                  <div><label className={`text-xs font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Tema</label><input className={`w-full p-3 rounded-xl border ${darkMode ? 'bg-slate-700 border-slate-600 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'} focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400`} value={formData.topic || ''} onChange={e => setFormData({ ...formData, topic: e.target.value })} /></div>
                  <div className="flex gap-2">
                    <div className="flex-1"><label className={`text-xs font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Fecha</label><input type="date" className={`w-full p-3 rounded-xl border ${darkMode ? 'bg-slate-700 border-slate-600 text-gray-100' : 'bg-white border-gray-200 text-gray-900'} focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400`} value={formData.date || ''} onChange={e => setFormData({ ...formData, date: e.target.value })} /></div>
                    <div className="w-1/3"><label className={`text-xs font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Hora</label><input type="time" className={`w-full p-3 rounded-xl border ${darkMode ? 'bg-slate-700 border-slate-600 text-gray-100' : 'bg-white border-gray-200 text-gray-900'} focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400`} value={formData.time || ''} onChange={e => setFormData({ ...formData, time: e.target.value })} /></div>
                  </div>
                  <div><label className={`text-xs font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Precio</label><div className="relative"><span className={`absolute left-4 top-3.5 font-bold ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>$</span><input type="number" className={`w-full p-3 pl-8 rounded-xl border font-bold ${darkMode ? 'bg-slate-700 border-slate-600 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'} focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 disabled:opacity-50`} value={formData.price ?? ''} disabled={Boolean(formData.isTrial)} onChange={e => setFormData({ ...formData, price: e.target.value })} /></div></div>
                  <div className="flex items-center gap-2 mt-2"><input type="checkbox" checked={Boolean(formData.isTrial)} onChange={(e) => { const isTrial = e.target.checked; const selected = students.find(st => st.id === formData.studentId); setFormData(prev => ({ ...prev, isTrial, price: isTrial ? 0 : (prev.price ?? selected?.defaultPrice) })); }} className="w-5 h-5 accent-indigo-600" /><label className={darkMode ? 'text-gray-300' : 'text-gray-700'}>Clase de prueba (Gratis)</label></div>
                  <button onClick={saveClass} disabled={isSubmitting} className="w-full bg-indigo-600 dark:bg-indigo-500 text-white p-4 rounded-xl font-bold mt-4 hover:bg-indigo-700 dark:hover:bg-indigo-600 transition disabled:opacity-50">{isSubmitting ? <Loader2 className="animate-spin mx-auto" /> : 'Agendar'}</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="fixed top-4 left-0 right-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded-full shadow-xl text-sm font-bold flex items-center gap-2 ${t.kind === 'error' ? 'bg-red-500 dark:bg-red-600 text-white' : t.kind === 'success' ? 'bg-green-500 dark:bg-green-600 text-white' : darkMode ? 'bg-slate-800 text-gray-100' : 'bg-slate-800 text-white'}`}>
            {t.kind === 'success' && <CheckCircle2 size={16} />}{t.kind === 'error' && <AlertCircle size={16} />}{t.text}
          </div>
        ))}
      </div>
    </div>
  );
}