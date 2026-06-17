'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Moon, Sun, ClipboardCheck, Truck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/context/ThemeContext';
import { MODULE_GROUPS } from '@/config/routes';

/* ── Helpers ─────────────────────────────────────────────────────── */
function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase() || '?';
}

const AVATAR_COLORS = ['#1a2550', '#16A34A', '#D97706', '#2563EB', '#9333EA', '#D32F2F'];
function avatarColor(initials: string) {
  let h = 0;
  for (let i = 0; i < initials.length; i++) h = (h * 31 + initials.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

/* ── Sub-components ──────────────────────────────────────────────── */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-3 mt-7 mb-2.5 flex items-center gap-2">
      {children}
      <span className="flex-1 h-px bg-border" />
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`bg-card border border-border rounded-card ${className}`}
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      {children}
    </div>
  );
}

function FieldCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card className="px-4 py-3 mb-2">
      <div className="text-[10px] text-text-3 uppercase tracking-wide font-bold mb-1">{label}</div>
      {children}
    </Card>
  );
}

/* ── Types ───────────────────────────────────────────────────────── */
type ActivityItem = {
  id: string;
  tipo: 'auditoria' | 'despacho';
  titulo: string;
  subtitulo: string;
  error?: boolean;
  date: string;
};

const ROLE_LABELS: Record<string, string> = {
  auditor: 'Auditor',
  'admin-auditoria': 'Admin Auditoría',
  despachador: 'Despachador',
  admin: 'Administrador',
  'recepcion-tienda': 'Recepción Tienda',
  'supervisor-picking': 'Sup. Abastecimiento',
  'asistente-despacho': 'Asistente Despacho',
  'coordinador-flota': 'Coordinador Flota',
  supervisor: 'Supervisor',
};

/* ── Page ────────────────────────────────────────────────────────── */
export default function PerfilPage() {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  /* Name */
  const [displayName,  setDisplayName]  = useState('');
  const [nameLoading,  setNameLoading]  = useState(false);
  const [nameSaved,    setNameSaved]    = useState(false);
  const [nameError,    setNameError]    = useState('');

  /* Email */
  const [newEmail,      setNewEmail]      = useState('');
  const [emailCurrPass, setEmailCurrPass] = useState('');
  const [emailLoading,  setEmailLoading]  = useState(false);
  const [emailSent,     setEmailSent]     = useState(false);
  const [emailError,    setEmailError]    = useState('');

  /* Password */
  const [currPass,    setCurrPass]    = useState('');
  const [newPass,     setNewPass]     = useState('');
  const [confPass,    setConfPass]    = useState('');
  const [passLoading, setPassLoading] = useState(false);
  const [passSaved,   setPassSaved]   = useState(false);
  const [passError,   setPassError]   = useState('');
  const [showPass,    setShowPass]    = useState(false);

  /* Activity */
  const [activity,        setActivity]        = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  useEffect(() => {
    if (profile?.full_name) setDisplayName(profile.full_name);
  }, [profile?.full_name]);

  /* Load activity by role */
  useEffect(() => {
    if (!user?.id || !profile?.role) return;
    const role = profile.role;
    const isAuditor   = ['auditor', 'admin-auditoria'].includes(role);
    const isDespacho  = ['despachador', 'supervisor', 'asistente-despacho', 'coordinador-flota'].includes(role);
    if (!isAuditor && !isDespacho) return;
    setActivityLoading(true);
    const load = async () => {
      if (isAuditor) {
        const { data } = await supabase
          .from('audit_entries')
          .select('id, fecha, hora, tienda_nombre, tipo, tiene_errores')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5);
        setActivity((data ?? []).map(e => ({
          id:       e.id as string,
          tipo:     'auditoria' as const,
          titulo:   (e.tienda_nombre as string) ?? '—',
          subtitulo:`${(e.tipo as string) ?? ''} · ${(e.fecha as string) ?? ''} ${(e.hora as string) ?? ''}`.trim(),
          error:    Boolean(e.tiene_errores),
          date:     (e.fecha as string) ?? '',
        })));
      } else {
        const { data } = await supabase
          .from('dispatch_history')
          .select('id, date, total_pallets, total_bultos')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5);
        setActivity((data ?? []).map(e => ({
          id:       String(e.id),
          tipo:     'despacho' as const,
          titulo:   `Despacho ${(e.date as string) ?? ''}`,
          subtitulo:`${(e.total_pallets as number) ?? 0} pallets · ${(e.total_bultos as number) ?? 0} bultos`,
          date:     (e.date as string) ?? '',
        })));
      }
      setActivityLoading(false);
    };
    void load();
  }, [user?.id, profile?.role]);

  /* Handlers */
  const handleSaveName = async () => {
    if (!displayName.trim()) return;
    setNameLoading(true); setNameError(''); setNameSaved(false);
    const { error } = await supabase.auth.updateUser({ data: { full_name: displayName.trim() } });
    if (error) setNameError(error.message);
    else { setNameSaved(true); setTimeout(() => setNameSaved(false), 2500); }
    setNameLoading(false);
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) { setEmailError('Correo inválido'); return; }
    if (!emailCurrPass) { setEmailError('Ingresa tu contraseña actual para confirmar'); return; }
    setEmailLoading(true); setEmailError(''); setEmailSent(false);
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: user!.email!, password: emailCurrPass });
    if (authErr) { setEmailError('Contraseña incorrecta'); setEmailLoading(false); return; }
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) setEmailError(error.message);
    else { setEmailSent(true); setNewEmail(''); setEmailCurrPass(''); }
    setEmailLoading(false);
  };

  const handleChangePassword = async () => {
    if (!currPass) { setPassError('Ingresa tu contraseña actual'); return; }
    if (newPass.length < 8) { setPassError('Mínimo 8 caracteres'); return; }
    if (newPass !== confPass) { setPassError('Las contraseñas no coinciden'); return; }
    if (newPass === currPass) { setPassError('La nueva contraseña debe ser distinta'); return; }
    setPassLoading(true); setPassError(''); setPassSaved(false);
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: user!.email!, password: currPass });
    if (authErr) { setPassError('Contraseña actual incorrecta'); setPassLoading(false); return; }
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) { setPassError(error.message); setPassLoading(false); return; }
    await supabase.auth.signOut({ scope: 'others' });
    setPassSaved(true); setCurrPass(''); setNewPass(''); setConfPass('');
    setTimeout(() => setPassSaved(false), 2500);
    setPassLoading(false);
  };

  /* Derived */
  const initials  = displayName ? getInitials(displayName) : '??';
  const bgAvatar  = avatarColor(initials);
  const roleLabel = ROLE_LABELS[profile?.role ?? ''] ?? profile?.role ?? '—';

  /* Modules the user can access */
  const allowedGroups = MODULE_GROUPS.map(g => ({
    ...g,
    routes: g.routes.filter(r =>
      profile?.role === 'admin' ||
      (profile?.allowedPaths ?? []).includes('*') ||
      (profile?.allowedPaths ?? []).includes(r.path)
    ),
  })).filter(g => g.routes.length > 0);

  const showActivity = activity.length > 0 || activityLoading;

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">

      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{
          background: 'linear-gradient(135deg, #0D1829 0%, #1e3a8a 100%)',
          boxShadow: '0 2px 16px rgba(13,24,41,0.35)',
        }}
      >
        <button
          onClick={() => router.back()}
          className="text-white/60 hover:text-white transition-colors text-[13px] font-medium px-3 py-1.5 rounded-full border border-white/10 hover:border-white/20"
        >
          ← Volver
        </button>
        <div className="flex-1">
          <div className="font-barlow-condensed text-[22px] font-bold text-white tracking-widest uppercase leading-none">Mi Perfil</div>
          <div className="text-[10px] text-white/35 uppercase tracking-widest mt-0.5">Configuración de cuenta</div>
        </div>
      </div>

      {/* ── Scroll area ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-12 max-w-lg mx-auto w-full">

        {/* ── Avatar card ── */}
        <Card className="mt-5 flex items-center gap-4 px-5 py-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: bgAvatar }}
          >
            <span className="font-barlow-condensed font-bold text-[26px] text-white leading-none">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-barlow-condensed text-[20px] font-bold text-text truncate">{displayName || 'Sin nombre'}</div>
            <div className="text-[12px] text-text-3 truncate mt-0.5">{user?.email}</div>
            <span className="inline-block mt-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-border text-text-3 uppercase tracking-wide">
              {roleLabel}
            </span>
          </div>
        </Card>

        {/* ── Apariencia ── */}
        <SectionTitle>Apariencia</SectionTitle>
        <Card className="px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[14px] font-semibold text-text">{theme === 'dark' ? 'Modo oscuro' : 'Modo claro'}</div>
              <div className="text-[11px] text-text-3 mt-0.5">
                {theme === 'dark' ? 'Fondo color KiosClub' : 'Fondo blanco'}
              </div>
            </div>
            {/* Toggle switch */}
            <button
              onClick={toggleTheme}
              aria-label="Cambiar tema"
              className="flex items-center gap-2.5 cursor-pointer"
            >
              <Sun size={15} style={{ color: theme === 'light' ? '#F59E0B' : 'var(--color-text-3)' }} />
              <div
                style={{
                  width: 44, height: 24, borderRadius: 12, position: 'relative',
                  background: theme === 'dark' ? '#2563EB' : 'var(--color-border)',
                  transition: 'background 0.25s',
                  flexShrink: 0,
                }}
              >
                <div style={{
                  position: 'absolute', top: 3,
                  left: theme === 'dark' ? 23 : 3,
                  width: 18, height: 18, borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                  transition: 'left 0.25s',
                }} />
              </div>
              <Moon size={15} style={{ color: theme === 'dark' ? '#93C5FD' : 'var(--color-text-3)' }} />
            </button>
          </div>
        </Card>

        {/* ── Mis Módulos ── */}
        {allowedGroups.length > 0 && (
          <>
            <SectionTitle>Mis módulos</SectionTitle>
            {profile?.role === 'admin' ? (
              <Card className="px-4 py-3 flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#2563EB20' }}>
                  <span className="text-[14px]">⭐</span>
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-text">Acceso completo</div>
                  <div className="text-[11px] text-text-3">Todos los módulos del sistema</div>
                </div>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {allowedGroups.map(group => (
                  <Card key={group.id} className="px-4 py-3">
                    <div className="text-[9px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: group.color }}>
                      {group.label}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.routes.map(r => (
                        <span
                          key={r.path}
                          className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                          style={{
                            background: `${group.color}18`,
                            color: group.color,
                            border: `1px solid ${group.color}30`,
                          }}
                        >
                          {r.label}
                        </span>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Actividad Reciente ── */}
        {showActivity && (
          <>
            <SectionTitle>Actividad reciente</SectionTitle>
            <Card>
              {activityLoading ? (
                <div className="px-4 py-5 text-[12px] text-text-3 text-center">Cargando…</div>
              ) : (
                activity.map((item, i) => {
                  const isAudit = item.tipo === 'auditoria';
                  return (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 px-4 py-3 ${i < activity.length - 1 ? 'border-b border-border' : ''}`}
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{
                          background: isAudit
                            ? (item.error ? 'rgba(212,43,43,0.12)' : 'rgba(52,199,89,0.12)')
                            : 'rgba(37,99,235,0.12)',
                        }}
                      >
                        {isAudit
                          ? <ClipboardCheck size={13} style={{ color: item.error ? '#D42B2B' : '#34C759' }} />
                          : <Truck size={13} style={{ color: '#2563EB' }} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-text truncate">{item.titulo}</div>
                        <div className="text-[11px] text-text-3 mt-0.5 truncate">{item.subtitulo}</div>
                      </div>
                      {item.date && (
                        <div className="text-[10px] text-text-3 flex-shrink-0 mt-0.5">{item.date}</div>
                      )}
                    </div>
                  );
                })
              )}
            </Card>
          </>
        )}

        {/* ── Nombre ── */}
        <SectionTitle>Nombre de usuario</SectionTitle>
        <FieldCard label="Nombre para mostrar">
          <input
            type="text"
            value={displayName}
            onChange={e => { setDisplayName(e.target.value); setNameSaved(false); }}
            placeholder="Tu nombre completo"
            className="w-full bg-transparent border-none outline-none font-barlow text-[14px] text-text"
          />
        </FieldCard>
        {nameError && <p className="text-[11px] text-red mb-2">{nameError}</p>}
        {nameSaved && <p className="text-[11px] text-success mb-2">✓ Nombre actualizado</p>}
        <ActionButton
          onClick={handleSaveName}
          disabled={nameLoading || !displayName.trim() || displayName === profile?.full_name}
          color="#1a2550"
        >
          {nameLoading ? 'Guardando…' : nameSaved ? '✓ Guardado' : 'Guardar nombre'}
        </ActionButton>

        {/* ── Correo ── */}
        <SectionTitle>Correo electrónico</SectionTitle>
        <FieldCard label="Correo actual">
          <span className="text-[13px] text-text-2">{user?.email}</span>
        </FieldCard>
        <FieldCard label="Nuevo correo">
          <input
            type="email"
            value={newEmail}
            onChange={e => { setNewEmail(e.target.value); setEmailError(''); setEmailSent(false); }}
            placeholder="nuevo@correo.com"
            className="w-full bg-transparent border-none outline-none font-barlow text-[14px] text-text"
          />
        </FieldCard>
        <FieldCard label="Contraseña actual (para confirmar)">
          <input
            type="password"
            value={emailCurrPass}
            onChange={e => { setEmailCurrPass(e.target.value); setEmailError(''); }}
            placeholder="Tu contraseña actual"
            className="w-full bg-transparent border-none outline-none font-barlow text-[14px] text-text"
          />
        </FieldCard>
        {emailError && <p className="text-[11px] text-red mb-2">{emailError}</p>}
        {emailSent  && <p className="text-[11px] text-success mb-2">✓ Verifica tu nuevo correo para confirmar el cambio</p>}
        <ActionButton
          onClick={handleChangeEmail}
          disabled={emailLoading || !newEmail.trim() || !emailCurrPass}
          color="#0f766e"
        >
          {emailLoading ? 'Verificando…' : 'Cambiar correo'}
        </ActionButton>

        {/* ── Contraseña ── */}
        <SectionTitle>Contraseña</SectionTitle>
        <FieldCard label="Contraseña actual">
          <input
            type={showPass ? 'text' : 'password'}
            value={currPass}
            onChange={e => { setCurrPass(e.target.value); setPassError(''); }}
            placeholder="Tu contraseña actual"
            className="w-full bg-transparent border-none outline-none font-barlow text-[14px] text-text"
          />
        </FieldCard>
        <FieldCard label="Nueva contraseña">
          <div className="flex items-center gap-2">
            <input
              type={showPass ? 'text' : 'password'}
              value={newPass}
              onChange={e => { setNewPass(e.target.value); setPassError(''); }}
              placeholder="Mínimo 8 caracteres"
              className="flex-1 bg-transparent border-none outline-none font-barlow text-[14px] text-text"
            />
            <button
              onClick={() => setShowPass(v => !v)}
              className="text-text-3 text-[11px] border-none bg-transparent cursor-pointer font-medium"
            >
              {showPass ? 'Ocultar' : 'Ver'}
            </button>
          </div>
        </FieldCard>
        <FieldCard label="Confirmar nueva contraseña">
          <input
            type={showPass ? 'text' : 'password'}
            value={confPass}
            onChange={e => { setConfPass(e.target.value); setPassError(''); }}
            placeholder="Repite la contraseña"
            className="w-full bg-transparent border-none outline-none font-barlow text-[14px] text-text"
          />
        </FieldCard>
        {passError && <p className="text-[11px] text-red mb-2">{passError}</p>}
        {passSaved && <p className="text-[11px] text-success mb-2">✓ Contraseña actualizada — otras sesiones cerradas</p>}
        <ActionButton
          onClick={handleChangePassword}
          disabled={passLoading || !currPass || !newPass || !confPass}
          color="#7C3AED"
        >
          {passLoading ? 'Verificando…' : passSaved ? '✓ Actualizada' : 'Cambiar contraseña'}
        </ActionButton>

        {/* ── Información de cuenta ── */}
        <SectionTitle>Información de cuenta</SectionTitle>
        <Card>
          {[
            { label: 'ID de usuario',  value: user?.id ?? '—' },
            { label: 'Cuenta creada',  value: user?.created_at ? new Date(user.created_at).toLocaleDateString('es-CL', { timeZone: 'America/Santiago', year: 'numeric', month: 'long', day: 'numeric' }) : '—' },
            { label: 'Último acceso',  value: user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('es-CL', { timeZone: 'America/Santiago', hour12: false, year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—' },
            { label: 'Rol',            value: roleLabel },
          ].map(({ label, value }, i, arr) => (
            <div
              key={label}
              className={`flex items-center justify-between px-4 py-3 ${i < arr.length - 1 ? 'border-b border-border' : ''}`}
            >
              <span className="text-[12px] text-text-3 flex-shrink-0">{label}</span>
              <span className="text-[11px] font-mono font-semibold text-text text-right ml-4 break-all">{value}</span>
            </div>
          ))}
        </Card>

        {/* ── Sesión ── */}
        <SectionTitle>Sesión</SectionTitle>
        <button
          onClick={async () => { await signOut(); router.push('/login'); }}
          className="w-full py-3 rounded-card font-barlow-condensed text-[15px] font-bold border border-red/30 text-red cursor-pointer hover:bg-red/5 transition-colors"
        >
          Cerrar sesión
        </button>

      </div>
    </div>
  );
}

/* ── ActionButton ─────────────────────────────────────────────────── */
function ActionButton({
  children, onClick, disabled, color,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-3 mb-1 rounded-card font-barlow-condensed text-[15px] font-bold text-white cursor-pointer disabled:opacity-40 transition-all active:scale-[0.98]"
      style={{ background: disabled ? `${color}80` : color }}
    >
      {children}
    </button>
  );
}
