import "./contact.css";

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

const COOLDOWN_REMINDER_VISIBLE_MS =
  9000;


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

  const hours = Math.floor(
    totalSeconds / 3600
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60
  );

  const seconds =
    totalSeconds % 60;

  if (hours > 0) {
    return seconds > 0
      ? `${hours}h ${minutes}m ${seconds}s`
      : `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return seconds > 0
      ? `${minutes}m ${seconds}s`
      : `${minutes}m`;
  }

  return `${seconds}s`;
}


/* Laptop / desktop: form enters left -> right. */
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


/* Laptop / desktop: SVG enters right -> left. */
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


/* Touch-first phones, foldables, and tablets use fade-only motion. */
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


const PORTRAIT_TOUCH_MOTION_QUERY =
  "(hover: none), (pointer: coarse)";


const Contact = ({
  desktopInputDetected = false,
}) => {
  const [success, setSuccess] =
    useState(false);

  const [error, setError] =
    useState(false);

  const [sending, setSending] =
    useState(false);

  const [cooldownUntil, setCooldownUntil] =
    useState(readStoredCooldownUntil);

  const [cooldownNow, setCooldownNow] =
    useState(() => Date.now());

  const [
    cooldownMessageVisible,
    setCooldownMessageVisible,
  ] = useState(false);

  const [
    cooldownShakeNonce,
    setCooldownShakeNonce,
  ] = useState(0);

  const [fadeOnlyMotion, setFadeOnlyMotion] =
    useState(() => {
      if (typeof window === "undefined") {
        return false;
      }

      return (
        window
          .matchMedia(
            PORTRAIT_TOUCH_MOTION_QUERY
          )
          .matches &&
        !desktopInputDetected
      );
    });


  const contactRef =
    useRef(null);

  const form =
    useRef(null);

  const cooldownHideTimerRef =
    useRef(null);

  const cooldownShakeRef =
    useRef(null);


  const isInView =
    useInView(
      contactRef,
      {
        amount: 0.15,
        once: false,
      }
    );


  /*
   * Only switch motion mode while Contact is off-screen so rotating a visible
   * device does not hide, replay, or change the current entrance animation.
   */
  useEffect(() => {
    const touchQuery =
      window.matchMedia(
        PORTRAIT_TOUCH_MOTION_QUERY
      );

    const syncMotionMode = () => {
      if (!isInView) {
        setFadeOnlyMotion(
          touchQuery.matches &&
          !desktopInputDetected
        );
      }
    };

    syncMotionMode();

    touchQuery.addEventListener(
      "change",
      syncMotionMode
    );

    return () => {
      touchQuery.removeEventListener(
        "change",
        syncMotionMode
      );
    };
  }, [
    isInView,
    desktopInputDetected,
  ]);


  /* Show success for six seconds, then reveal the cooldown reminder. */
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
   * localStorage is only a UX convenience. The server-side email/IP cooldown
   * remains authoritative if cache/cookies are cleared or another browser is
   * used.
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


  /*
   * Proactively hydrate the IP cooldown from the server. This keeps separate
   * browsers/profiles in sync without requiring another blocked submission.
   * A failed status request is deliberately non-fatal; POST remains the
   * authoritative enforcement path and existing local state is preserved.
   */
  useEffect(() => {
    let cancelled = false;

    const syncCooldownFromServer = async () => {
      try {
        const response = await fetch(
          "/api/contact",
          {
            method: "GET",
            headers: {
              Accept: "application/json",
            },
            cache: "no-store",
          }
        );

        let result = {};

        try {
          result = await response.json();
        } catch {
          result = {};
        }

        if (
          cancelled ||
          !response.ok
        ) {
          return;
        }

        const retryAfterSeconds = Math.max(
          0,
          Number(
            result?.retryAfterSeconds
          ) || 0
        );

        if (
          result?.cooldownActive &&
          retryAfterSeconds > 0
        ) {
          const now = Date.now();
          const expiresAt =
            now + retryAfterSeconds * 1000;

          setCooldownUntil(expiresAt);
          setCooldownNow(now);

          window.localStorage.setItem(
            CONTACT_COOLDOWN_STORAGE_KEY,
            String(expiresAt)
          );
          return;
        }

        if (cooldownHideTimerRef.current) {
          window.clearTimeout(
            cooldownHideTimerRef.current
          );
          cooldownHideTimerRef.current = null;
        }

        setCooldownUntil(0);
        setCooldownNow(Date.now());
        setCooldownMessageVisible(false);

        window.localStorage.removeItem(
          CONTACT_COOLDOWN_STORAGE_KEY
        );
      } catch {
        /* Keep local UX state if the read-only status check is unavailable. */
      }
    };

    const handleFocus = () => {
      syncCooldownFromServer();
    };

    const handleVisibilityChange = () => {
      if (
        document.visibilityState ===
          "visible"
      ) {
        syncCooldownFromServer();
      }
    };

    syncCooldownFromServer();

    window.addEventListener(
      "focus",
      handleFocus
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      cancelled = true;

      window.removeEventListener(
        "focus",
        handleFocus
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, []);


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


  /*
   * Replay the approved Horizontal Shake on the already-mounted inner text.
   * The outer cooldownMessage owns only fade-in/fade-out, so a blocked click
   * replays motion without remounting or blinking the reminder.
   */
  const shakeCooldownMessage = () => {
    if (
      typeof window === "undefined" ||
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches
    ) {
      return;
    }

    const node =
      cooldownShakeRef.current;

    if (!node) {
      return;
    }

    node.classList.remove(
      "cooldownJumpShake"
    );

    /* Force style recalculation so the same CSS animation can replay. */
    void node.offsetWidth;

    node.classList.add(
      "cooldownJumpShake"
    );
  };


  const restartCooldownReminderTimer = () => {
    if (cooldownHideTimerRef.current) {
      window.clearTimeout(
        cooldownHideTimerRef.current
      );
    }

    cooldownHideTimerRef.current =
      window.setTimeout(
        () => {
          setCooldownMessageVisible(false);
          cooldownHideTimerRef.current = null;
        },
        COOLDOWN_REMINDER_VISIBLE_MS
      );
  };


  const triggerCooldownReminder = () => {
    if (!cooldownActive) {
      return;
    }

    setCooldownMessageVisible(true);
    setCooldownShakeNonce(
      (nonce) => nonce + 1
    );
    restartCooldownReminderTimer();
  };


  /*
   * When a cooldown first becomes visible (including after the six-second
   * success message), show it once, replay Horizontal Shake, and begin its own
   * nine-second inactivity timer.
   */
  useEffect(() => {
    if (!cooldownActive) {
      setCooldownMessageVisible(false);

      if (cooldownHideTimerRef.current) {
        window.clearTimeout(
          cooldownHideTimerRef.current
        );

        cooldownHideTimerRef.current = null;
      }

      return;
    }

    if (success || error) {
      return;
    }

    setCooldownMessageVisible(true);
    setCooldownShakeNonce(
      (nonce) => nonce + 1
    );

    if (cooldownHideTimerRef.current) {
      window.clearTimeout(
        cooldownHideTimerRef.current
      );
    }

    cooldownHideTimerRef.current =
      window.setTimeout(
        () => {
          setCooldownMessageVisible(false);
          cooldownHideTimerRef.current = null;
        },
        COOLDOWN_REMINDER_VISIBLE_MS
      );
  }, [cooldownActive, success, error]);


  /* Run Horizontal Shake only after React has mounted the reminder text. */
  useEffect(() => {
    if (
      !cooldownMessageVisible ||
      success ||
      error ||
      cooldownShakeNonce === 0
    ) {
      return;
    }

    const frame =
      window.requestAnimationFrame(
        shakeCooldownMessage
      );

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    cooldownMessageVisible,
    cooldownShakeNonce,
    success,
    error,
  ]);


  /* Clear the reminder timer if Contact unmounts. */
  useEffect(() => {
    return () => {
      if (cooldownHideTimerRef.current) {
        window.clearTimeout(
          cooldownHideTimerRef.current
        );
      }
    };
  }, []);


  const handleSendButtonClick = (e) => {
    if (!cooldownActive) {
      return;
    }

    /*
     * Cooldown uses aria-disabled instead of the native disabled attribute so
     * the control can still explain why another submission is blocked.
     */
    e.preventDefault();
    triggerCooldownReminder();
  };


  const sendEmail = async (e) => {
    e.preventDefault();

    if (
      sending ||
      !form.current
    ) {
      return;
    }

    if (cooldownActive) {
      triggerCooldownReminder();
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

      form.current?.reset();
    } catch {
      setError(true);
      setSuccess(false);
    } finally {
      setSending(false);
    }
  };


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
          variants={activeFormVariants}
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
              } ${cooldownActive
                ? "cooldownBlocked"
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
            aria-disabled={
              sending ||
              cooldownActive
            }
            aria-busy={sending}
            aria-describedby=
              "contact-form-status"
            onClick={handleSendButtonClick}
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
                cooldownMessageVisible &&
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
                    <span
                      ref={cooldownShakeRef}
                      className="cooldownMessageText"
                    >
                      Message limit reached. Try again in {cooldownText}.
                    </span>
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
          variants={activeSvgVariants}
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
