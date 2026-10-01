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

  return (
    <article
      className="pSlide"
      aria-hidden={!isActive}
    >
      <div className="pSlideContent">

        <motion.div
          className="pImg"

          variants={imageVariants}

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

          variants={textVariants}

          initial="inactive"

          animate={
            shouldAnimate
              ? "active"
              : "inactive"
          }
        >
          <motion.h1
            variants={textItemVariants}
          >
            {item.title}
          </motion.h1>


          <motion.p
            variants={textItemVariants}
          >
            {item.desc}
          </motion.p>


          <motion.a
            variants={textItemVariants}

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

      className="portfolio"

      tabIndex={0}

      onKeyDown={handleKeyDown}

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