import { useEffect, useState } from 'react'

export function Screenshot({ shotRef, alt }: { shotRef: string; alt: string }): React.JSX.Element {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    window.ghost.recordings
      .getScreenshot(shotRef)
      .then((dataUrl) => {
        if (live) setSrc(dataUrl)
      })
      .catch(() => {
        if (live) setSrc(null)
      })
    return () => {
      live = false
    }
  }, [shotRef])
  if (src === null) {
    return <span className="muted">Screenshot unavailable</span>
  }
  return <img src={src} alt={alt} className="shot-thumb" />
}
