import * as React from "react"

import { cn } from "@/lib/utils"

interface ToolbarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Título de la sección/página (opcional). */
  title?: React.ReactNode
  /** Subtítulo o metadato bajo el título (opcional). */
  subtitle?: React.ReactNode
  /** Acciones/filtros alineados a la derecha. */
  actions?: React.ReactNode
}

/**
 * Toolbar enterprise — barra de título + acciones/filtros con densidad consistente.
 * Título a la izquierda, slot de acciones a la derecha; se apila en móvil.
 */
const Toolbar = React.forwardRef<HTMLDivElement, ToolbarProps>(
  ({ className, title, subtitle, actions, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        "px-4 py-3 border-b border-border bg-card",
        className
      )}
      {...props}
    >
      {(title || subtitle) && (
        <div className="flex flex-col gap-0.5 min-w-0">
          {title && (
            <span className="font-barlow-condensed font-bold uppercase tracking-wide text-[16px] leading-none text-foreground truncate">
              {title}
            </span>
          )}
          {subtitle && (
            <span className="text-[12px] text-muted-foreground truncate">{subtitle}</span>
          )}
        </div>
      )}
      {children}
      {actions && (
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">{actions}</div>
      )}
    </div>
  )
)
Toolbar.displayName = "Toolbar"

export { Toolbar }
