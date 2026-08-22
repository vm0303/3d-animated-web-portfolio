import Hero from './components/hero/Hero'
import About from './components/about/About'
import Portfolio from './components/portfolio/Portfolio'
import Contact from './components/contact/Contact'

import {
  useEffect,
  useRef,
  useState
} from 'react'


const captureViewportSnapshot = () => {
  const visualViewport = window.visualViewport

  const orientation =
    window.screen?.orientation?.type ||
    (
      window.innerWidth > window.innerHeight
        ? 'landscape'
        : 'portrait'
    )

  const round = (value) =>
    Math.round(value * 100) / 100

  return {
    capturedAt: new Date().toISOString(),

    orientation,

    inner: {
      width: window.innerWidth,
      height: window.innerHeight
    },

    visual: visualViewport
      ? {
        width: round(visualViewport.width),
        height: round(visualViewport.height),
        scale: visualViewport.scale,
        offsetTop: round(visualViewport.offsetTop),
        offsetLeft: round(visualViewport.offsetLeft),
        pageTop: round(visualViewport.pageTop),
        pageLeft: round(visualViewport.pageLeft)
      }
      : null,

    screen: {
      width: window.screen?.width ?? null,
      height: window.screen?.height ?? null,
      availWidth: window.screen?.availWidth ?? null,
      availHeight: window.screen?.availHeight ?? null
    },

    document: {
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      scrollY: Math.round(window.scrollY)
    },

    devicePixelRatio: window.devicePixelRatio,

    userAgent: navigator.userAgent
  }
}


const App = () => {


  return (
    <div className="container">



      <section id="#hero">
        <Hero />
      </section>


      <section id="#about">
        <About />
      </section>


      <section id="#portfolio">
        <Portfolio />
      </section>


      <section id="#contact">
        <Contact />
      </section>

    </div>
  )
}


export default App