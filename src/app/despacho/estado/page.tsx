import { redirect } from 'next/navigation';

// Panel unificado: /despacho/estado quedó fusionado en /registros (URL canónica). Se mantiene esta
// ruta registrada (permisos/middleware) pero redirige para no romper enlaces/favoritos antiguos.
export default function EstadoPage() {
  redirect('/registros');
}
