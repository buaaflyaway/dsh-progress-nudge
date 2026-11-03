/**
 * dsh-progress-nudge — keep a long-running agent talking to its user.
 *
 * ## The problem this solves
 *
 * A model with a strong tool bias (DeepSeek V4.1 Flash with `reasoningEffort:
 * max` is the observed case) can run many steps in a row where every assistant
 * message contains only reasoning and tool calls. The user sees a wall of tool
 * cards and has no idea what the agent is doing, whether it is stuck, or how
 * far along it is. Every one of those steps is a *silent execution round*.
 *
 * ## How the plugin observes
 *
 * The session log is the only source of truth. This plugin does not poll agent
 * status and does not keep its own event list; it listens to the post-commit
 * `session/event` feed and folds exactly three durable event types:
 *
 * - `assistant/message` — one completed model step. The message content is
 *   inspected: a non-blank `text` block means the user was addressed; a
 *   `tool-call` block means the step executed work.
 * - `turn/start` — a fresh user turn. The per-turn streak starts over, so a
 *   number from an earlier turn can never produce a surprise reminder.
 * - `session/disposed` — the live session left the registry; its counter is
 *   dropped with it (the map cannot grow for sessions that no longer exist).
 *
 * ## How the reminder reaches the model
 *
 * The counter alone is inert. The reminder is merged into the *next* request by
 * an `agent/pre-step` waterfall listener: it calls `next()` to preserve every
 * downstream decision, and when the streak is due it returns the same decision
 * with one extra user message prepended to `messages`. `AgentLoop.step()` then
 * appends that message to the session as a durable `user/message` and includes
 * it in the immediate request, so the reminder is replayable, visible to the
 * user, and impossible to lose.
 *
 * Delivering it from inside the `session/event` listener would be a bug: the
 * loop's `Session.commit()` publishes observers while its own append is still
 * in flight (`appending = true`), and any listener that appends then (for
 * example through `agent.inject()` → `inbox.splice()` →
 * `session.append("agent/inbox/spliced")`) is rejected with "session append
 * cannot reenter while another append is being published". That rejection is
 * contained per listener, so the plugin would look active while doing nothing.
 * Writing the reminder at the step boundary avoids the reentrancy entirely.
 *
 * ## Agent Teams
 *
 * When Agent Teams is composed, every member is an ordinary root Session, so
 * `includeSubagents` cannot distinguish them. `ctx.agentTeams.tryMembership()`
 * does: a teammate resolves with `role: "teammate"`, while the Lead and every
 * standalone Agent resolve with `role: "lead"`. `teamScope` decides whether a
 * teammate may be interrupted: the default `lead` keeps the reminder aimed at
 * the session the human is actually watching.
 *
 * ## Configuration
 *
 * Every field is `.volatile()`, which is what lets the Settings page (and the
 * plugin row) edit it live. Volatile values reach `apply()` as lazy wrappers,
 * so every read goes through {@link readConfig}.
 *
 * A repeat is delivered only after another full `threshold` of silent rounds
 * (10 → 20 → 30 …). That pokes a model that ignored the first reminder without
 * flooding the conversation, and any assistant text resets the count.
 *
 * @module dsh-progress-nudge
 */

import { createUserMessage } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'

/** Plugin row name used by the Loader and diagnostics. */
export const name = 'progress-nudge'

/** Supported reminder languages. */
export const LANGUAGES = ['en', 'zh-CN', 'zh-TW']

/** Built-in reminder text per language; `{n}` becomes the silent-round count. */
export const DEFAULT_TEXTS = {
  'zh-CN': [
    '【进度提醒 · 来自 Harness 的自动提醒，不是用户的新指令】',
    '你已连续 {n} 轮只发起工具调用、没有向用户输出任何文字，用户看不到你的执行情况。',
    '请先用一两句话简短汇报：① 已经完成了什么；② 当前结果或关键发现；③ 下一步准备做什么。',
    '汇报之后再继续调用工具执行任务。',
  ].join(''),
  'zh-TW': [
    '【進度提醒 · 來自 Harness 的自動提醒，不是使用者的新指令】',
    '你已連續 {n} 輪只發起工具呼叫、沒有向使用者輸出任何文字，使用者看不到你的執行情況。',
    '請先用一兩句話簡短回報：① 已經完成了什麼；② 目前結果或關鍵發現；③ 下一步準備做什麼。',
    '回報之後再繼續呼叫工具執行任務。',
  ].join(''),
  en: [
    '[Progress nudge — automated Harness reminder, not a new user instruction] ',
    'You have made {n} consecutive tool-call rounds without writing anything to the user, ',
    'so the user cannot see what you are doing. ',
    'Briefly report in one or two sentences: (1) what is done, (2) the current result or key finding, ',
    '(3) what you will do next. Then continue calling tools.',
  ].join(''),
}

/**
 * Read one config field.
 *
 * Schemastery's `.volatile()` turns a resolved value into a lazy wrapper whose
 * `.get()` returns the value; plain fields arrive as-is. Both shapes are
 * accepted here so the plugin works before and after the Loader resolves it.
 *
 * @param {unknown} value resolved config field.
 * @param {unknown} fallback value to use when the field is unset.
 * @returns {unknown} the plain value.
 */
export function readConfig(value, fallback) {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'object' && typeof value.get === 'function') {
    const resolved = value.get()
    return resolved === undefined || resolved === null ? fallback : resolved
  }
  return value
}

/** User-facing configuration; every field is editable from Settings. */
export const Config = z.object({
  threshold: z
    .number()
    .step(1)
    .min(1)
    .default(10)
    .volatile()
    .description('连续多少轮「只有工具调用、没有助手文本」后注入一次提醒（默认 10，最小 1）。'),
  repeat: z
    .boolean()
    .default(true)
    .volatile()
    .description(
      '模型无视提醒继续沉默时是否再次提醒：true 表示每再积累 threshold 轮提醒一次（10→20→30…），false 表示每段沉默只提醒一次。',
    ),
  includeSubagents: z
    .boolean()
    .default(false)
    .volatile()
    .description(
      '是否同样提醒 subagent 子代理会话。默认 false：子代理的工作结果由父代理转述，向子代理注入「向用户汇报」会使它的输出偏离任务。',
    ),
  teamScope: z
    .union([z.const('lead'), z.const('all')])
    .default('lead')
    .volatile()
    .description(
      '启用「智能体团队」时的提醒范围：lead = 只提醒 Lead（以及不属于任何团队的独立智能体）；all = 团队成员也会收到提醒。',
    ),
  language: z
    .union([z.const('en'), z.const('zh-CN'), z.const('zh-TW')])
    .default('zh-CN')
    .volatile()
    .description('提醒文案的语言：en / zh-CN（简体中文）/ zh-TW（繁体中文）。设置页文案也随之切换。'),
  text: z
    .string()
    .default('')
    .volatile()
    .description(
      '自定义提醒文案；{n} 会替换为当前连续沉默轮数。留空时使用所选语言的内置文案，并在输入框里以占位提示展示。',
    ),
})

/**
 * Classify one assistant message for the silent-round counter.
 *
 * A blank text block (whitespace only) is not a report: models emit empty text
 * blocks around tool calls, and counting those as "the user was told" would
 * silence the reminder forever. Reasoning blocks are deliberately ignored —
 * the user cannot see them, which is the whole point of the plugin.
 *
 * @param {{ content?: ReadonlyArray<{ type?: string, text?: string }> }} message
 *   the committed assistant message.
 * @returns {'reported' | 'silent' | 'neutral'} `reported` when the user saw
 *   text, `silent` when the step ran tools without text, `neutral` otherwise
 *   (a message with neither, e.g. a cut-off attempt).
 */
export function classifyAssistantMessage(message) {
  let reported = false
  let executed = false
  for (const block of message?.content ?? []) {
    if (block?.type === 'text') {
      if (typeof block.text === 'string' && block.text.trim().length > 0) reported = true
    } else if (block?.type === 'tool-call') {
      executed = true
    }
  }
  if (reported) return 'reported'
  return executed ? 'silent' : 'neutral'
}

/**
 * Resolve the effective reminder text for one configuration.
 *
 * @param {object} options row configuration (volatile wrappers accepted).
 * @returns {string} the custom text when set, else the built-in text of the
 *   selected language.
 */
export function resolveReminderText(options = {}) {
  const language = readConfig(options.language, 'zh-CN')
  const custom = readConfig(options.text, '')
  if (typeof custom === 'string' && custom.trim().length > 0) return custom
  return DEFAULT_TEXTS[language] ?? DEFAULT_TEXTS['zh-CN']
}

/**
 * Register the progress nudge for every live agent in this profile.
 *
 * State is plain per-session bookkeeping (`streak`, `remindedAt`), never a
 * competing source of truth: it is derived from committed events and rebuilt
 * from zero after a restart, matching the practice that the session log owns
 * what the model saw.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx plugin context.
 * @param {object} config resolved row configuration (volatile wrappers accepted).
 */
export function apply(ctx, config) {
  const threshold = Math.max(1, Math.trunc(readConfig(config?.threshold, 10)))
  const repeat = readConfig(config?.repeat, true) !== false
  const includeSubagents = readConfig(config?.includeSubagents, false) === true
  const teamScope = readConfig(config?.teamScope, 'lead') === 'all' ? 'all' : 'lead'
  const template = resolveReminderText(config ?? {})

  /** session id (equal to agent id) → { streak, remindedAt } */
  const streaks = new Map()

  const stateOf = (sessionId) => {
    let state = streaks.get(sessionId)
    if (state === undefined) {
      state = { streak: 0, remindedAt: 0 }
      streaks.set(sessionId, state)
    }
    return state
  }

  ctx.on('session/event', (session, event) => {
    if (event?.type === 'turn/start') {
      // A new user turn opens a new measurement window.
      streaks.delete(session.id)
      return
    }
    if (event?.type !== 'assistant/message') return

    // A cut-off attempt is not a completed round; the interrupted flag marks
    // the durable message written when the stream was aborted.
    if (event.data?.interrupted === true) return

    if (!includeSubagents && session.header?.origin === 'subagent') return

    const verdict = classifyAssistantMessage(event.data?.message)
    if (verdict === 'reported') {
      streaks.delete(session.id)
      return
    }
    if (verdict !== 'silent') return

    const state = stateOf(session.id)
    state.streak += 1
  })

  ctx.on('agent/pre-step', async ({ agent, messages }, next) => {
    const decision = await next()

    // A rejected step never reaches the model; keep the streak for later.
    if (decision?.kind !== 'enter') return decision

    const sessionId = agent.id
    const state = streaks.get(sessionId)
    if (state === undefined || state.streak < threshold) return decision

    if (state.remindedAt > 0) {
      if (!repeat) return decision
      if (state.streak - state.remindedAt < threshold) return decision
    }

    // Agent Teams: every member is a root Session, so `includeSubagents`
    // cannot separate a teammate. `tryMembership` reports `role: "lead"` for
    // the Lead and for every standalone Agent, and `teammate` only for an
    // actual team member.
    if (teamScope === 'lead') {
      try {
        const membership = ctx.get('agentTeams')?.tryMembership(agent)
        if (membership !== undefined && membership.role !== 'lead') return decision
      } catch {
        // A disposed or misbehaving Teams service must not block reminders.
      }
    }

    state.remindedAt = state.streak
    const reminder = createUserMessage({
      content: [
        {
          type: 'text',
          text: template.replaceAll('{n}', String(state.streak)),
        },
      ],
      source: { kind: 'progress-nudge' },
    })
    ctx.logger.info(
      'progress-nudge: injecting a reminder into session %s after %d silent tool round(s)',
      sessionId,
      state.streak,
    )
    return { ...decision, messages: [reminder, ...decision.messages] }
  })

  ctx.on('session/disposed', (session) => {
    streaks.delete(session.id)
  })
}
