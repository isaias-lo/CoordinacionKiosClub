'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, Users, ShieldCheck, Bell, Plus, Pencil, Trash2,
  Check, Minus, ChevronDown, X, Lock,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { MODULE_GROUPS, HOME_OPTIONS, ALL_MODULE_PATHS, cleanAllowedPaths, type ModuleGroup } from '@/config/routes';
import { groupState, applyGroupToggle, slugify } from './permisos';

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
  permissions?: Record<string, 'edit' | 'read'>;
}

/* ─── Constants ──────────────────────────────────────────────── */

interface SectionPerm { id: string; label: string; desc: string; group: string; }
const SECTION_PERMISSIONS: SectionPerm[] = [
  { id: 'config-tiendas/tiendas',    label: 'Gestionar Tiendas',  desc: 'Agregar, editar y desactivar tiendas',       group: 'Config. Tiendas' },
  { id: 'config-tiendas/calendario', label: 'Calendario de Abastecimiento', desc: 'Modificar el orden del calendario de rutas', group: 'Config. Tiendas' },
  { id: 'estado/seguimiento',        label: 'Sync desde Sheets',  desc: 'Importar registros desde Google Sheets',     group: 'Estado'          },
];

const PRESET_COLORS = [
  '#2563EB','#0891B2','#0D9488','#16A34A','#65A30D',
  '#D97706','#DC2626','#DB2777','#7C3AED','#475569',
];

const EMPTY_FORM = { email: '', password: '', full_name: '', role: 'auditor' };
const EMPTY_NEW_ROLE: Omit<AppRole,'is_system'> = {
  id: '', label: '', color: '#2563EB', home_path: '/perfil', allowed_paths: ['/perfil'],
};

/* ─── Enterprise light theme tokens (alineado con Config. Tiendas) ─────────── */

const C = {
  ground: '#F8FAFC', surface: '#fff', border: '#E2E8F0', borderSoft: '#F1F5F9',
  ink: '#0F172A', ink2: '#374151', muted: '#475569', muted2: '#64748B', faint: '#94A3B8',
  navy: '#1B2A6B', accent: '#2563EB', accentSoft: '#EFF6FF', accentBorder: '#BFDBFE',
  good: '#16A34A', goodSoft: '#F0FDF4', goodBorder: '#BBF7D0',
  amber: '#B45309', amberText: '#92400E', amberSoft: '#FFFBEB', amberBorder: '#FDE68A',
  danger: '#DC2626', dangerSoft: '#FEF2F2', dangerBorder: '#FECACA',
};

const INP: React.CSSProperties = {
  width: '100%', border: `1px solid ${C.border}`, borderRadius: 8,
  padding: '9px 12px', fontSize: 14, outline: 'none',
  background: '#fff', color: C.ink, boxSizing: 'border-box',
};
const LBL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: C.muted2,
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block',
};
const TH: React.CSSProperties = {
  position: 'sticky', top: 0, zIndex: 1, textAlign: 'left', padding: '9px 14px',
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
  color: C.navy, background: C.borderSoft, borderBottom: '2px solid rgba(27,42,107,0.18)', whiteSpace: 'nowrap',
};
const TD: React.CSSProperties = {
  padding: '10px 14px', borderBottom: `1px solid ${C.borderSoft}`, color: C.ink2, verticalAlign: 'middle',
};
const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 50,
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto',
};
const CARD: React.CSSProperties = {
  background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440,
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 16, margin: 'auto',
};
const BTN_PRIMARY: React.CSSProperties = {
  border: 'none', background: C.accent, color: '#fff', fontSize: 13, fontWeight: 700,
  borderRadius: 8, padding: '9px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
};
const BTN_SECONDARY: React.CSSProperties = {
  border: `1px solid ${C.border}`, background: '#fff', color: C.muted, fontSize: 13, fontWeight: 600,
  borderRadius: 8, padding: '9px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
};

/* ─── Helpers ────────────────────────────────────────────────── */

function makeHeaders(token: string | null) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` };
}

function fmtDate(iso: string | null, withYear = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', ...(withYear ? { year: '2-digit' } : {}) });
}

function homeLabel(path: string) {
  return path === '/' ? 'Dashboard' : path.replace(/^\//, '');
}

/* ─── Page ───────────────────────────────────────────────────── */

export default function UsuariosPage() {
  const router  = useRouter();
  const { profile, accessToken } = useAuth();

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
  const [roles,       setRoles]       = useState<AppRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError,   setRolesError]   = useState(false);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [pendingPerms,        setPendingPerms]        = useState<Record<string, string[]>>({});
  const [pendingSectionPerms, setPendingSectionPerms] = useState<Record<string, Record<string, 'edit' | 'read'>>>({});
  const [savingRole,          setSavingRole]          = useState<string | null>(null);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<AppRole | null>(null);
  const [deletingRole, setDeletingRole] = useState(false);

  /* ── Create Role Modal ── */
  const [createRoleModal,   setCreateRoleModal]   = useState(false);
  const [newRole,           setNewRole]           = useState({ ...EMPTY_NEW_ROLE });
  const [creatingRole,      setCreatingRole]      = useState(false);
  const [createRoleError,   setCreateRoleError]   = useState('');
  const [createRoleContext, setCreateRoleContext] = useState<'standalone' | 'approve' | 'edit'>('standalone');

  /* ── Edit Role Modal ── */
  const [editRoleModal,  setEditRoleModal]  = useState(false);
  const [editRoleTarget, setEditRoleTarget] = useState<AppRole | null>(null);
  const [editRoleForm,   setEditRoleForm]   = useState({ label: '', color: '#2563EB', home_path: '/' });
  const [editRoleSaving, setEditRoleSaving] = useState(false);
  const [editRoleError,  setEditRoleError]  = useState('');

  const pendingUsers = users.filter(u => u.role === 'pending');
  const activeUsers  = users.filter(u => u.role !== 'pending');

  /* ── Load functions ── */

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = makeHeaders(accessToken);
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
  }, [accessToken]);

  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    setRolesError(false);
    try {
      const headers = makeHeaders(accessToken);
      const res  = await fetch('/api/admin/roles', { headers });
      const data = await res.json() as { roles?: AppRole[]; error?: string };
      if (res.ok && data.roles) setRoles(data.roles);
      else setRolesError(true);
    } catch {
      setRolesError(true);
    } finally {
      setRolesLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { loadUsers(); loadRoles(); }, [loadUsers, loadRoles]);

  if (profile && profile.role !== 'admin') {
    router.replace('/');
    return null;
  }

  /* ── Role helpers ── */

  function roleColor(role: string) {
    return roles.find(r => r.id === role)?.color ?? '#64748B';
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
    const allEnabled = ALL_MODULE_PATHS.every(p => current.includes(p));
    const next = allEnabled ? ['/perfil'] : [...ALL_MODULE_PATHS, '/perfil'];
    setPendingPerms(prev => ({ ...prev, [roleId]: next }));
  }

  function toggleRoleGroup(roleId: string, group: ModuleGroup, originalPaths: string[]) {
    const current = getEditingPaths(roleId, originalPaths);
    const next = applyGroupToggle(group, current);
    setPendingPerms(prev => ({ ...prev, [roleId]: next }));
  }

  function hasUnsavedPerms(roleId: string) {
    return roleId in pendingPerms || roleId in pendingSectionPerms;
  }

  function getEditingSectionPerms(roleId: string, originalPerms: Record<string, 'edit' | 'read'> = {}) {
    return pendingSectionPerms[roleId] ?? originalPerms;
  }

  function setSectionPerm(roleId: string, sectionId: string, value: 'edit' | 'read', originalPerms: Record<string, 'edit' | 'read'> = {}) {
    const current = getEditingSectionPerms(roleId, originalPerms);
    setPendingSectionPerms(prev => ({
      ...prev,
      [roleId]: { ...current, [sectionId]: value },
    }));
  }

  async function handleSaveRolePerms(role: AppRole) {
    const newPaths = pendingPerms[role.id];
    const newPerms = pendingSectionPerms[role.id];
    if (!newPaths && !newPerms) return;
    setSavingRole(role.id);
    try {
      const headers = makeHeaders(accessToken);
      const body: Record<string, unknown> = { id: role.id };
      // Limpia rutas ya inexistentes antes de guardar (deja solo rutas reales + '*')
      if (newPaths) body.allowed_paths = cleanAllowedPaths(newPaths);
      if (newPerms) body.permissions   = newPerms;
      const res = await fetch('/api/admin/roles', {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar');
      setPendingPerms(prev => { const n = { ...prev }; delete n[role.id]; return n; });
      setPendingSectionPerms(prev => { const n = { ...prev }; delete n[role.id]; return n; });
      setRoles(prev => prev.map(r => r.id === role.id ? {
        ...r,
        ...(newPaths ? { allowed_paths: newPaths } : {}),
        ...(newPerms ? { permissions: newPerms } : {}),
      } : r));
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
      const headers = makeHeaders(accessToken);
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

  function openEditRole(role: AppRole) {
    setEditRoleTarget(role);
    setEditRoleForm({ label: role.label, color: role.color, home_path: role.home_path });
    setEditRoleError('');
    setEditRoleModal(true);
  }

  async function handleEditRole() {
    if (!editRoleTarget || !editRoleForm.label.trim()) {
      setEditRoleError('El nombre es requerido');
      return;
    }
    setEditRoleSaving(true);
    setEditRoleError('');
    try {
      const headers = makeHeaders(accessToken);
      const res = await fetch('/api/admin/roles', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id: editRoleTarget.id, ...editRoleForm }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al actualizar');
      setRoles(prev => prev.map(r => r.id === editRoleTarget.id ? { ...r, ...editRoleForm } : r));
      setEditRoleModal(false);
    } catch (e) {
      setEditRoleError(e instanceof Error ? e.message : 'Error');
    } finally {
      setEditRoleSaving(false);
    }
  }

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

  function toggleNewRoleGroup(group: ModuleGroup) {
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
      const headers = makeHeaders(accessToken);
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
      const headers = makeHeaders(accessToken);
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
        headers,  // incluye el Bearer token — el endpoint exige admin (verifyAdmin)
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
      const headers = makeHeaders(accessToken);
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
      const headers = makeHeaders(accessToken);
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

  /* ── Small presentational bits ── */

  function Avatar({ name, color, size = 34 }: { name: string; color: string; size?: number }) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 8, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.4, fontWeight: 700, color,
        background: `${color}14`, border: `1px solid ${color}33`,
      }}>
        {(name || '?')[0].toUpperCase()}
      </div>
    );
  }

  function RoleChip({ roleId }: { roleId: string }) {
    const color = roleColor(roleId);
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
        padding: '3px 9px 3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
        background: C.borderSoft, border: `1px solid ${C.border}`, color: C.ink2,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
        {roleLabel(roleId)}
      </span>
    );
  }

  /* ── Role Selector (shared by user/approve modals) ── */

  function RoleSelector({ value, onChange, context }: {
    value: string;
    onChange: (v: string) => void;
    context: 'approve' | 'edit';
  }) {
    const r = roles.find(x => x.id === value);
    const paths = r ? (r.allowed_paths.includes('*') ? ['Acceso total'] : r.allowed_paths) : [];
    return (
      <div>
        <label style={LBL}>Asignar rol</label>
        <select
          value={value}
          onChange={e => {
            if (e.target.value === '__create__') openCreateRole(context);
            else onChange(e.target.value);
          }}
          style={{ ...INP, fontWeight: 600, cursor: 'pointer' }}>
          {roles.map(rr => <option key={rr.id} value={rr.id}>{rr.label}</option>)}
          <option disabled>──────────────</option>
          <option value="__create__">+ Crear nuevo rol</option>
        </select>
        {r && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
            {paths.slice(0, 6).map(p => (
              <span key={p} style={{ fontSize: 11, color: C.muted, background: C.borderSoft, border: `1px solid ${C.border}`, borderRadius: 5, padding: '2px 7px' }}>
                {p === '/' ? 'Dashboard' : p === '*' ? 'Todo' : p === 'Acceso total' ? p : p.replace(/^\//, '')}
              </span>
            ))}
            {paths.length > 6 && (
              <span style={{ fontSize: 11, color: C.faint, padding: '2px 4px' }}>+{paths.length - 6} más</span>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ─── Render ─────────────────────────────────────────────── */

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.ground, fontFamily: 'inherit' }}>

      {/* ── Page header ── */}
      <div className="mobile-menu-safe" style={{ flexShrink: 0, background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => router.push('/')} style={BTN_SECONDARY} title="Volver al inicio">
          <ChevronLeft size={15} /> Inicio
        </button>

        <div style={{ width: 36, height: 36, borderRadius: 10, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Users size={18} color={C.accent} strokeWidth={1.9} />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, lineHeight: 1.2 }}>Usuarios y roles</div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 1 }}>Gestiona el acceso al sistema y los permisos por rol</div>
        </div>

        {/* Bell (solo en tab usuarios) */}
        {activeTab === 'usuarios' && (
          <button onClick={() => setBellOpen(!bellOpen)} title="Solicitudes pendientes"
            style={{ position: 'relative', width: 38, height: 38, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: pendingCount > 0 ? C.amberSoft : '#fff', border: `1px solid ${pendingCount > 0 ? C.amberBorder : C.border}` }}>
            <Bell size={17} color={pendingCount > 0 ? C.amber : C.muted2} strokeWidth={1.9} />
            {pendingCount > 0 && (
              <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 9, fontSize: 10, fontWeight: 700, color: '#fff', background: C.amber, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {pendingCount}
              </span>
            )}
          </button>
        )}

        {activeTab === 'usuarios' ? (
          <button onClick={openCreate} style={BTN_PRIMARY}><Plus size={15} /> Nuevo usuario</button>
        ) : (
          <button onClick={() => openCreateRole('standalone')} style={BTN_PRIMARY}><Plus size={15} /> Nuevo rol</button>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, display: 'flex', paddingLeft: 24, flexShrink: 0 }}>
        {([
          { id: 'usuarios' as const, label: 'Usuarios', Icon: Users,       count: activeUsers.length },
          { id: 'roles'    as const, label: 'Roles',    Icon: ShieldCheck, count: roles.length },
        ]).map(({ id, label, Icon, count }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '11px 18px', fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? C.accent : C.muted2,
              background: 'none', borderBottom: active ? `2px solid ${C.accent}` : '2px solid transparent',
              cursor: 'pointer', transition: 'all 0.15s', marginBottom: -1,
            }}>
              <Icon size={14} strokeWidth={active ? 2.2 : 1.8} />
              {label}
              <span style={{ fontSize: 11, fontWeight: 700, color: active ? C.accent : C.faint, background: active ? C.accentSoft : C.borderSoft, borderRadius: 20, padding: '1px 7px', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Bell dropdown ── */}
      {bellOpen && activeTab === 'usuarios' && (
        <div style={{ flexShrink: 0, margin: '12px 24px 0', borderRadius: 12, overflow: 'hidden', background: '#fff', border: `1px solid ${C.amberBorder}`, boxShadow: '0 8px 24px rgba(15,23,42,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${C.borderSoft}`, background: C.amberSoft }}>
            <Bell size={15} color={C.amber} />
            <span style={{ fontSize: 12, fontWeight: 700, color: C.amberText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Solicitudes pendientes</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#fff', background: C.amber, borderRadius: 20, padding: '1px 8px' }}>{pendingCount}</span>
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {pendingUsers.length === 0 ? (
              <div style={{ textAlign: 'center', color: C.faint, fontSize: 13, padding: 18 }}>Sin solicitudes</div>
            ) : pendingUsers.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 14px', borderBottom: `1px solid ${C.borderSoft}` }}>
                <Avatar name={u.full_name || u.email} color={C.amber} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.full_name}</div>
                  <div style={{ fontSize: 11, color: C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                </div>
                <button onClick={() => { setApproveTarget(u); setApproveRole('despachador'); setBellOpen(false); }}
                  style={{ ...BTN_PRIMARY, padding: '6px 12px', fontSize: 12, background: C.good }}>Aprobar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {/* ═══ TAB: USUARIOS ═══ */}
        {activeTab === 'usuarios' && (
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            {loading && <div style={{ textAlign: 'center', color: C.faint, padding: '64px 0', fontSize: 14 }}>Cargando usuarios…</div>}
            {error && (
              <div style={{ fontSize: 13, color: C.danger, textAlign: 'center', padding: '12px 14px', borderRadius: 8, marginBottom: 16, background: C.dangerSoft, border: `1px solid ${C.dangerBorder}` }}>{error}</div>
            )}

            {!loading && (
              <>
                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 18 }}>
                  {[
                    { k: 'Usuarios activos', v: activeUsers.length, sub: `${users.length} en total`, warn: false },
                    { k: 'Roles', v: roles.length, sub: `${roles.filter(r => r.is_system).length} de sistema`, warn: false },
                    { k: 'Pendientes de aprobación', v: pendingUsers.length, sub: pendingUsers.length ? 'requieren revisión' : 'al día', warn: pendingUsers.length > 0 },
                  ].map(s => (
                    <div key={s.k} style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 16px' }}>
                      <div style={{ fontSize: 12, color: C.muted2, fontWeight: 500 }}>{s.k}</div>
                      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 3, color: s.warn ? C.amber : C.ink, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
                      <div style={{ fontSize: 12, color: C.faint, marginTop: 1 }}>{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Pending panel */}
                {pendingUsers.length > 0 && (
                  <div style={{ marginBottom: 18, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.amberBorder}`, background: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: C.amberSoft, borderBottom: `1px solid ${C.amberBorder}` }}>
                      <Bell size={14} color={C.amber} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.amberText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pendientes de aprobación ({pendingUsers.length})</span>
                    </div>
                    {pendingUsers.map(u => (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: `1px solid ${C.borderSoft}` }}>
                        <Avatar name={u.full_name || u.email} color={C.amber} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.full_name}</div>
                          <div style={{ fontSize: 12, color: C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                        </div>
                        <button onClick={() => { setApproveTarget(u); setApproveRole('despachador'); }}
                          style={{ ...BTN_PRIMARY, background: C.good, padding: '7px 14px' }}>Aprobar y asignar rol</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Users table */}
                <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
                      <thead>
                        <tr>
                          <th style={TH}>Usuario</th>
                          <th style={TH}>Rol</th>
                          <th style={TH}>Último acceso</th>
                          <th style={TH}>Alta</th>
                          <th style={{ ...TH, textAlign: 'right' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeUsers.length === 0 && (
                          <tr><td style={{ ...TD, textAlign: 'center', color: C.faint, padding: '32px 0' }} colSpan={5}>Sin usuarios activos</td></tr>
                        )}
                        {activeUsers.map((u, i) => {
                          const zebra = i % 2 ? '#FAFBFC' : '#fff';
                          return (
                            <tr key={u.id} style={{ background: zebra }}
                              onMouseEnter={e => (e.currentTarget.style.background = C.accentSoft)}
                              onMouseLeave={e => (e.currentTarget.style.background = zebra)}>
                              <td style={TD}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                                  <Avatar name={u.full_name || u.email} color={roleColor(u.role)} />
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{u.full_name || '—'}</div>
                                    <div style={{ fontSize: 12, color: C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{u.email}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={TD}><RoleChip roleId={u.role} /></td>
                              <td style={{ ...TD, color: C.muted2, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{u.last_sign_in ? fmtDate(u.last_sign_in) : 'Nunca'}</td>
                              <td style={{ ...TD, color: C.muted2, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtDate(u.created_at, true)}</td>
                              <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'inline-flex', gap: 4 }}>
                                  <button onClick={() => openEdit(u)} title="Editar"
                                    style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', color: C.muted2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = C.accentSoft; e.currentTarget.style.color = C.accent; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = C.muted2; }}>
                                    <Pencil size={14} />
                                  </button>
                                  <button onClick={() => setDeleteTarget(u)} title="Eliminar"
                                    style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', color: C.muted2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = C.dangerSoft; e.currentTarget.style.color = C.danger; e.currentTarget.style.borderColor = C.dangerBorder; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = C.muted2; e.currentTarget.style.borderColor = C.border; }}>
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ TAB: ROLES ═══ */}
        {activeTab === 'roles' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760, margin: '0 auto' }}>
            {rolesLoading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '56px 0' }}>
                <div className="animate-spin" style={{ width: 16, height: 16, border: `2px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%' }} />
                <span style={{ color: C.faint, fontSize: 13 }}>Cargando roles…</span>
              </div>
            )}

            {rolesError && !rolesLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '56px 0' }}>
                <span style={{ fontSize: 13, color: C.danger }}>No se pudieron cargar los roles desde Supabase</span>
                <button onClick={loadRoles} style={{ ...BTN_SECONDARY, color: C.danger, borderColor: C.dangerBorder, background: C.dangerSoft }}>Reintentar</button>
              </div>
            )}

            {roles.map(role => {
              const isExpanded = expandedRole === role.id;
              const editingPaths = getEditingPaths(role.id, role.allowed_paths);
              const editingSecPerms = getEditingSectionPerms(role.id, role.permissions);
              const isFullAccess = role.allowed_paths.includes('*');
              const count = userCountForRole(role.id);
              const unsaved = hasUnsavedPerms(role.id);

              return (
                <div key={role.id} style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: `1px solid ${isExpanded ? C.accentBorder : C.border}`, boxShadow: isExpanded ? '0 6px 22px rgba(37,99,235,0.08)' : 'none', transition: 'all 0.15s' }}>

                  {/* Header row */}
                  <button onClick={() => setExpandedRole(isExpanded ? null : role.id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', background: 'none', border: 'none' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${role.color}14`, border: `1px solid ${role.color}33` }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: role.color }}>{role.label[0].toUpperCase()}</span>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{role.label}</span>
                        {role.is_system && (
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: C.faint, border: `1px solid ${C.border}`, borderRadius: 5, padding: '1px 6px' }}>Sistema</span>
                        )}
                        {unsaved && (
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: C.amberText, background: C.amberSoft, border: `1px solid ${C.amberBorder}`, borderRadius: 5, padding: '1px 6px' }}>● Sin guardar</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: 12, color: C.muted2 }}>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{count} {count === 1 ? 'usuario' : 'usuarios'}</span>
                        <span style={{ color: C.border }}>·</span>
                        <span>Inicio: {homeLabel(role.home_path)}</span>
                        {isFullAccess && (<><span style={{ color: C.border }}>·</span><span style={{ fontWeight: 700, color: role.color }}>Acceso total</span></>)}
                      </div>
                    </div>

                    <ChevronDown size={18} color={C.faint} style={{ flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                  </button>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 16px 16px', borderTop: `1px solid ${C.borderSoft}` }}>

                      {isFullAccess ? (
                        <div style={{ marginTop: 12, padding: '18px 16px', borderRadius: 10, textAlign: 'center', background: `${role.color}0d`, border: `1px solid ${role.color}30` }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: role.color, marginBottom: 2 }}>Acceso total a todas las secciones</div>
                          <div style={{ fontSize: 12, color: C.faint }}>Este rol no tiene restricciones de rutas</div>
                        </div>
                      ) : (
                        <>
                          {/* Module permissions header */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted2 }}>Permisos por módulo</span>
                            <button onClick={() => toggleAllPaths(role.id, role.allowed_paths)}
                              style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: C.accent, background: C.accentSoft, border: `1px solid ${C.accentBorder}`, borderRadius: 20, padding: '4px 11px', cursor: 'pointer' }}>
                              {ALL_MODULE_PATHS.every(p => editingPaths.includes(p)) ? 'Quitar todo' : 'Dar acceso total'}
                            </button>
                          </div>

                          {/* Module groups */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {MODULE_GROUPS.map(group => {
                              const gState = groupState(group, editingPaths);
                              const activeCount = group.routes.filter(r => editingPaths.includes(r.path)).length;
                              const on = gState !== 'none';
                              return (
                                <div key={group.id} style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${on ? group.color + '30' : C.border}`, background: on ? `${group.color}08` : '#fff' }}>
                                  <button onClick={() => toggleRoleGroup(role.id, group, role.allowed_paths)}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', background: 'none', border: 'none' }}>
                                    <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      background: gState === 'all' ? group.color : gState === 'some' ? `${group.color}55` : '#fff',
                                      border: gState === 'none' ? `1.5px solid ${C.border}` : 'none' }}>
                                      {gState === 'all'  && <Check size={12} color="#fff" strokeWidth={3} />}
                                      {gState === 'some' && <Minus size={12} color="#fff" strokeWidth={3} />}
                                    </span>
                                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: on ? C.ink : C.faint }}>{group.label}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '1px 8px', color: on ? group.color : C.faint, background: on ? `${group.color}18` : C.borderSoft, fontVariantNumeric: 'tabular-nums' }}>{activeCount}/{group.routes.length}</span>
                                  </button>

                                  <div style={{ padding: '0 12px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                                    {group.routes.map(route => {
                                      const isOn = editingPaths.includes(route.path);
                                      return (
                                        <button key={route.path} onClick={() => togglePath(role.id, route.path, role.allowed_paths)}
                                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 7, textAlign: 'left', cursor: 'pointer', border: 'none', background: isOn ? `${group.color}12` : 'transparent' }}>
                                          <span style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isOn ? group.color : '#fff', border: isOn ? 'none' : `1.5px solid ${C.border}` }}>
                                            {isOn && <Check size={10} color="#fff" strokeWidth={3.2} />}
                                          </span>
                                          <span style={{ fontSize: 12.5, color: isOn ? C.ink2 : C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{route.label}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Perfil — locked */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: C.borderSoft, border: `1px solid ${C.border}` }}>
                              <Lock size={13} color={C.faint} />
                              <span style={{ fontSize: 12.5, color: C.muted2 }}>Perfil — siempre activo</span>
                            </div>
                          </div>

                          {/* Section-level edit/read */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted2 }}>Permisos de sección</span>
                            {SECTION_PERMISSIONS.map(sec => {
                              const current = editingSecPerms[sec.id] ?? 'edit';
                              return (
                                <div key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: '#fff', border: `1px solid ${C.border}` }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{sec.label}</div>
                                    <div style={{ fontSize: 11, color: C.faint, marginTop: 1 }}>{sec.desc}</div>
                                    <div style={{ fontSize: 10, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{sec.group}</div>
                                  </div>
                                  <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', flexShrink: 0, border: `1px solid ${C.border}` }}>
                                    {(['edit', 'read'] as const).map(v => (
                                      <button key={v} onClick={() => setSectionPerm(role.id, sec.id, v, role.permissions)}
                                        style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', cursor: 'pointer', border: 'none',
                                          background: current === v ? (v === 'edit' ? C.accent : C.muted2) : '#fff',
                                          color: current === v ? '#fff' : C.faint }}>
                                        {v === 'edit' ? 'Editor' : 'Lectura'}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}

                      {/* Action bar */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 2 }}>
                        {!isFullAccess && unsaved && (
                          <button onClick={() => handleSaveRolePerms(role)} disabled={savingRole === role.id}
                            style={{ ...BTN_PRIMARY, flex: 1, justifyContent: 'center', opacity: savingRole === role.id ? 0.6 : 1 }}>
                            {savingRole === role.id ? 'Guardando…' : 'Guardar permisos'}
                          </button>
                        )}
                        <button onClick={() => openEditRole(role)} style={BTN_SECONDARY}><Pencil size={14} /> Editar rol</button>
                        {!role.is_system && (
                          <button onClick={() => setDeleteRoleTarget(role)}
                            style={{ ...BTN_SECONDARY, color: C.danger, borderColor: C.dangerBorder, background: C.dangerSoft }}><Trash2 size={14} /> Eliminar</button>
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
        <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) setApproveTarget(null); }}>
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>Aprobar usuario</span>
              <button onClick={() => { setApproveTarget(null); setApproveError(''); }} style={closeBtn}><X size={16} /></button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: C.amberSoft, border: `1px solid ${C.amberBorder}` }}>
              <Avatar name={approveTarget.full_name || approveTarget.email} color={C.amber} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{approveTarget.full_name}</div>
                <div style={{ fontSize: 12, color: C.muted2 }}>{approveTarget.email}</div>
              </div>
            </div>

            <RoleSelector value={approveRole} onChange={setApproveRole} context="approve" />

            {approveError && (
              <div style={{ fontSize: 13, color: C.danger, textAlign: 'center', padding: '8px 10px', borderRadius: 8, background: C.dangerSoft, border: `1px solid ${C.dangerBorder}` }}>{approveError}</div>
            )}

            <p style={{ fontSize: 12, color: C.faint, margin: 0 }}>Se actualizará el rol con los permisos definidos y se enviará la contraseña temporal por correo.</p>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setApproveTarget(null); setApproveError(''); }} style={{ ...BTN_SECONDARY, flex: 1, justifyContent: 'center' }}>Cancelar</button>
              <button onClick={handleApprove} disabled={approving} style={{ ...BTN_PRIMARY, flex: 1, justifyContent: 'center', background: C.good, opacity: approving ? 0.6 : 1 }}>{approving ? 'Aprobando…' : 'Aprobar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit User Modal ── */}
      {modal && (
        <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{modal === 'create' ? 'Nuevo usuario' : 'Editar usuario'}</span>
              <button onClick={() => setModal(null)} style={closeBtn}><X size={16} /></button>
            </div>

            {modal === 'create' && (
              <div>
                <label style={LBL}>Correo electrónico</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="usuario@empresa.cl" style={INP} />
              </div>
            )}

            <div>
              <label style={LBL}>Nombre completo</label>
              <input type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Juan Pérez" style={INP} autoComplete="off" />
            </div>

            {modal === 'create' && (
              <div>
                <label style={LBL}>Contraseña</label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Mínimo 8 caracteres" style={INP} autoComplete="new-password" />
              </div>
            )}

            <RoleSelector value={form.role} onChange={v => setForm(f => ({ ...f, role: v }))} context="edit" />

            {formError && (
              <div style={{ fontSize: 13, color: C.danger, textAlign: 'center', padding: '8px 10px', borderRadius: 8, background: C.dangerSoft, border: `1px solid ${C.dangerBorder}` }}>{formError}</div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModal(null)} style={{ ...BTN_SECONDARY, flex: 1, justifyContent: 'center' }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving} style={{ ...BTN_PRIMARY, flex: 1, justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>{saving ? 'Guardando…' : modal === 'create' ? 'Crear' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete User ── */}
      {deleteTarget && (
        <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
          <div style={{ ...CARD, maxWidth: 400 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>Eliminar usuario</span>
            <div style={{ fontSize: 13, color: C.muted }}>¿Eliminar a <span style={{ fontWeight: 600, color: C.ink }}>{deleteTarget.full_name}</span>? Esta acción no se puede deshacer.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} style={{ ...BTN_SECONDARY, flex: 1, justifyContent: 'center' }}>Cancelar</button>
              <button onClick={handleDelete} disabled={deleting} style={{ ...BTN_PRIMARY, flex: 1, justifyContent: 'center', background: C.danger, opacity: deleting ? 0.6 : 1 }}>{deleting ? 'Eliminando…' : 'Eliminar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Role ── */}
      {deleteRoleTarget && (
        <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) setDeleteRoleTarget(null); }}>
          <div style={{ ...CARD, maxWidth: 400 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>Eliminar rol</span>
            <div style={{ fontSize: 13, color: C.muted }}>¿Eliminar el rol <span style={{ fontWeight: 600, color: deleteRoleTarget.color }}>{deleteRoleTarget.label}</span>? Los usuarios con este rol quedarán sin permisos hasta que se les asigne uno nuevo.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteRoleTarget(null)} disabled={deletingRole} style={{ ...BTN_SECONDARY, flex: 1, justifyContent: 'center' }}>Cancelar</button>
              <button onClick={handleDeleteRole} disabled={deletingRole} style={{ ...BTN_PRIMARY, flex: 1, justifyContent: 'center', background: C.danger, opacity: deletingRole ? 0.6 : 1 }}>{deletingRole ? 'Eliminando…' : 'Eliminar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Role Modal ── */}
      {editRoleModal && editRoleTarget && (
        <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) setEditRoleModal(false); }}>
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: editRoleForm.color }} />
                <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>Editar rol</span>
              </div>
              <button onClick={() => setEditRoleModal(false)} style={closeBtn}><X size={16} /></button>
            </div>

            <div>
              <label style={LBL}>Nombre del rol</label>
              <input type="text" value={editRoleForm.label} onChange={e => setEditRoleForm(f => ({ ...f, label: e.target.value }))} placeholder="Ej: Coordinador" style={INP} />
            </div>

            <div>
              <label style={LBL}>Color</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setEditRoleForm(f => ({ ...f, color: c }))}
                    style={{ width: 28, height: 28, borderRadius: 7, background: c, cursor: 'pointer', border: editRoleForm.color === c ? '2px solid #0F172A' : '2px solid transparent', outline: editRoleForm.color === c ? `2px solid ${c}` : 'none', outlineOffset: 1 }} />
                ))}
              </div>
            </div>

            <div>
              <label style={LBL}>Pantalla de inicio</label>
              <select value={editRoleForm.home_path} onChange={e => setEditRoleForm(f => ({ ...f, home_path: e.target.value }))} style={{ ...INP, cursor: 'pointer' }}>
                {HOME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {editRoleError && (
              <div style={{ fontSize: 13, color: C.danger, textAlign: 'center', padding: '8px 10px', borderRadius: 8, background: C.dangerSoft, border: `1px solid ${C.dangerBorder}` }}>{editRoleError}</div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditRoleModal(false)} style={{ ...BTN_SECONDARY, flex: 1, justifyContent: 'center' }}>Cancelar</button>
              <button onClick={handleEditRole} disabled={editRoleSaving || !editRoleForm.label.trim()} style={{ ...BTN_PRIMARY, flex: 1, justifyContent: 'center', opacity: (editRoleSaving || !editRoleForm.label.trim()) ? 0.6 : 1 }}>{editRoleSaving ? 'Guardando…' : 'Guardar cambios'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Role Modal ── */}
      {createRoleModal && (
        <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) setCreateRoleModal(false); }}>
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>Crear nuevo rol</span>
              <button onClick={() => setCreateRoleModal(false)} style={closeBtn}><X size={16} /></button>
            </div>

            <div>
              <label style={LBL}>Nombre del rol</label>
              <input type="text" value={newRole.label} onChange={e => handleNewRoleLabel(e.target.value)} placeholder="Ej: Coordinador" style={INP} />
              {newRole.id && (
                <div style={{ fontSize: 11, color: C.faint, marginTop: 5 }}>ID: <span style={{ color: C.muted2, fontFamily: 'ui-monospace, monospace' }}>{newRole.id}</span></div>
              )}
            </div>

            <div>
              <label style={LBL}>Color</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setNewRole(prev => ({ ...prev, color: c }))}
                    style={{ width: 28, height: 28, borderRadius: 7, background: c, cursor: 'pointer', border: newRole.color === c ? '2px solid #0F172A' : '2px solid transparent', outline: newRole.color === c ? `2px solid ${c}` : 'none', outlineOffset: 1 }} />
                ))}
              </div>
            </div>

            <div>
              <label style={LBL}>Pantalla de inicio</label>
              <select value={newRole.home_path} onChange={e => setNewRole(prev => ({ ...prev, home_path: e.target.value }))} style={{ ...INP, cursor: 'pointer' }}>
                {HOME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label style={LBL}>Acceso por módulo</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {MODULE_GROUPS.map(group => {
                  const state = groupState(group, newRole.allowed_paths);
                  const on = state !== 'none';
                  return (
                    <div key={group.id} style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${on ? group.color + '30' : C.border}`, background: on ? `${group.color}08` : '#fff' }}>
                      <button onClick={() => toggleNewRoleGroup(group)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer', textAlign: 'left', background: 'none', border: 'none' }}>
                        <span style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: state === 'all' ? group.color : state === 'some' ? `${group.color}55` : '#fff', border: state === 'none' ? `1.5px solid ${C.border}` : 'none' }}>
                          {state === 'all'  && <Check size={11} color="#fff" strokeWidth={3} />}
                          {state === 'some' && <Minus size={11} color="#fff" strokeWidth={3} />}
                        </span>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: on ? C.ink : C.faint }}>{group.label}</span>
                        <span style={{ fontSize: 11, color: on ? group.color : C.faint, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{group.routes.filter(r => newRole.allowed_paths.includes(r.path)).length}/{group.routes.length}</span>
                      </button>
                      <div style={{ padding: '0 10px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {group.routes.map(route => {
                          const isOn = newRole.allowed_paths.includes(route.path);
                          return (
                            <button key={route.path} onClick={() => toggleNewRolePath(route.path)}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 7, textAlign: 'left', cursor: 'pointer', border: 'none', background: isOn ? `${group.color}12` : 'transparent' }}>
                              <span style={{ width: 14, height: 14, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isOn ? group.color : '#fff', border: isOn ? 'none' : `1.5px solid ${C.border}` }}>
                                {isOn && <Check size={9} color="#fff" strokeWidth={3.2} />}
                              </span>
                              <span style={{ fontSize: 12.5, color: isOn ? C.ink2 : C.faint }}>{route.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: C.borderSoft, border: `1px solid ${C.border}` }}>
                  <Lock size={12} color={C.faint} />
                  <span style={{ fontSize: 12.5, color: C.muted2 }}>Perfil — siempre activo</span>
                </div>
              </div>
            </div>

            {createRoleError && (
              <div style={{ fontSize: 13, color: C.danger, textAlign: 'center', padding: '8px 10px', borderRadius: 8, background: C.dangerSoft, border: `1px solid ${C.dangerBorder}` }}>{createRoleError}</div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setCreateRoleModal(false)} style={{ ...BTN_SECONDARY, flex: 1, justifyContent: 'center' }}>Cancelar</button>
              <button onClick={handleCreateRole} disabled={creatingRole || !newRole.id || !newRole.label} style={{ ...BTN_PRIMARY, flex: 1, justifyContent: 'center', opacity: (creatingRole || !newRole.id || !newRole.label) ? 0.6 : 1 }}>{creatingRole ? 'Creando…' : 'Crear rol'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Shared UI ───────────────────────────────────────────────── */

const closeBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6, border: '1px solid #E2E8F0', background: '#F8FAFC',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', flexShrink: 0,
};
