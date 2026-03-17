import {useEffect, useRef, useState} from 'react'

type LazyImageProps = {
  src: string
  alt: string
  className?: string
}

export function LazyImage({ src, alt, className }: LazyImageProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref}>
      {isVisible ? (
        <img src={src} alt={alt} className={className} />
      ) : (
        <div className={className} />
      )}
    </div>
  )
}
