#!/bin/bash
# setup-dev.sh — Configuración de entorno de desarrollo
# Correr una vez por máquina: bash scripts/setup-dev.sh

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}=== Setup Entorno KiosClub ===${NC}\n"

# ── 1. Detectar quién eres ────────────────────────────────────────────────────
echo "¿Quién eres?"
echo "  1) Erick"
echo "  2) Isaías"
read -p "Selecciona (1 o 2): " QUIEN

if [ "$QUIEN" = "1" ]; then
  NOMBRE="Erick"
  TRABAJO_FILE="TRABAJO_ERICK.md"
elif [ "$QUIEN" = "2" ]; then
  NOMBRE="Isaías"
  TRABAJO_FILE="TRABAJO_ISAIAS.md"
else
  echo "Opción inválida. Saliendo."
  exit 1
fi

echo -e "\n${GREEN}Hola $NOMBRE, configurando tu entorno...${NC}\n"

# ── 2. Detectar shell config ──────────────────────────────────────────────────
if [ -f "$HOME/.zshrc" ]; then
  SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
  SHELL_RC="$HOME/.bashrc"
else
  SHELL_RC="$HOME/.profile"
fi
echo -e "  Shell config: ${YELLOW}$SHELL_RC${NC}"

# ── 3. Agregar aliases ────────────────────────────────────────────────────────
if grep -q "alias bye=" "$SHELL_RC" 2>/dev/null; then
  sed -i '' '/alias bye=/d' "$SHELL_RC"
  sed -i '' '/alias hola=/d' "$SHELL_RC"
fi

cat >> "$SHELL_RC" << ALIASES

# KiosClub — aliases de sesión ($NOMBRE)
alias bye='claude -p "Estás en el proyecto CoordinacionKiosClub. Lee CLAUDE.md y $TRABAJO_FILE, revisa el git log de los últimos 5 commits con: git log --oneline -5. Luego actualiza $TRABAJO_FILE con: fecha de hoy, último commit, rama actual, qué se completó basándote en los commits recientes, qué quedó en progreso y cuáles son los próximos pasos concretos. Sé específico." && git -C \"$REPO_DIR\" add $TRABAJO_FILE && git -C \"$REPO_DIR\" commit -m "chore: actualizar estado de sesión ($NOMBRE)" --allow-empty && echo "✅ $TRABAJO_FILE guardado y commiteado"'
alias hola='claude -p "Estás en el proyecto CoordinacionKiosClub. Lee CLAUDE.md y $TRABAJO_FILE y dime en 3-4 líneas: en qué estamos, qué queda pendiente y cuál es el próximo paso."'
ALIASES

echo -e "  ${GREEN}✓${NC} Aliases bye/hola instalados"

# ── 4. Configurar hook PreCompact de Claude Code ──────────────────────────────
CLAUDE_DIR="$HOME/.claude"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
mkdir -p "$CLAUDE_DIR"

AUTO_COMMIT_CMD="cd '$REPO_DIR' && git add -A && git commit -m 'WIP: auto-save antes de compactar contexto' --allow-empty 2>/dev/null; true"

if [ -f "$SETTINGS_FILE" ]; then
  # Si ya existe, hacer backup y agregar el hook
  cp "$SETTINGS_FILE" "$SETTINGS_FILE.backup"
  echo -e "  ${YELLOW}⚠${NC}  settings.json existente — backup en settings.json.backup"
  echo -e "  ${YELLOW}!${NC}  Agrega manualmente el hook PreCompact (ver instrucciones al final)"
else
  cat > "$SETTINGS_FILE" << JSON
{
  "hooks": {
    "PreCompact": [
      {
        "type": "command",
        "command": "$AUTO_COMMIT_CMD"
      }
    ]
  }
}
JSON
  echo -e "  ${GREEN}✓${NC} Hook PreCompact configurado en Claude Code"
fi

# ── 5. Actualizar post-commit hook del repo ───────────────────────────────────
HOOK_FILE="$REPO_DIR/.git/hooks/post-commit"
cat > "$HOOK_FILE" << 'HOOK'
#!/bin/bash
LAST=$(git log -1 --pretty="%s")
DATE=$(date '+%Y-%m-%d %H:%M')
BRANCH=$(git branch --show-current)
FILES=$(git log --name-only --pretty=format: -3 | sort -u | grep -v '^$')

# Detectar archivo de trabajo según git user.email
EMAIL=$(git config user.email 2>/dev/null || echo "")
if echo "$EMAIL" | grep -qi "erick"; then
  TRABAJO_FILE="TRABAJO_ERICK.md"
else
  TRABAJO_FILE="TRABAJO_ISAIAS.md"
fi

# Preservar secciones existentes
PROGRESO="[actualizar con comando bye]"
PASOS="[actualizar con comando bye]"
if [ -f "$TRABAJO_FILE" ]; then
  _P=$(awk '/^## En progreso/{f=1;next} f && /^## /{exit} f{print}' "$TRABAJO_FILE" | grep -v '^\[' | grep -v '^[[:space:]]*$')
  _S=$(awk '/^## Próximos pasos/{f=1;next} f && /^## /{exit} f{print}' "$TRABAJO_FILE" | grep -v '^\[' | grep -v '^[[:space:]]*$')
  [ -n "$_P" ] && PROGRESO="$_P"
  [ -n "$_S" ] && PASOS="$_S"
fi

cat > "$TRABAJO_FILE" << ESTADO
# Estado actual del trabajo

## Última sesión
Fecha: $DATE
Último commit: $LAST
Rama: $BRANCH

## Archivos modificados recientemente
$FILES

## En progreso
$PROGRESO

## Próximos pasos
$PASOS
ESTADO
HOOK
chmod +x "$HOOK_FILE"
echo -e "  ${GREEN}✓${NC} Hook post-commit actualizado"

# ── 6. Configurar git user.email si falta ────────────────────────────────────
CURRENT_EMAIL=$(git -C "$REPO_DIR" config user.email 2>/dev/null || echo "")
if [ -z "$CURRENT_EMAIL" ]; then
  read -p "  Tu email de git (para identificarte en hooks): " USER_EMAIL
  git -C "$REPO_DIR" config user.email "$USER_EMAIL"
  echo -e "  ${GREEN}✓${NC} Git email configurado"
fi

# ── 7. Source shell config ────────────────────────────────────────────────────
source "$SHELL_RC" 2>/dev/null || true
echo -e "\n${GREEN}=== Setup completado para $NOMBRE ===${NC}"
echo -e "  ${CYAN}bye${NC}  → guarda tu estado al terminar el día"
echo -e "  ${CYAN}hola${NC} → resumen rápido del estado del proyecto"
echo -e "\n  Recuerda hacer ${YELLOW}source $SHELL_RC${NC} o abrir una terminal nueva.\n"
