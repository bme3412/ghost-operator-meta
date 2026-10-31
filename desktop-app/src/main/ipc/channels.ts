/** Renderer → main request channels (ipcRenderer.invoke). */
export const CHANNELS = {
  ping: 'ghost:ping',
  echo: 'ghost:echo',
  targetGetInfo: 'target:get-info',
  recorderGetState: 'recorder:get-state',
  recorderStart: 'recorder:start',
  recorderPause: 'recorder:pause',
  recorderResume: 'recorder:resume',
  recorderContext: 'recorder:context',
  recorderEvents: 'recorder:events',
  recorderNote: 'recorder:note',
  recorderFinish: 'recorder:finish',
  recorderCancel: 'recorder:cancel',
  toolbarSetHeight: 'toolbar:set-height',
  recordingsList: 'recordings:list',
  recordingsGet: 'recordings:get',
  recordingsScreenshot: 'recordings:screenshot',
  skillsList: 'skills:list',
  skillsGet: 'skills:get',
  skillsCompile: 'skills:compile',
  skillsSaveDraft: 'skills:save-draft',
  skillsUpdateDraft: 'skills:update-draft',
  skillsPublish: 'skills:publish',
  runsStart: 'runs:start',
  runsState: 'runs:state',
  runsPause: 'runs:pause',
  runsResume: 'runs:resume',
  runsStop: 'runs:stop',
  runsAdvance: 'runs:advance',
  runsApprove: 'runs:approve',
  runsRetry: 'runs:retry',
  runsExplain: 'runs:explain',
  runsShowTarget: 'runs:show-target',
  runsShowInStudio: 'runs:show-in-studio',
  runsList: 'runs:list',
  runsGet: 'runs:get'
} as const

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS]

/** Main → renderer push events (webContents.send). */
export const EVENTS = {
  highlight: 'ghost:highlight',
  recordingState: 'ghost:recording-state',
  studioShow: 'ghost:studio-show',
  runProgress: 'ghost:run-progress',
  libraryChanged: 'ghost:library-changed'
} as const

export type PushEvent = (typeof EVENTS)[keyof typeof EVENTS]
