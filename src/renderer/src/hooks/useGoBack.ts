import {useCallback} from 'react'
import {useLocation, useNavigate} from 'react-router-dom'

export function useGoBack(fallbackPath: string) {
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(() => {
    // react-router sets key to "default" on the initial entry.
    // Any in-app navigation produces a unique key, so "default" means
    // there is no previous in-app page to go back to.
    if (location.key !== 'default') {
      navigate(-1)
    } else {
      navigate(fallbackPath)
    }
  }, [navigate, location.key, fallbackPath])
}
