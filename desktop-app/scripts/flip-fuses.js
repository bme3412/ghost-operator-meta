// electron-builder afterPack hook: pin Electron fuses for the packaged app.
// RunAsNode off (no NODE_OPTIONS/codegen escape hatch) and
// GrantFileProtocolExtraPrivileges off (file:// pages get no extra power).
// Invoked as `pnpm dist` / `pnpm dist:dir`; throws loudly on failure.
const path = require('node:path')
const { flipFuses, FuseVersion, FuseV1Options, FuseState } = require('@electron/fuses')

module.exports = async function flipFusesAfterPack(context) {
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  )
  // eslint-disable-next-line no-console
  console.log(`[flip-fuses] pinning fuses for ${appPath}`)
  await flipFuses(appPath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: FuseState.DISABLE,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: FuseState.DISABLE
  })
}
