import * as Sentry from "@sentry/electron/renderer";
import React from "react";
import ReactDOM from "react-dom/client";
import "./globals.css";
import App from "./renderer/App";
import AppErrorBoundary from "./renderer/components/AppErrorBoundary";

Sentry.init({
  dsn: "https://849738274a045a047fd2068789244d13@o4511147466752000.ingest.us.sentry.io/4511147471077376",
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
