'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase() || '?';
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-barlow-condensed text-[11px] font-bold uppercase tracking-[0.14em] text-text-3 mt-6 mb-2 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-border">
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-border rounded-card px-4 py-3 mb-2" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.04)' }}>
      <div className="text-[10px] text-text-3 uppercase tracking-wide font-bold mb-1">{label}</div>
      {children}
    </div>
  );
}

export default function PerfilPage() {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [nameLoading, setNameLoading] = useState(false);
  const [nameSaved,   setNameSaved]   = useState(false);
  const [nameError,   setNameError]   = useState('');

  const [newEmail,    setNewEmail]    = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent,    setEmailSent]    = useState(false);
  const [emailError,   setEmailError]   = useState('');

  const [newPass,     setNewPass]     = useState('');
  const [confPass,    setConfPass]    = useState('');
  const [passLoading, setPassLoading] = useState(false);
  const [passSaved,   setPassSaved]   = useState(false);
  const [passError,   setPassError]   = useState('');

  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    if (profile?.full_name) setDisplayName(profile.full_name);
  }, [profile?.full_name]);

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
    setEmailLoading(true); setEmailError(''); setEmailSent(false);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) setEmailError(error.message);
    else { setEmailSent(true); setNewEmail(''); }
    setEmailLoading(false);
  };

  const handleChangePassword = async () => {
    if (newPass.length < 6) { setPassError('Mínimo 6 caracteres'); return; }
    if (newPass !== confPass) { setPassError('Las contraseñas no coinciden'); return; }
    setPassLoading(true); setPassError(''); setPassSaved(false);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) setPassError(error.message);
    else { setPassSaved(true); setNewPass(''); setConfPass(''); setTimeout(() => setPassSaved(false), 2500); }
    setPassLoading(false);
  };

  const roleLabel: Record<string, string> = {
    auditor: 'Auditor',
    'admin-auditoria': 'Admin Auditoría',
    despachador: 'Despachador',
    admin: 'Administrador',
  };

  const initials = displayName ? getInitials(displayName) : '??';
  const PALETTE = ['#1a2550', '#16A34A', '#D97706', '#2563EB', '#9333EA', '#D32F2F'];
  let h = 0;
  for (let i = 0; i < initials.length; i++) h = (h * 31 + initials.charCodeAt(i)) % PALETTE.length;
  const avatarBg = PALETTE[h];

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #1a2550 0%, #1e3a8a 100%)', boxShadow: '0 2px 16px rgba(26,37,80,0.30)' }}>
        <button onClick={() => router.back()}
          className="border-none bg-white/10 text-white/80 text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full">
          ← Volver
        </button>
        <div className="flex-1">
          <div className="font-barlow-condensed text-[22px] font-bold text-white tracking-widest uppercase">Mi Perfil</div>
          <div className="text-[11px] text-white/40 uppercase tracking-widest">Configuración de cuenta</div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-10 max-w-lg mx-auto w-full">

        {/* Avatar + account info */}
        <div className="mt-6 flex items-center gap-4 bg-white border border-border rounded-card px-5 py-4" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: avatarBg }}>
            <span className="font-barlow-condensed font-bold text-[24px] text-white leading-none">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-barlow-condensed text-[20px] font-bold text-navy truncate">{displayName || 'Sin nombre'}</div>
            <div className="text-[12px] text-text-3 truncate">{user?.email}</div>
            {profile?.role && (
              <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[rgba(26,37,80,0.08)] text-navy">
                {roleLabel[profile.role] ?? profile.role}
              </span>
            )}
          </div>
        </div>

        {/* ── NOMBRE ── */}
        <SectionTitle>Nombre de usuario</SectionTitle>
        <Field label="Nombre para mostrar">
          <input
            type="text"
            value={displayName}
            onChange={e => { setDisplayName(e.target.value); setNameSaved(false); }}
            placeholder="Tu nombre completo"
            className="w-full bg-transparent border-none outline-none font-barlow text-[15px] text-text"
          />
        </Field>
        {nameError && <div className="text-[11px] text-red mb-2">{nameError}</div>}
        {nameSaved && <div className="text-[11px] text-success mb-2">✓ Nombre actualizado</div>}
        <button
          onClick={handleSaveName}
          disabled={nameLoading || !displayName.trim() || displayName === profile?.full_name}
          className="w-full py-3 rounded-card font-barlow-condensed text-[16px] font-bold text-white cursor-pointer disabled:opacity-40 transition-all"
          style={{ background: 'linear-gradient(135deg, #1a2550, #1e3a8a)' }}>
          {nameLoading ? '⏳ Guardando…' : nameSaved ? '✓ Guardado' : 'Guardar nombre'}
        </button>

        {/* ── CORREO ── */}
        <SectionTitle>Correo electrónico</SectionTitle>
        <Field label="Correo actual">
          <span className="font-barlow text-[14px] text-text-2">{user?.email}</span>
        </Field>
        <Field label="Nuevo correo">
          <input
            type="email"
            value={newEmail}
            onChange={e => { setNewEmail(e.target.value); setEmailError(''); setEmailSent(false); }}
            placeholder="nuevo@correo.com"
            className="w-full bg-transparent border-none outline-none font-barlow text-[15px] text-text"
          />
        </Field>
        {emailError && <div className="text-[11px] text-red mb-2">{emailError}</div>}
        {emailSent && <div className="text-[11px] text-success mb-2">✓ Verifica tu nuevo correo para confirmar el cambio</div>}
        <button
          onClick={handleChangeEmail}
          disabled={emailLoading || !newEmail.trim()}
          className="w-full py-3 rounded-card font-barlow-condensed text-[16px] font-bold text-white cursor-pointer disabled:opacity-40 transition-all"
          style={{ background: 'linear-gradient(135deg, #0f766e, #0d9488)' }}>
          {emailLoading ? '⏳ Enviando…' : 'Cambiar correo'}
        </button>

        {/* ── CONTRASEÑA ── */}
        <SectionTitle>Contraseña</SectionTitle>
        <Field label="Nueva contraseña">
          <div className="flex items-center gap-2">
            <input
              type={showPass ? 'text' : 'password'}
              value={newPass}
              onChange={e => { setNewPass(e.target.value); setPassError(''); }}
              placeholder="Mínimo 6 caracteres"
              className="flex-1 bg-transparent border-none outline-none font-barlow text-[15px] text-text"
            />
            <button onClick={() => setShowPass(v => !v)} className="text-text-3 text-[12px] border-none bg-transparent cursor-pointer">{showPass ? 'Ocultar' : 'Ver'}</button>
          </div>
        </Field>
        <Field label="Confirmar nueva contraseña">
          <input
            type={showPass ? 'text' : 'password'}
            value={confPass}
            onChange={e => { setConfPass(e.target.value); setPassError(''); }}
            placeholder="Repite la contraseña"
            className="w-full bg-transparent border-none outline-none font-barlow text-[15px] text-text"
          />
        </Field>
        {passError && <div className="text-[11px] text-red mb-2">{passError}</div>}
        {passSaved && <div className="text-[11px] text-success mb-2">✓ Contraseña actualizada</div>}
        <button
          onClick={handleChangePassword}
          disabled={passLoading || !newPass || !confPass}
          className="w-full py-3 rounded-card font-barlow-condensed text-[16px] font-bold text-white cursor-pointer disabled:opacity-40 transition-all"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)' }}>
          {passLoading ? '⏳ Actualizando…' : passSaved ? '✓ Actualizada' : 'Cambiar contraseña'}
        </button>

        {/* ── INFORMACIÓN ── */}
        <SectionTitle>Información de cuenta</SectionTitle>
        <div className="bg-white border border-border rounded-card overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.04)' }}>
          {[
            { label: 'ID de usuario', value: user?.id?.slice(0, 16) + '…' },
            { label: 'Creada el', value: user?.created_at ? new Date(user.created_at).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' }) : '—' },
            { label: 'Último acceso', value: user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString('es-CL', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—' },
            { label: 'Rol', value: roleLabel[profile?.role ?? ''] ?? profile?.role ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0">
              <span className="text-[12px] text-text-3">{label}</span>
              <span className="text-[12px] font-semibold text-text text-right ml-4 truncate max-w-[200px]">{value}</span>
            </div>
          ))}
        </div>

        {/* ── IDEAS FUTURAS ── */}
        <SectionTitle>Próximamente</SectionTitle>
        <div className="bg-white border border-border rounded-card px-4 py-3 space-y-2" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.04)' }}>
          {[
            { icon: '🖼', text: 'Foto de perfil personalizada' },
            { icon: '🔔', text: 'Preferencias de notificaciones' },
            { icon: '🌙', text: 'Modo oscuro' },
            { icon: '📊', text: 'Resumen de mis auditorías' },
            { icon: '🔐', text: 'Historial de accesos' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3 text-[13px] text-text-3">
              <span className="text-[16px]">{icon}</span>
              <span>{text}</span>
              <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-bg-2 text-text-3">Pronto</span>
            </div>
          ))}
        </div>

        {/* ── CERRAR SESIÓN ── */}
        <SectionTitle>Sesión</SectionTitle>
        <button
          onClick={async () => { await signOut(); router.push('/login'); }}
          className="w-full py-3 rounded-card font-barlow-condensed text-[16px] font-bold border-2 border-red/30 text-red cursor-pointer hover:bg-red/5 transition-colors">
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
