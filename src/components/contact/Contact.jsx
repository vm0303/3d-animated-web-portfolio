import "./contact.css";
import emailjs from "@emailjs/browser";
import {
  useRef,
  useState,
} from "react";
import {
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


  const sendEmail = (e) => {
    e.preventDefault();

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

          form.current?.reset();
        },
        () => {
          setError(true);
          setSuccess(false);
        }
      )
      .finally(() => {
        setSending(false);
      });
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
            className="formButton"
            variants={listVariants}
            type="submit"
            disabled={sending}
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
            {
              success && (
                <span className="successMessage">
                  Your message was sent successfully. I'll get back to you as soon as possible.
                </span>
              )
            }

            {
              error && (
                <span className="errorMessage">
                  Failed to send your message. Please try again later.
                </span>
              )
            }
          </div>
        </motion.form>
      </div>


      <div className="cSection">
        SVG
      </div>
    </div>
  );
};


export default Contact;
