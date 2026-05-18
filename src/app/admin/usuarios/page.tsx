'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { ProfilePill } from '@/components/ProfilePill';

/* ─── Types ─────────────────────────────────────────────────── */

interface AppUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
  last_sign_in: string | null;
}

interface AppRole {
  id: string;
  label: string;
  color: string;
  home_path: string;
  allowed_paths: string[];
  is_system: boolean;
}

interface PermSection { path: string; label: string; }
interface PermGroup   { id: string; label: string; color: string; sections: PermSection[]; }

/* ─── Constants ──────────────────────────────────────────────── */

const FALLBACK_ROLES: AppRole[] = [
  { id: 'auditor',            label: 'Auditor',            color: '#9333EA', home_path: '/auditoria', allowed_paths: ['/auditoria','/historial','/perfil'],                                                                                    is_system: true },
  { id: 'admin-auditoria',    label: 'Admin Auditoría',    color: '#0891B2', home_path: '/auditoria', allowed_paths: ['/auditoria','/auditoria-admin','/perfil'],                                                                              is_system: true },
  { id: 'despachador',        label: 'Despachador',        color: '#2563EB', home_path: '/',          allowed_paths: ['/','/despacho-hub','/despacho','/despacho/regiones','/despacho/santiago','/despacho/estado','/registros','/control-interno','/recepcion','/historial','/perfil'], is_system: true },
  { id: 'supervisor',         label: 'Supervisor',         color: '#16A34A', home_path: '/',          allowed_paths: ['/','/despacho-hub','/despacho','/despacho/regiones','/despacho/santiago','/despacho/estado','/registros','/control-interno','/recepcion','/historial','/perfil'], is_system: true },
  { id: 'recepcion-tienda',   label: 'Recepción Tienda',   color: '#10B981', home_path: '/tiendas',   allowed_paths: ['/tiendas','/recepcion','/perfil'],                                                                                      is_system: true },
  { id: 'supervisor-picking', label: 'Supervisor Picking', color: '#6366F1', home_path: '/picking',   allowed_paths: ['/picking','/perfil'],                                                                                                   is_system: true },
  { id: 'admin',              label: 'Administrador',      color: '#D97706', home_path: '/',          allowed_paths: ['*'],                                                                                                                    is_system: true },
];

const PERMISSION_GROUPS: PermGroup[] = [
  {
    id: 'despacho', label: 'Despacho', color: '#2563EB',
    sections: [
      { path: '/despacho-hub',      label: 'Hub de Despacho'      },
      { path: '/despacho/regiones', label: 'Bodega Regiones'       },
      { path: '/despacho/santiago', label: 'Bodega Santiago'       },
      { path: '/despacho',          label: 'Enrutador'             },
      { path: '/despacho/estado',   label: 'Estado / Seguimiento'  },
      { path: '/registros',         label: 'Registros'             },
      { path: '/historial',         label: 'Historial'             },
    ],
  },
  {
    id: 'control-interno', label: 'Control Interno', color: '#10B981',
    sections: [
      { path: '/control-interno',  label: 'Control Interno'    },
      { path: '/tiendas',          label: 'Tiendas'            },
      { path: '/recepcion',        label: 'Recepción'          },
      { path: '/auditoria',        label: 'Auditoría'          },
      { path: '/auditoria-admin',  label: 'Revisión Auditoría' },
      { path: '/admin/tiendas',    label: 'Config. Tiendas'    },
    ],
  },
  {
    id: 'picking', label: 'Picking', color: '#F59E0B',
    sections: [
      { path: '/picking', label: 'Picking' },
    ],
  },
];

const ALL_SECTION_PATHS = PERMISSION_GROUPS.flatMap(g => g.sections.map(s => s.path));

function groupState(group: PermGroup, paths: string[]): 'all' | 'some' | 'none' {
  const n = group.sections.filter(s => paths.includes(s.path)).length;
  if (n === 0) return 'none';
  if (n === group.sections.length) return 'all';
  return 'some';
}

function applyGroupToggle(group: PermGroup, paths: string[]): string[] {
  if (groupState(group, paths) === 'all') {
    return paths.filter(p => !group.sections.some(s => s.path === p));
  }
  const toAdd = group.sections.map(s => s.path).filter(p => !paths.includes(p));
  return [...paths, ...toAdd];
}

const HOME_OPTIONS = [
  { value: '/',               label: 'Dashboard'        },
  { value: '/auditoria',      label: 'Auditoría'        },
  { value: '/despacho-hub',   label: 'Hub de Despacho'  },
  { value: '/tiendas',        label: 'Tiendas'          },
  { value: '/picking',        label: 'Picking'          },
  { value: '/perfil',         label: 'Perfil'           },
];

const PRESET_COLORS = [
  '#9333EA','#0891B2','#2563EB','#16A34A','#10B981',
  '#D97706','#EF4444','#EC4899','#6366F1','#F59E0B',
];

const EMPTY_FORM = { email: '', password: '', full_name: '', role: 'auditor' };
const EMPTY_NEW_ROLE: Omit<AppRole,'is_system'> = {
  id: '', label: '', color: '#2563EB', home_path: '/', allowed_paths: ['/perfil'],
};

/* ─── Helpers ────────────────────────────────────────────────── */

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` };
}

function slugify(str: string) {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').slice(0, 32);
}

/* ─── Page ───────────────────────────────────────────────────── */

export default function UsuariosPage() {
  const router  = useRouter();
  const { profile } = useAuth();

  /* ── Tab ── */
  const [activeTab, setActiveTab] = useState<'usuarios' | 'roles'>('usuarios');

  /* ── Users state ── */
  const [users,        setUsers]        = useState<AppUser[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [bellOpen,     setBellOpen]     = useState(false);

  const [modal,     setModal]    = useState<'create' | 'edit' | null>(null);
  const [editUser,  setEditUser] = useState<AppUser | null>(null);
  const [form,      setForm]     = useState(EMPTY_FORM);
  const [saving,    setSaving]   = useState(false);
  const [formError, setFormError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  const [approveTarget, setApproveTarget] = useState<AppUser | null>(null);
  const [approveRole,   setApproveRole]   = useState('despachador');
  const [approving,     setApproving]     = useState(false);
  const [approveError,  setApproveError]  = useState('');

  /* ── Roles state ── */
  const [roles,       setRoles]       = useState<AppRole[]>(FALLBACK_ROLES);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [pendingPerms, setPendingPerms] = useState<Record<string, string[]>>({});
  const [savingRole,   setSavingRole]   = useState<string | null>(null);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<AppRole | null>(null);
  const [deletingRole, setDeletingRole] = useState(false);

  /* ── Create Role Modal ── */
  const [createRoleModal,   setCreateRoleModal]   = useState(false);
  const [newRole,           setNewRole]           = useState({ ...EMPTY_NEW_ROLE });
  const [creatingRole,      setCreatingRole]      = useState(false);
  const [createRoleError,   setCreateRoleError]   = useState('');
  const [createRoleContext, setCreateRoleContext] = useState<'standalone' | 'approve' | 'edit'>('standalone');

  const pendingUsers = users.filter(u => u.role === 'pending');
  const activeUsers  = users.filter(u => u.role !== 'pending');

  /* ── Load functions ── */

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await authHeaders();
      const res  = await fetch('/api/admin/users', { headers });
      const data = await res.json() as { users?: AppUser[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error');
      const all = data.users ?? [];
      setUsers(all);
      setPendingCount(all.filter((u: AppUser) => u.role === 'pending').length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      const headers = await authHeaders();
      const res  = await fetch('/api/admin/roles', { headers });
      const data = await res.json() as { roles?: AppRole[]; error?: string };
      if (res.ok && data.roles) setRoles(data.roles);
    } catch {
      // silently keep fallback roles
    } finally {
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); loadRoles(); }, [loadUsers, loadRoles]);

  if (profile && profile.role !== 'admin') {
    router.replace('/');
    return null;
  }

  /* ── Role helpers ── */

  function roleColor(role: string) {
    return roles.find(r => r.id === role)?.color ?? '#6B7280';
  }
  function roleLabel(role: string) {
    return roles.find(r => r.id === role)?.label ?? role;
  }

  function userCountForRole(roleId: string) {
    return activeUsers.filter(u => u.role === roleId).length;
  }

  function getEditingPaths(roleId: string, originalPaths: string[]) {
    return pendingPerms[roleId] ?? originalPaths;
  }

  function togglePath(roleId: string, path: string, originalPaths: string[]) {
    const current = getEditingPaths(roleId, originalPaths);
    const next = current.includes(path)
      ? current.filter(p => p !== path)
      : [...current, path];
    setPendingPerms(prev => ({ ...prev, [roleId]: next }));
  }

  function toggleAllPaths(roleId: string, originalPaths: string[]) {
    const current = getEditingPaths(roleId, originalPaths);
    const allEnabled = ALL_SECTION_PATHS.every(p => current.includes(p));
    const next = allEnabled ? ['/perfil'] : [...ALL_SECTION_PATHS, '/perfil'];
    setPendingPerms(prev => ({ ...prev, [roleId]: next }));
  }

  function toggleRoleGroup(roleId: string, group: PermGroup, originalPaths: string[]) {
    const current = getEditingPaths(roleId, originalPaths);
    const next = applyGroupToggle(group, current);
    setPendingPerms(prev => ({ ...prev, [roleId]: next }));
  }

  function hasUnsavedPerms(roleId: string) {
    return roleId in pendingPerms;
  }

  async function handleSaveRolePerms(role: AppRole) {
    const newPaths = pendingPerms[role.id];
    if (!newPaths) return;
    setSavingRole(role.id);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/admin/roles', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id: role.id, allowed_paths: newPaths }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar');
      setPendingPerms(prev => { const n = { ...prev }; delete n[role.id]; return n; });
      setRoles(prev => prev.map(r => r.id === role.id ? { ...r, allowed_paths: newPaths } : r));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar permisos');
    } finally {
      setSavingRole(null);
    }
  }

  async function handleDeleteRole() {
    if (!deleteRoleTarget) return;
    setDeletingRole(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/roles?id=${deleteRoleTarget.id}`, { method: 'DELETE', headers });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error');
      setDeleteRoleTarget(null);
      await loadRoles();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar rol');
    } finally {
      setDeletingRole(false);
    }
  }

  /* ── Create Role ── */

  function openCreateRole(context: 'standalone' | 'approve' | 'edit' = 'standalone') {
    setNewRole({ ...EMPTY_NEW_ROLE });
    setCreateRoleError('');
    setCreateRoleContext(context);
    setCreateRoleModal(true);
  }

  function handleNewRoleLabel(label: string) {
    setNewRole(prev => ({ ...prev, label, id: slugify(label) }));
  }

  function toggleNewRolePath(path: string) {
    setNewRole(prev => ({
      ...prev,
      allowed_paths: prev.allowed_paths.includes(path)
        ? prev.allowed_paths.filter(p => p !== path)
        : [...prev.allowed_paths, path],
    }));
  }

  function toggleNewRoleGroup(group: PermGroup) {
    setNewRole(prev => ({
      ...prev,
      allowed_paths: applyGroupToggle(group, prev.allowed_paths),
    }));
  }

  async function handleCreateRole() {
    if (!newRole.id || !newRole.label) {
      setCreateRoleError('Nombre e ID son requeridos');
      return;
    }
    setCreatingRole(true);
    setCreateRoleError('');
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers,
        body: JSON.stringify(newRole),
      });
      const data = await res.json() as { role?: AppRole; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al crear rol');

      await loadRoles();
      setCreateRoleModal(false);

      // Auto-select the new role in the appropriate context
      if (createRoleContext === 'approve') setApproveRole(newRole.id);
      if (createRoleContext === 'edit')    setForm(f => ({ ...f, role: newRole.id }));
    } catch (e) {
      setCreateRoleError(e instanceof Error ? e.message : 'Error');
    } finally {
      setCreatingRole(false);
    }
  }

  /* ── Users handlers ── */

  async function handleApprove() {
    if (!approveTarget) return;
    setApproving(true);
    setApproveError('');
    try {
      const headers = await authHeaders();
      const pass = Math.random().toString(36).slice(2, 10) + 'A1!';

      const patchRes = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id: approveTarget.id, role: approveRole, full_name: approveTarget.full_name, password: pass }),
      });
      const patchData = await patchRes.json() as { error?: string };
      if (!patchRes.ok) throw new Error(patchData.error ?? 'Error al aprobar');

      const emailRes = await fetch('/api/auth/send-approval-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: approveTarget.email, full_name: approveTarget.full_name, password: pass, role: approveRole }),
      });
      if (!emailRes.ok) {
        const emailData = await emailRes.json() as { error?: string };
        throw new Error(emailData.error ?? 'Error al enviar correo');
      }

      setApproveTarget(null);
      await loadUsers();
    } catch (e) {
      setApproveError(e instanceof Error ? e.message : 'Error');
    } finally {
      setApproving(false);
    }
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError('');
    setModal('create');
  }

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

  /* ── Role Selector component (shared by modals) ── */

  function RoleSelector({ value, onChange, context }: {
    value: string;
    onChange: (v: string) => void;
    context: 'approve' | 'edit';
  }) {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] text-white/65 uppercase tracking-wider">Asignar rol</label>
        <div className="relative">
          <select
            value={value}
            onChange={e => {
              if (e.target.value === '__create__') {
                openCreateRole(context);
              } else {
                onChange(e.target.value);
              }
            }}
            className="w-full px-3 py-2.5 rounded-xl text-[15px] font-semibold focus:outline-none border cursor-pointer appearance-none pr-8"
            style={{ background: 'rgba(255,255,255,0.09)', color: 'white', borderColor: 'rgba(255,255,255,0.2)', WebkitTextFillColor: 'white' }}>
            {roles.map(r => (
              <option key={r.id} value={r.id} style={{ background: '#1a2550', color: 'white' }}>
                {r.label}
              </option>
            ))}
            <option disabled style={{ background: '#1a2550', color: 'rgba(255,255,255,0.3)' }}>──────────────</option>
            <option value="__create__" style={{ background: '#1a2550', color: '#60A5FA' }}>
              + Crear nuevo rol
            </option>
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/50 text-[11px]">▼</span>
        </div>
        {/* Preview del rol seleccionado */}
        {value !== '__create__' && (() => {
          const r = roles.find(x => x.id === value);
          if (!r) return null;
          const paths = r.allowed_paths.includes('*') ? ['Acceso total'] : r.allowed_paths;
          return (
            <div className="flex flex-wrap gap-1 mt-1">
              {paths.slice(0, 5).map(p => (
                <span key={p} className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{ background: `${r.color}22`, color: r.color, border: `1px solid ${r.color}44` }}>
                  {p === '/' ? 'Dashboard' : p === '*' ? 'Todo' : p.replace('/', '')}
                </span>
              ))}
              {paths.length > 5 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] text-white/40">+{paths.length - 5} más</span>
              )}
            </div>
          );
        })()}
      </div>
    );
  }

  /* ─── Render ─────────────────────────────────────────────── */

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden"
         style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3"
           style={{ background: 'rgba(26,37,80,0.8)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button onClick={() => router.push('/')}
          className="px-3.5 py-1.5 rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.13)' }}>
          <span className="font-barlow-condensed text-[13px] font-bold tracking-widest uppercase text-white">INICIO</span>
        </button>

        {/* Tab switcher */}
        <div className="flex gap-1 flex-1"
             style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '3px', maxWidth: '260px' }}>
          {(['usuarios', 'roles'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="flex-1 py-1.5 rounded-[9px] font-barlow-condensed text-[13px] font-bold tracking-wider uppercase transition-all cursor-pointer"
              style={activeTab === tab
                ? { background: 'rgba(37,99,235,0.9)', color: 'white', boxShadow: '0 2px 8px rgba(37,99,235,0.4)' }
                : { color: 'rgba(255,255,255,0.45)' }}>
              {tab === 'usuarios' ? `Usuarios ${activeUsers.length > 0 ? activeUsers.length : ''}` : `Roles ${roles.length}`}
            </button>
          ))}
        </div>

        {/* Bell (solo en tab usuarios) */}
        {activeTab === 'usuarios' && (
          <button
            onClick={() => setBellOpen(!bellOpen)}
            className="relative p-2 rounded-xl cursor-pointer transition-all"
            style={{ background: pendingCount > 0 ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.06)', border: pendingCount > 0 ? '1px solid rgba(234,179,8,0.3)' : '1px solid rgba(255,255,255,0.07)' }}>
            <span className="text-xl">🔔</span>
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold text-black flex items-center justify-center"
                    style={{ background: '#EAB308' }}>
                {pendingCount}
              </span>
            )}
          </button>
        )}

        {activeTab === 'usuarios' ? (
          <button onClick={openCreate}
            className="px-4 py-2 rounded-xl font-barlow-condensed text-[15px] font-bold tracking-wider text-white uppercase cursor-pointer active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', boxShadow: '0 4px 16px rgba(37,99,235,0.4)' }}>
            + Nuevo
          </button>
        ) : (
          <button onClick={() => openCreateRole('standalone')}
            className="px-4 py-2 rounded-xl font-barlow-condensed text-[15px] font-bold tracking-wider text-white uppercase cursor-pointer active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg,#9333EA,#7C3AED)', boxShadow: '0 4px 16px rgba(147,51,234,0.4)' }}>
            + Rol
          </button>
        )}

        <ProfilePill compact />
      </div>

      {/* Bell dropdown */}
      {bellOpen && activeTab === 'usuarios' && (
        <div className="flex-shrink-0 mx-4 mt-2 rounded-2xl overflow-hidden"
             style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(234,179,8,0.2)' }}>
          <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10"
               style={{ background: 'rgba(234,179,8,0.08)' }}>
            <span className="text-lg">🔔</span>
            <span className="font-barlow-condensed text-[14px] font-bold text-yellow-400 uppercase tracking-wider">
              Solicitudes pendientes
            </span>
            <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold text-black"
                  style={{ background: '#EAB308' }}>
              {pendingCount}
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {pendingUsers.length === 0 ? (
              <div className="text-center text-white/40 text-sm py-4">Sin solicitudes</div>
            ) : (
              pendingUsers.map(u => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                       style={{ background: 'rgba(234,179,8,0.3)', border: '1px solid rgba(234,179,8,0.4)' }}>
                    {(u.full_name || u.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-[13px] font-medium truncate">{u.full_name}</div>
                    <div className="text-white/40 text-[11px] truncate">{u.email}</div>
                  </div>
                  <button
                    onClick={() => { setApproveTarget(u); setApproveRole('despachador'); setBellOpen(false); }}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-white cursor-pointer active:scale-95 transition-all"
                    style={{ background: 'linear-gradient(135deg,#2563EB,#1D4ED8)' }}>
                    Aprobar
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">

        {/* ── TAB: USUARIOS ── */}
        {activeTab === 'usuarios' && (
          <>
            {loading && <div className="text-center text-white/40 py-16 text-sm">Cargando usuarios...</div>}
            {error && (
              <div className="text-sm text-red-400 text-center py-4 rounded-xl mb-4"
                   style={{ background: 'rgba(211,47,47,0.1)' }}>{error}</div>
            )}

            {pendingUsers.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-yellow-400 text-sm">🔔</span>
                  <span className="font-barlow-condensed text-[14px] font-bold text-yellow-400 uppercase tracking-wider">
                    Pendientes de aprobación ({pendingUsers.length})
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {pendingUsers.map(u => (
                    <div key={u.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                         style={{ background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.15)' }}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                           style={{ background: 'rgba(234,179,8,0.2)', border: '2px solid rgba(234,179,8,0.4)' }}>
                        {(u.full_name || u.email)[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-[15px] font-medium truncate">{u.full_name}</div>
                        <div className="text-white/40 text-[12px] truncate">{u.email}</div>
                      </div>
                      <span className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
                            style={{ background: 'rgba(234,179,8,0.15)', color: '#EAB308', border: '1px solid rgba(234,179,8,0.3)' }}>
                        Pendiente
                      </span>
                      <button onClick={() => { setApproveTarget(u); setApproveRole('despachador'); }}
                        className="px-3 py-1.5 rounded-xl text-[12px] font-bold text-white cursor-pointer active:scale-95 transition-all"
                        style={{ background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', boxShadow: '0 4px 12px rgba(37,99,235,0.4)' }}>
                        Aprobar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 max-w-2xl mx-auto">
              {activeUsers.map(u => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                     style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                       style={{ background: `${roleColor(u.role)}40`, border: `2px solid ${roleColor(u.role)}60` }}>
                    {(u.full_name || u.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-[15px] font-medium truncate">{u.full_name}</div>
                    <div className="text-white/40 text-[12px] truncate">{u.email}</div>
                  </div>
                  <span className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
                        style={{ background: `${roleColor(u.role)}22`, color: roleColor(u.role), border: `1px solid ${roleColor(u.role)}44` }}>
                    {roleLabel(u.role)}
                  </span>
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
          </>
        )}

        {/* ── TAB: ROLES ── */}
        {activeTab === 'roles' && (
          <div className="flex flex-col gap-3 max-w-2xl mx-auto">
            {rolesLoading && <div className="text-center text-white/40 py-8 text-sm">Cargando roles...</div>}

            {roles.map(role => {
              const isExpanded = expandedRole === role.id;
              const editingPaths = getEditingPaths(role.id, role.allowed_paths);
              const isFullAccess = role.allowed_paths.includes('*');
              const count = userCountForRole(role.id);
              const unsaved = hasUnsavedPerms(role.id);

              return (
                <div key={role.id} className="rounded-2xl overflow-hidden"
                     style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${isExpanded ? role.color + '44' : 'rgba(255,255,255,0.07)'}`, transition: 'border-color 0.2s' }}>

                  {/* Card header */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3.5 cursor-pointer text-left"
                    onClick={() => setExpandedRole(isExpanded ? null : role.id)}>
                    {/* Color dot */}
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: role.color, boxShadow: `0 0 8px ${role.color}80` }} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-[15px] font-semibold">{role.label}</span>
                        {role.is_system && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider text-white/40"
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            Sistema
                          </span>
                        )}
                        {unsaved && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                                style={{ background: 'rgba(234,179,8,0.15)', color: '#EAB308', border: '1px solid rgba(234,179,8,0.3)' }}>
                            Sin guardar
                          </span>
                        )}
                      </div>
                      <div className="text-white/35 text-[11px] mt-0.5">
                        {count} {count === 1 ? 'usuario' : 'usuarios'} · Home: {role.home_path === '/' ? 'Dashboard' : role.home_path}
                      </div>
                    </div>

                    {/* Access preview pills */}
                    <div className="flex gap-1 flex-shrink-0 max-w-[160px] overflow-hidden">
                      {isFullAccess ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                              style={{ background: `${role.color}22`, color: role.color, border: `1px solid ${role.color}44` }}>
                          Acceso total
                        </span>
                      ) : (
                        role.allowed_paths.slice(0, 2).map(p => (
                          <span key={p} className="px-2 py-0.5 rounded-full text-[10px] font-medium truncate"
                                style={{ background: `${role.color}18`, color: role.color }}>
                            {p === '/' ? 'Dashboard' : p.slice(1)}
                          </span>
                        ))
                      )}
                    </div>

                    <span className="text-white/40 text-[12px] flex-shrink-0 ml-1" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 flex flex-col gap-4"
                         style={{ borderTop: `1px solid ${role.color}20` }}>

                      {isFullAccess ? (
                        <div className="py-3 text-center">
                          <span className="text-[13px] font-semibold" style={{ color: role.color }}>
                            Acceso total a todas las secciones
                          </span>
                          <div className="text-white/35 text-[11px] mt-1">Este rol no tiene restricciones de rutas</div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between pt-3 pb-1">
                            <span className="text-[11px] text-white/50 uppercase tracking-wider font-semibold">Acceso por módulo</span>
                            <button
                              onClick={() => toggleAllPaths(role.id, role.allowed_paths)}
                              className="text-[10px] px-2 py-1 rounded-lg cursor-pointer transition-colors"
                              style={{ color: role.color, background: `${role.color}15`, border: `1px solid ${role.color}25` }}>
                              {ALL_SECTION_PATHS.every(p => editingPaths.includes(p)) ? 'Quitar todo' : 'Dar todo'}
                            </button>
                          </div>

                          <div className="flex flex-col gap-2">
                            {PERMISSION_GROUPS.map(group => {
                              const state = groupState(group, editingPaths);
                              return (
                                <div key={group.id} className="rounded-xl overflow-hidden"
                                     style={{ border: `1px solid ${group.color}20`, background: 'rgba(255,255,255,0.02)' }}>
                                  {/* Cabecera del grupo */}
                                  <button
                                    onClick={() => toggleRoleGroup(role.id, group, role.allowed_paths)}
                                    className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer transition-all text-left"
                                    style={{ background: state !== 'none' ? `${group.color}12` : 'transparent' }}>
                                    <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                                         style={{
                                           background: state === 'all' ? group.color : state === 'some' ? `${group.color}55` : 'rgba(255,255,255,0.08)',
                                           border: state === 'none' ? '1px solid rgba(255,255,255,0.15)' : 'none',
                                         }}>
                                      {state === 'all'  && <span className="text-white text-[9px] font-bold">✓</span>}
                                      {state === 'some' && <span className="text-white text-[9px] font-bold">–</span>}
                                    </div>
                                    <span className="text-[12px] font-bold uppercase tracking-wider flex-1"
                                          style={{ color: state !== 'none' ? group.color : 'rgba(255,255,255,0.35)' }}>
                                      {group.label}
                                    </span>
                                    <span className="text-[10px] text-white/30">
                                      {group.sections.filter(s => editingPaths.includes(s.path)).length}/{group.sections.length}
                                    </span>
                                  </button>
                                  {/* Sub-secciones */}
                                  <div className="px-2 pb-1.5 flex flex-col gap-0.5">
                                    {group.sections.map(section => {
                                      const isOn = editingPaths.includes(section.path);
                                      return (
                                        <button key={section.path}
                                          onClick={() => togglePath(role.id, section.path, role.allowed_paths)}
                                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all cursor-pointer"
                                          style={{ background: isOn ? `${group.color}10` : 'transparent' }}>
                                          <div className="w-3 h-3 rounded flex items-center justify-center flex-shrink-0"
                                               style={{
                                                 background: isOn ? group.color : 'rgba(255,255,255,0.07)',
                                                 border: isOn ? 'none' : '1px solid rgba(255,255,255,0.12)',
                                               }}>
                                            {isOn && <span className="text-white text-[8px] font-bold">✓</span>}
                                          </div>
                                          <span className="text-[12px]" style={{ color: isOn ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)' }}>
                                            {section.label}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Perfil siempre activo */}
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                                 style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                              <div className="w-3 h-3 rounded flex-shrink-0"
                                   style={{ background: 'rgba(255,255,255,0.3)' }} />
                              <span className="text-[12px] text-white/35">Perfil — siempre activo</span>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 mt-1">
                        {!isFullAccess && unsaved && (
                          <button
                            onClick={() => handleSaveRolePerms(role)}
                            disabled={savingRole === role.id}
                            className="flex-1 py-2 rounded-xl font-barlow-condensed text-[14px] font-bold tracking-wider text-white uppercase cursor-pointer disabled:opacity-50 active:scale-95 transition-all"
                            style={{ background: `linear-gradient(135deg,${role.color},${role.color}cc)`, boxShadow: `0 4px 12px ${role.color}40` }}>
                            {savingRole === role.id ? 'Guardando...' : 'Guardar cambios'}
                          </button>
                        )}
                        {!role.is_system && (
                          <button
                            onClick={() => setDeleteRoleTarget(role)}
                            className="px-4 py-2 rounded-xl text-[13px] text-red-400/70 cursor-pointer hover:text-red-400 hover:bg-red-400/10 transition-colors"
                            style={{ border: '1px solid rgba(239,68,68,0.2)' }}>
                            Eliminar rol
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MODALS */}
      {/* ═══════════════════════════════════════════════════════ */}

      {/* ── Approve modal ── */}
      {approveTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.65)' }} onClick={() => setApproveTarget(null)} />
          <div className="relative w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
               style={{ background: '#1a2550', border: '1px solid rgba(255,255,255,0.12)' }}>

            <div className="font-barlow-condensed text-xl font-bold text-white tracking-wider uppercase">
              Aprobar usuario
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                   style={{ background: 'rgba(234,179,8,0.3)', border: '2px solid rgba(234,179,8,0.4)' }}>
                {(approveTarget.full_name || approveTarget.email)[0].toUpperCase()}
              </div>
              <div>
                <div className="text-white font-medium">{approveTarget.full_name}</div>
                <div className="text-white/40 text-sm">{approveTarget.email}</div>
              </div>
            </div>

            <RoleSelector value={approveRole} onChange={setApproveRole} context="approve" />

            {approveError && (
              <div className="text-sm text-red-400 text-center px-2 py-2 rounded-lg"
                   style={{ background: 'rgba(211,47,47,0.12)' }}>{approveError}</div>
            )}

            <p className="text-white/40 text-xs">
              Se actualizará el rol con los permisos definidos y se enviará la contraseña temporal por correo.
            </p>

            <div className="flex gap-2 mt-1">
              <button onClick={() => { setApproveTarget(null); setApproveError(''); }}
                className="flex-1 py-2.5 rounded-xl text-[14px] text-white/50 cursor-pointer hover:bg-white/8 transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                Cancelar
              </button>
              <button onClick={handleApprove} disabled={approving}
                className="flex-1 py-2.5 rounded-xl font-barlow-condensed text-[15px] font-bold tracking-wider text-white uppercase cursor-pointer disabled:opacity-50 active:scale-95 transition-all"
                style={{ background: 'linear-gradient(135deg,#16A34A,#15803D)', boxShadow: '0 4px 12px rgba(22,163,74,0.4)' }}>
                {approving ? 'Aprobando...' : 'Aprobar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit User Modal ── */}
      {modal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.65)' }} onClick={() => setModal(null)} />
          <div className="relative w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
               style={{ background: '#1a2550', border: '1px solid rgba(255,255,255,0.12)' }}>

            <div className="font-barlow-condensed text-xl font-bold text-white tracking-wider uppercase">
              {modal === 'create' ? 'Nuevo usuario' : 'Editar usuario'}
            </div>

            {modal === 'create' && (
              <Field label="Correo electrónico">
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="usuario@empresa.cl" className={inputCls}
                  style={{ WebkitTextFillColor: 'white', WebkitBoxShadow: '0 0 0 40px #1a2550 inset' }} />
              </Field>
            )}

            <Field label="Nombre completo">
              <input type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="Juan Pérez" className={inputCls} autoComplete="off"
                style={{ WebkitTextFillColor: 'white', WebkitBoxShadow: '0 0 0 40px #1a2550 inset' }} />
            </Field>

            {modal === 'create' && (
              <Field label="Contraseña">
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 6 caracteres" className={inputCls} autoComplete="new-password"
                  style={{ WebkitTextFillColor: 'white', WebkitBoxShadow: '0 0 0 40px #1a2550 inset' }} />
              </Field>
            )}

            <RoleSelector value={form.role} onChange={v => setForm(f => ({ ...f, role: v }))} context="edit" />

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

      {/* ── Delete User ── */}
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

      {/* ── Delete Role ── */}
      {deleteRoleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
             style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
               style={{ background: '#1a2550', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="font-barlow-condensed text-xl font-bold text-white">Eliminar rol</div>
            <div className="text-white/60 text-sm">
              ¿Eliminar el rol <span className="font-medium" style={{ color: deleteRoleTarget.color }}>{deleteRoleTarget.label}</span>?
              Los usuarios con este rol quedarán sin permisos hasta que se les asigne uno nuevo.
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteRoleTarget(null)} disabled={deletingRole}
                className="flex-1 py-2.5 rounded-xl text-[14px] text-white/50 cursor-pointer hover:bg-white/8 transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                Cancelar
              </button>
              <button onClick={handleDeleteRole} disabled={deletingRole}
                className="flex-1 py-2.5 rounded-xl font-bold text-[14px] text-white uppercase cursor-pointer disabled:opacity-50"
                style={{ background: 'rgba(211,47,47,0.8)' }}>
                {deletingRole ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Role Modal ── */}
      {createRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 overflow-y-auto py-4">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => setCreateRoleModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl p-6 flex flex-col gap-4 my-auto"
               style={{ background: '#1a2550', border: '1px solid rgba(147,51,234,0.3)' }}>

            <div className="font-barlow-condensed text-xl font-bold text-white tracking-wider uppercase">
              Crear nuevo rol
            </div>

            {/* Label */}
            <Field label="Nombre del rol">
              <input
                type="text"
                value={newRole.label}
                onChange={e => handleNewRoleLabel(e.target.value)}
                placeholder="Ej: Coordinador"
                className={inputCls}
                style={{ WebkitTextFillColor: 'white', WebkitBoxShadow: '0 0 0 40px #1a2550 inset' }} />
            </Field>

            {/* ID preview */}
            {newRole.id && (
              <div className="text-[11px] text-white/35 -mt-2">
                ID: <span className="text-white/55 font-mono">{newRole.id}</span>
              </div>
            )}

            {/* Color */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-white/65 uppercase tracking-wider">Color</label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setNewRole(prev => ({ ...prev, color: c }))}
                    className="w-7 h-7 rounded-full cursor-pointer transition-all"
                    style={{
                      background: c,
                      boxShadow: newRole.color === c ? `0 0 0 2px #1a2550, 0 0 0 4px ${c}` : 'none',
                      transform: newRole.color === c ? 'scale(1.15)' : 'scale(1)',
                    }} />
                ))}
              </div>
            </div>

            {/* Home path */}
            <Field label="Pantalla de inicio">
              <div className="relative">
                <select
                  value={newRole.home_path}
                  onChange={e => setNewRole(prev => ({ ...prev, home_path: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-[15px] focus:outline-none border cursor-pointer appearance-none pr-8"
                  style={{ background: 'rgba(255,255,255,0.09)', color: 'white', borderColor: 'rgba(255,255,255,0.2)', WebkitTextFillColor: 'white' }}>
                  {HOME_OPTIONS.map(o => (
                    <option key={o.value} value={o.value} style={{ background: '#1a2550', color: 'white' }}>{o.label}</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/50 text-[11px]">▼</span>
              </div>
            </Field>

            {/* Permissions */}
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-white/65 uppercase tracking-wider">Acceso por módulo</label>
              <div className="flex flex-col gap-2">
                {PERMISSION_GROUPS.map(group => {
                  const state = groupState(group, newRole.allowed_paths);
                  return (
                    <div key={group.id} className="rounded-xl overflow-hidden"
                         style={{ border: `1px solid ${group.color}20`, background: 'rgba(255,255,255,0.02)' }}>
                      {/* Cabecera del grupo */}
                      <button
                        onClick={() => toggleNewRoleGroup(group)}
                        className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer transition-all text-left"
                        style={{ background: state !== 'none' ? `${group.color}12` : 'transparent' }}>
                        <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                             style={{
                               background: state === 'all' ? group.color : state === 'some' ? `${group.color}55` : 'rgba(255,255,255,0.08)',
                               border: state === 'none' ? '1px solid rgba(255,255,255,0.15)' : 'none',
                             }}>
                          {state === 'all'  && <span className="text-white text-[9px] font-bold">✓</span>}
                          {state === 'some' && <span className="text-white text-[9px] font-bold">–</span>}
                        </div>
                        <span className="text-[12px] font-bold uppercase tracking-wider flex-1"
                              style={{ color: state !== 'none' ? group.color : 'rgba(255,255,255,0.35)' }}>
                          {group.label}
                        </span>
                        <span className="text-[10px] text-white/30">
                          {group.sections.filter(s => newRole.allowed_paths.includes(s.path)).length}/{group.sections.length}
                        </span>
                      </button>
                      {/* Sub-secciones */}
                      <div className="px-2 pb-1.5 flex flex-col gap-0.5">
                        {group.sections.map(section => {
                          const isOn = newRole.allowed_paths.includes(section.path);
                          return (
                            <button key={section.path}
                              onClick={() => toggleNewRolePath(section.path)}
                              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all cursor-pointer"
                              style={{ background: isOn ? `${group.color}10` : 'transparent' }}>
                              <div className="w-3 h-3 rounded flex items-center justify-center flex-shrink-0"
                                   style={{
                                     background: isOn ? group.color : 'rgba(255,255,255,0.07)',
                                     border: isOn ? 'none' : '1px solid rgba(255,255,255,0.12)',
                                   }}>
                                {isOn && <span className="text-white text-[8px] font-bold">✓</span>}
                              </div>
                              <span className="text-[12px]" style={{ color: isOn ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)' }}>
                                {section.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {/* Perfil siempre activo */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                     style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="w-3 h-3 rounded flex-shrink-0" style={{ background: 'rgba(255,255,255,0.3)' }} />
                  <span className="text-[12px] text-white/35">Perfil — siempre activo</span>
                </div>
              </div>
            </div>

            {createRoleError && (
              <div className="text-sm text-red-400 text-center px-2 py-2 rounded-lg"
                   style={{ background: 'rgba(211,47,47,0.12)' }}>{createRoleError}</div>
            )}

            <div className="flex gap-2 mt-1">
              <button onClick={() => setCreateRoleModal(false)}
                className="flex-1 py-2.5 rounded-xl text-[14px] text-white/50 cursor-pointer hover:bg-white/8 transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                Cancelar
              </button>
              <button onClick={handleCreateRole} disabled={creatingRole || !newRole.id || !newRole.label}
                className="flex-1 py-2.5 rounded-xl font-barlow-condensed text-[15px] font-bold tracking-wider text-white uppercase cursor-pointer disabled:opacity-50 active:scale-95 transition-all"
                style={{ background: `linear-gradient(135deg,${newRole.color},${newRole.color}cc)`, boxShadow: `0 4px 12px ${newRole.color}40` }}>
                {creatingRole ? 'Creando...' : 'Crear rol'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Shared UI ───────────────────────────────────────────────── */

const inputCls = 'w-full px-3 py-2.5 rounded-xl text-[15px] text-white placeholder:text-white/35 focus:outline-none bg-white/8 border border-white/15 focus:border-white/35 transition-colors';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] text-white/65 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}
