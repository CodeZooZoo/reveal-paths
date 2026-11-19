<p align="center"><img src=".claude-plugin/icon.png" width="96" alt="reveal-paths icon"></p>

# reveal-paths

**A Claude Code mod for the Claude desktop app on Windows: click a file path in a reply and File Explorer opens with that file selected. Right-click a `.cmd` or `.bat` for a run menu.**

Claude writes `C:\Users\me\notes.txt`, a backticked relative path, or a markdown link like `[pc.md](reference/pc.md)`. With reveal-paths, every one of those that exists on disk becomes a link. Click it and Explorer opens with the file highlighted. Right-click it there for Windows' own menu: Open with, Copy as path, Properties and the rest.

When a reply names a `.cmd` or `.bat` file, a line appears under it:

```text
⚙ build.cmd  ·  right-click for run options
```

Right-click it for:

| Option | What it does |
|---|---|
| **Run** | Runs it in a Command Prompt window that stays open |
| **Run as admin** | Windows asks first (UAC), then runs it elevated |
| **Run in PowerShell** | Runs it in a PowerShell 7 window that stays open |
| **Run in Claude's terminal** | Puts the request in the prompt box; press Enter and Claude runs it in the Terminal panel |
| **Open Claude CLI here** | Opens Windows Terminal in the file's folder with `claude` running |

## Install

Needs Windows and the Claude desktop app (Code tab). The PowerShell and Claude CLI options also need PowerShell 7 (`pwsh`) and Windows Terminal.

At the prompt of a Claude Code terminal session:

```text
/plugin install reveal-paths --marketplace CodeZooZoo/reveal-paths
```

Answer `y` to add the marketplace, then pick the user scope. From a shell:

```bash
claude plugin install reveal-paths --marketplace CodeZooZoo/reveal-paths
```

In the desktop app, where `/plugin` doesn't run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `CodeZooZoo/reveal-paths`, then **Add plugin**. It works in new desktop sessions.

## Safety

Claude's replies can be steered by text it reads, so every path in a reply is treated as untrusted:

- **A plain click never opens or runs anything.** It only shows the file in Explorer.
- **Running needs two deliberate clicks** (right-click, then an option), and only for a `.cmd` or `.bat` file that exists, checked again at the moment you click. "Run as admin" also goes through Windows' own UAC prompt.
- **No injection.** The file's path reaches PowerShell only through an environment variable, never inside the command text. Names holding characters `cmd.exe`, Explorer or Windows Terminal would re-read (`& | < > ^ % ! " , ;`) are refused.
- **No network paths.** `\\server\share` paths are never linked: opening one can send your Windows credentials to that host.
- **Sends nothing.** The mod makes no network calls and reads no environment variables, credentials or file contents.

## What it reads, runs and sends

**Hooks** (`hooks/register.tsx`):

| Hook | What it does |
|---|---|
| `ui.render` on `AssistantMessage` (desktop surface only) | Finds paths in a reply, checks they exist with `$.fs.stat`, and redraws the reply as a `Markdown` whose links the mod answers (`onLinkPress`). The stored conversation is not changed. Adds a `Client` region per `.cmd`/`.bat` file. |
| `ui.message` | Receives the option picked in a `.cmd` menu, re-checks the file, and runs it. |

The `.cmd` menu is a `Client` surface module (`hooks/cmd-menu.tsx`) that opens on a right-click via `surface.onPointer` and posts the choice back with `surface.post`.

**Runs** (`$.process.run`, by argument vector, no shell), only on your click:

| Program | When |
|---|---|
| `powershell.exe -Command Start-Process explorer.exe /select,<file>` | a click on a path (PowerShell asks for a visible window; a direct `explorer.exe` call from Claude opens hidden) |
| `powershell.exe -Command Start-Process cmd.exe /k <file>` | Run, and Run as admin (`-Verb RunAs`) |
| `powershell.exe -Command Start-Process pwsh.exe -NoExit -Command & <file>` | Run in PowerShell |
| `powershell.exe -Command Start-Process wt.exe -d <folder> pwsh -NoExit -Command claude` | Open Claude CLI here |

"Run in Claude's terminal" runs nothing itself: it fills the prompt box (`$.prompt.fill`) and you decide whether to send it.

**Reads:** file metadata only (does the path exist, is it a file or folder, where a link leads) and the session's working directory. **Stores:** nothing.

In the terminal the mod does nothing; for terminal sessions see [open-paths](https://github.com/kiankhooban/open-paths).

## Credits

Path finding (`hooks/paths.ts`) is copied unchanged from [open-paths](https://github.com/kiankhooban/open-paths) v0.2.0 by Kian Khooban, MIT License.

## License

MIT
