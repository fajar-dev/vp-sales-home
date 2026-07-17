"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Snackbar } from "@mui/material";

export type ToastSeverity = "error" | "warning" | "info" | "success";

interface ToastDetail {
  message: string;
  severity?: ToastSeverity;
}

const TOAST_EVENT = "vpsales:toast";
/** Identical messages within this window are collapsed into one toast. */
const DEDUPE_WINDOW_MS = 4000;

/**
 * Fire-and-forget toast from anywhere (hooks, fetch handlers) without context
 * plumbing. A single <ToastHost /> mounted in the root layout renders them.
 */
export function showToast(message: string, severity: ToastSeverity = "error") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { message, severity } }),
  );
}

/** Convenience wrapper for API failures. */
export function showApiError(message: string) {
  showToast(message, "error");
}

interface ActiveToast {
  key: number;
  message: string;
  severity: ToastSeverity;
}

export default function ToastHost() {
  const [queue, setQueue] = useState<ActiveToast[]>([]);
  const recentRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const handler = (event: Event) => {
      const { message, severity = "error" } = (event as CustomEvent<ToastDetail>).detail ?? {};
      if (!message) return;

      const now = Date.now();
      const lastShown = recentRef.current.get(message) ?? 0;
      if (now - lastShown < DEDUPE_WINDOW_MS) return;
      recentRef.current.set(message, now);

      setQueue((prev) => [...prev.slice(-2), { key: now + Math.random(), message, severity }]);
    };

    window.addEventListener(TOAST_EVENT, handler);
    return () => window.removeEventListener(TOAST_EVENT, handler);
  }, []);

  const dismiss = useCallback((key: number) => {
    setQueue((prev) => prev.filter((t) => t.key !== key));
  }, []);

  return (
    <>
      {queue.map((toast, idx) => (
        <Snackbar
          key={toast.key}
          open
          autoHideDuration={6000}
          onClose={(_, reason) => {
            if (reason === "clickaway") return;
            dismiss(toast.key);
          }}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          sx={{ bottom: { xs: 16 + idx * 64, md: 24 + idx * 64 } }}
        >
          <Alert
            onClose={() => dismiss(toast.key)}
            severity={toast.severity}
            variant="filled"
            sx={{ width: "100%", boxShadow: "0 6px 24px rgba(15, 23, 42, 0.18)" }}
          >
            {toast.message}
          </Alert>
        </Snackbar>
      ))}
    </>
  );
}
