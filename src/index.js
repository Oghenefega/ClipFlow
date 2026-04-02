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
  });
}

// Flush PostHog event queue before app quits
window.addEventListener("beforeunload", () => { posthog.shutdown(); });

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
