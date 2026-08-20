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
  const [
    debugPosition,
    setDebugPosition
  ] = useState(null)


  /*
   * Which device family are we currently testing?
   */
  const [
    qaFamily,
    setQaFamily
  ] = useState(
    () =>
      localStorage.getItem(
        'portfolio-qa-family'
      ) || ''
  )


  /*
   * Mobile browser UI state.
   *
   * This is intentionally manual because Safari/Chrome
   * do not expose a universal reliable property saying
   * "the toolbar is currently collapsed".
   */
  const [
    qaBrowserUi,
    setQaBrowserUi
  ] = useState(
    () =>
      localStorage.getItem(
        'portfolio-qa-browser-ui'
      ) || 'expanded'
  )

  const [
    qaFoldState,
    setQaFoldState
  ] = useState(
    () =>
      localStorage.getItem(
        'portfolio-qa-fold-state'
      ) || 'standard'
  );




  const [
    qaSaveStatus,
    setQaSaveStatus
  ] = useState('')


  const dragRef = useRef({
    dragging: false,
    offsetX: 0,
    offsetY: 0
  })


  /*
   * Used to throttle viewport debugger updates without
   * causing React rerenders while scrolling/resizing.
   */
  const debugAnimationFrameRef =
    useRef(null)


  const handleDebugPointerDown = (e) => {
    const debug = e.currentTarget
    const rect = debug.getBoundingClientRect()

    dragRef.current = {
      dragging: true,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top
    }

    debug.setPointerCapture?.(
      e.pointerId
    )

    /*
     * First drag converts the centered position into
     * explicit pixel coordinates.
     */
    setDebugPosition({
      x: rect.left,
      y: rect.top
    })
  }


  const handleDebugPointerMove = (e) => {
    if (!dragRef.current.dragging) {
      return
    }

    const debug = e.currentTarget
    const rect = debug.getBoundingClientRect()

    let x =
      e.clientX -
      dragRef.current.offsetX

    let y =
      e.clientY -
      dragRef.current.offsetY

    const maxX =
      Math.max(
        0,
        window.innerWidth -
        rect.width
      )

    const maxY =
      Math.max(
        0,
        window.innerHeight -
        rect.height
      )

    x =
      Math.max(
        0,
        Math.min(x, maxX)
      )

    y =
      Math.max(
        0,
        Math.min(y, maxY)
      )

    setDebugPosition({
      x,
      y
    })
  }


  const handleDebugPointerUp = (e) => {
    dragRef.current.dragging = false

    e.currentTarget
      .releasePointerCapture?.(
        e.pointerId
      )
  }


  /*
   * Build the JSON that should be copied/downloaded.
   *
   * In addition to the actual viewport snapshot, include
   * the QA labels that we selected manually.
   */
  const buildQaJson = () => {
    const snapshot =
      captureViewportSnapshot()

    window
      .__PORTFOLIO_VIEWPORT_DEBUG__ =
      snapshot

    return {
      family:
        String(qaFamily)
          .replace(/\D/g, '')
          .padStart(2, '0'),

      browserUi:
        qaBrowserUi,

      foldState:
        qaFoldState,

      snapshot
    }
  }


  const handleCopyViewportJSON =
    async (e) => {
      e.stopPropagation()

      const data =
        buildQaJson()

      const json =
        JSON.stringify(
          data,
          null,
          2
        )

      const button =
        e.currentTarget

      const originalText =
        button.textContent

      try {
        await navigator.clipboard
          .writeText(json)

        button.textContent =
          'Copied!'
      }

      catch {
        /*
         * Clipboard fallback for environments where
         * navigator.clipboard is unavailable.
         */
        const textarea =
          document.createElement(
            'textarea'
          )

        textarea.value = json

        textarea.style.position =
          'fixed'

        textarea.style.opacity =
          '0'

        textarea.style.pointerEvents =
          'none'

        document.body
          .appendChild(
            textarea
          )

        textarea.focus()
        textarea.select()

        try {
          document.execCommand(
            'copy'
          )

          button.textContent =
            'Copied!'
        }

        catch {
          button.textContent =
            'Copy failed'
        }

        textarea.remove()
      }

      setTimeout(
        () => {
          button.textContent =
            originalText
        },
        1200
      )
    }


  const handleDownloadViewportJSON =
    (e) => {
      e.stopPropagation()

      const data =
        buildQaJson()

      const snapshot =
        data.snapshot

      const json =
        JSON.stringify(
          data,
          null,
          2
        )

      const blob =
        new Blob(
          [json],
          {
            type:
              'application/json'
          }
        )

      const url =
        URL.createObjectURL(
          blob
        )

      const link =
        document.createElement(
          'a'
        )

      const safeOrientation =
        String(
          snapshot.orientation
        )
          .replace(
            /[^a-z0-9-]/gi,
            '-'
          )

      link.download =
        [
          'viewport',
          data.family || 'unknown-family',
          snapshot.inner.width +
          'x' +
          snapshot.inner.height,
          safeOrientation,
          data.foldState,
          data.browserUi
        ].join('-') +
        '.json'

      link.href = url

      document.body
        .appendChild(
          link
        )

      link.click()

      link.remove()

      setTimeout(
        () => {
          URL.revokeObjectURL(
            url
          )
        },
        1000
      )
    }


  const handleQaFamilyChange =
    (e) => {
      const value =
        e.target.value
          .replace(/\D/g, '')
          .slice(0, 2)

      setQaFamily(
        value
      )

      localStorage.setItem(
        'portfolio-qa-family',
        value
      )
    }


  const handleQaBrowserUiChange =
    (e) => {
      const value =
        e.target.value

      setQaBrowserUi(
        value
      )

      localStorage.setItem(
        'portfolio-qa-browser-ui',
        value
      )
    }

  const handleQaFoldStateChange =
    (e) => {

      const value =
        e.target.value;


      setQaFoldState(
        value
      );


      localStorage.setItem(
        'portfolio-qa-fold-state',
        value
      );

    };


  const handleSaveObservation =
    async (e) => {
      e.stopPropagation()

      const family =
        String(qaFamily)
          .replace(/\D/g, '')
          .padStart(2, '0')

      if (
        !/^\d{2}$/.test(
          family
        )
      ) {
        setQaSaveStatus(
          'Enter Family number'
        )

        return
      }

      /*
       * If the Family / Browser UI / Fold State controls opened the
       * on-screen keyboard, dismiss it before measuring the viewport.
       * The Visual Viewport API shrinks around virtual keyboards, which
       * would otherwise contaminate browser-chrome observations.
       */
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 400)
      )

      const snapshot =
        captureViewportSnapshot()

      window
        .__PORTFOLIO_VIEWPORT_DEBUG__ =
        snapshot

      setQaSaveStatus(
        'Saving...'
      )

      try {
        const response =
          await fetch(
            '/__qa/observations',
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json'
              },

              body:
                JSON.stringify({
                  family,

                  browserUi:
                    qaBrowserUi,

                  foldState:
                    qaFoldState,

                  snapshot
                })
            }
          )

        /*
         * Read text first so that if the server returns
         * malformed JSON, we can show a useful error.
         */
        const responseText =
          await response.text()

        let result

        try {
          result =
            JSON.parse(
              responseText
            )
        }

        catch {
          throw new Error(
            `Server returned invalid JSON: ${responseText.slice(0, 180)}`
          )
        }

        if (
          !response.ok ||
          !result.ok
        ) {
          throw new Error(
            result.error ||
            'Save failed.'
          )
        }

        setQaFamily(
          family
        )

        localStorage.setItem(
          'portfolio-qa-family',
          family
        )

        setQaSaveStatus(
          `Saved ${family} — ${qaFoldState} — ${qaBrowserUi} — ${snapshot.inner.width}×${snapshot.inner.height}`
        );

        console.log(
          '[Responsive QA] Observation saved:',
          result
        )

        setTimeout(
          () => {
            setQaSaveStatus('')
          },
          3000
        )
      }

      catch (error) {
        console.error(
          '[Responsive QA] Save failed:',
          error
        )

        setQaSaveStatus(
          `Failed: ${error.message}`
        )
      }
    }


  useEffect(() => {
    const updateViewportDebug =
      () => {
        const output =
          document.getElementById(
            'viewport-debug-output'
          )

        if (!output) {
          return
        }

        const snapshot =
          captureViewportSnapshot()

        window
          .__PORTFOLIO_VIEWPORT_DEBUG__ =
          snapshot

        const visualWidth =
          snapshot.visual
            ?.width ??
          'N/A'

        const visualHeight =
          snapshot.visual
            ?.height ??
          'N/A'

        const scale =
          snapshot.visual
            ?.scale ??
          'N/A'

        const offsetTop =
          snapshot.visual
            ?.offsetTop ??
          'N/A'

        const pageTop =
          snapshot.visual
            ?.pageTop ??
          'N/A'

        output.innerHTML = `
          <strong>LAYOUT</strong>
          <br>

          inner:
          ${snapshot.inner.width}
          ×
          ${snapshot.inner.height}

          <br>

          visual:
          ${visualWidth}
          ×
          ${visualHeight}

          <br>

          scale:
          ${scale}

          <br>

          DPR:
          ${snapshot.devicePixelRatio}

          <br><br>

          <strong>VISUAL VIEWPORT</strong>
          <br>

          offsetTop:
          ${offsetTop}

          <br>

          pageTop:
          ${pageTop}

          <br><br>

          <strong>SCREEN</strong>
          <br>

          screen:
          ${snapshot.screen.width}
          ×
          ${snapshot.screen.height}

          <br>

          available:
          ${snapshot.screen.availWidth}
          ×
          ${snapshot.screen.availHeight}

          <br><br>

          <strong>DOCUMENT</strong>
          <br>

          scrollY:
          ${snapshot.document.scrollY}

          <br>

          scrollWidth:
          ${snapshot.document.scrollWidth}

          <br>

          scrollHeight:
          ${snapshot.document.scrollHeight}

          <br><br>

          orientation:
          ${snapshot.orientation}
        `
      }


    const scheduleViewportDebugUpdate =
      () => {
        if (
          debugAnimationFrameRef
            .current !== null
        ) {
          return
        }

        debugAnimationFrameRef.current =
          requestAnimationFrame(
            () => {
              debugAnimationFrameRef
                .current =
                null

              updateViewportDebug()
            }
          )
      }


    updateViewportDebug()


    const initialTimer =
      setTimeout(
        scheduleViewportDebugUpdate,
        1000
      )


    const handleOrientationChange =
      () => {
        /*
         * Re-center the debugger after the device rotates.
         */
        setDebugPosition(null)

        setTimeout(
          scheduleViewportDebugUpdate,
          800
        )
      }


    window.addEventListener(
      'resize',
      scheduleViewportDebugUpdate
    )

    window.addEventListener(
      'scroll',
      scheduleViewportDebugUpdate,
      {
        passive: true
      }
    )

    window.addEventListener(
      'orientationchange',
      handleOrientationChange
    )

    window.visualViewport
      ?.addEventListener(
        'resize',
        scheduleViewportDebugUpdate
      )

    window.visualViewport
      ?.addEventListener(
        'scroll',
        scheduleViewportDebugUpdate
      )


    return () => {
      clearTimeout(
        initialTimer
      )

      if (
        debugAnimationFrameRef
          .current !== null
      ) {
        cancelAnimationFrame(
          debugAnimationFrameRef
            .current
        )
      }

      window.removeEventListener(
        'resize',
        scheduleViewportDebugUpdate
      )

      window.removeEventListener(
        'scroll',
        scheduleViewportDebugUpdate
      )

      window.removeEventListener(
        'orientationchange',
        handleOrientationChange
      )

      window.visualViewport
        ?.removeEventListener(
          'resize',
          scheduleViewportDebugUpdate
        )

      window.visualViewport
        ?.removeEventListener(
          'scroll',
          scheduleViewportDebugUpdate
        )
    }
  }, [])


  const debuggerButtonStyle = {
    width: '100%',
    padding: '7px 10px',
    border:
      '1px solid rgba(255,255,255,0.35)',
    borderRadius: '6px',
    background:
      'rgba(255,255,255,0.12)',
    color: 'white',
    fontFamily: 'monospace',
    fontSize: '14px',
    cursor: 'pointer',
    touchAction: 'manipulation'
  }


  return (
    <div className="container">

      <div
        id="viewport-debug"

        onPointerDown={
          handleDebugPointerDown
        }

        onPointerMove={
          handleDebugPointerMove
        }

        onPointerUp={
          handleDebugPointerUp
        }

        onPointerCancel={
          handleDebugPointerUp
        }

        style={{
          position: 'fixed',

          left:
            debugPosition
              ? `${debugPosition.x}px`
              : '50%',

          top:
            debugPosition
              ? `${debugPosition.y}px`
              : '50%',

          transform:
            debugPosition
              ? 'none'
              : 'translate(-50%, -50%)',

          zIndex: 999999,

          background:
            'rgba(0, 0, 0, 0.88)',

          color: 'white',

          padding: '10px',

          fontSize: '7px',

          lineHeight: '1',

          fontFamily: 'monospace',

          width: 'max-content',

          maxWidth:
            'calc(100vw - 20px)',

          boxSizing: 'border-box',

          pointerEvents: 'auto',

          cursor: 'move',

          touchAction: 'none',

          userSelect: 'none',

          border:
            '1px solid rgba(255,255,255,0.35)',

          borderRadius: '8px',

          boxShadow:
            '0 4px 14px rgba(0,0,0,0.4)'
        }}
      >

        <div
          id="viewport-debug-output"
        />




        <div
          style={{
            marginTop: '10px',
            paddingTop: '10px',
            borderTop:
              '1px solid rgba(255,255,255,0.25)'
          }}
        >

          {/* FAMILY */}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >

            <label
              htmlFor="qa-family"

              style={{
                fontSize: '13px',
                whiteSpace: 'nowrap'
              }}
            >
              Family:
            </label>


            <input
              id="qa-family"

              type="text"

              inputMode="numeric"

              maxLength={2}

              placeholder="04"

              value={
                qaFamily
              }

              onChange={
                handleQaFamilyChange
              }

              onPointerDown={
                (e) =>
                  e.stopPropagation()
              }

              style={{
                width: '48px',
                padding: '5px',

                border:
                  '1px solid rgba(255,255,255,0.35)',

                borderRadius:
                  '5px',

                background:
                  'rgba(255,255,255,0.12)',

                color: 'white',

                fontFamily:
                  'monospace',

                fontSize: '14px',

                textAlign: 'center'
              }}
            />

          </div>


          {/* BROWSER UI */}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '8px'
            }}
          >

            <label
              htmlFor="qa-browser-ui"

              style={{
                fontSize: '13px',
                whiteSpace: 'nowrap'
              }}
            >
              Browser UI:
            </label>


            <select
              id="qa-browser-ui"

              value={
                qaBrowserUi
              }

              onChange={
                handleQaBrowserUiChange
              }

              onPointerDown={
                (e) =>
                  e.stopPropagation()
              }

              style={{
                flex: 1,

                padding: '5px',

                border:
                  '1px solid rgba(255,255,255,0.35)',

                borderRadius:
                  '5px',

                background: '#222',

                color: 'white',

                fontFamily:
                  'monospace',

                fontSize:
                  '13px'
              }}
            >

              <option value="expanded">
                Expanded
              </option>

              <option value="collapsed">
                Collapsed
              </option>

            </select>

          </div>

          <div
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '8px'
  }}
>

  <label
    htmlFor="qa-fold-state"
    style={{
      fontSize: '13px',
      whiteSpace: 'nowrap'
    }}
  >
    Fold state:
  </label>


  <select
    id="qa-fold-state"

    value={
      qaFoldState
    }

    onChange={
      handleQaFoldStateChange
    }

    onPointerDown={
      (e) =>
        e.stopPropagation()
    }

    style={{
      flex: 1,
      padding: '5px',

      border:
        '1px solid rgba(255,255,255,0.35)',

      borderRadius: '5px',

      background: '#222',

      color: 'white',

      fontFamily: 'monospace',

      fontSize: '13px'
    }}
  >

    <option value="standard">
      Standard
    </option>

    <option value="unfolded">
      Unfolded
    </option>

    <option value="folded">
      Folded
    </option>

  </select>

</div>


          {/* SAVE */}

          <button
            type="button"

            onPointerDown={
              (e) =>
                e.stopPropagation()
            }

            onClick={
              handleSaveObservation
            }

            style={{
              ...debuggerButtonStyle,

              marginTop: '8px',

              background: '#1769aa',

              fontWeight: 'bold'
            }}
          >
            Save Observation
          </button>


          {
            qaSaveStatus && (
              <div
                style={{
                  marginTop: '6px',

                  fontSize: '12px',

                  textAlign:
                    'center',

                  maxWidth:
                    '220px',

                  overflowWrap:
                    'anywhere'
                }}
              >
                {qaSaveStatus}
              </div>
            )
          }

        </div>

      </div>


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