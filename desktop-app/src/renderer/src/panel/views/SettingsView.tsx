import { useEffect, useState } from 'react'
import type { ProviderId } from '../../../../shared/schemas'
import { Button } from '../../components/Button'
import { friendlyError } from '../../lib/errors'

export function SettingsView(): React.JSX.Element {
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [urlBusy, setUrlBusy] = useState(false)
  const [urlSaved, setUrlSaved] = useState(false)
  const [provider, setProvider] = useState<ProviderId | null>(null)
  const [providerFailed, setProviderFailed] = useState(false)

  useEffect(() => {
    window.ghost.target
      .getInfo()
      .then((info) => setUrlInput(info.url))
      .catch((err: unknown) => setUrlError(friendlyError(err)))
    window.ghost.providers
      .getDefault()
      .then(setProvider)
      .catch(() => setProviderFailed(true))
  }, [])

  const applyUrl = (): void => {
    const trimmed = urlInput.trim()
    if (!trimmed) {
      setUrlError('Enter a target URL — e.g. http://localhost:3000.')
      return
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      setUrlError('URL must start with http:// or https://.')
      return
    }
    setUrlBusy(true)
    setUrlError(null)
    setUrlSaved(false)
    window.ghost.target
      .setUrl(trimmed)
      .then((info) => {
        setUrlInput(info.url)
        setUrlSaved(true)
      })
      .catch((err: unknown) => setUrlError(friendlyError(err)))
      .finally(() => setUrlBusy(false))
  }

  return (
    <div>
      <section className="card" aria-label="Website">
        <h2>Website</h2>
        <p className="muted">The site Muse for SMB learns from and works in.</p>
        <div className="field">
          <label htmlFor="settings-url">Site URL</label>
          <input
            id="settings-url"
            data-testid="settings-url"
            data-semid="settings-url"
            type="text"
            value={urlInput}
            spellCheck={false}
            onChange={(event) => {
              setUrlInput(event.target.value)
              if (urlError !== null) setUrlError(null)
            }}
          />
          <Button
            data-testid="settings-url-apply"
            data-semid="settings-url-apply"
            disabled={urlBusy}
            onClick={applyUrl}
          >
            Apply
          </Button>
        </div>
        {urlError !== null && (
          <p className="teach-hint" role="alert">
            {urlError}
          </p>
        )}
        {urlSaved && (
          <p className="alert-success" role="status">
            Website updated.
          </p>
        )}
      </section>
      <section className="card" aria-label="AI mode">
        <h2>AI mode</h2>
        {provider === null ? (
          providerFailed ? (
            <p className="alert-error" role="alert">
              Could not determine the AI mode.
            </p>
          ) : (
            <p className="muted">Checking…</p>
          )
        ) : (
          <p data-testid="settings-ai-mode" data-semid="settings-ai-mode">
            {provider === 'meta' ? (
              <>
                <strong>AI: Meta</strong>
                <span className="muted"> — drafts and explanations use the Meta model.</span>
              </>
            ) : (
              <>
                <strong>Offline demo mode</strong>
                <span className="muted">
                  {' '}
                  — drafts use the built-in deterministic procedure. Set MODEL_API_KEY and
                  relaunch for Meta.
                </span>
              </>
            )}
          </p>
        )}
      </section>
    </div>
  )
}
