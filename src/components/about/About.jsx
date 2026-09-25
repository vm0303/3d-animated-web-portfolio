import {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";

import {
  motion,
  useInView,
  AnimatePresence,
} from "motion/react";


import AboutModelContainer
  from "./stage/AboutModelContainer";

import LaptopScreenModal
  from "./LaptopScreenModal";

import {
  readAboutQaConfig,
} from "../../qaSrc/aboutQa";

import "./about.css";


const titleVariants = {
  initial: {
    x: -100,
    y: -50,
    opacity: 0,
  },

  animate: {
    x: 0,
    y: 0,
    opacity: 1,

    transition: {
      duration: 0.8,
    },
  },
};


const listVariants = {
  initial: {
    x: -80,
    opacity: 0,
  },

  animate: {
    x: 0,
    opacity: 1,

    transition: {
      duration: 0.7,
      staggerChildren: 0.18,
    },
  },
};


const paragraphVariants = {
  initial: {
    x: -80,
    opacity: 0,
  },

  animate: {
    x: 0,
    opacity: 1,

    transition: {
      duration: 0.6,
    },
  },
};


const buttonVariants = {
  initial: {
    opacity: 0,
  },

  animate: {
    opacity: 1,

    transition: {
      duration: 1.2,
    },
  },

  exit: {
    opacity: 0,

    transition: {
      duration: 0.4,
      ease: "easeOut",
    },
  },
};


const About = () => {
  /*
   * QA-only deterministic scene/model selection.
   * Production behavior is unchanged unless about-qa=1
   * is present in the URL.
   */
  const aboutQaRef =
    useRef(
      readAboutQaConfig()
    );

  const aboutQa =
    aboutQaRef.current;


  const [
    activeScene,
    setActiveScene,
  ] = useState(
    () =>
      aboutQa.scene ??
      "developer"
  );


  const aboutRef =
    useRef(null);


  const [
    isLaptopScreenOpen,
    setIsLaptopScreenOpen,
  ] = useState(false);


  const screenTriggerRef =
    useRef(null);


  const [
    isLaptopModelReady,
    setIsLaptopModelReady,
  ] = useState(false);


  const openLaptopScreen =
    useCallback(() => {
      setIsLaptopScreenOpen(true);
    }, []);


  const closeLaptopScreen =
    useCallback(() => {
      setIsLaptopScreenOpen(false);
    }, []);


  const handleLaptopModelReady =
    useCallback(() => {
      setIsLaptopModelReady(true);
    }, []);


  const isInView =
    useInView(
      aboutRef,
      {
        amount: 0.15,
        once: false,
      }
    );


  useEffect(() => {
    if (
      !isInView &&
      !aboutQa.enabled
    ) {
      setActiveScene("developer");

      setIsLaptopModelReady(false);
    }
  }, [
    isInView,
    aboutQa.enabled,
  ]);


  useEffect(() => {
    if (
      activeScene !== "developer"
    ) {
      setIsLaptopModelReady(false);
    }
  }, [activeScene]);


  /*
   * If About leaves view or another
   * model chapter becomes active,
   * make sure the laptop modal closes.
   */
  useEffect(() => {
    if (
      !isInView ||
      activeScene !== "developer"
    ) {
      closeLaptopScreen();
    }
  }, [
    isInView,
    activeScene,
    closeLaptopScreen,
  ]);


  /*
   * Preload the readable screen image
   * once About becomes visible.
   *
   * This avoids a visible image-loading
   * delay the first time View Screen
   * is pressed.
   */
  useEffect(() => {
    if (!isInView) {
      return;
    }


    const image =
      new Image();


    image.src =
      "/about/laptop-screen.png";
  }, [isInView]);


  return (
    <div
      className="about"
      ref={aboutRef}
    >
      <div className="aSection left">
        <motion.h1
          className="aTitle"

          variants={
            titleVariants
          }

          animate={
            isInView
              ? "animate"
              : "initial"
          }
        >
          About Me
        </motion.h1>


        <motion.div
          className="aboutList"

          variants={
            listVariants
          }

          animate={
            isInView
              ? "animate"
              : "initial"
          }
        >
          <motion.p
            variants={
              paragraphVariants
            }
          >
            I’m a{" "}

            <button
              type="button"

              className=
                "aboutKeyword"

              data-active={
                activeScene ===
                "developer"
              }

              aria-pressed={
                activeScene ===
                "developer"
              }

              onClick={() =>
                setActiveScene(
                  "developer"
                )
              }
            >
              <span
                className=
                  "aboutKeywordText"
              >
                full-stack software engineer
              </span>
            </button>{" "}

            who enjoys turning complex
            problems into reliable,
            intuitive experiences.

            Over the years, I’ve
            worked across{" "}

            <span
              className=
                "aboutKeywordRun aboutKeywordRunBackendFrontend"
            >
              <button
                type="button"

                className=
                  "aboutKeyword"

                aria-label=
                  "Java and Spring-based systems"

                data-active={
                  activeScene ===
                  "backend"
                }

                aria-pressed={
                  activeScene ===
                  "backend"
                }

                onClick={() =>
                  setActiveScene(
                    "backend"
                  )
                }
              >
                <span
                  className=
                    "aboutKeywordText aboutBackendLabelFull"
                >
                  Java and Spring-based
                  systems,
                </span>

                <span
                  aria-hidden="true"

                  className=
                    "aboutKeywordText aboutBackendLabelCompact"
                >
                  Java/Spring systems,
                </span>
              </button>{" "}

              <button
                type="button"

                className=
                  "aboutKeyword"

                data-active={
                  activeScene ===
                  "frontend"
                }

                aria-pressed={
                  activeScene ===
                  "frontend"
                }

                onClick={() =>
                  setActiveScene(
                    "frontend"
                  )
                }
              >
                <span
                  className=
                    "aboutKeywordText"
                >
                  modern front-end
                  development,
                </span>
              </button>{" "}
              and{" "}
            </span>

            <button
              type="button"

              className=
                "aboutKeyword"

              data-active={
                activeScene ===
                "cloud"
              }

              aria-pressed={
                activeScene ===
                "cloud"
              }

              onClick={() =>
                setActiveScene(
                  "cloud"
                )
              }
            >
              <span
                className=
                  "aboutKeywordText"
              >
                cloud &amp; automation,
              </span>
            </button>{" "}
            building applications
            and tools that are designed
            to scale and stay dependable.
          </motion.p>


          <motion.p
            variants={
              paragraphVariants
            }
          >
            What keeps me excited about
            software is the constant
            opportunity to learn,
            experiment, and build
            something better.

            Whether I’m creating an
            interactive interface,
            improving a backend service,
            automating a deployment
            workflow, or exploring new
            technologies, I enjoy
            understanding how all the
            pieces fit together.
          </motion.p>


          <motion.p
            variants={
              paragraphVariants
            }
          >
            Outside of development,
            you’ll usually find me{" "}

            <button
              type="button"

              className=
                "aboutKeyword"

              data-active={
                activeScene ===
                "hobbies"
              }

              aria-pressed={
                activeScene ===
                "hobbies"
              }

              onClick={() =>
                setActiveScene(
                  "hobbies"
                )
              }
            >
              <span
                className=
                  "aboutKeywordText"
              >
                working out, gaming,
                cycling, or getting lost
                in a good movie or TV
                series.
              </span>
            </button>
          </motion.p>
        </motion.div>
      </div>


      <div className="aSection right">
        {isInView && (
          <>
            <AboutModelContainer
              activeScene={
                activeScene
              }

              onLaptopReady={
                handleLaptopModelReady
              }

              qaMode={
                aboutQa.enabled
              }

              qaModelId={
                aboutQa.model
              }
            />


            <AnimatePresence>
              {activeScene ===
                "developer" &&
                isLaptopModelReady && (
                  <motion.button
                    key=
                      "view-screen-button"

                    ref={
                      screenTriggerRef
                    }

                    type="button"

                    className=
                      "aboutScreenTrigger"

                    variants={
                      buttonVariants
                    }

                    initial="initial"

                    animate="animate"

                    exit="exit"

                    aria-haspopup=
                      "dialog"

                    onClick={
                      openLaptopScreen
                    }
                  >
                    <span>
                      View screen
                    </span>


                    <span
                      aria-hidden="true"

                      className=
                        "aboutScreenTriggerIcon"
                    >
                      ↗
                    </span>
                  </motion.button>
                )}
            </AnimatePresence>
          </>
        )}
      </div>


      <LaptopScreenModal
        open={
          isLaptopScreenOpen
        }

        onClose={
          closeLaptopScreen
        }

        returnFocusRef={
          screenTriggerRef
        }
      />
    </div>
  );
};


export default About;