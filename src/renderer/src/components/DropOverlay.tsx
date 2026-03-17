import {useTranslation} from '../i18n'

export function DropOverlay() {
  const t = useTranslation()
  return (
    <div className="absolute inset-0 z-50 bg-blue-600/20 border-2 border-dashed border-blue-400 rounded-xl flex items-center justify-center pointer-events-none">
      <p className="text-blue-300 text-lg font-medium">{t.dropPdfHere}</p>
    </div>
  )
}
