# reveal-paths

A Claude Code mod for the **Claude desktop app** on Windows. When a reply names a file that exists, such as `C:\Users\me\notes.txt`, a backticked relative path, or a markdown link like `[pc.md](reference/pc.md)`, the path becomes a link. Clicking it opens File Explorer with that file selected (`explorer.exe /select,<path>`). From there, right-click gives Windows' usual menu: Open, Copy as path, and the rest.

- A plain click never opens or runs anything: it's always a reveal.
- Under a reply that names a `.cmd` or `.bat` file, a line `⚙ name · right-click for run options` appears. Right-click it for: Run, Run as admin (Windows asks first), Run in PowerShell, Run in Claude's terminal (puts the request in the prompt box; you press Enter), Open Claude CLI here (Windows Terminal in the file's folder).
- Paths reach PowerShell only through environment variables, never in the command text.
- Network paths and names with characters Explorer or cmd.exe would misread are refused.
- In the terminal it does nothing, so it doesn't clash with open-paths there.

## Install

Needs Windows, the Claude desktop app (Code tab), and PowerShell 7 (`pwsh`) and Windows Terminal for the PowerShell and Claude CLI options.

At the prompt of a Claude Code terminal session:

```text
/plugin install reveal-paths --marketplace CodeZooZoo/reveal-paths
```

Answer `y` to add the marketplace, then pick the user scope. From a shell:

```bash
claude plugin install reveal-paths --marketplace CodeZooZoo/reveal-paths
```

In the desktop app, where `/plugin` doesn't run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `CodeZooZoo/reveal-paths`, then **Add plugin**. It works in new desktop sessions.

## Credits

Path finding (`hooks/paths.ts`) is copied unchanged from [open-paths](https://github.com/kiankhooban/open-paths) v0.2.0, MIT License.
