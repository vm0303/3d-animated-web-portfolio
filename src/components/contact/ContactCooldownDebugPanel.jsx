import {
  useRef,
  useState,
} from "react";


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

  const dragRef =
    useRef(null);


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
          15s after the most recent reminder trigger
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
            onClick={() =>
              onStartCooldown(durationSeconds)
            }
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
            onClick={onShowReminder}
          >
            Show + Jump & Shake
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
          {lastEvent}
        </div>

        <div
          style={{
            ...pillStyle,
            color: "#ffd479",
          }}
        >
          Debug mode blocks real /api/contact submissions. During an active cooldown,
          click the real Send button repeatedly: the blocked counter should rise,
          the text should replay the Jump & Shake motion without blinking/remounting,
          and the 15-second fade timer should restart after each blocked click.
        </div>
      </div>
    </aside>
  );
};


export default CooldownDebugPanel;
