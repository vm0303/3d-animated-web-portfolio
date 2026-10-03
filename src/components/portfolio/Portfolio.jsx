import "./portfolio.css"

import {
  motion,
  useInView,
} from "motion/react"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

import useEmblaCarousel from "embla-carousel-react"


const items = [
  {
    id: 1,
    img: "/p1.jpg",
    title: "WeathAware",
    desc: "An interactive React weather dashboard delivering current conditions, hourly trends, multi-day forecasts, geolocation, autocomplete, adaptive weather themes, dark mode, notifications, and smooth Framer Motion animations through WeatherAPI integration across modern devices.",
    link: "https://weathaware-alpha.vercel.app/",
  },
  {
    id: 2,
    img: "/p2.jpg",
    title: "NYC Info Tours",
    desc: "A full-stack serverless NYC tour booking platform using AWS Lambda, DynamoDB, API Gateway, S3, CloudFront, SES, and ACM, with responsive forms, pricing calculations, validation, confirmations, and secure HTTPS delivery for users.",
    link: "https://www.nycinfotours.app/",
  },
  {
    id: 3,
    img: "/p3.jpg",
    title: "2048",
    desc: "A Vue CLI recreation of the classic 2048 game backed by Google Firestore, featuring responsive gameplay and mobile swipe support for an interactive browser-based puzzle experience across devices and desktops.",
    link: "https://2048-using-vue-and-firestore.vercel.app/",
  },
  {
    id: 4,
    img: "/p4.jpg",
    title: "DocQuery",
    desc: "An AI-powered document question-answering application supporting PDF, TXT, and DOCX uploads, using FAISS, OpenAI embeddings, LangChain, and Streamlit to deliver source-grounded natural-language answers through a clean chat workflow for uploaded files.",
    link: "https://docquerybot-0303.streamlit.app/",
  },
  {
    id: 5,
    img: "/p5.jpg",
    title: "React Arcade Puzzles",
    desc: "A React-based collection of interactive puzzle games designed around problem-solving, featuring Towers of Hanoi with Redux-assisted interactions and a sliding puzzle animated with React Motion for engaging browser gameplay across devices.",
    link: "https://react-arcade-puzzles.vercel.app/",
  },
]


/*
 * Laptop / desktop motion keeps the existing directional entrance.
 */
const imageVariants = {
  inactive: {
    x: -180,
    y: 120,
    scale: 0.96,
    opacity: 0,
  },

  active: {
    x: 0,
    y: 0,
    scale: 1,
    opacity: 1,

    transition: {
      duration: 0.55,
      ease: "easeOut",
    },
  },
}


const textVariants = {
  inactive: {
    x: 180,
    y: 120,
    opacity: 0,
  },

  active: {
    x: 0,
    y: 0,
    opacity: 1,

    transition: {
      duration: 0.55,
      ease: "easeOut",

      staggerChildren: 0.08,
      delayChildren: 0.08,
    },
  },
}


const textItemVariants = {
  inactive: {
    x: 40,
    y: 20,
    opacity: 0,
  },

  active: {
    x: 0,
    y: 0,
    opacity: 1,

    transition: {
      duration: 0.35,
      ease: "easeOut",
    },
  },
}


/*
 * Phones, foldables, and tablets use a fade-only sequence.
 *
 * No x/y movement is used here. The components enter one-by-one:
 *
 * image  -> immediately
 * title  -> 2 seconds
 * text   -> 4 seconds
 * button -> 6 seconds
 *
 * This mode is selected for touch-first / coarse-pointer devices.
 */
const fadeOnlyImageVariants = {
  inactive: {
    opacity: 0,
  },

  active: {
    opacity: 1,

    transition: {
      duration: 0.5,
      ease: "easeOut",
    },
  },
}


const fadeOnlyTextContainerVariants = {
  inactive: {
    opacity: 1,
  },

  active: {
    opacity: 1,
  },
}


const fadeOnlyItemVariants = {
  inactive: {
    opacity: 0,
  },

  active: (delaySeconds = 0) => ({
    opacity: 1,

    transition: {
      duration: 0.5,
      delay: delaySeconds,
      ease: "easeOut",
    },
  }),
}


const TOUCH_MOTION_QUERY =
  "(hover: none), (pointer: coarse)"

const ARROW_IDLE_MS = 5000


const ArrowIcon = ({ direction }) => (
  <svg
    viewBox="0 0 32 56"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d={
        direction === "left"
          ? "M28 4 L4 28 L28 52"
          : "M4 4 L28 28 L4 52"
      }
    />
  </svg>
)


const ProjectSlide = ({
  item,
  isActive,
  portfolioInView,
  fadeOnlyMotion,
}) => {

  /*
   * This is the actual animation condition.
   *
   * A project animates only when:
   *
   * 1. Portfolio itself is on screen
   * 2. This project is Embla's selected project
   */
  const shouldAnimate =
    portfolioInView && isActive

  const selectedImageVariants =
    fadeOnlyMotion
      ? fadeOnlyImageVariants
      : imageVariants

  const selectedTextVariants =
    fadeOnlyMotion
      ? fadeOnlyTextContainerVariants
      : textVariants

  const selectedTextItemVariants =
    fadeOnlyMotion
      ? fadeOnlyItemVariants
      : textItemVariants

  return (
    <article
      className="pSlide"
      aria-hidden={!isActive}
    >
      <div className="pSlideContent">

        <motion.div
          className="pImg"

          variants={selectedImageVariants}

          /*
           * IMPORTANT:
           * Do NOT use initial={false}.
           *
           * We want WeathAware to begin in the
           * inactive state before Portfolio enters.
           */
          initial="inactive"

          animate={
            shouldAnimate
              ? "active"
              : "inactive"
          }
        >
          <img
            src={item.img}
            alt={`${item.title} project preview`}
          />
        </motion.div>


        <motion.div
          className="pText"

          variants={selectedTextVariants}

          initial="inactive"

          animate={
            shouldAnimate
              ? "active"
              : "inactive"
          }
        >
          <motion.h1
            variants={selectedTextItemVariants}
            custom={fadeOnlyMotion ? 2 : undefined}
          >
            {item.title}
          </motion.h1>


          <motion.p
            variants={selectedTextItemVariants}
            custom={fadeOnlyMotion ? 4 : undefined}
          >
            {item.desc}
          </motion.p>


          <motion.a
            variants={selectedTextItemVariants}
            custom={fadeOnlyMotion ? 6 : undefined}

            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            <button type="button">
              View Project
            </button>
          </motion.a>

        </motion.div>

      </div>
    </article>
  )
}


const Portfolio = () => {

  const portfolioRef = useRef(null)

  /*
   * Trigger fairly early.
   *
   * 0.15 means we don't wait until almost half of the
   * Portfolio section is visible.
   *
   * As soon as roughly 15% enters the viewport,
   * Motion starts.
   */
  const portfolioInView =
    useInView(
      portfolioRef,
      {
        amount: 0.15,
      }
    )


  const [emblaRef, emblaApi] =
    useEmblaCarousel({
      loop: true,
      align: "start",
    })


  const [
    selectedIndex,
    setSelectedIndex,
  ] = useState(0)


  /*
   * Real phones, foldables, and tablets are touch-first / coarse-pointer
   * devices. They use the sequential fade-only motion above rather than
   * the laptop/desktop x/y entrance motion.
   */
  const [
    fadeOnlyMotion,
    setFadeOnlyMotion,
  ] = useState(() => {
    if (typeof window === "undefined") {
      return false
    }

    return window
      .matchMedia(TOUCH_MOTION_QUERY)
      .matches
  })

  useEffect(() => {
    const mediaQuery =
      window.matchMedia(
        TOUCH_MOTION_QUERY
      )

    const syncMotionMode = () => {
      setFadeOnlyMotion(
        mediaQuery.matches
      )
    }

    syncMotionMode()

    mediaQuery.addEventListener(
      "change",
      syncMotionMode
    )

    return () => {
      mediaQuery.removeEventListener(
        "change",
        syncMotionMode
      )
    }
  }, [])


  /*
   * Laptop/desktop carousel arrows are activity-driven.
   *
   * Entering the Portfolio shows them.
   * Pointer movement, clicks, wheel activity, or keyboard focus keeps them
   * visible. Five seconds after the last activity they fade back out.
   *
   * Phone/foldable/tablet CSS still hides arrows completely.
   */
  const [
    controlsActive,
    setControlsActive,
  ] = useState(false)

  const controlsTimerRef =
    useRef(null)

  const clearControlsTimer =
    useCallback(() => {
      if (controlsTimerRef.current) {
        window.clearTimeout(
          controlsTimerRef.current
        )

        controlsTimerRef.current = null
      }
    }, [])

  const activateControls =
    useCallback(() => {
      setControlsActive(true)
      clearControlsTimer()

      controlsTimerRef.current =
        window.setTimeout(
          () => {
            setControlsActive(false)
            controlsTimerRef.current = null
          },
          ARROW_IDLE_MS
        )
    }, [
      clearControlsTimer,
    ])

  useEffect(() => {
    if (portfolioInView) {
      activateControls()
      return
    }

    clearControlsTimer()
    setControlsActive(false)
  }, [
    portfolioInView,
    activateControls,
    clearControlsTimer,
  ])

  useEffect(() => {
    return () => {
      clearControlsTimer()
    }
  }, [
    clearControlsTimer,
  ])


  const scrollPrev = useCallback(() => {
    emblaApi?.scrollPrev()
  }, [
    emblaApi,
  ])


  const scrollNext = useCallback(() => {
    emblaApi?.scrollNext()
  }, [
    emblaApi,
  ])


  const scrollTo = useCallback(
    (index) => {
      emblaApi?.scrollTo(index)
    },
    [
      emblaApi,
    ]
  )


  const onSelect = useCallback(
    (api) => {
      setSelectedIndex(
        api.selectedScrollSnap()
      )
    },
    []
  )


  useEffect(() => {
    if (!emblaApi) return

    onSelect(emblaApi)

    emblaApi.on(
      "select",
      onSelect
    )

    emblaApi.on(
      "reInit",
      onSelect
    )

    return () => {
      emblaApi.off(
        "select",
        onSelect
      )

      emblaApi.off(
        "reInit",
        onSelect
      )
    }
  }, [
    emblaApi,
    onSelect,
  ])


  const handleKeyDown = (event) => {

    activateControls()

    if (event.key === "ArrowLeft") {
      event.preventDefault()

      scrollPrev()
    }


    if (event.key === "ArrowRight") {
      event.preventDefault()

      scrollNext()
    }

  }


  return (
    <div
      ref={portfolioRef}

      className={
        `portfolio ${
          controlsActive
            ? "pControlsActive"
            : ""
        }`
      }

      tabIndex={0}

      onKeyDown={handleKeyDown}

      onPointerMove={activateControls}
      onPointerDown={activateControls}
      onWheel={activateControls}
      onFocus={activateControls}

      aria-label="Portfolio projects"
    >

      <div
        className="pViewport"
        ref={emblaRef}
      >
        <div className="pContainer">

          {items.map(
            (item, index) => (

              <ProjectSlide
                key={item.id}

                item={item}

                isActive={
                  index === selectedIndex
                }

                portfolioInView={
                  portfolioInView
                }

                fadeOnlyMotion={
                  fadeOnlyMotion
                }
              />

            )
          )}

        </div>
      </div>


      <button
        type="button"

        className="pArrow pArrowLeft"

        onClick={scrollPrev}

        aria-label="Previous project"
      >
        <ArrowIcon direction="left" />
      </button>


      <button
        type="button"

        className="pArrow pArrowRight"

        onClick={scrollNext}

        aria-label="Next project"
      >
        <ArrowIcon direction="right" />
      </button>


      <div
        className="pDots"

        role="group"

        aria-label="Choose project"
      >

        {items.map(
          (item, index) => (

            <button
              type="button"

              key={item.id}

              className={
                `pDot ${
                  index === selectedIndex
                    ? "pDotActive"
                    : ""
                }`
              }

              onClick={() =>
                scrollTo(index)
              }

              aria-label={
                `Go to ${item.title}`
              }

              aria-current={
                index === selectedIndex
                  ? "true"
                  : undefined
              }
            />

          )
        )}

      </div>

    </div>
  )
}


export default Portfolio