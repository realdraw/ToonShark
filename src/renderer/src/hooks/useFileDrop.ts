import {useCallback, useRef, useState} from 'react'
import {isSupportedFile} from '@shared/constants/supported-formats'

type UseFileDropOptions = {
  onDrop: (paths: string[]) => void
}

export function useFileDrop({ onDrop }: UseFileDropOptions) {
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    dragCounter.current--
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDragging(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragging(false)
    const paths: string[] = []
    for (const file of Array.from(e.dataTransfer.files)) {
      if (!isSupportedFile(file.name)) continue
      const path = window.api.getPathForFile(file)
      if (path) paths.push(path)
    }
    if (paths.length > 0) onDrop(paths)
  }, [onDrop])

  const dropProps = {
    onDrop: handleDrop,
    onDragOver: handleDragOver,
    onDragEnter: handleDragEnter,
    onDragLeave: handleDragLeave
  }

  return { isDragging, dropProps }
}
