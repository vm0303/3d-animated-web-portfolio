import {
  useEffect,
  useRef,
  useState,
} from "react";


const DEBUG_REMINDER_VISIBLE_MS =
  9000;


const panelStyle = {
  position: "fixed",
  zIndex: 99999,
  width: "min(340px, calc(100vw - 24px))",
  maxHeight: "calc(100vh - 24px)",
  overflowY: "auto",
  background: "rgba(8, 15, 38, 0.96)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.22)",
  borderRadius: "12px",
  boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
  fontFamily: "system-ui, sans-serif",
  fontSize: "13px",
  lineHeight: 1.35,
  userSelect: "none",
};


const headerStyle = {
  padding: "10px 12px",
  cursor: "grab",
  borderBottom: "1px solid rgba(255,255,255,0.15)",
  fontWeight: 700,
  touchAction: "none",
};


const bodyStyle = {
  padding: "12px",
  display: "grid",
  gap: "10px",
};


const rowStyle = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};


const buttonStyle = {
  flex: "1 1 120px",
  minHeight: "34px",
  border: 0,
  borderRadius: "7px",
  padding: "7px 9px",
  cursor: "pointer",
  background: "#3b9cff",
  color: "#fff",
  fontWeight: 650,
};


const secondaryButtonStyle = {
  ...buttonStyle,
  background: "#243454",
};


const dangerButtonStyle = {
  ...buttonStyle,
  background: "#8a2d45",
};


const pillStyle = {
  padding: "7px 8px",
  borderRadius: "7px",
  background: "rgba(255,255,255,0.07)",
};


function formatExactRemaining(
  cooldownUntil
) {
  const totalSeconds = Math.max(
    0,
    Math.ceil(
      (cooldownUntil - Date.now()) / 1000
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


const CooldownDebugPanel = ({
  cooldownActive,
  cooldownText,
  cooldownUntil,
  cooldownMessageVisible,
  blockedClickCount,
  wouldSubmitCount,
  lastEvent,
  onStartCooldown,
  onSimulateSuccess,
  onShowReminder,
  onHideReminder,
  onExpireNow,
  onResetDebugCounters,
}) => {
  const [durationSeconds, setDurationSeconds] =
    useState(30);

  const [position, setPosition] =
    useState({ x: 18, y: 18 });

  const [manualReminderNonce, setManualReminderNonce] =
    useState(0);

  const dragRef =
    useRef(null);

  const fadeTimerRef =
    useRef(null);

  const visibleReminderNodeRef =
    useRef(null);

  const hideReminderRef =
    useRef(onHideReminder);

  hideReminderRef.current =
    onHideReminder;


  const restartDebugFadeTimer = () => {
    if (fadeTimerRef.current) {
      window.clearTimeout(
        fadeTimerRef.current
      );
    }

    fadeTimerRef.current =
      window.setTimeout(
        () => {
          hideReminderRef.current?.();
          fadeTimerRef.current = null;
        },
        DEBUG_REMINDER_VISIBLE_MS
      );
  };


  /*
   * TEMP manual-test behavior:
   * - show exact remaining seconds in the actual cooldown message
   * - keep that text ticking until the cooldown expires
   * - start the 9-second fade only when the message is actually mounted
   *
   * Contact.jsx still owns the real cooldown state. This helper only overrides
   * the displayed debug text and shortens the reminder visibility for this
   * manual browser-validation pass.
   */
  useEffect(() => {
    if (!cooldownActive || !cooldownUntil) {
      visibleReminderNodeRef.current = null;

      if (fadeTimerRef.current) {
        window.clearTimeout(
          fadeTimerRef.current
        );
        fadeTimerRef.current = null;
      }

      return;
    }

    const syncReminder = () => {
      const node =
        document.querySelector(
          ".cooldownMessageText"
        );

      if (!node) {
        visibleReminderNodeRef.current = null;
        return;
      }

      const exactText =
        formatExactRemaining(
          cooldownUntil
        );

      node.textContent =
        `Message limit reached. Try again in ${exactText}.`;

      if (
        node !==
        visibleReminderNodeRef.current
      ) {
        visibleReminderNodeRef.current = node;
        restartDebugFadeTimer();
      }
    };

    syncReminder();

    const timer =
      window.setInterval(
        syncReminder,
        250
      );

    return () => {
      window.clearInterval(timer);
    };
  }, [
    cooldownActive,
    cooldownUntil,
  ]);


  /* Every blocked Send click must restart the reminder fade timer. */
  useEffect(() => {
    if (
      cooldownActive &&
      visibleReminderNodeRef.current
    ) {
      restartDebugFadeTimer();
    }
  }, [
    blockedClickCount,
    manualReminderNonce,
    cooldownActive,
  ]);


  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) {
        window.clearTimeout(
          fadeTimerRef.current
        );
      }
    };
  }, []);


  const onPointerDown = (event) => {
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };

    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  };


  const onPointerMove = (event) => {
    const drag = dragRef.current;

    if (
      !drag ||
      drag.pointerId !== event.pointerId
    ) {
      return;
    }

    setPosition({
      x: Math.max(
        0,
        drag.originX +
          event.clientX -
          drag.startX
      ),
      y: Math.max(
        0,
        drag.originY +
          event.clientY -
          drag.startY
      ),
    });
  };


  const onPointerUp = (event) => {
    if (
      dragRef.current?.pointerId ===
      event.pointerId
    ) {
      dragRef.current = null;
    }
  };


  const endsAt =
    cooldownActive && cooldownUntil
      ? new Date(
          cooldownUntil
        ).toLocaleTimeString()
      : "—";


  const setPreset = (seconds) => {
    setDurationSeconds(seconds);
  };

  const visibleLastEvent =
    String(lastEvent || "")
      .replaceAll(
        "Jump & Shake",
        "Horizontal Shake"
      )
      .replaceAll(
        "12-second",
        "9-second"
      )
      .replaceAll(
        "after 12s",
        "after 9s"
      );


  return (
    <aside
      aria-label="Temporary Contact cooldown test controls"
      style={{
        ...panelStyle,
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div
        style={headerStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        TEMP Contact cooldown tester — drag me
      </div>

      <div style={bodyStyle}>
        <div style={pillStyle}>
          <strong>Cooldown:</strong>{" "}
          {cooldownActive
            ? `ACTIVE (${cooldownText})`
            : "inactive"}
          <br />
          <strong>Ends:</strong>{" "}
          {endsAt}
          <br />
          <strong>Reminder:</strong>{" "}
          {cooldownMessageVisible
            ? "visible"
            : "hidden"}
          <br />
          <strong>Auto-fade:</strong>{" "}
          9s after the most recent reminder trigger
        </div>

        <label>
          Test timeout: {durationSeconds >= 3600
            ? `${Math.round(durationSeconds / 3600)}h`
            : durationSeconds >= 60
              ? `${Math.round(durationSeconds / 60)}m`
              : `${durationSeconds}s`}
          <input
            type="range"
            min="10"
            max="180"
            step="5"
            value={Math.min(durationSeconds, 180)}
            onChange={(event) => {
              setDurationSeconds(
                Number(event.target.value)
              );
            }}
            style={{
              width: "100%",
              marginTop: "6px",
              accentColor: "#3b9cff",
            }}
          />
        </label>

        <div style={rowStyle}>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => setPreset(10)}
          >
            10s
          </button>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => setPreset(30)}
          >
            30s
          </button>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => setPreset(120)}
          >
            2m
          </button>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => setPreset(10800)}
          >
            3h
          </button>
        </div>

        <div style={rowStyle}>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => {
              setManualReminderNonce(
                (nonce) => nonce + 1
              );
              onStartCooldown(
                durationSeconds
              );
            }}
          >
            Start cooldown
          </button>

          <button
            type="button"
            style={buttonStyle}
            onClick={() =>
              onSimulateSuccess(
                Math.max(10, durationSeconds)
              )
            }
          >
            Success → cooldown
          </button>
        </div>

        <div style={rowStyle}>
          <button
            type="button"
            style={secondaryButtonStyle}
            disabled={!cooldownActive}
            onClick={() => {
              setManualReminderNonce(
                (nonce) => nonce + 1
              );
              onShowReminder();
            }}
          >
            Show + Horizontal Shake
          </button>

          <button
            type="button"
            style={secondaryButtonStyle}
            disabled={!cooldownActive}
            onClick={onHideReminder}
          >
            Fade reminder now
          </button>
        </div>

        <div style={rowStyle}>
          <button
            type="button"
            style={dangerButtonStyle}
            onClick={onExpireNow}
          >
            Expire now
          </button>

          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={onResetDebugCounters}
          >
            Reset counters
          </button>
        </div>

        <div style={pillStyle}>
          <strong>Blocked Send clicks:</strong>{" "}
          {blockedClickCount}
          <br />
          <strong>Inactive submits intercepted:</strong>{" "}
          {wouldSubmitCount}
          <br />
          <strong>Last event:</strong>{" "}
          {visibleLastEvent}
        </div>

        <div
          style={{
            ...pillStyle,
            color: "#ffd479",
          }}
        >
          Debug mode blocks real /api/contact submissions. During an active cooldown,
          the visible countdown includes exact seconds and keeps ticking. Repeated
          Send clicks must stay blocked, replay the Horizontal Shake, and restart
          the 9-second fade timer after every blocked click.
        </div>
      </div>
    </aside>
  );
};


export default CooldownDebugPanel;
