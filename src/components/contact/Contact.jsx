import "./contact.css";
import "./contact-tablet-portrait.locked.css";
import "./contact-status.css";

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


const CONTACT_COOLDOWN_STORAGE_KEY =
  "portfolioContactCooldownUntil";

const DEFAULT_CONTACT_COOLDOWN_SECONDS =
  3 * 60 * 60;


function readStoredCooldownUntil() {
  if (typeof window === "undefined") {
    return 0;
  }

  const value = Number(
    window.localStorage.getItem(
      CONTACT_COOLDOWN_STORAGE_KEY
    )
  );

  return Number.isFinite(value) &&
    value > Date.now()
      ? value
      : 0;
}


function formatCooldownTime(
  remainingMilliseconds
) {
  const totalSeconds = Math.max(
    0,
    Math.ceil(
      remainingMilliseconds / 1000
    )
  );

  const totalMinutes = Math.ceil(
    totalSeconds / 60
  );

  const hours = Math.floor(
    totalMinutes / 60
  );

  const minutes =
    totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (totalSeconds >= 60) {
    return `${Math.max(1, totalMinutes)}m`;
  }

  return `${totalSeconds}s`;
}


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

  const [
    cooldownUntil,
    setCooldownUntil,
  ] = useState(
    readStoredCooldownUntil
  );

  const [
    cooldownNow,
    setCooldownNow,
  ] = useState(() => Date.now());


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
   * form ref because the form element
   * is also used to gather submission
   * values.
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
   * This prevents a device rotation while
   * Contact is visible from replaying or
   * changing the entrance animation.
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
   * for six seconds, then allow the
   * persistent cooldown message to take
   * over the status region.
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


  /*
   * Keep the cooldown label current.
   * The browser-side timestamp is only a
   * UX convenience. The server remains the
   * authority for whether another message
   * is allowed.
   */
  useEffect(() => {
    if (!cooldownUntil) {
      return;
    }


    const syncCooldown = () => {
      const now = Date.now();

      setCooldownNow(now);

      if (cooldownUntil <= now) {
        setCooldownUntil(0);

        window.localStorage.removeItem(
          CONTACT_COOLDOWN_STORAGE_KEY
        );
      }
    };


    syncCooldown();


    const timer =
      window.setInterval(
        syncCooldown,
        1000
      );


    return () => {
      window.clearInterval(timer);
    };
  }, [cooldownUntil]);


  const activateCooldown = (
    seconds = DEFAULT_CONTACT_COOLDOWN_SECONDS
  ) => {
    const safeSeconds =
      Number.isFinite(Number(seconds)) &&
      Number(seconds) > 0
        ? Number(seconds)
        : DEFAULT_CONTACT_COOLDOWN_SECONDS;

    const expiresAt =
      Date.now() +
      safeSeconds * 1000;

    setCooldownUntil(expiresAt);
    setCooldownNow(Date.now());

    window.localStorage.setItem(
      CONTACT_COOLDOWN_STORAGE_KEY,
      String(expiresAt)
    );
  };


  const cooldownRemaining =
    Math.max(
      0,
      cooldownUntil - cooldownNow
    );

  const cooldownActive =
    cooldownRemaining > 0;

  const cooldownText =
    cooldownActive
      ? formatCooldownTime(
          cooldownRemaining
        )
      : "";


  const sendEmail = async (e) => {
    e.preventDefault();


    if (
      sending ||
      cooldownActive ||
      !form.current
    ) {
      return;
    }


    setSuccess(false);
    setError(false);
    setSending(true);


    const formData =
      new FormData(
        form.current
      );


    try {
      const response =
        await fetch(
          "/api/contact",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              name:
                formData.get("name"),

              email:
                formData.get("email"),

              message:
                formData.get("message"),

              company_website:
                formData.get(
                  "company_website"
                ),
            }),
          }
        );


      let result = {};

      try {
        result =
          await response.json();
      } catch {
        result = {};
      }


      if (
        response.status === 429 &&
        result?.code ===
          "CONTACT_COOLDOWN"
      ) {
        activateCooldown(
          result.retryAfterSeconds
        );

        setSuccess(false);
        setError(false);
        return;
      }


      if (!response.ok) {
        throw new Error(
          result?.message ||
          "Failed to send message."
        );
      }


      setSuccess(true);
      setError(false);

      activateCooldown(
        result.cooldownSeconds
      );

      /*
       * Clear the form only after
       * a successful submission.
       */
      form.current?.reset();
    } catch {
      setError(true);
      setSuccess(false);
    } finally {
      setSending(false);
    }
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

          variants={listVariants}

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


          <div
            className="contactHoneypot"
            aria-hidden="true"
          >
            <label
              htmlFor="company-website"
            >
              Website
            </label>

            <input
              id="company-website"
              type="text"
              name="company_website"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>


          <motion.button
            className={
              `formButton ${sending
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

            disabled={
              sending ||
              cooldownActive
            }

            aria-busy={sending}

            aria-describedby=
              "contact-form-status"
          >
            {
              sending
                ? "Sending..."
                : "Send"
            }
          </motion.button>


          <div
            id="contact-form-status"
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
                    Failed to send message. Please try again later
                  </motion.span>
                )
              }
            </AnimatePresence>


            <AnimatePresence>
              {
                cooldownActive &&
                !success &&
                !error && (
                  <motion.span
                    className="cooldownMessage"

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
                    Message limit reached. You can send another message in {cooldownText}.
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
