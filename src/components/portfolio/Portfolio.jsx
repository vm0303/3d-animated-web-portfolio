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


/* Laptop / desktop keeps the directional entrance motion. */
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
 * Phones, folded/unfolded foldables, and tablets use Motion fade-ins only.
 * Each component receives a full 1.2-second fade. The next component begins
 * when the previous fade finishes:
 *
 * image     0.0s -> 1.2s
 * title     1.2s -> 2.4s
 * paragraph 2.4s -> 3.6s
 * button    3.6s -> 4.8s
 *
 * No x/y/scale motion is applied in this mode.
 */
const TOUCH_FADE_DURATION = 1.2

const fadeOnlyImageVariants = {
  inactive: {
    opacity: 0,
  },

  active: {
    opacity: 1,

    transition: {
      duration: TOUCH_FADE_DURATION,
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
      duration: TOUCH_FADE_DURATION,
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
            custom={
              fadeOnlyMotion
                ? TOUCH_FADE_DURATION
                : undefined
            }
          >
            {item.title}
          </motion.h1>


          <motion.p
            variants={selectedTextItemVariants}
            custom={
              fadeOnlyMotion
                ? TOUCH_FADE_DURATION * 2
                : undefined
            }
          >
            {item.desc}
          </motion.p>


          <motion.a
            variants={selectedTextItemVariants}
            custom={
              fadeOnlyMotion
                ? TOUCH_FADE_DURATION * 3
                : undefined
            }
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
   * Laptop/desktop arrows are activity-driven.
   * Portfolio entry shows them immediately. Every pointer/keyboard/wheel
   * interaction restarts the five-second idle timer. When the timer expires,
   * CSS performs the actual opacity fade instead of removing the controls.
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
