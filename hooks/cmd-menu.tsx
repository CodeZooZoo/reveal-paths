// One .cmd/.bat file under a reply: a line that opens a menu of ways to run it on right-click
// (or left-click). A choice is posted to the hooks module, which checks it and runs it.
import type { ClientModule } from 'claude-code'

type Props = { path: string }
type State = { open: boolean }

export const ACTIONS = [
  ['run', 'Run'],
  ['admin', 'Run as admin'],
  ['powershell', 'Run in PowerShell'],
  ['sidebar', "Run in Claude's terminal"],
  ['cli', 'Open Claude CLI here'],
] as const

const CmdMenu: ClientModule<Props, State> = (props, s) => {
  const { Box, Text, Button } = s.elements
  const open = s.state?.open ?? false
  const name = props.path.slice(props.path.replace(/\\/g, '/').lastIndexOf('/') + 1)

  s.onPointer(ev => {
    // Only the closed line toggles: with the menu open, its buttons take the clicks.
    if (ev.type === 'down' && !open && ev.y === 0) s.setState({ open: true })
  })

  const choose = (action: string) => {
    s.post({ action, path: props.path })
    s.setState({ open: false })
  }

  if (!open) return <Text dimColor>{`⚙ ${name}  ·  right-click for run options`}</Text>
  return (
    <Box flexDirection="column">
      <Text dimColor>{`⚙ ${props.path}`}</Text>
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {ACTIONS.map(([id, label]) => (
          <Button key={id} label={label} onPress={() => choose(id)} />
        ))}
        <Button key="cancel" label="Cancel" dimColor onPress={() => s.setState({ open: false })} />
      </Box>
    </Box>
  )
}

export default CmdMenu
