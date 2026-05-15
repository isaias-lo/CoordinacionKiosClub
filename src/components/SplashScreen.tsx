'use client';

import { useEffect, useState } from 'react';

export function SplashScreen() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading]   = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('splash_shown')) return;
    setVisible(true);
    const t1 = setTimeout(() => setFading(true), 3400);
    const t2 = setTimeout(() => {
      setVisible(false);
      sessionStorage.setItem('splash_shown', '1');
    }, 3900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (!visible) return null;

  // Responsive sizes via clamp(): min (mobile) → fluid → max (desktop)
  const ring0 = 'clamp(140px, 20vmin, 310px)';
  const ring1Inset = 'clamp(16px, 2.2vmin, 38px)';
  const ring2Inset = 'clamp(32px, 4.4vmin, 76px)';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(160deg,#0c1229 0%,#111A3E 55%,#0f1f3d 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
      opacity: fading ? 0 : 1,
      transition: fading ? 'opacity 0.5s ease' : 'none',
    }}>
      <style>{`
        @keyframes sp-float1 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%      { transform: translate(30px,-20px) scale(1.08); }
          66%      { transform: translate(-15px,25px) scale(0.95); }
        }
        @keyframes sp-float2 {
          0%,100% { transform: translate(0,0) scale(1); }
          40%      { transform: translate(-25px,-30px) scale(1.05); }
          70%      { transform: translate(20px,15px) scale(0.97); }
        }
        @keyframes sp-float3 {
          0%,100% { transform: translate(0,0) scale(1); }
          35%      { transform: translate(20px,-15px) scale(1.06); }
          65%      { transform: translate(-10px,20px) scale(0.96); }
        }
        @keyframes sp-spin-cw  { to { transform: rotate(360deg);  } }
        @keyframes sp-spin-ccw { to { transform: rotate(-360deg); } }
        @keyframes sp-rings-in {
          from { opacity:0; transform: scale(0.6); }
          to   { opacity:1; transform: scale(1); }
        }
        @keyframes sp-logo-in {
          from { opacity:0; transform: scale(0.82); }
          to   { opacity:1; transform: scale(1); }
        }
        @keyframes sp-fade-in  { from { opacity:0; } to { opacity:1; } }
        @keyframes sp-star-in  {
          from { opacity:0; transform: scale(0.4); }
          to   { opacity:1; transform: scale(1); }
        }
        @keyframes sp-progress {
          from { width: 0; }
          to   { width: 100%; }
        }
      `}</style>

      {/* Blob 1 — top-left, blue */}
      <div style={{
        position: 'absolute', top: '-8%', left: '-8%',
        width: 'clamp(280px, 40vw, 820px)',
        height: 'clamp(280px, 40vw, 820px)',
        borderRadius: '50%',
        background: 'rgba(26,58,143,0.75)', filter: 'blur(80px)',
        animation: 'sp-fade-in 1s ease 0.2s both, sp-float1 8s ease-in-out 1s infinite',
      }} />

      {/* Blob 2 — bottom-right, teal */}
      <div style={{
        position: 'absolute', bottom: '-8%', right: '-8%',
        width: 'clamp(260px, 38vw, 780px)',
        height: 'clamp(260px, 38vw, 780px)',
        borderRadius: '50%',
        background: 'rgba(13,122,110,0.5)', filter: 'blur(80px)',
        animation: 'sp-fade-in 1s ease 0.4s both, sp-float2 10s ease-in-out 1.2s infinite',
      }} />

      {/* Blob 3 — center, soft red */}
      <div style={{ position: 'absolute', top: '50%', left: '50%' }}>
        <div style={{
          width: 'clamp(200px, 30vw, 620px)',
          height: 'clamp(200px, 30vw, 620px)',
          borderRadius: '50%',
          background: 'rgba(180,30,30,0.22)', filter: 'blur(80px)',
          transform: 'translate(-50%, -50%)',
          animation: 'sp-fade-in 1s ease 0.6s both, sp-float3 7s ease-in-out 1.4s infinite',
        }} />
      </div>

      {/* Spinning rings */}
      <div style={{
        position: 'relative',
        width: ring0, height: ring0,
        flexShrink: 0, zIndex: 1,
        animation: 'sp-rings-in 0.7s cubic-bezier(0.34,1.5,0.64,1) 0.3s both',
        marginBottom: 'clamp(20px, 3.5vmin, 52px)',
      }}>
        {/* Ring 1 — outer, white */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '1.5px solid rgba(255,255,255,0.55)',
          borderTopColor: 'transparent',
          filter: 'drop-shadow(0 0 5px rgba(255,255,255,0.18))',
          animation: 'sp-spin-cw 2.8s linear infinite',
        }} />
        {/* Ring 2 — middle, blue */}
        <div style={{
          position: 'absolute',
          top: ring1Inset, right: ring1Inset, bottom: ring1Inset, left: ring1Inset,
          borderRadius: '50%',
          border: '1.5px solid rgba(42,91,215,0.75)',
          borderBottomColor: 'transparent',
          filter: 'drop-shadow(0 0 5px rgba(42,91,215,0.3))',
          animation: 'sp-spin-ccw 4s linear infinite',
        }} />
        {/* Ring 3 — inner, teal */}
        <div style={{
          position: 'absolute',
          top: ring2Inset, right: ring2Inset, bottom: ring2Inset, left: ring2Inset,
          borderRadius: '50%',
          border: '1.5px solid rgba(13,122,110,0.8)',
          borderTopColor: 'transparent', borderLeftColor: 'transparent',
          filter: 'drop-shadow(0 0 5px rgba(13,122,110,0.3))',
          animation: 'sp-spin-cw 5.5s linear infinite',
        }} />
      </div>

      {/* Logo */}
      <div style={{
        textAlign: 'center', zIndex: 1,
        animation: 'sp-logo-in 0.8s cubic-bezier(0.34,1.5,0.64,1) 0.55s both',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 'clamp(2px, 0.4vmin, 6px)' }}>
          <span style={{
            fontSize: 'clamp(44px, 7vw, 108px)',
            fontWeight: 800, color: '#d93025',
            letterSpacing: '-0.02em', lineHeight: 1,
            fontFamily: 'Barlow Condensed, sans-serif',
          }}>KIOS</span>
          <span style={{
            fontSize: 'clamp(28px, 4.4vw, 68px)',
            fontStyle: 'italic', fontWeight: 700, color: '#fff',
            lineHeight: 1, fontFamily: 'Barlow Condensed, sans-serif',
          }}>Club</span>
        </div>

        {/* Star bar */}
        <div style={{
          display: 'flex',
          gap: 'clamp(3px, 0.5vmin, 7px)',
          borderRadius: 2,
          padding: 'clamp(3px, 0.5vmin, 7px) clamp(8px, 1.2vmin, 18px)',
          background: '#1a3a8f',
          justifyContent: 'center',
          marginTop: 'clamp(6px, 1vmin, 14px)',
          width: 'fit-content', marginLeft: 'auto', marginRight: 'auto',
        }}>
          {[0,1,2,3,4].map(i => (
            <span key={i} style={{
              color: '#fff',
              fontSize: 'clamp(8px, 1.1vmin, 15px)',
              animation: `sp-star-in 0.3s cubic-bezier(0.34,1.5,0.64,1) ${0.85 + i * 0.12}s both`,
            }}>★</span>
          ))}
        </div>

        <div style={{
          marginTop: 'clamp(8px, 1.3vmin, 18px)',
          fontSize: 'clamp(9px, 1.1vmin, 16px)',
          color: 'rgba(255,255,255,0.35)',
          letterSpacing: 'clamp(3px, 0.5vmin, 7px)',
          textTransform: 'uppercase',
          animation: 'sp-fade-in 0.4s ease 1.1s both',
        }}>
          Sistema Interno
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        marginTop: 'clamp(36px, 5.5vmin, 80px)',
        zIndex: 1,
        width: 'clamp(80px, 10vw, 200px)',
        height: 1.5,
        background: 'rgba(255,255,255,0.10)',
        borderRadius: 2, overflow: 'hidden',
        animation: 'sp-fade-in 0.3s ease 0.9s both',
      }}>
        <div style={{
          height: '100%',
          background: 'linear-gradient(90deg, #2a5bd7, #fff)',
          animation: 'sp-progress 1.6s cubic-bezier(0.25,0.1,0.25,1) 1s both',
          width: 0,
        }} />
      </div>

      {/* Version */}
      <div style={{
        marginTop: 'clamp(10px, 1.5vmin, 20px)',
        zIndex: 1,
        fontSize: 'clamp(9px, 1vmin, 14px)',
        color: 'rgba(255,255,255,0.13)',
        textTransform: 'uppercase', letterSpacing: '1px',
        animation: 'sp-fade-in 0.3s ease 1.1s both',
      }}>
        toolskios.vercel.app
      </div>
    </div>
  );
}
