// Pitido y vibración al escanear. Con la handheld en la mano y la vista en la etiqueta, un toast en
// pantalla no se ve: el oído y la mano sí se enteran.
//
// El sonido se genera con Web Audio (sin archivos que descargar ni cachear). Chrome solo deja
// sonar después de un gesto de la persona; una tecla del lector cuenta como gesto, así que el
// primer escaneo ya suena. Si el navegador no deja, se sigue sin sonido: nunca es un error.

export type TipoAviso = 'ok' | 'aviso' | 'error';

// Frecuencia (Hz) y duración (ms) de cada tono. Error = dos tonos graves, fácil de distinguir.
const TONOS: Record<TipoAviso, { hz: number; ms: number }[]> = {
  ok:    [{ hz: 1760, ms: 70 }],
  aviso: [{ hz: 880, ms: 90 }, { hz: 1320, ms: 90 }],
  error: [{ hz: 330, ms: 140 }, { hz: 330, ms: 140 }],
};

const VIBRACION: Record<TipoAviso, number | number[]> = {
  ok: 40,
  aviso: [60, 60, 60],
  error: [150, 80, 150],
};

let ctx: AudioContext | null = null;

function contexto(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

export function avisoFisico(tipo: TipoAviso): void {
  try { navigator.vibrate?.(VIBRACION[tipo]); } catch { /* sin vibración */ }
  try {
    const ac = contexto();
    if (!ac) return;
    let t = ac.currentTime;
    for (const { hz, ms } of TONOS[tipo]) {
      const osc = ac.createOscillator();
      const vol = ac.createGain();
      osc.type = 'square';
      osc.frequency.value = hz;
      vol.gain.setValueAtTime(0.08, t);
      vol.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      osc.connect(vol).connect(ac.destination);
      osc.start(t);
      osc.stop(t + ms / 1000);
      t += ms / 1000 + 0.04;
    }
  } catch { /* sin sonido */ }
}
