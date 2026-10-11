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


const App = () => {
  useEffect(() => {
    let preloadStarted = false

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

    return cleanup
  }, [])


  return (
    <div className="container">
      <section id="#hero">
        <Hero />
      </section>

      <LazySection
        id="#about"
        rootMargin="0px"
      >
        <Suspense fallback={null}>
          <About />
        </Suspense>
      </LazySection>

      <LazySection id="#portfolio">
        <Suspense fallback={null}>
          <Portfolio />
        </Suspense>
      </LazySection>

      <LazySection id="#contact">
        <Suspense fallback={null}>
          <Contact />
        </Suspense>
      </LazySection>
    </div>
  )
}

export default App
