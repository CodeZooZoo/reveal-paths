// reveal-paths: in the Claude desktop app, a file path in a reply becomes a link; a click opens
// File Explorer with that file selected (explorer.exe /select,<path>). Nothing is ever opened or run.
// The terminal is left to open-paths, so the two never draw the same reply.

import type { Register, EngineInterface } from 'claude-code'

import { applyEdits, escapeMd, findRefs, homeOf, hrefOf, linkOf, resolvePath } from './paths'
import type { Ctx, Ref } from './paths'

type Found = { kind: 'file' | 'dir'; real: string }

const HIT_MS = 60_000
const MISS_MS = 5_000
const STAT_TIMEOUT_MS = 300
const MAX_PROBES = 64
const cache = new Map<string, { found: Found | null; at: number }>()
let home: string | undefined

/** Characters cmd.exe re-parses, and Explorer's switch separator: a path holding one is refused. */
const UNSAFE = /[&|<>^%!"\r\n,;]/ // `;` too: Windows Terminal splits its command line on it
const isNetwork = (p: string) => /^(\/\/|\\\\)/.test(p)
/** A markdown link: [label](target "title"). */
const MD_LINK = /\[([^\]\n]*)\]\(<?([^)\s>]+)>?(?:\s+"[^"\n]*")?\)/g
/** A URL scheme, but not a Windows drive letter (C:). */
const SCHEME = /^[a-z][a-z0-9+.-]+:/i

// How each .cmd menu choice starts, as PowerShell run with a visible window. The file's path and
// folder arrive only as environment variables, never in the command text, so a name cannot inject.
// Windows PowerShell 5.1 joins -ArgumentList with spaces, so each path is quoted here.
const Q = `('"' + $env:REVEAL_PATHS_TARGET + '"')`
const QD = `('"' + $env:REVEAL_PATHS_DIR + '"')`
const RUNNERS = {
  run: `Start-Process -FilePath cmd.exe -ArgumentList '/k', ${Q} -WorkingDirectory $env:REVEAL_PATHS_DIR -WindowStyle Normal`,
  admin: `Start-Process -FilePath cmd.exe -ArgumentList '/k', ${Q} -Verb RunAs -WindowStyle Normal`,
  powershell: `$p = $env:REVEAL_PATHS_TARGET -replace "'", "''"; Start-Process -FilePath pwsh.exe -ArgumentList '-NoExit', '-Command', ("& '" + $p + "'") -WorkingDirectory $env:REVEAL_PATHS_DIR -WindowStyle Normal`,
  cli: `Start-Process -FilePath wt.exe -ArgumentList '-d', ${QD}, 'pwsh.exe', '-NoExit', '-Command', 'claude' -WindowStyle Normal`,
  sidebar: '',
} as const
const LABELS: Record<string, string> = {
  run: 'Running',
  admin: 'Asking Windows to run as admin',
  powershell: 'Running in PowerShell',
  cli: 'Opening Claude CLI in the folder of',
}

async function statOf($: EngineInterface, abs: string): Promise<Found | null> {
  let timer: { cancel(): void } | undefined
  const late = new Promise<undefined>(done => {
    timer = $.clock.after(STAT_TIMEOUT_MS, () => done(undefined))
  })
  const st = await Promise.race([$.fs.stat(abs, { resolve: true }).catch(() => undefined), late])
  timer?.cancel()
  const kind = st?.kind === 'file' ? 'file' : st?.kind === 'dir' ? 'dir' : null
  const real = st?.realPath?.replace(/\\/g, '/')
  return kind && real && !isNetwork(real) ? { kind, real } : null
}

async function lookUp($: EngineInterface, paths: string[]): Promise<void> {
  const now = await $.clock.now()
  const stale = [...new Set(paths)].filter(p => {
    const c = cache.get(p)
    return !c || now - c.at > (c.found ? HIT_MS : MISS_MS)
  })
  await Promise.all(
    stale.slice(0, MAX_PROBES).map(async p => {
      const found = await statOf($, p)
      cache.delete(p)
      cache.set(p, { found, at: now })
    }),
  )
  if (cache.size > 2000) for (const k of [...cache.keys()].slice(0, cache.size - 2000)) cache.delete(k)
}

async function ctxOf($: EngineInterface): Promise<Ctx> {
  const cwd = (await $.session.cwd().catch(() => undefined))?.replace(/\\/g, '/')
  if (home === undefined) home = homeOf($.plugin.root, cwd) ?? ''
  return { home: home || undefined, cwd }
}

/** A markdown link's target as a local path: `../a.md`, `src/x.ts:42`, `C:\x`, `file:///C:/x`. */
function linkTarget(href: string): string | undefined {
  if (href.startsWith('#')) return undefined
  let p = href
  if (/^file:\/\//i.test(p)) p = p.replace(/^file:\/\/\/?/i, '')
  else if (SCHEME.test(p) && !/^[A-Za-z]:[\\/]/.test(p)) return undefined
  try {
    p = decodeURIComponent(p)
  } catch {
    return undefined
  }
  return p.replace(/#.*$/, '').replace(/:\d+(?::\d+|-\d+)?$/, '') || undefined
}

function targetOf(href: string): string | undefined {
  const m = /^file:\/\/([^#]*)/.exec(href)
  if (!m) return undefined
  try {
    return decodeURIComponent(m[1]!).replace(/^\/([A-Za-z]:\/)/, '$1')
  } catch {
    return undefined
  }
}

async function reveal($: EngineInterface, href: string): Promise<void> {
  const abs = targetOf(href)
  const found = abs ? await statOf($, abs) : null
  if (!found) {
    $.ui.toast(`reveal-paths: could not find ${abs ?? href}`)
    return
  }
  const win = found.real.replace(/\//g, '\\')
  if (UNSAFE.test(win)) {
    $.ui.toast('reveal-paths: not showing it, its name holds characters Explorer would misread')
    return
  }
  const name = win.slice(win.lastIndexOf('\\') + 1)
  // The engine starts processes hidden, and Explorer passes that on: its window opens invisible.
  // PowerShell's Start-Process asks for a normal window instead. The path goes in an environment
  // variable, never into the command text, so nothing in a file name can be run.
  const res = await $.process
    .run(
      [
        'powershell.exe',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Start-Process -FilePath "$env:WINDIR\\explorer.exe" -ArgumentList ('/select,"' + $env:REVEAL_PATHS_TARGET + '"') -WindowStyle Normal`,
      ],
      { timeoutMs: 15_000, env: { REVEAL_PATHS_TARGET: win } },
    )
    .catch((err: unknown) => ({ exitCode: -1, stdout: '', stderr: String(err) }))
  $.ui.toast(
    res.exitCode === 0
      ? `Showing ${name} in File Explorer`
      : `reveal-paths: Explorer failed (exit ${res.exitCode}): ${res.stderr.trim().slice(0, 160)}`,
  )
}

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.isSummary) return next(e)
    const text = e.props.text
    const ctx = await ctxOf($)

    // 1. Markdown links to local files: [pc.md](../../reference/pc.md)
    const mdLinks: { start: number; end: number; label: string; abs: string }[] = []
    for (const m of text.matchAll(MD_LINK)) {
      const p = linkTarget(m[2]!)
      const abs = p ? resolvePath(p, ctx) : undefined
      if (abs) mdLinks.push({ start: m.index, end: m.index + m[0].length, label: m[1]!, abs })
    }
    // 2. Bare and backticked paths outside links and code blocks.
    const refs: { ref: Ref; abs: string }[] = []
    for (const ref of findRefs(text)) {
      const abs = resolvePath(ref.path, ctx)
      if (abs) refs.push({ ref, abs })
    }
    if (mdLinks.length === 0 && refs.length === 0) return next(e)

    await lookUp($, [...mdLinks.map(l => l.abs), ...refs.map(r => r.abs)])
    const real = (abs: string) => cache.get(abs)?.found?.real
    const edits: { start: number; end: number; text: string }[] = []
    const hrefs = new Set<string>()
    for (const l of mdLinks) {
      const r = real(l.abs)
      if (!r) continue
      const href = hrefOf(r)
      hrefs.add(href)
      edits.push({ start: l.start, end: l.end, text: `[${l.label}](${href})` })
    }
    for (const { ref, abs } of refs) {
      const r = real(abs)
      if (!r) continue
      const href = hrefOf(r, ref.line, ref.col)
      hrefs.add(href)
      // A link around `code` is taken over by the desktop app's own path handling (it opens its
      // file pane), so a backticked path is drawn as a plain link, backticks dropped.
      const label = ref.code ? escapeMd(ref.label.slice(1, -1)) : null
      edits.push({ start: ref.start, end: ref.end, text: label === null ? linkOf({ ref, href }) : `[${label}](${href})` })
    }
    // No local link resolved: keep the app's own drawing untouched.
    if (edits.length === 0) return next(e)

    const { Markdown, Box, Client } = $.ui.resolve(e)
    const md = (
      <Markdown
        key="reveal-paths"
        text={applyEdits(text, edits)}
        pressableLinks={[...hrefs].slice(0, 256)}
        onLinkPress={link => void reveal($, link.href)}
      />
    )
    const cmds = [...new Set([...mdLinks.map(l => real(l.abs)), ...refs.map(r => real(r.abs))])].filter(
      (p): p is string => !!p && /\.(cmd|bat)$/i.test(p),
    )
    if (cmds.length === 0 || !Client) return md
    return (
      <Box flexDirection="column">
        {md}
        {cmds.slice(0, 8).map(p => (
          <Client key={`cmd:${p}`} module="./cmd-menu.tsx" props={{ path: p }} />
        ))}
      </Box>
    )
  }).catch(($, e, next) => next(e)) // never in the way of a reply

  // A choice from a .cmd menu. The post is input from code, so everything is checked again here.
  on('ui.message', async ($, e) => {
    const d = e.data as { action?: unknown; path?: unknown } | null
    const action = typeof d?.action === 'string' ? d.action : ''
    if (!d || typeof d.path !== 'string' || !(action in RUNNERS)) return {}
    const found = await statOf($, d.path)
    if (!found || found.kind !== 'file' || !/\.(cmd|bat)$/i.test(found.real)) {
      $.ui.toast(`reveal-paths: not running it, ${d.path} is not an existing .cmd or .bat file`)
      return {}
    }
    const win = found.real.replace(/\//g, '\\')
    if (UNSAFE.test(win)) {
      $.ui.toast('reveal-paths: not running it, its name holds characters cmd.exe would misread')
      return {}
    }
    const name = win.slice(win.lastIndexOf('\\') + 1)
    if (action === 'sidebar') {
      // The terminal panel is Claude's to drive: the request goes in the prompt box, you press Enter.
      await $.prompt.fill({ text: `Run this in the Terminal panel (a new tab in its folder): "${win}"` })
      $.ui.toast(`Press Enter to have Claude run ${name} in its terminal`)
      return {}
    }
    const res = await $.process
      .run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', RUNNERS[action as keyof typeof RUNNERS]], {
        timeoutMs: 15_000,
        env: { REVEAL_PATHS_TARGET: win, REVEAL_PATHS_DIR: win.slice(0, win.lastIndexOf('\\')) },
      })
      .catch((err: unknown) => ({ exitCode: -1, stdout: '', stderr: String(err) }))
    $.ui.toast(
      res.exitCode === 0
        ? `${LABELS[action] ?? action}: ${name}`
        : `reveal-paths: could not start it (exit ${res.exitCode}): ${res.stderr.trim().slice(0, 160)}`,
    )
    return {}
  })
}
