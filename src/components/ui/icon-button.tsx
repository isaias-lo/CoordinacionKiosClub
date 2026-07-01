import * as React from "react"

import { Button, type ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface IconButtonProps extends Omit<ButtonProps, "size"> {
  /** Etiqueta accesible obligatoria (el botón solo tiene un icono). */
  "aria-label": string
  size?: "sm" | "default"
}

/**
 * IconButton — botón cuadrado solo-icono sobre el sistema de `Button`.
 * Estándar de iconografía: `lucide-react`. Requiere `aria-label`.
 */
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = "ghost", size = "default", ...props }, ref) => (
    <Button
      ref={ref}
      variant={variant}
      size="icon"
      className={cn(size === "sm" && "h-9 w-9", className)}
      {...props}
    />
  )
)
IconButton.displayName = "IconButton"

export { IconButton }
