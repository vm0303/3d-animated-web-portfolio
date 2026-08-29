/*
  Manual TestMu real-device evidence collector.

  Activated only when the URL contains either:
    ?qaManualEvidence=1
    ?qaManualProbe=1

  This collector is intentionally independent of Appium/WebDriver. It runs in
  the page itself so it can be used in TestMu manual sessions, including
  browsers where DevTools/copy/download are unavailable.

  Start the local receiver first:
    node qa/testmu/appium/manual-real-device-evidence-server.cjs

  Example URL:
    http://192.168.1.233:5173/?qaManualEvidence=1&qaDevice=Realme%20GT2%20Pro&qaManufacturer=realme&qaPlatform=Android&qaOs=14
*/

const ACTIVE_KEYS = ["qaManualEvidence", "qaManualProbe"]
const DEFAULT_RECEIVER_PORT = 4179

const text = (value) => String(value ?? "").trim()

const finite = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const round = (value) => {
  const number = finite(value)
  return number === null ? null : Math.round(number * 100) / 100
}

const detectBrowser = () => {
  const ua = navigator.userAgent || ""
  const tests = [
    ["Edge", /EdgA?\/([\d.]+)/i],
    ["Samsung Internet", /SamsungBrowser\/([\d.]+)/i],
    ["Firefox", /Firefox\/([\d.]+)/i],
    ["Firefox", /FxiOS\/([\d.]+)/i],
    ["Chrome", /Chrome\/([\d.]+)/i],
    ["Chrome", /CriOS\/([\d.]+)/i],
    ["Safari", /Version\/([\d.]+).*Safari/i],
  ]

  for (const [name, pattern] of tests) {
    const match = ua.match(pattern)
    if (match) {
      return { name, version: match[1] || null }
    }
  }

  return { name: "Unknown", version: null }
}

const detectPlatform = () => {
  const ua = navigator.userAgent || ""
  const platform = navigator.userAgentData?.platform || navigator.platform || ""

  if (/android/i.test(ua) || /android/i.test(platform)) return "Android"
  if (/iphone|ipad|ipod/i.test(ua) || /ios/i.test(platform)) return "iOS"
  return platform || "Unknown"
}

const viewportAspectOrientation = (width, height) => {
  if (!(width > 0 && height > 0)) return null
  if (width === height) return "square"
  return width > height ? "landscape" : "portrait"
}

const safeAreaSnapshot = () => {
  const probe = document.createElement("div")
  probe.setAttribute("data-qa-manual-safe-area-probe", "true")
  probe.style.cssText = [
    "position:fixed",
    "visibility:hidden",
    "pointer-events:none",
    "width:0",
    "height:0",
    "padding-top:env(safe-area-inset-top, 0px)",
    "padding-right:env(safe-area-inset-right, 0px)",
    "padding-bottom:env(safe-area-inset-bottom, 0px)",
    "padding-left:env(safe-area-inset-left, 0px)",
  ].join(";")

  document.documentElement.appendChild(probe)

  try {
    const style = getComputedStyle(probe)
    const viewportMeta = document.querySelector('meta[name="viewport"]')
    const viewportMetaContent = viewportMeta?.getAttribute("content") || null
    const cssEnvSupported =
      typeof CSS !== "undefined" && typeof CSS.supports === "function"
        ? CSS.supports("padding-top: env(safe-area-inset-top)")
        : null

    return {
      insets: {
        top: round(Number.parseFloat(style.paddingTop) || 0),
        right: round(Number.parseFloat(style.paddingRight) || 0),
        bottom: round(Number.parseFloat(style.paddingBottom) || 0),
        left: round(Number.parseFloat(style.paddingLeft) || 0),
      },
      measurement: {
        measured: true,
        cssEnvSupported,
        viewportMetaContent,
        viewportFitCover:
          typeof viewportMetaContent === "string"
            ? /(?:^|,|\s)viewport-fit\s*=\s*cover(?:\s|,|$)/i.test(viewportMetaContent)
            : false,
        error: null,
        collectionMethod: "computed-css-env-insets",
      },
    }
  } catch (error) {
    return {
      insets: null,
      measurement: {
        measured: false,
        cssEnvSupported: null,
        viewportMetaContent: null,
        viewportFitCover: false,
        error: error?.message || String(error),
        collectionMethod: "computed-css-env-insets",
      },
    }
  } finally {
    probe.remove()
  }
}

const collectMeasurement = () => {
  const visual = window.visualViewport || null
  const root = document.documentElement
  const portrait = matchMedia("(orientation: portrait)").matches
  const landscape = matchMedia("(orientation: landscape)").matches
  const cssMediaOrientation = portrait ? "portrait" : landscape ? "landscape" : null
  const safeArea = safeAreaSnapshot()
  const browser = detectBrowser()

  return {
    capturedAt: new Date().toISOString(),
    page: {
      href: location.href,
      title: document.title,
      readyState: document.readyState,
    },
    browserDetected: browser,
    platformDetected: detectPlatform(),
    userAgent: navigator.userAgent || null,
    navigatorPlatform: navigator.platform || null,
    userAgentData: navigator.userAgentData
      ? {
          platform: navigator.userAgentData.platform || null,
          mobile: navigator.userAgentData.mobile ?? null,
          brands: Array.isArray(navigator.userAgentData.brands)
            ? navigator.userAgentData.brands.map((item) => ({
                brand: item.brand,
                version: item.version,
              }))
            : null,
        }
      : null,
    maxTouchPoints: navigator.maxTouchPoints ?? null,
    devicePixelRatio: round(window.devicePixelRatio),
    outerWindow: {
      width: round(window.outerWidth),
      height: round(window.outerHeight),
    },
    screenOrientation: screen.orientation
      ? {
          type: screen.orientation.type || null,
          angle: finite(screen.orientation.angle),
        }
      : null,
    cssMediaOrientation,
    viewportAspectOrientation: viewportAspectOrientation(
      window.innerWidth,
      window.innerHeight,
    ),
    orientationMediaQueries: {
      portrait,
      landscape,
    },
    innerViewport: {
      width: round(window.innerWidth),
      height: round(window.innerHeight),
    },
    visualViewport: visual
      ? {
          width: round(visual.width),
          height: round(visual.height),
          scale: round(visual.scale),
          offsetTop: round(visual.offsetTop),
          offsetLeft: round(visual.offsetLeft),
          pageTop: round(visual.pageTop),
          pageLeft: round(visual.pageLeft),
        }
      : null,
    screen: {
      width: round(screen.width),
      height: round(screen.height),
      availWidth: round(screen.availWidth),
      availHeight: round(screen.availHeight),
      colorDepth: finite(screen.colorDepth),
      pixelDepth: finite(screen.pixelDepth),
    },
    document: {
      clientWidth: round(root.clientWidth),
      clientHeight: round(root.clientHeight),
      scrollWidth: round(root.scrollWidth),
      scrollHeight: round(root.scrollHeight),
      scrollX: round(window.scrollX),
      scrollY: round(window.scrollY),
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
    },
    safeAreaInsets: safeArea.insets,
    safeAreaMeasurement: safeArea.measurement,
  }
}

const createElement = (tag, attributes = {}, children = []) => {
  const element = document.createElement(tag)

  for (const [key, value] of Object.entries(attributes)) {
    if (key === "style") Object.assign(element.style, value)
    else if (key === "className") element.className = value
    else if (key === "textContent") element.textContent = value
    else if (key === "value") element.value = value
    else if (key === "checked") element.checked = Boolean(value)
    else element.setAttribute(key, value)
  }

  for (const child of children) {
    element.append(child)
  }

  return element
}

const addOption = (select, value, label = value) => {
  const option = document.createElement("option")
  option.value = value
  option.textContent = label
  select.append(option)
}

const receiverEndpointFrom = (params) => {
  const explicit = text(params.get("qaReceiver"))
  if (explicit) return explicit

  const protocol = location.protocol === "https:" ? "https:" : "http:"
  return `${protocol}//${location.hostname}:${DEFAULT_RECEIVER_PORT}/__qa/manual-evidence`
}

const healthEndpointFrom = (receiverEndpoint) => {
  try {
    const url = new URL(receiverEndpoint)
    url.pathname = "/health"
    url.search = ""
    return url.toString()
  } catch {
    return null
  }
}

export const initManualRealDeviceEvidence = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {}

  const params = new URLSearchParams(location.search)
  const active = ACTIVE_KEYS.some((key) => params.get(key) === "1")
  if (!active) return () => {}

  if (document.querySelector("[data-qa-manual-evidence-panel]")) return () => {}

  const detectedBrowser = detectBrowser()
  const receiverEndpoint = receiverEndpointFrom(params)
  const panel = createElement("aside", {
    "data-qa-manual-evidence-panel": "true",
    style: {
      position: "fixed",
      zIndex: "2147483647",
      top: "8px",
      left: "8px",
      width: "min(320px, calc(100vw - 16px))",
      maxHeight: "calc(60vh - 16px)",
      overflow: "auto",
      boxSizing: "border-box",
      padding: "12px",
      borderRadius: "10px",
      background: "rgba(8, 10, 24, 0.96)",
      color: "#fff",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: "8px",
      lineHeight: "1",
      boxShadow: "0 8px 28px rgba(0,0,0,.45)",
      border: "1px solid rgba(255,255,255,.2)",
    },
  })

  const heading = createElement("div", {
    textContent: "Manual TestMu Evidence",
    style: { fontWeight: "700", fontSize: "14px", marginBottom: "8px" },
  })
  panel.append(heading)

  const status = createElement("div", {
    textContent: "Checking receiver…",
    style: { marginBottom: "8px", whiteSpace: "pre-wrap" },
  })
  panel.append(status)

  const fields = {}
  const addField = (labelText, key, value, options = null) => {
    const wrapper = createElement("label", {
      style: { display: "block", margin: "6px 0" },
    })
    wrapper.append(createElement("div", { textContent: labelText, style: { opacity: ".8" } }))

    let input
    if (options) {
      input = document.createElement("select")
      for (const [optionValue, optionLabel] of options) addOption(input, optionValue, optionLabel)
      input.value = value
    } else {
      input = document.createElement("input")
      input.type = "text"
      input.value = value
    }

    Object.assign(input.style, {
      width: "100%",
      boxSizing: "border-box",
      border: "1px solid rgba(255,255,255,.25)",
      borderRadius: "6px",
      background: "#11162b",
      color: "#fff",
      padding: "7px",
      font: "inherit",
    })

    wrapper.append(input)
    panel.append(wrapper)
    fields[key] = input
  }

  addField("Device model *", "deviceName", text(params.get("qaDevice")))
  addField("Manufacturer", "manufacturer", text(params.get("qaManufacturer")))
  addField("Platform *", "platformName", text(params.get("qaPlatform")) || detectPlatform(), [
    ["Android", "Android"],
    ["iOS", "iOS"],
    ["Other", "Other"],
  ])
  addField("OS version *", "platformVersion", text(params.get("qaOs")))
  addField("Browser *", "browserName", text(params.get("qaBrowser")) || detectedBrowser.name)
  addField("Browser version", "browserVersion", detectedBrowser.version || "")
  addField("Display state", "displayState", text(params.get("qaDisplayState")) || "standard-main-display", [
    ["standard-main-display", "standard-main-display"],
    ["unfolded-main-display", "unfolded-main-display (flip/open)"],
    ["folded-outer-display", "folded-outer-display"],
    ["unfolded-inner-display", "unfolded-inner-display"],
    ["single-display-or-unspanned", "single-display-or-unspanned"],
    ["dual-display-or-spanned", "dual-display-or-spanned"],
  ])
  addField("Fold state", "foldState", text(params.get("qaFoldState")) || "standard", [
    ["standard", "standard / non-foldable"],
    ["folded", "folded"],
    ["unfolded", "unfolded"],
    ["unknown", "unknown"],
  ])
  addField("Posture / spanning mode", "posture", text(params.get("qaPosture")) || "", [
    ["", "not specified"],
    ["flat", "flat"],
    ["half-open", "half-open"],
    ["book", "book"],
    ["unspanned", "unspanned"],
    ["spanned", "spanned"],
    ["unknown", "unknown"],
  ])
  addField("Automation issue", "automationIssue", text(params.get("qaAutomationIssue")) || "webdriver-provisioning-failure", [
    ["webdriver-provisioning-failure", "WebDriver/provisioning failure"],
    ["device-unavailable-in-automation", "Device unavailable in automation"],
    ["browser-automation-unavailable", "Browser automation unavailable"],
    ["manual-verification-only", "Manual verification only"],
    ["other", "Other"],
  ])
  addField("TestMu session / device label", "testmuSessionLabel", text(params.get("qaTestMuSession")))
  addField("Notes", "notes", text(params.get("qaNotes")))

  const measurementPre = createElement("pre", {
    style: {
      margin: "8px 0",
      padding: "8px",
      borderRadius: "6px",
      background: "#080b17",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      maxHeight: "180px",
      overflow: "auto",
    },
  })
  panel.append(measurementPre)

  const buttonRow = createElement("div", {
    style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" },
  })

  const makeButton = (label) => createElement("button", {
    type: "button",
    textContent: label,
    style: {
      border: "0",
      borderRadius: "6px",
      padding: "8px",
      cursor: "pointer",
      font: "inherit",
      fontWeight: "700",
    },
  })

  const refreshButton = makeButton("Refresh measurement")
  const saveButton = makeButton("Save JSON directly")
  buttonRow.append(refreshButton, saveButton)
  panel.append(buttonRow)

  const receiverLine = createElement("div", {
    textContent: `Receiver: ${receiverEndpoint}`,
    style: { marginTop: "8px", opacity: ".7", wordBreak: "break-all" },
  })
  panel.append(receiverLine)

  document.body.append(panel)

  let latestMeasurement = null
  let refreshTimer = null

  const renderMeasurement = () => {
    latestMeasurement = collectMeasurement()
    const m = latestMeasurement
    measurementPre.textContent = [
      `orientation: ${m.cssMediaOrientation || "unknown"}`,
      `inner: ${m.innerViewport.width}×${m.innerViewport.height}`,
      `visual: ${m.visualViewport?.width ?? "na"}×${m.visualViewport?.height ?? "na"}`,
      `screen: ${m.screen.width}×${m.screen.height}`,
      `DPR: ${m.devicePixelRatio}`,
      `safe: ${m.safeAreaInsets ? `${m.safeAreaInsets.top}/${m.safeAreaInsets.right}/${m.safeAreaInsets.bottom}/${m.safeAreaInsets.left}` : "unavailable"}`,
      `viewport-fit=cover: ${m.safeAreaMeasurement.viewportFitCover}`,
      `browser: ${m.browserDetected.name} ${m.browserDetected.version || ""}`.trim(),
    ].join("\n")
  }

  const scheduleRefresh = () => {
    clearTimeout(refreshTimer)
    refreshTimer = setTimeout(renderMeasurement, 350)
  }

  refreshButton.addEventListener("click", renderMeasurement)
  window.addEventListener("resize", scheduleRefresh)
  window.addEventListener("orientationchange", scheduleRefresh)
  window.visualViewport?.addEventListener("resize", scheduleRefresh)

  saveButton.addEventListener("click", async () => {
    renderMeasurement()

    const context = Object.fromEntries(
      Object.entries(fields).map(([key, input]) => [key, text(input.value)]),
    )

    if (!context.deviceName || !context.platformName || !context.platformVersion || !context.browserName) {
      status.textContent = "Missing required metadata: device model, platform, OS version, or browser."
      return
    }

    saveButton.disabled = true
    status.textContent = "Saving evidence to QA receiver…"

    try {
      const response = await fetch(receiverEndpoint, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifactType: "testmu-manual-real-device-evidence-submission",
          schemaVersion: 1,
          submittedAt: new Date().toISOString(),
          context: {
            ...context,
            orientation: latestMeasurement.cssMediaOrientation,
            testmuSessionType: "manual-real-device",
            evidencePurpose: "fallback-for-automation-or-provisioning-issue",
          },
          measurement: latestMeasurement,
        }),
      })

      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)

      status.textContent = `SAVED\n${body.fileName || "manual evidence JSON"}\n${body.relativePath || ""}`
    } catch (error) {
      status.textContent = `SAVE FAILED\n${error?.message || error}\nMake sure the manual evidence receiver is running.`
    } finally {
      saveButton.disabled = false
    }
  })

  const checkReceiver = async () => {
    const health = healthEndpointFrom(receiverEndpoint)
    if (!health) {
      status.textContent = "Receiver URL is invalid."
      return
    }

    try {
      const response = await fetch(health, { mode: "cors" })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      status.textContent = `Receiver connected on port ${data.port ?? DEFAULT_RECEIVER_PORT}.`
    } catch {
      status.textContent = "Receiver not detected. Start: node qa/testmu/appium/manual-real-device-evidence-server.cjs"
    }
  }

  renderMeasurement()
  checkReceiver()

  return () => {
    clearTimeout(refreshTimer)
    window.removeEventListener("resize", scheduleRefresh)
    window.removeEventListener("orientationchange", scheduleRefresh)
    window.visualViewport?.removeEventListener("resize", scheduleRefresh)
    panel.remove()
  }
}
