import {create} from 'zustand'
import type {AppSettings} from '@shared/types'
import {toErrorMessage} from '@shared/utils'

type SettingsStore = {
  settings: AppSettings | null
  isLoading: boolean
  error: string | null

  loadSettings: () => Promise<void>
  saveSettings: (settings: AppSettings) => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: null,
  isLoading: false,
  error: null,

  loadSettings: async () => {
    set({ isLoading: true, error: null })
    try {
      const settings = await window.api.loadSettings()
      set({ settings, isLoading: false })
    } catch (err) {
      const message = toErrorMessage(err)
      window.api.log('error', 'Failed to load settings', message)
      set({ isLoading: false, error: message })
    }
  },

  saveSettings: async (settings: AppSettings) => {
    await window.api.saveSettings(settings)
    set({ settings })
  }
}))
