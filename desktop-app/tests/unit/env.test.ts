import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadLocalEnv, parseEnvText } from '../../src/main/env'

describe('parseEnvText', () => {
  it('parses KEY=VALUE lines, skips blanks/comments/exports', () => {
    expect(
      parseEnvText(
        '# comment\n\nexport MODEL_API_KEY=abc123\nSPARK_MODEL=muse-spark-1.3\nEMPTY=\nNOEQUALS\n'
      )
    ).toEqual({ MODEL_API_KEY: 'abc123', SPARK_MODEL: 'muse-spark-1.3', EMPTY: '' })
  })

  it('keeps values containing = and strips matching quotes', () => {
    expect(parseEnvText('PADDED=ab==\nSINGLE=\'q v\'\nDOUBLE="q v"\n')).toEqual({
      PADDED: 'ab==',
      SINGLE: 'q v',
      DOUBLE: 'q v'
    })
  })
})

describe('loadLocalEnv', () => {
  function tempEnv(content: string): string {
    const file = join(mkdtempSync(join(tmpdir(), 'ghost-env-')), '.env.local')
    writeFileSync(file, content, 'utf8')
    return file
  }

  it('loads the first existing file without overriding set vars', () => {
    const file = tempEnv('MODEL_API_KEY=file-key\nSPARK_MODEL=file-model\n')
    const target: Record<string, string | undefined> = { SPARK_MODEL: 'env-model' }
    expect(loadLocalEnv(target, [join(tmpdir(), 'ghost-env-missing'), file])).toBe(file)
    expect(target).toEqual({ SPARK_MODEL: 'env-model', MODEL_API_KEY: 'file-key' })
  })

  it('returns null when no candidate exists', () => {
    const target: Record<string, string | undefined> = {}
    expect(loadLocalEnv(target, [join(tmpdir(), 'ghost-env-missing')])).toBeNull()
    expect(target).toEqual({})
  })
})
