import { BrowserWindow, dialog } from 'electron'
import { getRecorder } from '../recorder/service'
import { openStudioForRecording } from './registry'
import { baseWebPreferences, loadPage } from './shared'

/** Compact draggable recording toolbar, ~480x64 logical pixels. */
export function createToolbarWindow(position?: { x: number; y: number }): BrowserWindow {
  const window = new BrowserWindow({
    title: 'Ghost Operator',
    width: 480,
    height: 64,
    useContentSize: true,
    x: position?.x,
    y: position?.y,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    webPreferences: baseWebPreferences(),
    show: false
  })
  window.once('ready-to-show', () => window.show())
  loadPage(window, 'toolbar')

  let forceClose = false
  window.on('close', (event) => {
    if (forceClose) return
    if (getRecorder().getPush().status === 'idle') return
    event.preventDefault()
    void dialog
      .showMessageBox(window, {
        type: 'warning',
        title: 'Recording in progress',
        message: 'A recording is in progress. Finish it or discard it?',
        buttons: ['Finish recording', 'Discard', 'Keep recording'],
        defaultId: 2,
        cancelId: 2
      })
      .then(({ response }) => {
        if (response === 2) return
        const recorder = getRecorder()
        const done =
          response === 0
            ? recorder.finish().then((recording) => openStudioForRecording(recording.id))
            : Promise.resolve(recorder.cancel())
        void done.then(() => {
          forceClose = true
          window.close()
        })
      })
  })

  return window
}
