import {
  useEffect,
  useRef,
} from "react";


const ContactCooldownServerSyncTemp = ({
  enabled,
  onCooldown,
  onClearCooldown,
  onStatus,
}) => {
  const onCooldownRef =
    useRef(onCooldown);

  const onClearCooldownRef =
    useRef(onClearCooldown);

  const onStatusRef =
    useRef(onStatus);

  onCooldownRef.current = onCooldown;
  onClearCooldownRef.current = onClearCooldown;
  onStatusRef.current = onStatus;


  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let cancelled = false;

    const syncFromServer = async (
      reason = "manual"
    ) => {
      try {
        const response =
          await fetch(
            "/api/contact",
            {
              method: "GET",
              headers: {
                Accept: "application/json",
              },
              cache: "no-store",
            }
          );

        const result =
          await response.json();

        if (
          cancelled ||
          !response.ok
        ) {
          throw new Error(
            result?.message ||
            `Cooldown status request failed (${response.status}).`
          );
        }

        const retryAfterSeconds =
          Math.max(
            0,
            Number(
              result?.retryAfterSeconds
            ) || 0
          );

        if (
          result?.cooldownActive &&
          retryAfterSeconds > 0
        ) {
          onCooldownRef.current?.(
            retryAfterSeconds
          );

          onStatusRef.current?.(
            `Server cooldown synced (${reason}): ${retryAfterSeconds}s remaining.`
          );
          return;
        }

        onClearCooldownRef.current?.();
        onStatusRef.current?.(
          `Server cooldown check (${reason}): inactive.`
        );
      } catch (error) {
        if (!cancelled) {
          onStatusRef.current?.(
            `Server cooldown check failed (${reason}): ${error instanceof Error ? error.message : "unknown error"}`
          );
        }
      }
    };

    const handleFocus = () => {
      syncFromServer("window focus");
    };

    const handleVisibilityChange = () => {
      if (
        document.visibilityState ===
        "visible"
      ) {
        syncFromServer(
          "tab visible"
        );
      }
    };

    syncFromServer("initial load");

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
  }, [enabled]);


  return null;
};


export default ContactCooldownServerSyncTemp;
