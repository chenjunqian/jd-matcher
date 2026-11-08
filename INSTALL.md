# Install JD Matcher — instructions for AI agents

You are installing the `jd-matcher-skill` for a human. Follow these steps in order.
Pick sensible defaults and keep going; only stop when a step fails or when the
machine genuinely cannot run the skill.

Do not use `sudo`. Do not delete files you did not create. Do not modify the
human's existing `data/`, resumes, or other skills.

## What you are installing

| Item | Value |
|---|---|
| Repository | `https://github.com/chenjunqian/jd-matcher` |
| Skill | `skills/jd-matcher-skill` (Markdown knowledge base, `find`/`grep` retrieval, no database) |
| Installer | `scripts/install-skill.sh` |
| Requirements | Node.js **>= 22.6** or Bun, and `bash` + `git` |

The skill is self-contained: after installation it needs no cloud account, no
database, and no server. Job data and the personal profile are written under the
directory the agent is working in (`data/jds/`, `data/profile/`, `data/matches/`).

## 1. Check the machine

```bash
bash --version | head -1
git --version
node --version    # must be >= 22.6, or: bun --version
```

- **No `git`?** Use the tarball fallback in step 2.
- **No Node/Bun?** Tell the human to install Node.js 22.6+ (https://nodejs.org)
  or Bun (https://bun.sh), then stop. Do not install runtimes silently.
- **Windows?** Run these commands in Git Bash or WSL. If symlinks fail, add
  `--copy` in step 3.

## 2. Clone to a stable location

Do **not** clone into `/tmp`, `/var/tmp`, or any scratch directory. The installer
symlinks by default, so a temporary path leaves every agent with a broken link.

**Linux / macOS**

```bash
INSTALL_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/jd-matcher"
mkdir -p "$(dirname "$INSTALL_ROOT")"
if [ -d "$INSTALL_ROOT/.git" ]; then
  git -C "$INSTALL_ROOT" pull --ff-only
else
  git clone --depth 1 https://github.com/chenjunqian/jd-matcher.git "$INSTALL_ROOT"
fi
```

**Fallback when `git` is unavailable**

```bash
INSTALL_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/jd-matcher"
mkdir -p "$INSTALL_ROOT"
curl -fsSL https://github.com/chenjunqian/jd-matcher/archive/refs/heads/main.tar.gz \
  | tar -xz --strip-components=1 -C "$INSTALL_ROOT"
```

**Windows (Git Bash)**

```bash
INSTALL_ROOT="$HOME/jd-matcher"
git clone --depth 1 https://github.com/chenjunqian/jd-matcher.git "$INSTALL_ROOT"
```

If `INSTALL_ROOT` already exists and is not this repository, stop and ask the
human before overwriting anything.

## 3. Install for every agent

```bash
cd "$INSTALL_ROOT"
bash scripts/install-skill.sh --scope global --target all
```

Why both flags:

- `--scope global` is required. Without it, and without a TTY, the installer
  falls back to the current project only.
- `--target all` writes every supported user-level agent directory, so the skill
  is discovered whichever agent the human opens next: `~/.agents/skills`,
  `~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`, `~/.gemini/skills`,
  `~/.gemini/config/skills`, `~/.config/opencode/skills`, `~/.pi/agent/skills`.

If symlinks are unsupported (some Windows setups, read-only homes, cloud
sandboxes):

```bash
bash scripts/install-skill.sh --scope global --target all --copy
```

`--copy` snapshots the skill; updates then require re-running the installer.
Prefer symlinks when the install root is stable so `git pull` updates every agent.

### If a destination is skipped

The installer never overwrites a skill it did not create. If it prints
`skipped ... already exists`:

- Keep it if the existing entry is a symlink into `$INSTALL_ROOT` or contains a
  `.installed-by-jd-matcher` marker (that is a previous install you can refresh
  with `--force`).
- Otherwise leave it untouched and report the conflict to the human.

## 4. Verify

```bash
cd "$INSTALL_ROOT"
bash scripts/install-skill.sh --list
```

Then confirm at least one target contains a readable `SKILL.md`:

```bash
for p in "$HOME/.agents/skills" "$HOME/.claude/skills" "$HOME/.codex/skills" \
         "$HOME/.cursor/skills" "$HOME/.gemini/skills" \
         "$HOME/.gemini/config/skills" "$HOME/.config/opencode/skills" \
         "$HOME/.pi/agent/skills"; do
  [ -f "$p/jd-matcher-skill/SKILL.md" ] && echo "ok: $p"
done
```

At least one `ok:` line must appear. If none does, re-run step 3 with `--copy`
and check that `$HOME` is the same user the agent runs as.

## 5. Tell the human

Report, in the human's language:

1. **Where it was installed** (`$INSTALL_ROOT`).
2. **Restart the agent session** (or run `/reload`) so the skill is discovered —
   skills are scanned at session start.
3. **How to start**: just ask “find remote jobs and match them to my resume”.
4. **First run**: the agent asks for a resume and job expectations, then writes
   `data/profile/resume.md` and `data/profile/expectations.md` in the working
   directory. Tell them this is local and git-ignored.
5. **Updating later**: `git -C "$INSTALL_ROOT" pull --ff-only` (symlink installs
   pick it up immediately; `--copy` installs need step 3 again).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `git clone` fails / no network | Use the tarball fallback in step 2, or ask the human to download the ZIP from GitHub |
| `node: command not found` | Install Node.js 22.6+ or Bun, then retry |
| `ln: operation not supported` | Re-run step 3 with `--copy` |
| Skill not discovered after install | Check the agent's skill directory in the table from step 3; restart the session |
| `skipped ... already exists` | See “If a destination is skipped” above |
| Permission denied on `$HOME` | Use `INSTALL_ROOT="$HOME/jd-matcher"` and `--copy` |
| Agent cannot run shell commands | Installation must happen on the human's machine. Ask them to open a desktop agent (Claude Code, Codex, Cursor, pi) or run Option B in the README |

## What not to do

- Do not `pip install`, `npm install -g`, or otherwise add dependencies — the
  skill runs directly from the repo with Node/Bun.
- Do not copy the skill into the human's project `.agents/skills` unless they ask
  for a project-local install; global install is the default for this prompt.
- Do not run the skill's crawl or match scripts during installation. Installation
  only registers the skill.
