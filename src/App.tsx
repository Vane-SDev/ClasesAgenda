import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  Plus, Users, DollarSign, AlertCircle,
  Trash2, BookOpen, LogOut, MessageCircle, CheckCircle2, Clock, X
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInAnonymously,
  type User
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';

// ---------- Firebase init (tu config) ----------
const firebaseConfig = {
  apiKey: "AIzaSyB_nKKCZxp9dkg4CFV7N6ySavuQ2BH7syk",
  authDomain: "appclases-40e85.firebaseapp.com",
  projectId: "appclases-40e85",
  storageBucket: "appclases-40e85.firebasestorage.app",
  messagingSenderId: "846276201926",
  appId: "1:846276201926:web:f3573360f1c67c4112f6c7"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- Types ----------
interface Student { id: string; name: string; phone?: string; level: string; defaultPrice: number; }
interface ClassSession { id: string; studentId: string; studentName: string; topic: string; date: string; startTime: string; price: number; isPaid: boolean; }
interface FormData { name?: string; phone?: string; level?: string; studentId?: string; topic?: string; date?: string; time?: string; price?: string | number; }

// ---------- Helpers ----------
const currency = (v = 0) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(v);
const isPastDate = (dateStr: string) => {
  const today = new Date(); today.setHours(0,0,0,0);
  return new Date(dateStr + 'T23:59:59') < today;
};
const formatDateHeader = (dateStr: string) => {
  const date = new Date(dateStr + 'T12:00:00');
  const today = new Date(); const tomorrow = new Date(); tomorrow.setDate(today.getDate()+1);
  if (date.toDateString() === today.toDateString()) return 'Hoy';
  if (date.toDateString() === tomorrow.toDateString()) return 'Mañana';
  return date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
};

// ---------- Small toast system (local) ----------
type Toast = { id: string; text: string; kind?: 'info'|'error'|'success' };
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (t: Toast) => {
    setToasts(s => [...s, t]);
    setTimeout(() => setToasts(s => s.filter(x => x.id !== t.id)), 3500);
  };
  return { toasts, push };
}

// ---------- App ----------
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'agenda'|'students'>('agenda');
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add_class'|'add_student'>('add_class');
  const [formData, setFormData] = useState<FormData>({});
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [loginError, setLoginError] = useState('');
  const { toasts, push } = useToasts();
  const modalFirstRef = useRef<HTMLInputElement|null>(null);

  // Auth + snapshots
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(true);
      if (!u) { setStudents([]); setSessions([]); setLoading(false); return; }
      const studentsCollection = collection(db, 'users', u.uid, 'students');
      const sessionsCollection = collection(db, 'users', u.uid, 'sessions');
      const qStudents = query(studentsCollection, orderBy('name'));
      const unsubStd = onSnapshot(qStudents, (snap) => {
        setStudents(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      }, (e) => { console.error(e); push({ id: String(Date.now()), text: 'Error cargando alumnos', kind: 'error' }); });

      const unsubSess = onSnapshot(sessionsCollection, (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as ClassSession[];
        data.sort((a,b) => new Date(b.date + 'T' + b.startTime).getTime() - new Date(a.date + 'T' + a.startTime).getTime());
        setSessions(data);
        setLoading(false);
      }, (e) => { console.error(e); push({ id: String(Date.now()), text: 'Error cargando clases', kind: 'error' }); });

      return () => { unsubStd(); unsubSess(); };
    });
    return unsubAuth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts global
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'n') { if(view==='agenda') openNewClassModal(); }
      if (e.key === 'a') { openNewStudentModal(); }
      if (e.key === 'g') { setView(v => v === 'agenda' ? 'students' : 'agenda'); }
      if (e.key === 'Escape') setIsModalOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [view, students]);

  // Autofocus modal
  useEffect(() => {
    if (isModalOpen) setTimeout(() => modalFirstRef.current?.focus(), 80);
  }, [isModalOpen]);

  // Auth handlers
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      push({ id: String(Date.now()), text: 'Bienvenida!', kind: 'success' });
    } catch (err) {
      console.error(err);
      try { await signInAnonymously(auth); push({ id: String(Date.now()), text: 'Acceso anónimo', kind: 'info' }); }
      catch { setLoginError('Error de acceso.'); push({ id: String(Date.now()), text: 'Error login', kind: 'error' }); }
    }
  };

  // Save student
  const saveStudent = async () => {
    if (!user) return push({ id: String(Date.now()), text: 'Debes iniciar sesión', kind: 'error' });
    if (!formData.name || String(formData.price || '').trim() === '') return push({ id: String(Date.now()), text: 'Completa nombre y precio', kind: 'error' });
    try {
      await addDoc(collection(db, 'users', user.uid, 'students'), {
        name: formData.name,
        phone: formData.phone || '',
        level: formData.level || 'General',
        defaultPrice: Number(formData.price),
        createdAt: serverTimestamp()
      });
      setIsModalOpen(false); setFormData({});
      push({ id: String(Date.now()), text: 'Alumno agregado', kind: 'success' });
    } catch (e) { console.error(e); push({ id: String(Date.now()), text: 'Error guardando alumno', kind: 'error' }); }
  };

  // Save class
  const saveClass = async () => {
    if (!user) return push({ id: String(Date.now()), text: 'Debes iniciar sesión', kind: 'error' });
    const student = students.find(s => s.id === formData.studentId);
    if (!student) return push({ id: String(Date.now()), text: 'Seleccioná un alumno', kind: 'error' });
    if (!formData.date || !formData.time) return push({ id: String(Date.now()), text: 'Fecha y hora requeridas', kind: 'error' });
    try {
      await addDoc(collection(db, 'users', user.uid, 'sessions'), {
        studentId: student.id,
        studentName: student.name,
        topic: formData.topic || 'Clase Regular',
        date: formData.date,
        startTime: formData.time,
        price: Number(formData.price || student.defaultPrice || 0),
        isPaid: false,
        createdAt: serverTimestamp()
      });
      setIsModalOpen(false); setFormData({});
      push({ id: String(Date.now()), text: 'Clase agendada', kind: 'success' });
    } catch (e) { console.error(e); push({ id: String(Date.now()), text: 'Error agendando clase', kind: 'error' }); }
  };

  const togglePay = async (session: ClassSession) => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid, 'sessions', session.id);
    await updateDoc(ref, { isPaid: !session.isPaid });
    push({ id: String(Date.now()), text: session.isPaid ? 'Pago revertido' : 'Marcado como cobrado', kind: 'info' });
  };

  const deleteItem = async (col: string, id: string) => {
    if (!user) return;
    if (!confirm('¿Eliminar registro? Esta acción es irreversible.')) return;
    await deleteDoc(doc(db, 'users', user.uid, col, id));
    push({ id: String(Date.now()), text: 'Eliminado', kind: 'info' });
  };

  const sendWhatsApp = (session: ClassSession) => {
    const student = students.find(s => s.id === session.studentId);
    if (!student?.phone) { push({ id: String(Date.now()), text: 'Sin teléfono registrado', kind: 'error' }); return; }
    const msg = `Hola ${student.name.split(' ')[0]}! Te recuerdo nuestra clase: ${session.topic} el ${new Date(session.date).toLocaleDateString('es-AR')} a las ${session.startTime}hs.`;
    window.open(`https://wa.me/${student.phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Derived data
  const financials = useMemo(() => sessions.reduce((acc, curr) => {
    if (curr.isPaid) acc.collected += curr.price; else acc.owed += curr.price; return acc;
  }, { collected: 0, owed: 0 }), [sessions]);

  const groupedSessions = useMemo(() => {
    const groups: Record<string, ClassSession[]> = {};
    sessions.forEach(s => { groups[s.date] = groups[s.date] || []; groups[s.date].push(s); });
    return Object.keys(groups).sort((a,b) => new Date(b).getTime()-new Date(a).getTime()).map(date => ({ date, items: groups[date].sort((a,b)=>a.startTime.localeCompare(b.startTime)) }));
  }, [sessions]);

  // Modal open helpers
  const openNewClassModal = () => {
    if (students.length === 0) { push({ id: String(Date.now()), text: 'Registrá un alumno antes', kind: 'info' }); return; }
    setModalMode('add_class'); setFormData({ date: new Date().toISOString().split('T')[0], time: '17:00' }); setIsModalOpen(true);
  };
  const openNewStudentModal = () => { setModalMode('add_student'); setFormData({}); setIsModalOpen(true); };

  // Login screen
  if (loading && !user) return <div className="min-h-screen flex items-center justify-center text-gray-500">Cargando...</div>;
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800 p-6">
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl">
          <h1 className="text-2xl font-extrabold text-center mb-4 text-indigo-900">ProfeAgenda</h1>
          <form onSubmit={handleLogin} className="space-y-3">
            <input aria-label="email" type="email" placeholder="Email" className="w-full p-3 border rounded-lg bg-gray-50 outline-none focus:ring-2 ring-indigo-500" value={email} onChange={e=>setEmail(e.target.value)} />
            <input aria-label="contraseña" type="password" placeholder="Contraseña" className="w-full p-3 border rounded-lg bg-gray-50 outline-none focus:ring-2 ring-indigo-500" value={password} onChange={e=>setPassword(e.target.value)} />
            {loginError && <div role="alert" className="text-red-600 text-sm bg-red-50 p-2 rounded">{loginError}</div>}
            <button className="w-full bg-indigo-600 text-white p-3 rounded-lg font-bold hover:bg-indigo-700 transition">Ingresar</button>
            <p className="text-xs text-gray-500 text-center">Atajos: <span className="font-medium">n</span> nueva clase · <span className="font-medium">a</span> nuevo alumno</p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 font-sans pb-28">
      {/* HEADER */}
      <div className="bg-white sticky top-0 z-20 shadow-sm">
        <div className="px-4 py-3 flex justify-between items-center max-w-md mx-auto">
          <div>
            <h1 className="font-bold text-lg text-indigo-900">Hola, Vane</h1>
            <p className="text-xs text-gray-500">Mi agenda • {students.length} alumnos</p>
          </div>
          <div className="flex items-center gap-3">
            <button title="Cerrar sesión" onClick={() => auth.signOut()} className="p-2 rounded-md hover:bg-gray-100" aria-label="Cerrar sesión"><LogOut size={18} /></button>
          </div>
        </div>

        {/* DASH FINANCIERO */}
        <div className="max-w-md mx-auto px-4 pb-4">
          <div className="flex gap-3">
            <div className={`flex-1 bg-white rounded-lg p-3 shadow-sm border-l-4 ${financials.owed? 'border-red-500':'border-gray-200'}`}>
              <p className="text-gray-500 text-[10px] uppercase font-bold">Pendiente</p>
              <div className="flex items-end justify-between">
                <span className="text-xl font-bold text-red-600">{currency(financials.owed)}</span>
                <AlertCircle size={16} className="text-red-300" />
              </div>
            </div>
            <div className="flex-1 bg-white rounded-lg p-3 shadow-sm border-l-4 border-green-500">
              <p className="text-gray-500 text-[10px] uppercase font-bold">Cobrado</p>
              <div className="flex items-end justify-between">
                <span className="text-xl font-bold text-green-600">{currency(financials.collected)}</span>
                <CheckCircle2 size={16} className="text-green-300" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-md mx-auto p-4 space-y-6">
        {/* AGENDA */}
        {view === 'agenda' && (
          <div className="space-y-6">
            {loading ? (
              <div className="space-y-3">
                {/* skeletons */}
                <div className="animate-pulse bg-white p-4 rounded-xl shadow-sm h-20" />
                <div className="animate-pulse bg-white p-4 rounded-xl shadow-sm h-20" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center text-gray-400 py-8">No hay clases registradas. <br/> Presioná <span className="font-bold">+</span> para crear una.</div>
            ) : (
              groupedSessions.map(group => {
                const past = isPastDate(group.date);
                return (
                  <div key={group.date} className={`${past ? 'opacity-60' : ''}`}>
                    <h3 className="sticky top-0 bg-slate-50/95 py-2 font-bold text-gray-500 text-sm uppercase tracking-wide mb-2">{formatDateHeader(group.date)}</h3>
                    <div className="space-y-3">
                      {group.items.map(s => (
                        <article key={s.id} className={`p-4 rounded-xl shadow-sm border transition-all ${s.isPaid ? 'bg-white border-gray-100' : 'bg-white border-indigo-100 ring-1 ring-indigo-50'}`} aria-labelledby={`session-${s.id}`}>
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h4 id={`session-${s.id}`} className="font-bold text-gray-900">{s.studentName}</h4>
                              <p className="text-sm text-indigo-600 font-medium">{s.topic}</p>
                            </div>
                            <div className="text-right">
                              <span className={`block font-bold ${s.isPaid ? 'text-green-600' : 'text-red-500'}`}>{currency(s.price)}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                            <div className="text-xs text-gray-500 flex gap-2 items-center"><Clock size={14}/> {s.startTime}hs</div>
                            <div className="flex gap-2">
                              <button title="Enviar recordatorio" onClick={() => sendWhatsApp(s)} className="p-2 bg-green-50 text-green-600 rounded-full hover:bg-green-100 transition" aria-label="Enviar WhatsApp"><MessageCircle size={18} /></button>
                              <button title={s.isPaid ? "Desmarcar pago" : "Marcar como cobrado"} onClick={() => togglePay(s)} className={`p-2 rounded-full transition flex gap-1 items-center ${s.isPaid ? 'bg-gray-100 text-gray-400' : 'bg-indigo-600 text-white shadow-md'}`} aria-pressed={s.isPaid}><DollarSign size={18} />{!s.isPaid && <span className="text-xs font-bold pr-1">Cobrar</span>}</button>
                              <button title="Eliminar" onClick={() => deleteItem('sessions', s.id)} className="p-2 text-gray-300 hover:text-red-500" aria-label="Eliminar"><Trash2 size={18} /></button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ALUMNOS */}
        {view === 'students' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-gray-700 text-lg">Alumnos</h3>
              <button onClick={() => openNewStudentModal()} className="text-sm bg-gray-900 text-white px-3 py-1 rounded">Nuevo</button>
            </div>
            {students.map(std => (
              <div key={std.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-gray-900">{std.name}</h4>
                  <p className="text-xs text-gray-500">{std.level} • Sugerido: {currency(std.defaultPrice)}</p>
                </div>
                <button onClick={() => deleteItem('students', std.id)} className="text-gray-300 hover:text-red-500" aria-label={`Eliminar ${std.name}`}><Trash2 size={18} /></button>
              </div>
            ))}
            {students.length === 0 && <div className="text-center text-gray-400 p-6">No hay alumnos. Agregá uno para empezar.</div>}
          </div>
        )}
      </main>

      {/* FAB */}
      <div className="fixed bottom-24 right-4 z-20 flex flex-col gap-3 items-end">
        {view === 'agenda' && <button onClick={openNewClassModal} className="bg-indigo-600 text-white p-4 rounded-full shadow-xl hover:bg-indigo-700 transition active:scale-95" aria-label="Nueva clase"><Plus size={28}/></button>}
        {(view === 'students' || students.length === 0) && <button onClick={openNewStudentModal} className="bg-gray-800 text-white p-4 rounded-full shadow-xl hover:bg-black transition active:scale-95" aria-label="Nuevo alumno"><Users size={24}/></button>}
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in slide-in-from-bottom-10">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-800">{modalMode === 'add_class' ? 'Nueva Clase' : 'Nuevo Alumno'}</h3>
              <button onClick={() => setIsModalOpen(false)} aria-label="Cerrar" className="p-2 rounded hover:bg-gray-100"><X size={18} /></button>
            </div>

            <div className="space-y-4">
              {modalMode === 'add_student' ? (
                <>
                  <input ref={modalFirstRef} autoFocus placeholder="Nombre" className="w-full p-3 border rounded-lg bg-gray-50" onChange={e=>setFormData({...formData, name: e.target.value})} />
                  <input placeholder="Teléfono (549...)" className="w-full p-3 border rounded-lg bg-gray-50" onChange={e=>setFormData({...formData, phone: e.target.value})} />
                  <input type="number" placeholder="Precio Base ($)" className="w-full p-3 border rounded-lg bg-gray-50" onChange={e=>setFormData({...formData, price: e.target.value})} />
                  <div className="flex gap-2">
                    <button onClick={saveStudent} className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold">Guardar</button>
                    <button onClick={() => setIsModalOpen(false)} className="w-full text-gray-500 py-3 rounded-xl">Cancelar</button>
                  </div>
                </>
              ) : (
                <>
                  <select ref={modalFirstRef} className="w-full p-3 border rounded-lg bg-white" onChange={e => { const s = students.find(st => st.id === e.target.value); setFormData({...formData, studentId: s?.id, price: s?.defaultPrice}); }}>
                    <option value="">Seleccionar Alumno...</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <input placeholder="Tema" className="w-full p-3 border rounded-lg bg-gray-50" onChange={e=>setFormData({...formData, topic: e.target.value})} />
                  <div className="flex gap-2">
                    <input type="date" className="w-1/2 p-3 border rounded-lg bg-gray-50" value={formData.date || ''} onChange={e=>setFormData({...formData, date: e.target.value})} />
                    <input type="time" className="w-1/2 p-3 border rounded-lg bg-gray-50" value={formData.time || ''} onChange={e=>setFormData({...formData, time: e.target.value})} />
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-gray-400">$</span>
                    <input type="number" className="w-full p-3 pl-8 border rounded-lg bg-gray-50 font-bold" value={formData.price || ''} onChange={e=>setFormData({...formData, price: e.target.value})} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveClass} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold">Agendar</button>
                    <button onClick={() => setIsModalOpen(false)} className="w-full text-gray-500 py-3 rounded-xl">Cancelar</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* NAV */}
      <nav className="fixed bottom-0 w-full bg-white border-t z-30 pb-safe">
        <div className="max-w-md mx-auto grid grid-cols-2">
          <button onClick={() => setView('agenda')} className={`p-4 flex flex-col items-center ${view === 'agenda' ? 'text-indigo-600' : 'text-gray-400'}`} aria-current={view==='agenda'}>
            <BookOpen size={24}/> <span className="text-[10px] uppercase font-bold mt-1">Agenda</span>
          </button>
          <button onClick={() => setView('students')} className={`p-4 flex flex-col items-center ${view === 'students' ? 'text-indigo-600' : 'text-gray-400'}`} aria-current={view==='students'}>
            <Users size={24}/> <span className="text-[10px] uppercase font-bold mt-1">Alumnos</span>
          </button>
        </div>
      </nav>

      {/* TOASTS */}
      <div className="fixed bottom-40 right-4 z-50 flex flex-col gap-3">
        {toasts.map(t => (
          <div key={t.id} role="status" className={`px-4 py-2 rounded-lg shadow ${t.kind==='error'?'bg-red-50 text-red-700':'bg-white text-gray-800'}`}>{t.text}</div>
        ))}
      </div>
    </div>
  );
}
