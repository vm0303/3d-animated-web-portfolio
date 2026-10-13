# Vishal Madhav — 3D Animated Portfolio

A responsive, interactive developer portfolio built with React, Three.js, React Three Fiber, Framer Motion, and Vite. The site combines 3D scenes, animated content, project showcases, and a production contact workflow into a polished experience designed to work across phones, tablets, foldables, laptops, hybrid touchscreen devices, and large desktop displays.

This project began from the structure and ideas demonstrated in Lama Dev's animated 3D portfolio tutorial, then grew into a heavily customized production portfolio with extensive responsive geometry work, device-specific interaction handling, lazy loading, cross-browser validation, secure contact delivery, and deployment hardening.

> **Live Site:** [vishalmadhav.com](https://vishalmadhav.com/)

---

## About This Project

The goal of this portfolio is to present my work, skills, and experience through a visually engaging interface without sacrificing responsiveness, accessibility, usability, or production reliability.

The site includes:

- An animated **Hero** section with 3D visuals, certifications, social links, and smooth section navigation
- An interactive **About** section featuring multiple 3D models and responsive presentation states
- A responsive **Portfolio** carousel with project previews, keyboard support, swipe support, and hybrid mouse/touch interaction handling
- A production-ready **Contact** section with server-side submission handling, rate limiting, cooldown protection, and user feedback
- Responsive layouts validated across **phones, foldables, tablets, laptops, hybrid touchscreen devices, and wide desktop displays**
- Cross-browser testing across modern Chromium, Firefox, WebKit/Safari, and real-device environments
- Lazy-loaded non-Hero sections to reduce initial page work and improve loading behavior

---

## Features

- **Interactive 3D content** powered by Three.js, React Three Fiber, and Drei
- **Smooth motion and transitions** using Motion / Framer Motion
- **Responsive geometry** built for a wide range of screen sizes and orientations
- **Hybrid touchscreen support** so touchscreen laptops can retain desktop-style interactions when real mouse or trackpad input is present
- **Touch-friendly Portfolio navigation** with swipe support through Embla Carousel
- **Keyboard-accessible Portfolio controls**
- **Lazy-loaded About, Portfolio, and Contact sections**
- **Production contact form** backed by an Express API route
- **Server-side cooldown and rate-limit protections** using Upstash Redis
- **Email delivery through EmailJS and Hostinger mail infrastructure**
- **Reduced-motion handling** where appropriate
- **Cross-browser and real-device validation**

---

## Tech Stack

- **React 19**
- **Vite 8**
- **Three.js**
- **React Three Fiber**
- **@react-three/drei**
- **Motion / Framer Motion**
- **Embla Carousel**
- **Express 5**
- **Upstash Redis**
- **EmailJS**
- **ESLint**
- **Hostinger** for production hosting

---

## Portfolio Sections

### Hero

Introduces the portfolio with animated content, certifications, social links, responsive 3D visuals, and navigation into the rest of the site.

### About

Presents my background, technologies, interests, and experience through an interactive 3D model-driven section. The layout was adapted for phones, foldables, tablets, laptops, and wide displays while preserving the intended visual composition.

### Portfolio

Showcases selected projects in a responsive carousel with animated project entrances, swipe support, dot navigation, keyboard controls, and desktop arrow controls. Hybrid touchscreen laptops are handled separately so touch capability does not incorrectly force mobile-only motion behavior.

### Contact

Provides a production contact form with server-side request handling, EmailJS delivery, Redis-backed cooldowns, burst protection, global limits, validation, and user-facing success/error states.

---

## Projects Featured

1. **WeathAware** — Interactive React weather dashboard with forecasts, geolocation, adaptive themes, notifications, and animated UI
2. **NYC Info Tours** — Full-stack serverless NYC tour booking platform built with AWS services
3. **2048** — Vue recreation of the classic 2048 game with Firestore and mobile swipe support
4. **DocQuery** — AI-powered document question-answering app using LangChain, FAISS, OpenAI embeddings, and Streamlit
5. **React Arcade Puzzles** — React-based puzzle collection featuring Towers of Hanoi and a sliding puzzle

---

## Third-Party Assets & Attributions

This portfolio uses and references third-party **3D models, logos, and related creative assets**. I do not claim ownership of those third-party assets.

Creator credits, source links, and license information are maintained in:

> **[ATTRIBUTIONS.md](./ATTRIBUTIONS.md)**

That file currently includes credits for assets such as the MacBook Pro model, Java model, React logo model, cloud model, gears model, dumbbell model, PlayStation 5 box model, bicycle model, clapperboard model, and Spring logo/branding reference.

All credited third-party assets remain the work and property of their respective creators and rights holders, subject to the licenses and terms listed in `ATTRIBUTIONS.md`.

---

## Acknowledgements

The original concept and structural starting point were inspired by **Lama Dev's 3D animated portfolio tutorial** and reference project:

- Tutorial: https://www.youtube.com/watch?v=KGCMSaEWPVs
- Reference repository: https://github.com/safak/3d-animated-portfolio/tree/completed

The final portfolio has been substantially adapted and expanded with custom content, responsive behavior, additional device handling, production contact infrastructure, security protections, performance work, accessibility improvements, and deployment-specific changes.

---

## License & Asset Usage

Source code in this repository and third-party creative assets should be treated separately.

Before reusing or redistributing any third-party model, logo, or creative asset included or referenced by this project, review the original creator's license and usage terms in **[ATTRIBUTIONS.md](./ATTRIBUTIONS.md)**.
