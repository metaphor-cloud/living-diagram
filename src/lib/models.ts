/**
 * Model choices offered in the UI. Text models run the chat panel via the
 * Responses API; realtime models run voice and meeting mode. Ids current
 * as of July 2026 - the settings dialog lets the user type any other id.
 */
export type ModelOption = { id: string; label: string }

export const CHAT_MODELS: ModelOption[] = [
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra - balanced (default)' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol - most capable' },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna - fast and cheap' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini - budget' },
]

export const REALTIME_MODELS: ModelOption[] = [
  { id: 'gpt-realtime-2.1', label: 'GPT Realtime 2.1 (default)' },
  { id: 'gpt-realtime-2.1-mini', label: 'GPT Realtime 2.1 Mini - cheaper' },
]

export const DEFAULT_CHAT_MODEL = 'gpt-5.6-terra'
export const DEFAULT_REALTIME_MODEL = 'gpt-realtime-2.1'
