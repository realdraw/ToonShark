import {useToastStore} from '../stores/toastStore'

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-2 px-4 py-3 rounded-lg shadow-lg text-sm text-white animate-[slideIn_0.25s_ease-out] ${
            toast.type === 'success'
              ? 'bg-emerald-600'
              : toast.type === 'info'
                ? 'bg-blue-600'
                : 'bg-red-600'
          }`}
        >
          <span className="flex-1">{toast.message}</span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.onClick()
                removeToast(toast.id)
              }}
              className="text-white font-medium underline underline-offset-2 hover:text-white/80 flex-shrink-0 text-xs"
            >
              {toast.action.label}
            </button>
          )}
          <button
            onClick={() => removeToast(toast.id)}
            className="text-white/70 hover:text-white flex-shrink-0 leading-none text-lg"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  )
}
