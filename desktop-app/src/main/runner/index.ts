import type {
  CheckResult,
  ExecutionStatus,
  RunMode,
  RunProgress,
  RunRecord,
  RunStepView,
  SkillRecipe,
  SkillStep,
  StartRunRequest
} from '../../shared/schemas'
import { evaluateCheck, resolvePlaceholders, type DomQuery } from './checks'
import {
  executeComputerTask,
  resolveBindings,
  selectorForStep,
  type DomAct
} from './operations'
import { waitForStepChecks } from './wait'

export interface RunnerDeps {
  now: () => number
  tick: () => Promise<void>
  getSkillVersion: (skillId: string, version: number | null) => {
    skillName: string
    recipe: SkillRecipe
  } | null
  domQuery: DomQuery
  domAct: DomAct
  persistRun: (record: RunRecord) => void
  onProgress: (progress: RunProgress | null) => void
  highlight: (selector: string | null) => void
  /** Overrideable sleep for check waits; defaults to a setTimeout sleep. */
  sleep?: (ms: number) => Promise<void>
  /** Override the bounded check-wait budget; defaults live in ./wait. */
  checkWait?: { timeoutMs?: number; pollMs?: number }
}

interface ActiveRun {
  record: RunRecord
  recipe: SkillRecipe
  skillName: string
}

const TERMINAL: ReadonlySet<ExecutionStatus> = new Set([
  'succeeded',
  'failed',
  'cancelled'
])

/** Explicit execution state machine. One active run at a time. */
export function createRunner(deps: RunnerDeps): {
  getProgress: () => RunProgress | null
  startRun: (request: StartRunRequest) => RunProgress
  pauseRun: (runId: string) => RunProgress
  resumeRun: (runId: string) => RunProgress
  stopRun: (runId: string) => RunProgress
  advanceRun: (runId: string) => Promise<RunProgress>
  approveRun: (runId: string) => RunProgress
  retryRun: (runId: string) => Promise<RunProgress>
} {
  let active: ActiveRun | null = null
  let counter = 0

  function stepView(
    step: SkillStep,
    index: number,
    currentIndex: number,
    inputs: Record<string, string>
  ): RunStepView {
    const bindings: Record<string, { path: string; value: string }> = {}
    for (const [name, template] of Object.entries(step.bindings)) {
      let value: string
      try {
        value = resolvePlaceholders(template, inputs)
      } catch {
        value = '(missing input)'
      }
      bindings[name] = { path: template, value }
    }
    return {
      index,
      id: step.id,
      kind: step.kind,
      goal: step.goal,
      why: step.why,
      expected: step.expected,
      bindings,
      checks: step.checks.map((c) => c.name),
      status: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo'
    }
  }

  function progress(): RunProgress | null {
    if (!active) return null
    const { record, recipe, skillName } = active
    const steps = recipe.steps.map((step, index) =>
      stepView(step, index, record.currentStepIndex, record.inputs)
    )
    return {
      runId: record.id,
      skillId: record.skillId,
      skillName,
      skillVersion: record.skillVersion,
      mode: record.mode,
      status: record.status,
      inputs: record.inputs,
      current: steps[record.currentStepIndex] ?? null,
      steps,
      checks: record.checks,
      awaitingApproval: record.awaitingApproval,
      error: record.error
    }
  }

  function commit(): RunProgress {
    if (!active) throw new Error('No active run.')
    deps.persistRun(active.record)
    const next = progress()
    if (!next) throw new Error('No active run.')
    deps.onProgress(next)
    return next
  }

  function requireActive(runId: string): ActiveRun {
    if (!active || active.record.id !== runId) {
      throw new Error(`No active run ${runId}.`)
    }
    if (TERMINAL.has(active.record.status)) {
      throw new Error(`Run ${runId} already ended (${active.record.status}).`)
    }
    return active
  }

  function currentStep(run: ActiveRun): SkillStep {
    const step = run.recipe.steps[run.record.currentStepIndex]
    if (!step) throw new Error('Run has no current step.')
    return step
  }

  async function evaluateStepChecks(run: ActiveRun, step: SkillStep): Promise<CheckResult[]> {
    // Wait-for-condition replaces blind settling: give the page a bounded
    // window to render the check targets after the step's action, then
    // evaluate honestly whether or not they appeared.
    await waitForStepChecks(step.checks, run.record.inputs, deps.domQuery, {
      timeoutMs: deps.checkWait?.timeoutMs,
      pollMs: deps.checkWait?.pollMs,
      sleep: deps.sleep
    })
    const nowMs = deps.now()
    const results: CheckResult[] = []
    for (const ref of step.checks) {
      results.push(await evaluateCheck(ref, { inputs: run.record.inputs, nowMs, dom: deps.domQuery }))
    }
    return results
  }

  function finishTerminal(run: ActiveRun, status: ExecutionStatus, error?: string): RunProgress {
    run.record.status = status
    run.record.endedAt = new Date(deps.now()).toISOString()
    run.record.awaitingApproval = false
    if (error !== undefined) run.record.error = error
    deps.highlight(null)
    return commit()
  }

  /** Advance past a completed step; finishes the run when steps run out. */
  function advanceIndex(run: ActiveRun): RunProgress | null {
    run.record.currentStepIndex += 1
    if (run.record.currentStepIndex >= run.recipe.steps.length) {
      return finishTerminal(run, 'succeeded')
    }
    deps.highlight(selectorForStep(currentStep(run), run.record.inputs))
    return commit()
  }

  async function executeAssistedStep(run: ActiveRun, step: SkillStep): Promise<void> {
    const attemptIndex = run.record.attempts.filter((a) => a.stepId === step.id).length
    if (step.kind === 'review') {
      run.record.awaitingApproval = true
      run.record.status = 'paused'
      run.record.attempts.push({
        runId: run.record.id,
        stepId: step.id,
        attempt: attemptIndex,
        actions: ['awaiting user approval'],
        observedOutcome: step.goal ?? 'Review requested.',
        passed: undefined
      })
      deps.highlight(selectorForStep(step, run.record.inputs))
      commit()
      return
    }

    let actions: string[]
    let observed: string
    if (step.kind === 'computer_task') {
      const outcome = await executeComputerTask(step, run.record.inputs, { act: deps.domAct })
      actions = outcome.actions
      observed = outcome.observed
      deps.highlight(outcome.highlight)
    } else if (step.kind === 'read_source' || step.kind === 'transform') {
      const resolved = resolveBindings(step, run.record.inputs)
      actions = Object.entries(resolved).map(([name, value]) => `${name}=${value}`)
      observed = step.goal ?? `Resolved ${actions.length} binding(s).`
      deps.highlight(selectorForStep(step, run.record.inputs))
    } else if (step.kind === 'verify') {
      actions = ['evaluated checks']
      observed = step.goal ?? 'Evaluated checks.'
    } else {
      throw new Error(`Unsupported step kind "${step.kind as string}".`)
    }

    const checkResults = await evaluateStepChecks(run, step)
    const failed = checkResults.filter((c) => !c.passed)
    run.record.attempts.push({
      runId: run.record.id,
      stepId: step.id,
      attempt: attemptIndex,
      actions,
      observedOutcome: observed,
      passed: failed.length === 0
    })
    run.record.checks.push(...checkResults)
    if (failed.length > 0) {
      throw new Error(
        `Check(s) failed on step "${step.id}": ${failed.map((c) => `${c.check} (${c.observed})`).join('; ')}`
      )
    }
  }

  async function assistedLoop(run: ActiveRun): Promise<void> {
    while (
      active === run &&
      run.record.status === 'running' &&
      !run.record.awaitingApproval &&
      run.record.currentStepIndex < run.recipe.steps.length
    ) {
      await deps.tick()
      if (active !== run || run.record.status !== 'running' || run.record.awaitingApproval) {
        return
      }
      try {
        const step = currentStep(run)
        await executeAssistedStep(run, step)
        if (run.record.awaitingApproval) return
        const done = advanceIndex(run)
        if (done && TERMINAL.has(done.status)) return
      } catch (error) {
        finishTerminal(run, 'failed', (error as Error).message)
        return
      }
    }
  }

  return {
    getProgress: progress,

    startRun(request: StartRunRequest): RunProgress {
      if (active && !TERMINAL.has(active.record.status)) {
        throw new Error(`Run ${active.record.id} is still ${active.record.status}.`)
      }
      const found = deps.getSkillVersion(request.skillId, request.version ?? null)
      if (!found) {
        throw new Error(`No published version found for skill ${request.skillId}.`)
      }
      if (found.recipe.steps.length === 0) {
        throw new Error('Skill has no steps.')
      }
      const startedAtMs = deps.now()
      counter += 1
      const mode: RunMode = request.mode
      active = {
        recipe: found.recipe,
        skillName: found.skillName,
        record: {
          id: `run-${startedAtMs}-${counter}`,
          skillId: request.skillId,
          skillVersion: found.recipe.version,
          mode,
          inputs: request.inputs,
          status: 'running',
          startedAt: new Date(startedAtMs).toISOString(),
          currentStepIndex: 0,
          attempts: [],
          checks: [],
          awaitingApproval: false
        }
      }
      deps.highlight(selectorForStep(currentStep(active), active.record.inputs))
      const first = commit()
      if (mode === 'assisted') {
        void assistedLoop(active)
      }
      return first
    },

    pauseRun(runId: string): RunProgress {
      const run = requireActive(runId)
      if (run.record.status !== 'running') {
        throw new Error(`Cannot pause a ${run.record.status} run.`)
      }
      run.record.status = 'paused'
      return commit()
    },

    resumeRun(runId: string): RunProgress {
      const run = requireActive(runId)
      if (run.record.status !== 'paused') {
        throw new Error(`Cannot resume a ${run.record.status} run.`)
      }
      if (run.record.awaitingApproval) {
        throw new Error('Run is awaiting approval; approve or stop it.')
      }
      run.record.status = 'running'
      const next = commit()
      if (run.record.mode === 'assisted') {
        void assistedLoop(run)
      }
      return next
    },

    stopRun(runId: string): RunProgress {
      const run = requireActive(runId)
      return finishTerminal(run, 'cancelled')
    },

    async advanceRun(runId: string): Promise<RunProgress> {
      const run = requireActive(runId)
      if (run.record.mode !== 'guide') {
        throw new Error('Only guided runs advance manually.')
      }
      if (run.record.status !== 'running') {
        throw new Error(`Cannot advance a ${run.record.status} run.`)
      }
      const step = currentStep(run)
      const attemptIndex = run.record.attempts.filter((a) => a.stepId === step.id).length
      const checkResults = await evaluateStepChecks(run, step)
      const failed = checkResults.filter((c) => !c.passed)
      run.record.attempts.push({
        runId: run.record.id,
        stepId: step.id,
        attempt: attemptIndex,
        actions: ['confirmed by user in guided mode'],
        observedOutcome: step.goal ?? 'Confirmed.',
        passed: failed.length === 0
      })
      run.record.checks.push(...checkResults)
      if (failed.length > 0) {
        return finishTerminal(
          run,
          'failed',
          `Check(s) failed on step "${step.id}": ${failed.map((c) => c.check).join(', ')}.`
        )
      }
      const done = advanceIndex(run)
      if (!done) throw new Error('No active run.')
      return done
    },

    approveRun(runId: string): RunProgress {
      const run = requireActive(runId)
      if (!run.record.awaitingApproval) {
        throw new Error('Run is not awaiting approval.')
      }
      run.record.awaitingApproval = false
      run.record.status = 'running'
      const attempts = run.record.attempts.filter(
        (a) => a.stepId === currentStep(run).id && a.passed === undefined
      )
      const pending = attempts[attempts.length - 1]
      if (pending) {
        pending.passed = true
        pending.observedOutcome = `${pending.observedOutcome} Approved by user.`
      }
      const done = advanceIndex(run)
      if (!done) throw new Error('No active run.')
      if (run.record.mode === 'assisted' && !TERMINAL.has(done.status)) {
        void assistedLoop(run)
      }
      return done
    },

    async retryRun(runId: string): Promise<RunProgress> {
      const run = requireActive(runId)
      if (run.record.status !== 'running' && run.record.status !== 'paused') {
        throw new Error(`Cannot retry a ${run.record.status} run.`)
      }
      const step = currentStep(run)
      if (step.kind !== 'verify') {
        throw new Error('Only verify steps can be retried.')
      }
      if (run.record.status === 'paused' && !run.record.awaitingApproval) {
        run.record.status = 'running'
      }
      const checkResults = await evaluateStepChecks(run, step)
      const failed = checkResults.filter((c) => !c.passed)
      run.record.attempts.push({
        runId: run.record.id,
        stepId: step.id,
        attempt: run.record.attempts.filter((a) => a.stepId === step.id).length,
        actions: ['retried checks'],
        observedOutcome: failed.length === 0 ? 'All checks passed.' : 'Checks still failing.',
        passed: failed.length === 0
      })
      run.record.checks.push(...checkResults)
      if (failed.length > 0) {
        return commit()
      }
      const done = advanceIndex(run)
      if (!done) throw new Error('No active run.')
      return done
    }
  }
}

export type Runner = ReturnType<typeof createRunner>
