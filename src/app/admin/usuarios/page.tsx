'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';

interface AppUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
  last_sign_in: string | null;
}

const ROLE_OPTS = [
  { value: 'auditor',          label: 'Auditor',         color: '#9333EA' },
  { value: 'admin-auditoria',  label: 'Admin Auditoría', color: '#0891B2' },
  { value: 'despachador',      label: 'Despachador',     color: '#2563EB' },
  { value: 'admin',            label: 'Administrador',   color: '#D97706' },
];

function roleColor(role: string) {
  return ROLE_OPTS.find(r => r.value === role)?.color ?? '#6B7280';
}
function roleLabel(role: string) {
  return ROLE_OPTS.find(r => r.value === role)?.label ?? role;
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` };
}

const EMPTY_FORM = { email: '', password: '', full_name: '', role: 'auditor' };

export default function UsuariosPage() {
  const router  = useRouter();
  const { profile } = useAuth();

  const [users,   setUsers]   = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // Modal state
  const [modal,     setModal]     = useState<'create' | 'edit' | null>(null);
  const [editUser,  setEditUser]  = useState<AppUser | null>(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState('');

  // Confirm delete
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await authHeaders();
      const res  = await fetch('/api/admin/users', { headers });
      const data = await res.json() as { users?: AppUser[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error');
      setUsers((data.users ?? []).sort((a, b) => a.full_name.localeCompare(b.full_name)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // Guard: only admins
  if (profile && profile.role !== 'admin') {
    router.replace('/');
    return null;
  }

  /* ── Create ── */
  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError('');
    setModal('create');
  }

  /* ── Edit ── */
  function openEdit(u: AppUser) {
    setEditUser(u);
    setForm({ email: u.email, password: '', full_name: u.full_name, role: u.role });
    setFormError('');
    setModal('edit');
  }

  async function handleSave() {
    setSaving(true);
    setFormError('');
    try {
      const headers = await authHeaders();
      if (modal === 'create') {
        const res  = await fetch('/api/admin/users', { method: 'POST', headers, body: JSON.stringify(form) });
        const data = await res.json() as { error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Error al crear');
      } else if (modal === 'edit' && editUser) {
        const body: Record<string, string> = { id: editUser.id, role: form.role };
        if (form.full_name) body.full_name = form.full_name;
        const res  = await fetch('/api/admin/users', { method: 'PATCH', headers, body: JSON.stringify(body) });
        const data = await res.json() as { error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Error al actualizar');
      }
      setModal(null);
      await loadUsers();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/users?id=${deleteTarget.id}`, { method: 'DELETE', headers });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al eliminar');
      setDeleteTarget(null);
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden"
         style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3"
           style={{ background: 'rgba(26,37,80,0.8)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button onClick={() => router.push('/')}
          className="border-none bg-white/10 text-white/70 text-[13px] cursor-pointer px-3 py-1.5 rounded-full">
          ← Inicio
        </button>
        <div className="flex-1">
          <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase">
            Gestión de usuarios
          </div>
          <div className="text-[11px] text-white/40 uppercase tracking-widest">
            {users.length} usuario{users.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button onClick={openCreate}
          className="px-4 py-2 rounded-xl font-barlow-condensed text-[15px] font-bold tracking-wider text-white uppercase cursor-pointer active:scale-95 transition-all"
          style={{ background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', boxShadow: '0 4px 16px rgba(37,99,235,0.4)' }}>
          + Nuevo
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && (
          <div className="text-center text-white/40 py-16 text-sm">Cargando usuarios...</div>
        )}
        {error && (
          <div className="text-sm text-red-400 text-center py-4 rounded-xl mb-4"
               style={{ background: 'rgba(211,47,47,0.1)' }}>{error}</div>
        )}

        <div className="flex flex-col gap-2 max-w-2xl mx-auto">
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                 style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>

              {/* Avatar */}
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                   style={{ background: `${roleColor(u.role)}40`, border: `2px solid ${roleColor(u.role)}60` }}>
                {(u.full_name || u.email)[0].toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-white text-[15px] font-medium truncate">{u.full_name}</div>
                <div className="text-white/40 text-[12px] truncate">{u.email}</div>
              </div>

              {/* Role badge */}
              <span className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
                    style={{ background: `${roleColor(u.role)}22`, color: roleColor(u.role), border: `1px solid ${roleColor(u.role)}44` }}>
                {roleLabel(u.role)}
              </span>

              {/* Actions */}
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => openEdit(u)}
                  className="px-2.5 py-1.5 rounded-lg text-[12px] text-white/50 cursor-pointer hover:text-white hover:bg-white/10 transition-colors">
                  Editar
                </button>
                <button onClick={() => setDeleteTarget(u)}
                  className="px-2.5 py-1.5 rounded-lg text-[12px] text-red-400/60 cursor-pointer hover:text-red-400 hover:bg-red-400/10 transition-colors">
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Create / Edit Modal ── */}
      {modal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4"
             style={{ background: 'rgba(0,0,0,0.6)' }}
             onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
               style={{ background: '#1a2550', border: '1px solid rgba(255,255,255,0.1)' }}>

            <div className="font-barlow-condensed text-xl font-bold text-white tracking-wider uppercase">
              {modal === 'create' ? 'Nuevo usuario' : 'Editar usuario'}
            </div>

            {modal === 'create' && (
              <Field label="Correo electrónico">
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="usuario@empresa.cl" className={inputCls} />
              </Field>
            )}

            <Field label="Nombre completo">
              <input type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="Juan Pérez" className={inputCls} />
            </Field>

            {modal === 'create' && (
              <Field label="Contraseña">
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 6 caracteres" className={inputCls} />
              </Field>
            )}

            <Field label="Rol">
              <div className="flex gap-2">
                {ROLE_OPTS.map(r => (
                  <button key={r.value} onClick={() => setForm(f => ({ ...f, role: r.value }))}
                    className="flex-1 py-2 rounded-xl text-[13px] font-bold uppercase tracking-wider cursor-pointer transition-all"
                    style={form.role === r.value
                      ? { background: `${r.color}33`, color: r.color, border: `2px solid ${r.color}` }
                      : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.35)', border: '2px solid rgba(255,255,255,0.1)' }}>
                    {r.label}
                  </button>
                ))}
              </div>
            </Field>

            {formError && (
              <div className="text-sm text-red-400 text-center px-2 py-2 rounded-lg"
                   style={{ background: 'rgba(211,47,47,0.12)' }}>{formError}</div>
            )}

            <div className="flex gap-2 mt-1">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2.5 rounded-xl text-[14px] text-white/50 cursor-pointer hover:bg-white/8 transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-xl font-barlow-condensed text-[15px] font-bold tracking-wider text-white uppercase cursor-pointer disabled:opacity-50 transition-all"
                style={{ background: 'linear-gradient(135deg,#2563EB,#1D4ED8)' }}>
                {saving ? 'Guardando...' : modal === 'create' ? 'Crear' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4"
             style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
               style={{ background: '#1a2550', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="font-barlow-condensed text-xl font-bold text-white">Eliminar usuario</div>
            <div className="text-white/60 text-sm">
              ¿Eliminar a <span className="text-white font-medium">{deleteTarget.full_name}</span>? Esta acción no se puede deshacer.
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-[14px] text-white/50 cursor-pointer hover:bg-white/8 transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl font-bold text-[14px] text-white uppercase cursor-pointer disabled:opacity-50"
                style={{ background: 'rgba(211,47,47,0.8)' }}>
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 rounded-xl text-white text-sm placeholder:text-white/30 focus:outline-none bg-white/8 border border-white/10 focus:border-white/30';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] text-white/45 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}
