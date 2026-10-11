import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
} from 'react'

import Hero from './components/hero/hero'

const About = lazy(() =>
  import('./components/about/About')
)

const Portfolio = lazy(() =>
  import('./components/portfolio/Portfolio')
)

const Contact = lazy(() =>
  import('./components/contact/Contact')
)


const LazySection = ({
  id,
  children,
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
        rootMargin: '-100px 0px',
        threshold: 0,
      }
    )

    observer.observe(section)

    return () => {
      observer.disconnect()
    }
  }, [shouldRender])


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
  return (
    <div className="container">
      <section id="#hero">
        <Hero />
      </section>

      <LazySection id="#about">
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
