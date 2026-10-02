/**
 * Que un traductor o una extensión del navegador no tire abajo la pantalla.
 *
 * El traductor de Chrome (y extensiones como Grammarly o algunos bloqueadores) reemplaza los nodos de
 * texto de la página por los suyos. React no se entera: cuando le toca quitar o mover uno de SUS nodos,
 * ese nodo ya no es hijo de donde lo dejó y el navegador lanza
 * "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node".
 * El error sube hasta el ErrorBoundary y la persona pierde la pantalla en la que estaba trabajando.
 *
 * Pasó el 02/10 en /picking con un PC de bodega que traducía la página: apretar una tienda mostraba
 * "Algo salió mal en Abastecimiento". `translate="no"` en <html> evita el caso del traductor; esto
 * cubre lo que se escape (traducción forzada a mano, extensiones). Es el arreglo conocido del issue
 * facebook/react#11538: si el nodo ya no está donde React cree, no hay nada que quitar.
 *
 * Idempotente. Se instala una vez, desde instrumentation-client.ts, antes de que React dibuje nada.
 */

const MARCA = '__kcBlindajeDom';

type ProtoNodo = {
  removeChild: <T extends Node>(child: T) => T;
  insertBefore: <T extends Node>(node: T, ref: Node | null) => T;
};

export function blindarDom(proto: ProtoNodo & Record<string, unknown> = Node.prototype as never): void {
  if (proto[MARCA]) return;
  proto[MARCA] = true;

  const removeChild = proto.removeChild;
  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      console.warn('[blindajeDom] removeChild de un nodo que ya no es hijo (¿traductor o extensión?)', child);
      return child;
    }
    return removeChild.call(this, child) as T;
  };

  const insertBefore = proto.insertBefore;
  proto.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) {
      console.warn('[blindajeDom] insertBefore con una referencia que ya no es hija (¿traductor o extensión?)', ref);
      return node;
    }
    return insertBefore.call(this, node, ref) as T;
  };
}
