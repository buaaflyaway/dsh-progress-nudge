/**
 * dsh-progress-nudge — browser half.
 *
 * Registers one page in Settings → 过程汇报 / Progress Nudge. The page edits
 * this plugin's own row configuration through the generated `remote.settings`
 * namespace: `describe()` returns every configurable plugin entry with its
 * resolved value and revision, and `update(ns, patch, revision)` merges the
 * patch into the profile's stored user section. The Host then reloads the
 * plugin entry, so a saved threshold applies to the next model step.
 *
 * Everything here is plain JavaScript: the bundle self-registers through
 * `window.__ModuleLoader__.load`, requires only `react` (a platform seed), and
 * styles itself with `--dsw-alias-*` theme tokens so light/dark switch with the
 * host. No Harness client package is imported as a module, and no DOM outside
 * the React tree is touched except one scoped `<style>` tag.
 *
 * @module dsh-progress-nudge/client
 */
window.__ModuleLoader__.load({
  id: 'dsh-progress-nudge',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement

    /** Copy for the settings page, keyed by the plugin's own `language` setting. */
    const DICTIONARIES = {
      en: {
        title: 'Progress nudge',
        description:
          'When the model keeps calling tools without writing anything to the user, Harness injects a short reminder before the next model request.',
        threshold: 'Reminder threshold',
        thresholdHint:
          'How many consecutive tool-only rounds (no assistant text) trigger one reminder. Default 10.',
        text: 'Reminder text',
        textHint:
          'Use {n} for the current silent-round count. Leave empty to use the built-in text of the selected language (shown as the placeholder).',
        language: 'Language',
        languageHint: 'Applies to the reminder text and to this page.',
        repeat: 'Repeat while the model stays silent',
        repeatHint: 'Remind again after every further threshold of silent rounds.',
        includeSubagents: 'Also remind subagent sessions',
        includeSubagentsHint:
          'Subagent output is reported by its parent, so nudging it would derail its task.',
        teamScope: 'Agent Teams scope',
        teamScopeHint:
          'Takes effect only when Agent Teams is enabled: Lead sends reminders only to the Lead and standalone agents; All also reminds team members.',
        teamLead: 'Lead only',
        teamAll: 'All agents',
        save: 'Save',
        saving: 'Saving…',
        reset: 'Restore defaults',
        saved: 'Saved.',
        saveFailed: 'The deployment rejected the values; nothing was changed.',
        loading: 'Loading…',
        unavailable: 'The progress-nudge plugin is not loaded, so it cannot be configured right now.',
        readOnly: 'This deployment stores settings read-only.',
        invalidThreshold: 'Enter a whole number of at least 1.',
      },
      'zh-CN': {
        title: '过程汇报',
        description:
          '当模型连续多轮只调用工具、不向用户输出文字时，Harness 会在下一次模型请求前注入一条简短提醒，要求它先汇报进展。',
        threshold: '提醒间隔阈值',
        thresholdHint: '连续多少轮「只有工具调用、没有助手文本」后提醒一次。默认 10。',
        text: '提醒文案',
        textHint:
          '用 {n} 表示当前连续沉默轮数。留空时使用所选语言的内置文案（输入框里以占位提示展示）。',
        language: '语言',
        languageHint: '同时作用于提醒文案与这个设置页。',
        repeat: '模型继续沉默时重复提醒',
        repeatHint: '每再积累一个阈值轮数就再次提醒。',
        includeSubagents: '同时提醒子代理（subagent）会话',
        includeSubagentsHint: '子代理的产出由父代理转述，向它注入「向用户汇报」会让它偏离任务。',
        teamScope: '智能体团队范围',
        teamScopeHint:
          '仅在启用「智能体团队」时生效：仅 Lead 表示只提醒 Lead 与独立智能体；所有智能体表示团队成员也会被提醒。',
        teamLead: '仅 Lead',
        teamAll: '所有智能体',
        save: '保存',
        saving: '保存中…',
        reset: '恢复默认',
        saved: '已保存。',
        saveFailed: '本部署拒绝了这些值，配置没有改变。',
        loading: '加载中…',
        unavailable: '过程汇报插件当前未加载，暂时无法配置。',
        readOnly: '本部署的设置为只读。',
        invalidThreshold: '请填写不小于 1 的整数。',
      },
      'zh-TW': {
        title: '過程回報',
        description:
          '當模型連續多輪只呼叫工具、不向使用者輸出文字時，Harness 會在下一次模型請求前注入一則簡短提醒，要求它先回報進度。',
        threshold: '提醒間隔閾值',
        thresholdHint: '連續多少輪「只有工具呼叫、沒有助手文字」後提醒一次。預設 10。',
        text: '提醒文案',
        textHint:
          '用 {n} 表示目前連續沉默輪數。留空時使用所選語言的內建文案（輸入框中以佔位提示顯示）。',
        language: '語言',
        languageHint: '同時作用於提醒文案與這個設定頁。',
        repeat: '模型繼續沉默時重複提醒',
        repeatHint: '每再累積一個閾值輪數就再次提醒。',
        includeSubagents: '同時提醒子代理（subagent）工作階段',
        includeSubagentsHint: '子代理的產出由父代理轉述，向它注入「向使用者回報」會讓它偏離任務。',
        teamScope: '智慧體團隊範圍',
        teamScopeHint:
          '僅在啟用「智慧體團隊」時生效：僅 Lead 表示只提醒 Lead 與獨立智慧體；所有智慧體表示團隊成員也會被提醒。',
        teamLead: '僅 Lead',
        teamAll: '所有智慧體',
        save: '儲存',
        saving: '儲存中…',
        reset: '恢復預設',
        saved: '已儲存。',
        saveFailed: '本部署拒絕了這些值，設定沒有改變。',
        loading: '載入中…',
        unavailable: '過程回報外掛目前未載入，暫時無法設定。',
        readOnly: '本部署的設定為唯讀。',
        invalidThreshold: '請填寫不小於 1 的整數。',
      },
    }

    /** Built-in reminder text per language; mirrors the Host so the page can show it as a placeholder. */
    const DEFAULT_TEXTS = {
      'zh-CN':
        '【进度提醒 · 来自 Harness 的自动提醒，不是用户的新指令】你已连续 {n} 轮只发起工具调用、没有向用户输出任何文字，用户看不到你的执行情况。请先用一两句话简短汇报：① 已经完成了什么；② 当前结果或关键发现；③ 下一步准备做什么。汇报之后再继续调用工具执行任务。',
      'zh-TW':
        '【進度提醒 · 來自 Harness 的自動提醒，不是使用者的新指令】你已連續 {n} 輪只發起工具呼叫、沒有向使用者輸出任何文字，使用者看不到你的執行情況。請先用一兩句話簡短回報：① 已經完成了什麼；② 目前結果或關鍵發現；③ 下一步準備做什麼。回報之後再繼續呼叫工具執行任務。',
      en: '[Progress nudge — automated Harness reminder, not a new user instruction] You have made {n} consecutive tool-call rounds without writing anything to the user, so the user cannot see what you are doing. Briefly report in one or two sentences: (1) what is done, (2) the current result or key finding, (3) what you will do next. Then continue calling tools.',
    }

    /** Defaults the page shows before the first config is stored. */
    const DEFAULTS = {
      threshold: 10,
      repeat: true,
      includeSubagents: false,
      teamScope: 'lead',
      language: 'zh-CN',
      text: '',
    }

    /** Styles for the page; one scoped tag, removed with the plugin. */
    const CSS = [
      '.pn-section{display:flex;flex-direction:column;gap:14px;max-width:620px;padding:0 0 12px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}',
      '.pn-head{display:flex;flex-direction:column;gap:6px}',
      '.pn-title{margin:0;font-size:16px;font-weight:600;line-height:24px}',
      '.pn-desc{margin:0;color:var(--dsw-alias-label-secondary)}',
      '.pn-field{display:flex;flex-direction:column;gap:6px}',
      '.pn-label{font-weight:500}',
      '.pn-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
      '.pn-input,.pn-select,.pn-textarea{box-sizing:border-box;width:100%;padding:7px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;outline:none}',
      '.pn-input:focus,.pn-select:focus,.pn-textarea:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.pn-input:disabled,.pn-select:disabled,.pn-textarea:disabled{opacity:.6;cursor:not-allowed}',
      '.pn-textarea{min-height:72px;resize:vertical;line-height:20px}',
      '.pn-check{display:flex;align-items:center;gap:8px;font-weight:500}',
      '.pn-check input{width:15px;height:15px;accent-color:var(--dsw-alias-brand-primary)}',
      '.pn-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.pn-button{appearance:none;border:none;border-radius:8px;padding:6px 14px;font:inherit;font-weight:500;cursor:pointer;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base)}',
      '.pn-button:disabled{opacity:.5;cursor:not-allowed}',
      '.pn-button.ghost{background:transparent;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1)}',
      '.pn-status{font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.pn-status.ok{color:var(--dsw-alias-state-success-primary)}',
      '.pn-status.error{color:var(--dsw-alias-state-error-primary)}',
      '.pn-note{padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;color:var(--dsw-alias-label-secondary)}',
    ].join('\n')

    /** Names the plugin row may have in `settings.describe()` (row id, loader path, or package name). */
    const NAMESPACE_CANDIDATES = ['progress-nudge', 'include:progress-nudge', 'dsh-progress-nudge']

    /** Title shown in the Settings navigation; refreshed whenever the page loads or saves. */
    let navTitle = DICTIONARIES['zh-CN'].title

    /** Install the page's stylesheet once per page lifetime. */
    function installStyles() {
      const tagId = 'dsh-progress-nudge/settings.css'
      if (typeof document === 'undefined') return
      if (document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`) !== null) return
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-progress-nudge'
      tag.dataset.pluginCss = tagId
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    /** Locate this plugin's namespace view in one `settings.describe()` result. */
    function findNamespace(namespaces) {
      const list = Array.isArray(namespaces) ? namespaces : []
      for (const candidate of NAMESPACE_CANDIDATES) {
        const hit = list.find((view) => view && view.ns === candidate)
        if (hit !== undefined) return hit
      }
      const renamed = list.find((view) => typeof view?.ns === 'string' && view.ns.endsWith(':progress-nudge'))
      if (renamed !== undefined) return renamed
      // Last resort: identify the entry by a field only this plugin declares, so a
      // loader-side id rename cannot leave the page permanently unavailable.
      return list.find((view) => {
        try {
          return JSON.stringify(view?.schema ?? null).includes('teamScope')
        } catch {
          return false
        }
      })
    }

    /** Project one namespace value into the page's draft, filling defaults. */
    function draftOf(value) {
      const source = value !== null && typeof value === 'object' ? value : {}
      return {
        threshold: Number.isInteger(source.threshold) ? source.threshold : DEFAULTS.threshold,
        repeat: source.repeat !== false,
        includeSubagents: source.includeSubagents === true,
        teamScope: source.teamScope === 'all' ? 'all' : 'lead',
        language: typeof source.language === 'string' && DICTIONARIES[source.language] !== undefined
          ? source.language
          : DEFAULTS.language,
        text: typeof source.text === 'string' ? source.text : '',
      }
    }

    /** Read a RemoteError's message without depending on its class identity. */
    function messageOf(error) {
      if (error !== null && typeof error === 'object' && typeof error.message === 'string') return error.message
      return String(error)
    }

    /** Read one dictionary for a language, falling back to Simplified Chinese. */
    function dictionaryOf(language) {
      return DICTIONARIES[language] ?? DICTIONARIES['zh-CN']
    }

    /**
     * Render the settings page.
     *
     * @param {object} props slot owner props plus the injected `remote` face.
     * @returns the page element tree.
     */
    function ProgressNudgeSection(props) {
      const remote = props.remote
      const [phase, setPhase] = React.useState('loading')
      const [failure, setFailure] = React.useState('')
      const [view, setView] = React.useState(null)
      const [writable, setWritable] = React.useState(true)
      const [draft, setDraft] = React.useState(null)
      const [saving, setSaving] = React.useState(false)
      const [notice, setNotice] = React.useState(null)

      React.useEffect(() => {
        let alive = true
        remote
          .describe()
          .then((response) => {
            if (!alive) return
            // Remote methods answer a result envelope ({ ok, value } | { ok: false, error }),
            // unlike a plain local call: unwrap it before reading the settings view.
            if (response === null || response === undefined || response.ok !== true) {
              throw new Error(response?.error?.message ?? 'settings.describe failed')
            }
            const result = response.value
            const found = findNamespace(result?.namespaces)
            if (found === undefined) {
              setPhase('missing')
              return
            }
            const next = draftOf(found.value)
            navTitle = dictionaryOf(next.language).title
            setView(found)
            setWritable(result.writable !== false)
            setDraft(next)
            setPhase('ready')
          })
          .catch((error) => {
            if (!alive) return
            setFailure(messageOf(error))
            setPhase('error')
          })
        return () => {
          alive = false
        }
      }, [remote])

      const language = draft?.language ?? DEFAULTS.language
      const t = dictionaryOf(language)

      React.useEffect(() => {
        navTitle = t.title
      }, [t])

      if (phase === 'loading') return h('div', { className: 'pn-section' }, h('div', { className: 'pn-note' }, t.loading))
      if (phase === 'missing') return h('div', { className: 'pn-section' }, h('div', { className: 'pn-note' }, t.unavailable))
      if (phase === 'error') {
        return h(
          'div',
          { className: 'pn-section' },
          h('div', { className: 'pn-note' }, `${t.unavailable} ${failure}`),
        )
      }

      const disabled = writable !== true || saving === true
      const update = (patch) => setDraft({ ...draft, ...patch })

      const save = () => {
        const threshold = Number(draft.threshold)
        if (!Number.isInteger(threshold) || threshold < 1) {
          setNotice({ kind: 'error', text: t.invalidThreshold })
          return
        }
        setSaving(true)
        setNotice(null)
        remote
          .update(
            view.ns,
            {
              threshold,
              repeat: draft.repeat,
              includeSubagents: draft.includeSubagents,
              teamScope: draft.teamScope,
              language: draft.language,
              text: draft.text,
            },
            view.revision,
          )
          .then((response) => {
            if (response === null || response === undefined || response.ok !== true) {
              throw new Error(response?.error?.message ?? 'settings.update failed')
            }
            const updated = response.value
            const next = draftOf(updated?.value)
            navTitle = dictionaryOf(next.language).title
            setView(updated)
            setDraft(next)
            setSaving(false)
            setNotice({ kind: 'ok', text: t.saved })
          })
          .catch((error) => {
            setSaving(false)
            setNotice({ kind: 'error', text: `${t.saveFailed} ${messageOf(error)}` })
          })
      }

      const restore = () => {
        setDraft({ ...DEFAULTS })
        setNotice(null)
      }

      const thresholdField = h(
        'div',
        { className: 'pn-field' },
        h('label', { className: 'pn-label', htmlFor: 'pn-threshold' }, t.threshold),
        h('input', {
          id: 'pn-threshold',
          className: 'pn-input',
          type: 'number',
          min: 1,
          step: 1,
          value: String(draft.threshold),
          disabled,
          onChange: (event) => update({ threshold: event.target.value === '' ? '' : Number(event.target.value) }),
        }),
        h('p', { className: 'pn-hint' }, t.thresholdHint),
      )

      const textField = h(
        'div',
        { className: 'pn-field' },
        h('label', { className: 'pn-label', htmlFor: 'pn-text' }, t.text),
        h('textarea', {
          id: 'pn-text',
          className: 'pn-textarea',
          rows: 4,
          value: draft.text,
          placeholder: DEFAULT_TEXTS[language] ?? DEFAULT_TEXTS['zh-CN'],
          disabled,
          onChange: (event) => update({ text: event.target.value }),
        }),
        h('p', { className: 'pn-hint' }, t.textHint),
      )

      const languageField = h(
        'div',
        { className: 'pn-field' },
        h('label', { className: 'pn-label', htmlFor: 'pn-language' }, t.language),
        h(
          'select',
          {
            id: 'pn-language',
            className: 'pn-select',
            value: draft.language,
            disabled,
            onChange: (event) => update({ language: event.target.value }),
          },
          h('option', { value: 'zh-CN' }, '简体中文'),
          h('option', { value: 'zh-TW' }, '繁體中文'),
          h('option', { value: 'en' }, 'English'),
        ),
        h('p', { className: 'pn-hint' }, t.languageHint),
      )

      const repeatField = h(
        'div',
        { className: 'pn-field' },
        h(
          'label',
          { className: 'pn-check' },
          h('input', {
            type: 'checkbox',
            checked: draft.repeat,
            disabled,
            onChange: (event) => update({ repeat: event.target.checked }),
          }),
          t.repeat,
        ),
        h('p', { className: 'pn-hint' }, t.repeatHint),
      )

      const subagentField = h(
        'div',
        { className: 'pn-field' },
        h(
          'label',
          { className: 'pn-check' },
          h('input', {
            type: 'checkbox',
            checked: draft.includeSubagents,
            disabled,
            onChange: (event) => update({ includeSubagents: event.target.checked }),
          }),
          t.includeSubagents,
        ),
        h('p', { className: 'pn-hint' }, t.includeSubagentsHint),
      )

      const teamField = h(
        'div',
        { className: 'pn-field' },
        h('label', { className: 'pn-label', htmlFor: 'pn-team-scope' }, t.teamScope),
        h(
          'select',
          {
            id: 'pn-team-scope',
            className: 'pn-select',
            value: draft.teamScope,
            disabled,
            onChange: (event) => update({ teamScope: event.target.value }),
          },
          h('option', { value: 'lead' }, t.teamLead),
          h('option', { value: 'all' }, t.teamAll),
        ),
        h('p', { className: 'pn-hint' }, t.teamScopeHint),
      )

      const actions = h(
        'div',
        { className: 'pn-actions' },
        h('button', { type: 'button', className: 'pn-button', disabled, onClick: save }, saving ? t.saving : t.save),
        h('button', { type: 'button', className: 'pn-button ghost', disabled, onClick: restore }, t.reset),
        notice === null
          ? null
          : h('span', { className: `pn-status ${notice.kind === 'ok' ? 'ok' : 'error'}` }, notice.text),
        writable === true ? null : h('span', { className: 'pn-status' }, t.readOnly),
      )

      return h(
        'div',
        { className: 'pn-section' },
        h('div', { className: 'pn-head' }, h('h2', { className: 'pn-title' }, t.title), h('p', { className: 'pn-desc' }, t.description)),
        thresholdField,
        textField,
        languageField,
        repeatField,
        subagentField,
        teamField,
        actions,
      )
    }

    /** Required client services (Cordis fiber inject). */
    const inject = ['slots', 'remote', 'remote.settings']

    /**
     * Mount the settings page.
     *
     * @param {object} ctx browser plugin context.
     */
    function apply(ctx) {
      ctx.effect(() => {
        installStyles()
        return () => {}
      }, 'progress-nudge: styles')
      ctx.effect(
        () =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              {
                name: 'settings.section',
                id: 'progress-nudge',
                order: 30,
                label: () => navTitle,
                inject: () => ({ remote: ctx.remote.settings }),
              },
              ProgressNudgeSection,
            ),
          ),
        'progress-nudge: settings page',
      )
    }

    exports.apply = apply
    exports.inject = inject
    exports.ProgressNudgeSection = ProgressNudgeSection
    return module.exports
  },
})
