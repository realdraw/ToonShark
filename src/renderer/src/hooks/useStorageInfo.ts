import {useCallback, useEffect, useState} from 'react'
import type {StorageInfo} from '@shared/types'

export function useStorageInfo() {
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)

  const refresh = useCallback(() => {
    window.api.getStorageInfo().then(setStorageInfo).catch((err) => {
      window.api.log('error', 'Failed to load storage info', String(err))
    })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { storageInfo, refreshStorage: refresh }
}
