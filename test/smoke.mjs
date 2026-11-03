/**
 * Offline smoke test for dsh-progress-nudge.
 *
 * The plugin is exercised through the same public entry points the Harness
 * uses (`Config` to resolve defaults, `apply` to register listeners), with a
 * fake Context that records listeners and a fake Agent handed to the
 * `agent/pre-step` waterfall. No Harness process, no session persistence.
 *
 * Volatile fields are exercised in their real resolved shape: `Config(...)`
 * returns lazy wrappers, exactly what the Loader passes to `apply()`.
 *
 * Run: node test/smoke.mjs
 */
import assert from 'node:assert/strict'
import {
  Config,
  DEFAULT_TEXTS,
  apply,
  classifyAssistantMessage,
  readConfig,
  resolveReminderText,
} from '../index.js'

const TEXT = (text) => ({ type: 'text', text })
const TOOL = (name = 'bash') => ({ type: 'tool-call', id: `call-${name}`, name, arguments: '{}' })

/** Build a plugin instance over fake services. */
function harness(overrides = {}, options = {}) {
  const listeners = new Map()
  const logs = { info: [], warn: [] }
  const membershipOf = options.membership ?? (() => undefined)

  const ctx = {
    on(name, listener) {
      const bucket = listeners.get(name) ?? []
      bucket.push(listener)
      listeners.set(name, bucket)
      return () => {}
    },
    get(name) {
      if (name !== 'agentTeams') return undefined
      return { tryMembership: (agent) => membershipOf(agent) }
    },
    logger: {
      info: (...args) => logs.info.push(args),
      warn: (...args) => logs.warn.push(args),
    },
  }

  const config = Config(overrides)
  apply(ctx, config)

  const session = (id = 'session-a', origin = undefined) => ({ id, header: { id, origin } })
  const agent = (id = 'session-a') => ({ id })

  const emit = (name, ...args) => {
    for (const listener of listeners.get(name) ?? []) listener(...args)
  }

  /** Run the agent/pre-step waterfall the way AgentLoop does. */
  const preStep = async (targetAgent, messages = []) => {
    let index = 0
    const base = { kind: 'enter', messages }
    const call = async () => {
      const chain = listeners.get('agent/pre-step') ?? []
      const listener = chain[index]
      if (listener === undefined) return base
      index += 1
      return listener({ agent: targetAgent, messages }, call)
    }
    return call()
  }

  const assistant = (content, extra = {}) => ({
    type: 'assistant/message',
    data: { turn: 1, step: 1, message: { role: 'assistant', content }, stream: [], ...extra },
  })

  return {
    ctx,
    config,
    logs,
    session,
    agent,
    emit,
    preStep,
    assistant,
    turnStart: () => ({ type: 'turn/start', data: { turn: 2 } }),
  }
}

const injected = (decision) =>
  (decision.messages ?? []).filter((message) => message.source?.kind === 'progress-nudge')

const silentRounds = (h, s, count) => {
  for (let i = 0; i < count; i += 1) h.emit('session/event', s, h.assistant([TOOL()]))
}

// --- config wrappers and defaults ------------------------------------------

{
  const config = Config({})
  assert.equal(readConfig(config.threshold, 0), 10, 'default threshold is 10')
  assert.equal(readConfig(config.repeat, false), true)
  assert.equal(readConfig(config.includeSubagents, true), false)
  assert.equal(readConfig(config.teamScope, 'x'), 'lead')
  assert.equal(readConfig(config.language, 'x'), 'zh-CN')
  assert.equal(readConfig(undefined, 'fallback'), 'fallback')
  assert.equal(readConfig(7, 0), 7, 'plain values still read')
  assert.equal(typeof config.threshold.get, 'function', 'volatile fields resolve to lazy wrappers')
}

// --- built-in reminder text per language -----------------------------------

assert.match(resolveReminderText({ language: 'zh-CN' }), /进度提醒/)
assert.match(resolveReminderText({ language: 'zh-TW' }), /進度提醒/)
assert.match(resolveReminderText({ language: 'en' }), /Progress nudge/)
assert.match(resolveReminderText({ language: 'en', text: '自定义 {n}' }), /自定义 \{n\}/)
assert.equal(resolveReminderText({ language: 'en', text: '   ' }), DEFAULT_TEXTS.en)

// --- classification ---------------------------------------------------------

assert.equal(classifyAssistantMessage({ content: [TOOL()] }), 'silent')
assert.equal(classifyAssistantMessage({ content: [TOOL(), TEXT('  ')] }), 'silent')
assert.equal(classifyAssistantMessage({ content: [TEXT('完成一半')] }), 'reported')
assert.equal(classifyAssistantMessage({ content: [TEXT('完成'), TOOL()] }), 'reported')
assert.equal(classifyAssistantMessage({ content: [{ type: 'reasoning', text: '思考…' }, TOOL()] }), 'silent')
assert.equal(classifyAssistantMessage({ content: [] }), 'neutral')
assert.equal(classifyAssistantMessage({}), 'neutral')

// --- default threshold is 10 ----------------------------------------------

{
  const h = harness()
  const s = h.session()
  const a = h.agent()

  silentRounds(h, s, 9)
  assert.equal(injected(await h.preStep(a)).length, 0, 'nine silent rounds stay below the default threshold')

  silentRounds(h, s, 1)
  const decision = await h.preStep(a)
  assert.equal(injected(decision).length, 1, 'the tenth silent round injects one reminder')
  const [reminder] = injected(decision)
  assert.equal(reminder.role, 'user')
  assert.equal(reminder.source.kind, 'progress-nudge')
  assert.match(reminder.content[0].text, /连续 10 轮/)
  assert.ok(reminder.id)
  assert.equal(h.logs.info.length, 1)
}

// --- repeat cadence (10 → 20) ---------------------------------------------

{
  const h = harness()
  const s = h.session()
  const a = h.agent()

  silentRounds(h, s, 10)
  assert.equal(injected(await h.preStep(a)).length, 1)

  silentRounds(h, s, 9)
  assert.equal(injected(await h.preStep(a)).length, 0, 'nineteen rounds have not reached the next threshold')
  silentRounds(h, s, 1)
  assert.equal(injected(await h.preStep(a)).length, 1, 'the twentieth silent round reminds again')
}

// --- text resets the counter ----------------------------------------------

{
  const h = harness()
  const s = h.session()
  const a = h.agent()

  silentRounds(h, s, 10)
  assert.equal(injected(await h.preStep(a)).length, 1)

  h.emit('session/event', s, h.assistant([TEXT('已处理 3 个文件，正在验证。')]))
  silentRounds(h, s, 9)
  assert.equal(injected(await h.preStep(a)).length, 0, 'the report cleared the streak')
  silentRounds(h, s, 1)
  assert.equal(injected(await h.preStep(a)).length, 1, 'a new streak starts from zero')
}

// --- a new user turn resets the counter -----------------------------------

{
  const h = harness()
  const s = h.session()
  const a = h.agent()

  silentRounds(h, s, 6)
  h.emit('session/event', s, h.turnStart())
  silentRounds(h, s, 9)
  assert.equal(injected(await h.preStep(a)).length, 0)
  silentRounds(h, s, 1)
  assert.equal(injected(await h.preStep(a)).length, 1)
}

// --- interrupted steps are not rounds -------------------------------------

{
  const h = harness()
  const s = h.session()
  const a = h.agent()
  for (let i = 0; i < 10; i += 1) h.emit('session/event', s, h.assistant([TOOL()], { interrupted: true }))
  assert.equal(injected(await h.preStep(a)).length, 0)
}

// --- subagents are skipped unless configured ------------------------------

{
  const h = harness()
  const s = h.session('child', 'subagent')
  silentRounds(h, s, 10)
  assert.equal(injected(await h.preStep({ id: 'child' })).length, 0)
}
{
  const h = harness({ includeSubagents: true })
  const s = h.session('child', 'subagent')
  silentRounds(h, s, 10)
  assert.equal(injected(await h.preStep({ id: 'child' })).length, 1)
}

// --- Agent Teams scope -----------------------------------------------------

{
  // A teammate resolves as role "teammate"; the default lead scope skips it.
  const h = harness({}, {
    membership: (candidate) => (candidate.id === 'teammate' ? { role: 'teammate' } : { role: 'lead' }),
  })
  const mate = h.session('teammate')
  silentRounds(h, mate, 10)
  assert.equal(injected(await h.preStep({ id: 'teammate' })).length, 0, 'teamScope=lead skips teammates')

  const lead = h.session('lead')
  silentRounds(h, lead, 10)
  assert.equal(injected(await h.preStep({ id: 'lead' })).length, 1, 'the Lead still gets reminders')
}
{
  const h = harness({ teamScope: 'all' }, {
    membership: (candidate) => (candidate.id === 'teammate' ? { role: 'teammate' } : { role: 'lead' }),
  })
  const mate = h.session('teammate')
  silentRounds(h, mate, 10)
  assert.equal(injected(await h.preStep({ id: 'teammate' })).length, 1, 'teamScope=all reminds teammates')
}
{
  // Without the Agent Teams service every agent is independent and reminded.
  const h = harness({}, { membership: () => undefined })
  const s = h.session()
  silentRounds(h, s, 10)
  assert.equal(injected(await h.preStep(h.agent())).length, 1)
}

// --- repeat:false reminds once per streak ---------------------------------

{
  const h = harness({ repeat: false })
  const s = h.session()
  const a = h.agent()
  silentRounds(h, s, 30)
  assert.equal(injected(await h.preStep(a)).length, 1)
}

// --- custom threshold, text, and language ---------------------------------

{
  const h = harness({ threshold: 1, text: '第 {n} 轮了，说话！' })
  const s = h.session()
  const a = h.agent()
  silentRounds(h, s, 1)
  const decision = await h.preStep(a)
  assert.equal(injected(decision).length, 1)
  assert.equal(injected(decision)[0].content[0].text, '第 1 轮了，说话！')
}
{
  const h = harness({ language: 'en' })
  const s = h.session()
  const a = h.agent()
  silentRounds(h, s, 10)
  const decision = await h.preStep(a)
  assert.match(injected(decision)[0].content[0].text, /Progress nudge/)
  assert.match(injected(decision)[0].content[0].text, /10 consecutive/)
}

// --- a rejected step is preserved untouched -------------------------------

{
  const h = harness()
  const s = h.session()
  const a = h.agent()
  silentRounds(h, s, 10)

  const reject = async () => ({ kind: 'reject', reason: 'blocked' })
  h.ctx.on('agent/pre-step', reject)
  const decision = await h.preStep(a)
  assert.equal(decision.kind, 'reject')
  assert.equal(decision.messages, undefined)
}

// --- no observed session never reminds ------------------------------------

{
  const h = harness()
  const decision = await h.preStep({ id: 'unknown' })
  assert.equal(injected(decision).length, 0)
}

// --- disposed sessions drop their state -----------------------------------

{
  const h = harness()
  const s = h.session()
  const a = h.agent()
  silentRounds(h, s, 6)
  h.emit('session/disposed', s)
  silentRounds(h, s, 9)
  assert.equal(injected(await h.preStep(a)).length, 0, 'the dropped state restarted the counter')
  silentRounds(h, s, 1)
  assert.equal(injected(await h.preStep(a)).length, 1)
}

console.log('dsh-progress-nudge smoke test: all assertions passed')
