import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
} from 'react'

import Hero from './components/hero/hero'

const loadAbout = () =>
  import('./components/about/About')

const About = lazy(loadAbout)

const Portfolio = lazy(() =>
  import('./components/portfolio/Portfolio')
)

const Contact = lazy(() =>
  import('./components/contact/Contact')
)


const LazySection = ({
  id,
  children,
  rootMargin = '-100px 0px',
}) => {
  const sectionRef = useRef(null)
  const [shouldRender, setShouldRender] =
    useState(false)


  useEffect(() => {
    if (shouldRender) {
      return undefined
    }

    const section = sectionRef.current

    if (!section) {
      return undefined
    }

    if (
      typeof window === 'undefined' ||
      !('IntersectionObserver' in window)
    ) {
      setShouldRender(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          return
        }

        setShouldRender(true)
        observer.disconnect()
      },
      {
        root: null,
        rootMargin,
        threshold: 0,
      }
    )

    observer.observe(section)

    return () => {
      observer.disconnect()
    }
  }, [
    shouldRender,
    rootMargin,
  ])


  return (
    <section
      id={id}
      ref={sectionRef}
    >
      {shouldRender ? children : null}
    </section>
  )
}


const isTouchOnlyMobilePlatform = () => {
  if (typeof navigator === 'undefined') {
    return false
  }

  if (navigator.userAgentData?.mobile) {
    return true
  }

  const userAgent =
    navigator.userAgent || ''

  const platform =
    navigator.platform || ''

  const isIPadOS =
    platform === 'MacIntel' &&
    navigator.maxTouchPoints > 1

  return (
    /Android|iPhone|iPad|iPod/i
      .test(userAgent) ||
    isIPadOS
  )
}


const App = () => {
  const [
    desktopInputDetected,
    setDesktopInputDetected,
  ] = useState(false)


  /*
   * Hybrid Windows/ChromeOS/Linux laptops can advertise touch as their
   * primary pointer even while a real mouse or trackpad is in use. Track
   * demonstrated desktop input once for the whole session instead of asking
   * pointer-capability media queries to classify the device.
   *
   * iOS/iPadOS/Android stay touch-first even if an external pointer exists so
   * the accepted phone/tablet/foldable Motion behavior remains unchanged.
   */
  useEffect(() => {
    if (isTouchOnlyMobilePlatform()) {
      return undefined
    }

    const markDesktopInput = () => {
      setDesktopInputDetected(true)
    }

    const handlePointerInput = (event) => {
      if (event.pointerType === 'mouse') {
        markDesktopInput()
      }
    }

    window.addEventListener(
      'pointermove',
      handlePointerInput,
      { passive: true }
    )

    window.addEventListener(
      'pointerdown',
      handlePointerInput,
      { passive: true }
    )

    window.addEventListener(
      'wheel',
      markDesktopInput,
      { passive: true }
    )

    return () => {
      window.removeEventListener(
        'pointermove',
        handlePointerInput
      )

      window.removeEventListener(
        'pointerdown',
        handlePointerInput
      )

      window.removeEventListener(
        'wheel',
        markDesktopInput
      )
    }
  }, [])


  useEffect(() => {
    let preloadStarted = false
    let idleHandle = null
    let fallbackTimer = null

    const cleanup = () => {
      window.removeEventListener(
        'wheel',
        startAboutPreload
      )

      window.removeEventListener(
        'touchmove',
        startAboutPreload
      )

      window.removeEventListener(
        'keydown',
        handleKeyDown
      )

      if (
        idleHandle !== null &&
        'cancelIdleCallback' in window
      ) {
        window.cancelIdleCallback(idleHandle)
        idleHandle = null
      }

      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer)
        fallbackTimer = null
      }
    }

    const startAboutPreload = () => {
      if (preloadStarted) {
        return
      }

      preloadStarted = true
      void loadAbout()
      cleanup()
    }

    const handleKeyDown = (event) => {
      if (
        event.key === 'ArrowDown' ||
        event.key === 'PageDown' ||
        event.key === 'End' ||
        event.key === ' '
      ) {
        startAboutPreload()
      }
    }

    window.addEventListener(
      'wheel',
      startAboutPreload,
      { passive: true }
    )

    window.addEventListener(
      'touchmove',
      startAboutPreload,
      { passive: true }
    )

    window.addEventListener(
      'keydown',
      handleKeyDown
    )

    if ('requestIdleCallback' in window) {
      idleHandle = window.requestIdleCallback(
        () => {
          idleHandle = null
          startAboutPreload()
        },
        {
          timeout: 1500,
        }
      )
    }
    else {
      fallbackTimer = window.setTimeout(
        () => {
          fallbackTimer = null
          startAboutPreload()
        },
        1200
      )
    }

    return cleanup
  }, [])


  return (
    <div className="container">
      <section id="hero">
        <Hero />
      </section>

      <LazySection
        id="about"
        rootMargin="0px"
      >
        <Suspense fallback={null}>
          <About />
        </Suspense>
      </LazySection>

      <LazySection id="portfolio">
        <Suspense fallback={null}>
          <Portfolio
            desktopInputDetected={
              desktopInputDetected
            }
          />
        </Suspense>
      </LazySection>

      <LazySection id="contact">
        <Suspense fallback={null}>
          <Contact
            desktopInputDetected={
              desktopInputDetected
            }
          />
        </Suspense>
      </LazySection>
    </div>
  )
}

export default App
