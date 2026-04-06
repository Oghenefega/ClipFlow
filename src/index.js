import * as Sentry from "@sentry/electron/renderer";
import posthog from "posthog-js";
import React from "react";
import ReactDOM from "react-dom/client";
import "./globals.css";
import App from "./renderer/App";
import AppErrorBoundary from "./renderer/components/AppErrorBoundary";

Sentry.init({
  dsn: "https://849738274a045a047fd2068789244d13@o4511147466752000.ingest.us.sentry.io/4511147471077376",
});

// DOM-level crash screen — renders directly to DOM when React dies
function showCrashScreen(label, error) {
  const msg = error instanceof Error ? `${error.message}\n\n${error.stack}` : String(error);
  console.error(`[CrashScreen] ${label}:`, error);
  try { Sentry.captureException(error instanceof Error ? error : new Error(String(error))); } catch (_) {}
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `<div style="padding:48px;color:#ff6b6b;background:#0a0b10;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:monospace;text-align:center">
      <h1 style="font-size:20px;margin-bottom:12px;font-weight:700">ClipFlow crashed</h1>
      <p style="font-size:13px;color:#888;margin-bottom:16px">${label}</p>
      <pre style="font-size:11px;color:#ff9999;white-space:pre-wrap;max-width:700px;margin-bottom:24px;text-align:left;max-height:300px;overflow:auto">${msg.replace(/</g, "&lt;")}</pre>
      <button onclick="window.location.reload()" style="padding:10px 24px;background:#8b5cf6;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600">Reload App</button>
    </div>`;
  }
}

// Global error handlers — catch errors outside React's error boundary scope
window.addEventListener("error", (event) => {
  console.error("[Global] Uncaught error:", event.error || event.message);
  showCrashScreen("Uncaught error", event.error || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("[Global] Unhandled rejection:", event.reason);
  // Only show crash screen for rejections that actually kill React
  // (don't override a working UI for a background promise failure)
  const root = document.getElementById("root");
  if (root && root.children.length === 0) {
    showCrashScreen("Unhandled promise rejection", event.reason);
  }
});

// PostHog analytics — init synchronously before React mounts
posthog.init("phc_qGACntghkQEWxiGLRvfWzeRDnFns3Ut4HFXxcqKoAxgj", {
  api_host: "https://us.i.posthog.com",
  autocapture: false,
  capture_pageview: false,
  capture_pageleave: false,
  persistence: "localStorage",
});

// Identify with stable device ID + respect opt-out preference (async — store is IPC)
if (window.clipflow?.storeGet) {
  Promise.all([
    window.clipflow.storeGet("deviceId"),
    window.clipflow.storeGet("analyticsEnabled"),
  ]).then(([deviceId, analyticsEnabled]) => {
    if (analyticsEnabled === false) {
      posthog.opt_out_capturing();
    } else {
      posthog.opt_in_capturing();
    }
    if (deviceId) {
      posthog.identify(deviceId);
    }
  }).catch((err) => {
    console.warn("[PostHog] Failed to load analytics config:", err);
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
