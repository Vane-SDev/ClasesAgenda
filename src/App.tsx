import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  Plus, Users, DollarSign, AlertCircle,
  Trash2, BookOpen, LogOut, MessageCircle, CheckCircle2, Clock, X,
  Calendar, Phone, ChevronLeft, ChevronRight, Loader2, Search,
  BarChart3, Download, TrendingUp, FileText, Bell, CheckSquare, Square,
  Sun, Moon, Pencil, Contact // Nuevos iconos
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

// Importamos la instancia configurada
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

const withTimeout = <T,>(promise: Promise<T>, ms = 15000) => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error("Tiempo de espera agotado. Verifica tu conexión.")), ms)
    )
  ]);
};

// Normaliza fechas
const parseDateLocal = (dateStr: string) => new Date(`${dateStr}T12:00:00`);

// ---------- 3. TIPOS ----------
interface Student { 
  id: string; 
  name: string; 
  phone?: string; 
  parentPhone?: string; // NUEVO CAMPO
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
  id?: string; // Para saber si editamos
  name?: string; 
  phone?: string; 
  parentPhone?: string; // NUEVO CAMPO
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
  onEdit: (student: Student) => void; // NUEVO PROP
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
  onEdit, // Recibimos la función de editar
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
  
  // Lógica de calendario (resumida para brevedad, igual que antes)
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
          <div className="flex gap-2">
            <button 
              onClick={() => onEdit(student)} 
              className="text-white/70 hover:text-white p-2 hover:bg-white/10 rounded-full transition"
              title="Editar alumno"
            >
              <Pencil size={18} />
            </button>
            <button 
              onClick={() => onDelete(student.id)} 
              className="text-white/70 hover:text-white p-2 hover:bg-white/10 rounded-full transition"
              title="Eliminar alumno"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1 mt-3 relative z-10">
          {student.phone && (
            <div className="flex items-center gap-2 text-sm text-indigo-100">
              <div className="bg-white/20 p-1 rounded-full"><Phone size={12} /></div>
              <span>{student.phone}</span>
            </div>
          )}
          {student.parentPhone && (
            <div className="flex items-center gap-2 text-sm text-indigo-100">
              <div className="bg-white/20 p-1 rounded-full"><Contact size={12} /></div>
              <span>Resp: {student.parentPhone}</span>
            </div>
          )}
        </div>
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
              className="w-full px-3 py-2 bg-white dark:bg-slate-700 dark:text-white border border-indigo-200 dark:border-indigo-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              autoFocus
            />
            <button onClick={handleAddReminder} className="mt-2 w-full px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition">
              Guardar
            </button>
          </div>
        )}
        
        <div className="space-y-2 mb-3">
            {studentReminders.map(reminder => (
              <div key={reminder.id} className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
                <button onClick={() => onToggleReminder(reminder.id, true)} className="mt-0.5 text-yellow-600 dark:text-yellow-500">
                  <Square size={16} />
                </button>
                <div className="flex-1">
                  <p className="text-sm text-gray-800 dark:text-gray-200">{reminder.text}</p>
                </div>
                <button onClick={() => onDeleteReminder(reminder.id)} className="text-gray-400 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ---------- 6. COMPONENTE PRINCIPAL ----------
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
  const [loginError, setLoginError] = useState('');
  
  const { toasts, push } = useToasts();
  
  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  // Funciones para abrir modales (Creación y Edición)
  const openNewClassModal = useCallback(() => {
    if (students.length === 0) { push({ text: 'Registrá un alumno antes', kind: 'info' }); return; }
    setModalMode('add_class'); 
    setFormData({ date: new Date().toISOString().split('T')[0], time: '17:00', isTrial: false }); 
    setIsModalOpen(true);
  }, [students.length, push]);

  const openEditClassModal = useCallback((session: ClassSession) => {
    setModalMode('add_class'); // Reusamos el modo, pero con datos
    setFormData({
      id: session.id, // ID es clave para saber que es edición
      studentId: session.studentId,
      topic: session.topic,
      date: session.date,
      time: session.startTime,
      price: session.price,
      isTrial: session.isTrial
    });
    setIsModalOpen(true);
  }, []);

  const openNewStudentModal = useCallback(() => { 
    setModalMode('add_student'); 
    setFormData({}); 
    setIsModalOpen(true); 
  }, []);

  const openEditStudentModal = useCallback((student: Student) => {
    setModalMode('add_student');
    setFormData({
      id: student.id, // ID clave para edición
      name: student.name,
      phone: student.phone,
      parentPhone: student.parentPhone,
      level: student.level,
      price: student.defaultPrice
    });
    setIsModalOpen(true);
  }, []);

  // Auth y listeners
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) { setStudents([]); setSessions([]); setReminders([]); return; }

    const unsubStd = onSnapshot(query(collection(db, 'users', user.uid, 'students'), orderBy('name')), 
      (snap) => setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Student))),
      (err) => console.error("Error Alumnos:", err)
    );

    const unsubSess = onSnapshot(collection(db, 'users', user.uid, 'sessions'),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as ClassSession));
        data.sort((a, b) => new Date(b.date + 'T' + b.startTime).getTime() - new Date(a.date + 'T' + a.startTime).getTime());
        setSessions(data);
      },
      (err) => console.error("Error Clases:", err)
    );

    const unsubRem = onSnapshot(collection(db, 'users', user.uid, 'reminders'),
      (snap) => setReminders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reminder))),
      (err) => console.error("Error Recordatorios:", err)
    );

    return () => { unsubStd(); unsubSess(); unsubRem(); };
  }, [user]);

  // Manejo de Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLoginError('');
    try {
      await withTimeout(signInWithEmailAndPassword(auth, email, password));
    } catch (error) {
      console.error('Error login:', error);
      setLoginError('Credenciales incorrectas o error de conexión.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Guardar Alumno (Crear o Editar)
  const saveStudent = async () => {
    if (!user) return;
    const name = formData.name?.trim();
    if (!name) { push({ text: 'El nombre es requerido', kind: 'error' }); return; }
    const price = Number(formData.price);
    
    setIsSubmitting(true);
    try {
      const studentData = {
        name: name,
        phone: formData.phone?.trim() || '',
        parentPhone: formData.parentPhone?.trim() || '', // Guardamos el nuevo campo
        level: formData.level?.trim() || 'General',
        defaultPrice: price || 0,
      };

      if (formData.id) {
        // EDICIÓN
        await updateDoc(doc(db, 'users', user.uid, 'students', formData.id), studentData);
        push({ text: 'Alumno actualizado', kind: 'success' });
      } else {
        // CREACIÓN
        await addDoc(collection(db, 'users', user.uid, 'students'), {
          ...studentData,
          createdAt: serverTimestamp()
        });
        push({ text: 'Alumno creado', kind: 'success' });
      }
      setIsModalOpen(false);
    } catch (error) { 
      console.error('Error:', error);
      push({ text: 'Error al guardar', kind: 'error' }); 
    } finally {
      setIsSubmitting(false);
    }
  };

  // Guardar Clase (Crear o Editar)
  const saveClass = async () => {
    if (!user) return;
    if (!formData.studentId) { push({ text: 'Seleccioná un alumno', kind: 'error' }); return; }
    
    const student = students.find(s => s.id === formData.studentId);
    const isTrial = Boolean(formData.isTrial);
    const price = isTrial ? 0 : Number(formData.price);
    
    setIsSubmitting(true);
    try {
      const sessionData = {
        studentId: formData.studentId,
        studentName: student?.name || 'Alumno',
        topic: formData.topic?.trim() || 'Clase Regular',
        date: formData.date || '',
        startTime: formData.time || '',
        price: price,
        isPaid: isTrial, // Si es prueba, nace pagada (gratis)
        isTrial
      };

      if (formData.id) {
        // EDICIÓN
        await updateDoc(doc(db, 'users', user.uid, 'sessions', formData.id), sessionData);
        push({ text: 'Clase actualizada', kind: 'success' });
      } else {
        // CREACIÓN
        await addDoc(collection(db, 'users', user.uid, 'sessions'), {
          ...sessionData,
          createdAt: serverTimestamp()
        });
        push({ text: 'Clase agendada', kind: 'success' });
      }
      setIsModalOpen(false);
    } catch (error) { 
      console.error('Error:', error);
      push({ text: 'Error al agendar', kind: 'error' }); 
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resto de funciones (TogglePay, Delete, etc.)
  const togglePay = async (session: ClassSession) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'sessions', session.id), { isPaid: !session.isPaid });
      push({ text: session.isPaid ? 'Pago pendiente' : '¡Pago recibido!', kind: 'success' });
    } catch (error) { console.error(error); }
  };

  const deleteItem = async (col: string, id: string) => {
    if (!user || !window.confirm('¿Eliminar definitivamente?')) return;
    try { await deleteDoc(doc(db, 'users', user.uid, col, id)); push({ text: 'Eliminado', kind: 'info' }); } 
    catch (error) { console.error(error); }
  };

  const sendWhatsApp = (session: ClassSession) => {
    const student = students.find(s => s.id === session.studentId);
    const phone = student?.phone || student?.parentPhone; // Intenta celular alumno, sino padre
    if (!phone) { push({ text: 'Sin teléfono registrado', kind: 'error' }); return; }
    const msg = `Hola! Recuerdo la clase de ${session.topic} el ${new Date(session.date).toLocaleDateString('es-AR')} a las ${session.startTime}hs.`;
    window.open(`https://wa.me/${phone.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const addReminder = async (studentId: string, text: string) => {
    if (!user) return;
    await addDoc(collection(db, 'users', user.uid, 'reminders'), { studentId, text, completed: false, createdAt: serverTimestamp() });
  };
  const toggleReminder = async (id: string, completed: boolean) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid, 'reminders', id), { completed, completedAt: completed ? serverTimestamp() : null });
  };
  const deleteReminder = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, 'users', user.uid, 'reminders', id));
  };

  // Filtrado y Agrupación
  const filteredSessions = useMemo(() => {
    let filtered = sessions;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(s => s.studentName.toLowerCase().includes(q) || s.topic.toLowerCase().includes(q));
    }
    if (filterPaid !== 'all') filtered = filtered.filter(s => filterPaid === 'paid' ? s.isPaid : !s.isPaid);
    if (filterStudent !== 'all') filtered = filtered.filter(s => s.studentId === filterStudent);
    return filtered;
  }, [sessions, searchQuery, filterPaid, filterStudent]);

  const groupedSessions = useMemo(() => {
    const groups: Record<string, ClassSession[]> = {};
    filteredSessions.forEach(s => { if (!groups[s.date]) groups[s.date] = []; groups[s.date].push(s); });
    return Object.keys(groups).sort((a, b) => parseDateLocal(b).getTime() - parseDateLocal(a).getTime())
      .map(date => ({ date, items: groups[date].sort((a, b) => a.startTime.localeCompare(b.startTime)) }));
  }, [filteredSessions]);

  const financials = useMemo(() => {
    return sessions.reduce((acc, curr) => {
      curr.isPaid ? acc.collected += curr.price : acc.owed += curr.price;
      return acc;
    }, { collected: 0, owed: 0 });
  }, [sessions]);

  // LOGIN SCREEN
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>;
  
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-slate-900 to-black p-6">
        <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-8 w-full max-w-sm shadow-2xl text-white">
          <div className="text-center mb-8">
            <div className="bg-indigo-500 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/30"><BookOpen className="text-white" /></div>
            <h1 className="text-3xl font-bold tracking-tight">Infinitamente Matemático</h1>
            <p className="text-indigo-200 text-sm mt-1">Organización de mis clases</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="email" className="w-full p-4 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 outline-none text-white placeholder-white/30" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            <input type="password" className="w-full p-4 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 outline-none text-white placeholder-white/30" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} />
            {loginError && <div className="text-red-300 text-sm bg-red-500/20 p-3 rounded-lg text-center">{loginError}</div>}
            <button disabled={isSubmitting} className="w-full bg-indigo-500 hover:bg-indigo-400 text-white p-4 rounded-xl font-bold transition shadow-lg flex justify-center gap-2">
              {isSubmitting ? <Loader2 className="animate-spin" /> : 'Ingresar'}
            </button>
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
            <h1 className="font-bold text-xl bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">Infinitamente Matemático</h1>
            <p className={`text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{students.length} alumnos activos</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-full transition ${darkMode ? 'bg-slate-700 text-yellow-400' : 'bg-gray-100 text-gray-600'}`}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button onClick={() => signOut(auth)} className={`p-2 rounded-full transition ${darkMode ? 'bg-slate-700 hover:text-red-400' : 'bg-gray-100 hover:text-red-500'}`}><LogOut size={18} /></button>
          </div>
        </div>

        {(view === 'agenda' || view === 'students') && (
          <div className="max-w-md mx-auto px-4 pb-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-3.5 text-gray-400" size={18} />
              <input type="text" placeholder={view === 'agenda' ? "Buscar clases..." : "Buscar alumnos..."} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-200'} outline-none`} />
            </div>
            {view === 'agenda' && (
              <div className="flex gap-2">
                <select value={filterPaid} onChange={(e) => setFilterPaid(e.target.value as any)} className={`flex-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-200'}`}>
                  <option value="all">Todos</option><option value="paid">Pagados</option><option value="pending">Pendientes</option>
                </select>
                <select value={filterStudent} onChange={(e) => setFilterStudent(e.target.value)} className={`flex-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-200'}`}>
                  <option value="all">Alumnos</option>{students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
        
        {view === 'agenda' && financials.collected > 0 && (
            <div className="max-w-md mx-auto px-4 pb-4">
            <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'} rounded-2xl p-4 shadow-sm border grid grid-cols-2 gap-8 relative overflow-hidden`}>
                <div className={`absolute top-0 left-1/2 -ml-[1px] w-[1px] h-full ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}></div>
                <div className="text-center"><p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Por Cobrar</p><p className={`text-2xl font-black ${darkMode ? 'text-red-400' : 'text-slate-800'}`}>{currency(financials.owed)}</p></div>
                <div className="text-center"><p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Ingresos Mes</p><p className="text-2xl font-black text-green-600">{currency(financials.collected)}</p></div>
            </div>
            </div>
        )}
      </div>

      <main className="max-w-md mx-auto p-4 space-y-6">
        {view === 'agenda' && (
          <div className="space-y-8">
            {groupedSessions.map(group => (
              <div key={group.date} className={`relative ${isPastDate(group.date) ? 'opacity-70 grayscale-[0.5]' : ''}`}>
                <div className="sticky top-[140px] z-10 flex justify-center mb-4">
                  <span className={`${darkMode ? 'bg-slate-700' : 'bg-slate-800'} text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg`}>{formatDateHeader(group.date)}</span>
                </div>
                <div className={`space-y-3 pl-4 border-l-2 ${darkMode ? 'border-slate-700' : 'border-indigo-100'} ml-2`}>
                  {group.items.map(s => (
                    <div key={s.id} className="relative group">
                      <div className={`absolute -left-[21px] top-4 w-3 h-3 rounded-full border-2 ${darkMode ? 'border-slate-800' : 'border-white'} shadow-sm ${s.isPaid ? 'bg-green-500' : 'bg-indigo-500'}`}></div>
                      <article className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'} p-4 rounded-2xl shadow-sm border group-hover:shadow-md transition-all`}>
                        <div className="flex justify-between items-start mb-1">
                          <div>
                            <h4 className={`font-bold ${darkMode ? 'text-gray-100' : 'text-gray-800'} text-lg`}>{s.studentName}</h4>
                            <div className="flex flex-wrap gap-2 mt-1">
                              <span className={`text-xs font-medium px-2 py-0.5 ${darkMode ? 'bg-indigo-900/50 text-indigo-300' : 'bg-indigo-50 text-indigo-600'} rounded-md`}>{s.topic}</span>
                              {s.isTrial && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">Prueba gratis</span>}
                            </div>
                          </div>
                          <span className={`font-bold text-lg ${s.isTrial || s.isPaid ? 'text-green-600' : darkMode ? 'text-gray-300' : 'text-slate-700'}`}>{s.isTrial ? 'Gratis' : currency(s.price)}</span>
                        </div>
                        <div className="flex items-center justify-between mt-4">
                          <div className={`flex items-center gap-1.5 ${darkMode ? 'text-gray-300 bg-slate-700' : 'text-gray-500 bg-gray-50'} font-medium text-sm px-2 py-1 rounded-lg`}>
                            <Clock size={14} /> {s.startTime}
                          </div>
                          <div className="flex gap-2">
                             {/* EDITAR CLASE */}
                            <button onClick={() => openEditClassModal(s)} className={`w-9 h-9 flex items-center justify-center rounded-full ${darkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-500'} transition`}>
                              <Pencil size={16} />
                            </button>
                            <button onClick={() => sendWhatsApp(s)} className={`w-9 h-9 flex items-center justify-center rounded-full ${darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-50 text-green-600'} transition`}>
                              <MessageCircle size={18} />
                            </button>
                            <button onClick={() => !s.isTrial && togglePay(s)} disabled={s.isTrial} className={`h-9 px-3 rounded-full flex items-center gap-1 text-xs font-bold transition ${s.isTrial ? 'bg-green-50 text-green-600 border border-green-200 cursor-default' : s.isPaid ? darkMode ? 'bg-slate-700 text-gray-200' : 'bg-gray-100 text-gray-500' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'}`}>
                              {s.isTrial ? 'Prueba' : <><DollarSign size={14} /> {s.isPaid ? '' : 'Cobrar'}</>}
                            </button>
                            <button onClick={() => deleteItem('sessions', s.id)} className={`w-9 h-9 flex items-center justify-center rounded-full ${darkMode ? 'text-gray-500 hover:text-red-400' : 'text-gray-300 hover:text-red-500'} transition`}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </article>
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
              <h3 className={`font-bold ${darkMode ? 'text-gray-100' : 'text-gray-800'} text-xl`}>Mis Alumnos</h3>
              <button onClick={openNewStudentModal} className={`text-xs font-bold ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-200'} border shadow-sm px-3 py-1.5 rounded-lg transition`}>+ Agregar Nuevo</button>
            </div>
            <div className="grid gap-6">
              {students.map(std => (
                <StudentCard key={std.id} student={std} sessions={sessions} reminders={reminders} onTogglePay={togglePay} onDelete={(id) => deleteItem('students', id)} onEdit={openEditStudentModal} onAddReminder={addReminder} onToggleReminder={toggleReminder} onDeleteReminder={deleteReminder} />
              ))}
            </div>
          </div>
        )}

        {/* ESTADÍSTICAS Y GRÁFICOS (simplificado para el ejemplo) */}
        {view === 'stats' && <div className="text-center p-10 text-gray-500">Sección de estadísticas (igual que antes)</div>}
      </main>

      <div className="fixed bottom-24 right-4 z-20 flex flex-col gap-4 items-end pointer-events-none">
        {view === 'agenda' && <button onClick={openNewClassModal} className="pointer-events-auto bg-gradient-to-r from-indigo-600 to-violet-600 text-white w-14 h-14 rounded-2xl shadow-xl hover:scale-110 flex items-center justify-center"><Plus size={32} /></button>}
        {view === 'students' && <button onClick={openNewStudentModal} className="pointer-events-auto bg-gray-900 text-white w-14 h-14 rounded-2xl shadow-xl hover:scale-110 flex items-center justify-center"><Users size={28} /></button>}
      </div>

      <nav className={`fixed bottom-0 w-full ${darkMode ? 'bg-slate-800/90 border-slate-700' : 'bg-white/90 border-gray-200'} backdrop-blur-lg border-t z-30 pb-safe shadow-lg`}>
        <div className="max-w-md mx-auto grid grid-cols-3">
          <button onClick={() => setView('agenda')} className={`p-4 flex flex-col items-center ${view === 'agenda' ? 'text-indigo-600' : 'text-gray-400'}`}><BookOpen size={24} /><span className="text-[10px] font-bold mt-1">Agenda</span></button>
          <button onClick={() => setView('students')} className={`p-4 flex flex-col items-center ${view === 'students' ? 'text-indigo-600' : 'text-gray-400'}`}><Users size={24} /><span className="text-[10px] font-bold mt-1">Alumnos</span></button>
          <button onClick={() => setView('stats')} className={`p-4 flex flex-col items-center ${view === 'stats' ? 'text-indigo-600' : 'text-gray-400'}`}><BarChart3 size={24} /><span className="text-[10px] font-bold mt-1">Stats</span></button>
        </div>
      </nav>

      {/* Modal UNIFICADO (Crear y Editar) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-white/90 backdrop-blur-xl rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in slide-in-from-bottom-10 border border-white/20">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-gray-800">
                {formData.id ? 'Editar' : 'Nueva'} {modalMode === 'add_class' ? 'Clase' : 'Alumno'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              {modalMode === 'add_student' ? (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 ml-1 uppercase">Nombre</label>
                    <input ref={inputRef} autoFocus className="w-full p-4 bg-white border border-gray-200 rounded-xl focus:border-indigo-500 outline-none font-medium text-lg" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                  </div>
                  <div className="flex gap-3">
                    <div className="space-y-1 flex-1">
                      <label className="text-xs font-bold text-gray-500 ml-1 uppercase">Celular Alumno</label>
                      <input placeholder="549..." className="w-full p-3 bg-white border border-gray-200 rounded-xl outline-none" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                    </div>
                  </div>
                   {/* NUEVO CAMPO: RESPONSABLE */}
                  <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-500 ml-1 uppercase">Celular Responsable (Padre/Madre)</label>
                      <input placeholder="549..." className="w-full p-3 bg-white border border-gray-200 rounded-xl outline-none" value={formData.parentPhone || ''} onChange={e => setFormData({ ...formData, parentPhone: e.target.value })} />
                  </div>

                  <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-500 ml-1 uppercase">Precio Default</label>
                      <input type="number" className="w-full p-3 bg-white border border-gray-200 rounded-xl outline-none font-bold" value={formData.price || ''} onChange={e => setFormData({ ...formData, price: e.target.value })} />
                  </div>

                  <button onClick={saveStudent} disabled={isSubmitting} className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold text-lg hover:bg-black transition shadow-lg mt-2">
                    {isSubmitting ? <Loader2 className="animate-spin mx-auto" /> : (formData.id ? 'Actualizar Alumno' : 'Guardar Alumno')}
                  </button>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 ml-1 uppercase">Alumno</label>
                    <select ref={selectRef} disabled={!!formData.id} className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none font-medium text-lg disabled:bg-gray-100" value={formData.studentId || ''} onChange={e => { const s = students.find(st => st.id === e.target.value); setFormData({ ...formData, studentId: s?.id, price: s?.defaultPrice }); }}>
                      <option value="">Seleccionar...</option>{students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 ml-1 uppercase">Tema</label>
                    <input className="w-full p-3 bg-white border border-gray-200 rounded-xl outline-none" value={formData.topic || ''} onChange={e => setFormData({ ...formData, topic: e.target.value })} />
                  </div>
                  <div className="flex gap-3">
                    <div className="space-y-1 flex-1">
                      <label className="text-xs font-bold text-gray-500 ml-1 uppercase">Fecha</label>
                      <input type="date" className="w-full p-3 bg-white border border-gray-200 rounded-xl outline-none" value={formData.date || ''} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                    </div>
                    <div className="space-y-1 w-1/3">
                      <label className="text-xs font-bold text-gray-500 ml-1 uppercase">Hora</label>
                      <input type="time" className="w-full p-3 bg-white border border-gray-200 rounded-xl outline-none" value={formData.time || ''} onChange={e => setFormData({ ...formData, time: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 ml-1 uppercase">Precio</label>
                    <div className="flex items-center justify-between mb-2 text-xs font-semibold text-indigo-600">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={Boolean(formData.isTrial)} onChange={(e) => { const isTrial = e.target.checked; const selected = students.find(st => st.id === formData.studentId); setFormData(prev => ({ ...prev, isTrial, price: isTrial ? 0 : (prev.price ?? selected?.defaultPrice) })); }} className="accent-indigo-600" />
                        Clase de prueba (sin costo)
                      </label>
                    </div>
                    <div className="relative">
                      <span className="absolute left-4 top-3.5 text-gray-400 font-bold">$</span>
                      <input type="number" className="w-full p-3 pl-8 bg-white border border-gray-200 rounded-xl outline-none font-bold text-lg" value={formData.price ?? ''} disabled={Boolean(formData.isTrial)} onChange={e => setFormData({ ...formData, price: e.target.value })} />
                    </div>
                  </div>
                  <button onClick={saveClass} disabled={isSubmitting} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 transition shadow-lg mt-4">
                    {isSubmitting ? <Loader2 className="animate-spin mx-auto" /> : (formData.id ? 'Actualizar Clase' : 'Agendar Clase')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="fixed top-4 left-0 right-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded-full shadow-xl text-sm font-bold animate-in slide-in-from-top-5 fade-in duration-300 flex items-center gap-2 ${t.kind === 'error' ? 'bg-red-500 text-white' : 'bg-gray-900 text-white'}`}>
            {t.kind === 'success' && <CheckCircle2 size={16} />}{t.kind === 'error' && <AlertCircle size={16} />}{t.text}
          </div>
        ))}
      </div>
    </div>
  );
}