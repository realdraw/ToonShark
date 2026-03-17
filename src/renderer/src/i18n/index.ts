import {createContext, useContext} from 'react'
import type {Locale} from '@shared/types'
import type {TranslationKeys} from './en'
import en from './en'
import ko from './ko'

const translations: Record<Locale, TranslationKeys> = { en, ko }

export const I18nContext = createContext<TranslationKeys>(en)

export function getTranslations(locale: Locale): TranslationKeys {
  return translations[locale] ?? en
}

export function useTranslation(): TranslationKeys {
  return useContext(I18nContext)
}
