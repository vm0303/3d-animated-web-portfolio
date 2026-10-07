import "./contact.css";

import emailjs from "@emailjs/browser";
import ContactSvg from "./ContactSvg";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AnimatePresence,
  motion,
  useInView,
} from "motion/react";


/*
 * Laptop / desktop / landscape:
 * Form enters from left to right.
 */
const listVariants = {
  initial: {
    x: -100,
    opacity: 0,
  },

  animate: {
    x: 0,
    opacity: 1,

    transition: {
      duration: 0.5,
      staggerChildren: 0.2,
    },
  },
};


/*
 * Laptop / desktop / landscape:
 * SVG enters from right to left.
 */
const svgVariants = {
  initial: {
    x: 200,
    opacity: 0,
  },

  animate: {
    x: 0,
    opacity: 1,

    transition: {
      duration: 1,
      ease: "easeOut",
    },
  },
};


/*
 * Portrait phones, tablets,
 * folded foldables, and unfolded
 * foldables use fade-only motion.
 */
const portraitFadeVariants = {
  initial: {
    opacity: 0,
  },

  animate: {
    opacity: 1,

    transition: {
      duration: 1,
      ease: "easeOut",
    },
  },
};


/*
 * Fade-only mode applies only when:
 *
 * - device is portrait
 * - device behaves like a touch device
 *
 * This avoids applying portrait motion
 * to normal desktop/laptop layouts.
 */
const PORTRAIT_TOUCH_MOTION_QUERY =
  "(orientation: portrait) and (hover: none), " +
  "(orientation: portrait) and (pointer: coarse)";


const Contact = () => {
  const [
    success,
    setSuccess,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState(false);

  const [
    sending,
    setSending,
  ] = useState(false);


  /*
   * Decide the initial motion mode
   * from the current device/orientation.
   */
  const [
    fadeOnlyMotion,
    setFadeOnlyMotion,
  ] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window
      .matchMedia(
        PORTRAIT_TOUCH_MOTION_QUERY
      )
      .matches;
  });


  /*
   * Contact section visibility ref.
   *
   * We use this separately from the
   * form ref because EmailJS needs the
   * actual form element.
   */
  const contactRef =
    useRef(null);

  const form =
    useRef(null);


  /*
   * Both the form and SVG use this
   * same visibility state so their
   * entrance animations stay aligned.
   */
  const isInView =
    useInView(
      contactRef,
      {
        amount: 0.15,
        once: false,
      }
    );


  /*
   * Update the portrait/mobile motion
   * mode only while Contact is OFF screen.
   *
   * This is important for rotation.
   *
   * Example:
   *
   * 1. User enters Contact in portrait.
   * 2. Fade animation runs.
   * 3. User rotates to landscape.
   * 4. Contact remains visible.
   * 5. Motion mode stays locked.
   *
   * Therefore nothing disappears,
   * replays, or suddenly starts sliding.
   *
   * Once Contact leaves the viewport,
   * we can safely update the motion mode
   * for the next time it enters.
   */
  useEffect(() => {
    const mediaQuery =
      window.matchMedia(
        PORTRAIT_TOUCH_MOTION_QUERY
      );


    const syncMotionMode = () => {
      if (!isInView) {
        setFadeOnlyMotion(
          mediaQuery.matches
        );
      }
    };


    /*
     * Synchronize immediately whenever
     * Contact is currently off screen.
     */
    syncMotionMode();


    mediaQuery.addEventListener(
      "change",
      syncMotionMode
    );


    return () => {
      mediaQuery.removeEventListener(
        "change",
        syncMotionMode
      );
    };
  }, [isInView]);


  /*
   * Keep the success message visible
   * for six seconds, then allow
   * AnimatePresence to fade it out.
   */
  useEffect(() => {
    if (!success) {
      return;
    }


    const timer =
      window.setTimeout(
        () => {
          setSuccess(false);
        },
        6000
      );


    return () => {
      window.clearTimeout(timer);
    };
  }, [success]);


  const sendEmail = (e) => {
    e.preventDefault();


    /*
     * Extra protection against
     * duplicate submissions while
     * EmailJS is already processing.
     */
    if (sending) {
      return;
    }


    setSuccess(false);
    setError(false);
    setSending(true);


    emailjs
      .sendForm(
        import.meta.env.VITE_SERVICE_ID,
        import.meta.env.VITE_TEMPLATE_ID,
        form.current,
        {
          publicKey:
            import.meta.env.VITE_PUBLIC_KEY,
        }
      )
      .then(
        () => {
          setSuccess(true);
          setError(false);

          /*
           * Clear the form only after
           * successful submission.
           */
          form.current?.reset();
        },
        () => {
          setError(true);
          setSuccess(false);
        }
      )
      .finally(
        () => {
          setSending(false);
        }
      );
  };


  /*
   * Portrait touch device:
   * simple fade.
   *
   * Everything else:
   * directional desktop/landscape motion.
   */
  const activeFormVariants =
    fadeOnlyMotion
      ? portraitFadeVariants
      : listVariants;


  const activeSvgVariants =
    fadeOnlyMotion
      ? portraitFadeVariants
      : svgVariants;


  return (
    <div
      className="contact"
      ref={contactRef}
    >

      <div className="cSection">

        <motion.form
          ref={form}
          onSubmit={sendEmail}

          variants={
            activeFormVariants
          }

          initial="initial"

          animate={
            isInView
              ? "animate"
              : "initial"
          }
        >

          <motion.h1
            variants={
              fadeOnlyMotion
                ? undefined
                : listVariants
            }
          >
            Let's keep in touch!
          </motion.h1>


          <motion.div
            className="formItem"

            variants={
              fadeOnlyMotion
                ? undefined
                : listVariants
            }
          >
            <label htmlFor="name">
              Name

              <span
                className="requiredMark"
                aria-hidden="true"
              >
                *
              </span>
            </label>

            <input
              id="name"
              type="text"
              name="name"
              placeholder="Your Full Name"
              required
            />
          </motion.div>


          <motion.div
            className="formItem"

            variants={
              fadeOnlyMotion
                ? undefined
                : listVariants
            }
          >
            <label htmlFor="email">
              Email

              <span
                className="requiredMark"
                aria-hidden="true"
              >
                *
              </span>
            </label>

            <input
              id="email"
              type="email"
              name="email"
              placeholder="Your Email"
              required
            />
          </motion.div>


          <motion.div
            className="formItem"

            variants={
              fadeOnlyMotion
                ? undefined
                : listVariants
            }
          >
            <label htmlFor="message">
              Message

              <span
                className="requiredMark"
                aria-hidden="true"
              >
                *
              </span>
            </label>

            <textarea
              id="message"
              rows={10}
              name="message"
              placeholder="Write your message..."
              required
            />
          </motion.div>


          <motion.button
            className={
              `formButton ${
                sending
                  ? "sending"
                  : ""
              }`
            }

            variants={
              fadeOnlyMotion
                ? undefined
                : listVariants
            }

            type="submit"

            disabled={sending}

            aria-busy={sending}
          >
            {
              sending
                ? "Sending..."
                : "Send"
            }
          </motion.button>


          <div
            className="formStatus"

            aria-live="polite"
            aria-atomic="true"
          >

            <AnimatePresence>
              {
                success && (
                  <motion.span
                    className="successMessage"

                    initial={{
                      opacity: 0,
                      y: 4,
                    }}

                    animate={{
                      opacity: 1,
                      y: 0,
                    }}

                    exit={{
                      opacity: 0,
                      y: -4,
                    }}

                    transition={{
                      duration: 0.4,
                      ease: "easeOut",
                    }}
                  >
                    Message sent! Thanks! I'll get back to you as soon as I can.
                  </motion.span>
                )
              }
            </AnimatePresence>


            <AnimatePresence>
              {
                error && (
                  <motion.span
                    className="errorMessage"

                    initial={{
                      opacity: 0,
                      y: 4,
                    }}

                    animate={{
                      opacity: 1,
                      y: 0,
                    }}

                    exit={{
                      opacity: 0,
                      y: -4,
                    }}

                    transition={{
                      duration: 0.4,
                      ease: "easeOut",
                    }}
                  >
                    Failed to send. Please try again.
                  </motion.span>
                )
              }
            </AnimatePresence>

          </div>

        </motion.form>

      </div>


      <div className="cSection">

        <motion.div
          className="contactVisual"

          variants={
            activeSvgVariants
          }

          initial="initial"

          animate={
            isInView
              ? "animate"
              : "initial"
          }
        >
          <ContactSvg />
        </motion.div>

      </div>

    </div>
  );
};


export default Contact;