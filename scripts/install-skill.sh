#!/usr/bin/env bash
#
# install-skill.sh — install the bundled Agent Skills (`jd-matcher-skill`, optionally `kami`)
# either into the current project or into every supported AI agent's user-level skill directory.
#
# Supported agents / locations:
#   project: .agents/skills, .claude/skills, .gemini/skills, .cursor/skills, .opencode/skills
#   global : ~/.agents/skills, ~/.claude/skills, ~/.codex/skills, ~/.cursor/skills,
#            ~/.gemini/skills, ~/.gemini/config/skills (Antigravity), ~/.config/opencode/skills,
#            ~/.pi/agent/skills
#
# Usage: bash scripts/install-skill.sh [options]   (see --help)

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"

SCOPE=""
TARGETS_RAW=""
SKILLS=("jd-matcher-skill")
MODE="symlink"
FORCE=0
DRY_RUN=0
UNINSTALL=0
LIST_ONLY=0

MARKER_FILE=".installed-by-jd-matcher"
ALL_TARGETS="agents claude codex cursor gemini antigravity opencode pi"

# ---------------------------------------------------------------- output helpers
if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_BLUE=$'\033[34m'
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_BLUE=""
fi

info()  { printf '%s\n' "$*"; }
ok()    { printf '%s✔%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn()  { printf '%s!%s %s\n' "$C_YELLOW" "$C_RESET" "$*"; }
err()   { printf '%s✘%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; }
step()  { printf '%s»%s %s\n' "$C_BLUE" "$C_RESET" "$*"; }

usage() {
  cat <<'EOF'
Install the bundled JD Matcher Agent Skill (and optionally Kami).

Usage:
  bash scripts/install-skill.sh [options]

Scope:
  -s, --scope <local|global|both>  Where to install. `local` = this repository,
                                   `global` = user-level agent directories.
                                   Omitting it starts an interactive prompt (or
                                   defaults to `local` when not attached to a TTY).

Targets:
  -t, --target <name,...|all>      Limit to specific agents. Repeatable.
                                   local : agents, claude, gemini, cursor, opencode
                                   global: agents, claude, codex, cursor, gemini,
                                           antigravity, opencode, pi
                                   Default: auto-detect installed agents on this machine.

Skill selection:
      --skill <name,...>           Skill(s) to install (default: jd-matcher-skill).
      --with-kami                  Also install the bundled `kami` design skill.

Behaviour:
      --copy                       Copy the skill instead of symlinking. Needed on
                                   Windows, in cloud agents, or for read-only repos.
                                   Re-run the installer after `git pull` when copying.
  -f, --force                      Replace a conflicting skill installed by hand.
      --dry-run                    Print the planned actions without changing anything.
      --uninstall                  Remove skills installed by this script.
      --list                       Show every supported location and its status.
  -h, --help                       Show this help.

Examples:
  bash scripts/install-skill.sh                              # interactive
  bash scripts/install-skill.sh --scope global
  bash scripts/install-skill.sh --scope local --with-kami
  bash scripts/install-skill.sh --scope global --copy --target claude,pi
  bash scripts/install-skill.sh --scope global --dry-run
  bash scripts/install-skill.sh --scope global --uninstall
EOF
}

# ---------------------------------------------------------------- arg parsing
while [ $# -gt 0 ]; do
  case "$1" in
    -s|--scope)
      [ $# -ge 2 ] || { err "--scope requires a value"; exit 2; }
      SCOPE="$2"; shift 2 ;;
    -t|--target)
      [ $# -ge 2 ] || { err "--target requires a value"; exit 2; }
      TARGETS_RAW="${TARGETS_RAW:+$TARGETS_RAW,}$2"; shift 2 ;;
    --skill)
      [ $# -ge 2 ] || { err "--skill requires a value"; exit 2; }
      SKILLS=(); IFS=',' read -r -a _extra <<< "$2"
      for _s in "${_extra[@]}"; do SKILLS+=("$_s"); done
      shift 2 ;;
    --with-kami)
      SKILLS+=("kami"); shift ;;
    --copy)      MODE="copy"; shift ;;
    -f|--force)  FORCE=1; shift ;;
    --dry-run)   DRY_RUN=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    --list)      LIST_ONLY=1; shift ;;
    -h|--help)   usage; exit 0 ;;
    *)           err "Unknown option: $1"; usage; exit 2 ;;
  esac
done

case "$SCOPE" in
  ""|local|global|both) ;;
  *) err "--scope must be one of: local, global, both"; exit 2 ;;
esac

# de-duplicate selected skills while preserving order
_dedup=(); for _s in "${SKILLS[@]}"; do
  _seen=0; for _d in "${_dedup[@]:-}"; do [ "$_d" = "$_s" ] && _seen=1 && break; done
  [ "$_seen" = 0 ] && _dedup+=("$_s")
done
SKILLS=("${_dedup[@]}")

# ---------------------------------------------------------------- target registry
# local target -> path relative to the repository root
local_path() {
  case "$1" in
    agents)   printf '%s' "$REPO_ROOT/.agents/skills" ;;
    claude)   printf '%s' "$REPO_ROOT/.claude/skills" ;;
    gemini)   printf '%s' "$REPO_ROOT/.gemini/skills" ;;
    cursor)   printf '%s' "$REPO_ROOT/.cursor/skills" ;;
    opencode) printf '%s' "$REPO_ROOT/.opencode/skills" ;;
    *)        return 1 ;;
  esac
}

# global target -> user-level path
global_path() {
  case "$1" in
    agents)      printf '%s' "$HOME/.agents/skills" ;;
    claude)      printf '%s' "$HOME/.claude/skills" ;;
    codex)       printf '%s' "$HOME/.codex/skills" ;;
    cursor)      printf '%s' "$HOME/.cursor/skills" ;;
    gemini)      printf '%s' "$HOME/.gemini/skills" ;;
    antigravity) printf '%s' "$HOME/.gemini/config/skills" ;;
    opencode)    printf '%s' "$HOME/.config/opencode/skills" ;;
    pi)          printf '%s' "$HOME/.pi/agent/skills" ;;
    *)           return 1 ;;
  esac
}

# marker that suggests the agent is present on this machine (auto-detection)
global_detected() {
  case "$1" in
    agents)      [ -d "$HOME/.agents" ] ;;
    claude)      [ -d "$HOME/.claude" ] ;;
    codex)       [ -d "$HOME/.codex" ] ;;
    cursor)      [ -d "$HOME/.cursor" ] ;;
    gemini)      [ -d "$HOME/.gemini" ] ;;
    antigravity) [ -d "$HOME/.gemini/config" ] || [ -d "$HOME/.gemini/antigravity" ] ;;
    opencode)    [ -d "$HOME/.config/opencode" ] ;;
    pi)          [ -d "$HOME/.pi" ] ;;
    *)           return 1 ;;
  esac
}

local_targets() { printf '%s' "agents claude"; }
global_targets() {
  local found=""
  for t in $ALL_TARGETS; do
    global_detected "$t" && found="${found:+$found }$t"
  done
  # `.agents/skills` is the cross-client convention and the safest fallback
  [ -z "$found" ] && found="agents"
  printf '%s' "$found"
}

# ---------------------------------------------------------------- filesystem helpers
realpath_dir() { (cd -- "$1" >/dev/null 2>&1 && pwd -P); }

points_into_repo() {
  # $1 = symlink path; true when it resolves inside this repository
  local target dir resolved
  target="$(readlink -- "$1" 2>/dev/null)" || return 1
  [ -n "$target" ] || return 1
  case "$target" in
    /*) resolved="$(realpath_dir "$target" 2>/dev/null)" || return 1 ;;
    *)  dir="$(cd -- "$(dirname -- "$1")" && pwd -P)"
        resolved="$(realpath_dir "$dir/$target" 2>/dev/null)" || return 1 ;;
  esac
  case "$resolved" in "$REPO_ROOT"/*) return 0 ;; *) return 1 ;; esac
}

is_our_copy() { [ -f "$1/$MARKER_FILE" ]; }

remove_installed() {
  # $1 = destination path, $2 = true when an explicit --force was given
  local dest="$1" forced="$2"
  if [ -L "$dest" ]; then
    if points_into_repo "$dest" || [ "$forced" = 1 ]; then
      run "rm -- \"$dest\""
    else
      warn "kept $dest (symlink does not point into this repository)"
      return 1
    fi
  elif [ -e "$dest" ]; then
    if is_our_copy "$dest" || [ "$forced" = 1 ]; then
      run "rm -rf -- \"$dest\""
    else
      warn "kept $dest (not installed by this script — use --force to replace)"
      return 1
    fi
  else
    return 1
  fi
}

run() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '%s[dry-run]%s %s\n' "$C_DIM" "$C_RESET" "$*"
  else
    eval "$*"
  fi
}

install_skill() {
  # $1 = source dir, $2 = destination dir, $3 = skill name
  local src="$1" dest_dir="$2" skill="$3" dest="$2/$3"

  if [ -e "$dest" ] || [ -L "$dest" ]; then
    if [ "$UNINSTALL" = 1 ]; then
      remove_installed "$dest" "$FORCE" && ok "removed $dest" || true
      return 0
    fi
    if [ "$FORCE" = 1 ]; then
      remove_installed "$dest" 1 || true
    else
      warn "skipped $dest (already exists — use --force to replace)"
      return 0
    fi
  fi

  if [ "$UNINSTALL" = 1 ]; then
    info "  nothing installed at $dest"
    return 0
  fi

  run "mkdir -p -- \"$dest_dir\""
  if [ "$MODE" = "copy" ]; then
    run "cp -R -- \"$src\" \"$dest\""
    run ": > \"$dest/$MARKER_FILE\""
    ok "copied  $skill  ->  $dest"
  else
    run "ln -s -- \"$src\" \"$dest\""
    ok "linked  $skill  ->  $dest"
  fi
}

# ---------------------------------------------------------------- --list
print_list() {
  printf '%sProject scope (%s)%s\n' "$C_BOLD" "$REPO_ROOT" "$C_RESET"
  for t in agents claude gemini cursor opencode; do
    p="$(local_path "$t")"; s=""; [ -e "$p/jd-matcher-skill" ] && s=" $(printf '%s[installed]%s' "$C_GREEN" "$C_RESET")"
    printf '  %-11s %s%s\n' "$t" "$p" "$s"
  done
  printf '\n%sGlobal scope (%s)%s\n' "$C_BOLD" "$HOME" "$C_RESET"
  for t in $ALL_TARGETS; do
    p="$(global_path "$t")"; s=""; [ -e "$p/jd-matcher-skill" ] && s=" $(printf '%s[installed]%s' "$C_GREEN" "$C_RESET")"
    d=""; global_detected "$t" || d=" $(printf '%s(not detected)%s' "$C_DIM" "$C_RESET")"
    printf '  %-11s %s%s%s\n' "$t" "$p" "$s" "$d"
  done
}

if [ "$LIST_ONLY" = 1 ]; then print_list; exit 0; fi

# ---------------------------------------------------------------- resolve scope
if [ -z "$SCOPE" ]; then
  if [ -t 0 ]; then
    printf '%sWhere should the JD Matcher skill be installed?%s\n' "$C_BOLD" "$C_RESET"
    printf '  1) This project only  %s(%s)%s\n' "$C_DIM" "$REPO_ROOT" "$C_RESET"
    printf '  2) Global             %s(all projects, every detected AI agent)%s\n' "$C_DIM" "$C_RESET"
    printf '  3) Both\n'
    printf 'Choice [1]: '
    read -r answer || answer=""
    case "${answer:-1}" in
      2) SCOPE="global" ;;
      3) SCOPE="both" ;;
      *) SCOPE="local" ;;
    esac
  else
    SCOPE="local"
  fi
fi

# ---------------------------------------------------------------- resolve targets
TARGETS_LOCAL=""
TARGETS_GLOBAL=""
if [ -n "$TARGETS_RAW" ]; then
  IFS=',' read -r -a _req <<< "$TARGETS_RAW"
  for t in "${_req[@]}"; do
    [ -z "$t" ] && continue
    if [ "$t" = "all" ]; then
      case "$SCOPE" in
        local)  TARGETS_LOCAL="agents claude gemini cursor opencode" ;;
        global) TARGETS_GLOBAL="$ALL_TARGETS" ;;
        both)   TARGETS_LOCAL="agents claude gemini cursor opencode"; TARGETS_GLOBAL="$ALL_TARGETS" ;;
      esac
      continue
    fi
    if [ "$SCOPE" = "global" ] || [ "$SCOPE" = "both" ]; then
      global_path "$t" >/dev/null 2>&1 || { err "Unknown target: $t"; err "Global targets: $ALL_TARGETS"; exit 2; }
      TARGETS_GLOBAL="${TARGETS_GLOBAL:+$TARGETS_GLOBAL }$t"
    fi
    if [ "$SCOPE" = "local" ] || [ "$SCOPE" = "both" ]; then
      local_path "$t" >/dev/null 2>&1 || { err "Unknown target: $t"; err "Local targets: agents claude gemini cursor opencode"; exit 2; }
      TARGETS_LOCAL="${TARGETS_LOCAL:+$TARGETS_LOCAL }$t"
    fi
  done
else
  case "$SCOPE" in
    local)  TARGETS_LOCAL="$(local_targets)" ;;
    global) TARGETS_GLOBAL="$(global_targets)" ;;
    both)   TARGETS_LOCAL="$(local_targets)"; TARGETS_GLOBAL="$(global_targets)" ;;
  esac
fi

# ---------------------------------------------------------------- validate sources
for skill in "${SKILLS[@]}"; do
  src="$REPO_ROOT/skills/$skill"
  if [ ! -f "$src/SKILL.md" ]; then
    err "Skill not found: skills/$skill (missing SKILL.md)"
    exit 1
  fi
done

# ---------------------------------------------------------------- banner
if [ "$UNINSTALL" = 1 ]; then
  step "Uninstalling ${SKILLS[*]} (scope: $SCOPE)"
elif [ "$MODE" = "copy" ]; then
  step "Installing ${SKILLS[*]} by copy (scope: $SCOPE)"
else
  step "Installing ${SKILLS[*]} via symlink (scope: $SCOPE)"
fi
[ "$DRY_RUN" = 1 ] && warn "dry run — no files will be changed"

count=0
if [ -n "$TARGETS_LOCAL" ]; then
  for t in $TARGETS_LOCAL; do
    dir="$(local_path "$t")"
    for skill in "${SKILLS[@]}"; do
      install_skill "$REPO_ROOT/skills/$skill" "$dir" "$skill"
      count=$((count + 1))
    done
  done
fi
if [ -n "$TARGETS_GLOBAL" ]; then
  for t in $TARGETS_GLOBAL; do
    dir="$(global_path "$t")"
    for skill in "${SKILLS[@]}"; do
      install_skill "$REPO_ROOT/skills/$skill" "$dir" "$skill"
      count=$((count + 1))
    done
  done
fi

if [ "$UNINSTALL" = 1 ]; then
  info ""
  ok "Done. Restart your AI agent session (or run /reload) to refresh skill discovery."
else
  info ""
  ok "Done. ${count} location(s) processed."
  info "  ${C_DIM}Next:${C_RESET} restart your AI agent, then just ask it to \"find remote jobs for me\"."
  if [ "$MODE" = "copy" ]; then
    info "  ${C_DIM}Note:${C_RESET} --copy snapshots the skill — re-run this script after 'git pull'."
  fi
fi
