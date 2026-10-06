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


const listVariants = {
  initial: {
    x: 100,
    opacity: 0,
  },

  animate: {
    opacity: 1,
    x: 0,

    transition: {
      duration: 0.5,
      staggerChildren: 0.2,
    },
  },
};


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


  const form =
    useRef();


  const isInView =
    useInView(
      form,
      {
        margin: "-200px",
      }
    );


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
           * a successful submission.
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


  return (
    <div className="contact">

      <div className="cSection">

        <motion.form
          ref={form}
          onSubmit={sendEmail}

          variants={listVariants}

          animate={
            isInView
              ? "animate"
              : "initial"
          }
        >

          <motion.h1
            variants={listVariants}
          >
            Let's keep in touch!
          </motion.h1>


          <motion.div
            className="formItem"
            variants={listVariants}
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
            variants={listVariants}
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
            variants={listVariants}
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

            variants={listVariants}

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
        <ContactSvg />
      </div>

    </div>
  );
};


export default Contact;