import { useEffect, useState } from 'react'

/** Proves the preload IPC bridge is wired on every page. */
export function IpcStatus(): React.JSX.Element {
  const [status, setStatus] = useState('checking…')
  useEffect(() => {
    window.ghost
      .ping()
      .then((pong) => setStatus(pong))
      .catch((error: unknown) => setStatus(`error: ${String(error)}`))
  }, [])
  return (
    <p className="muted" data-testid="ipc-status">
      <span className={status === 'pong' ? 'dot dot-ok' : 'dot'} /> IPC: {status}
    </p>
  )
}
