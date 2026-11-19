import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AdminApp from "./admin/AdminApp";
import PublicReportApp from "./public-report/PublicReportApp";
import "./styles.css";

const pathname = window.location.pathname;
const RootApp = pathname.startsWith("/admin")
  ? AdminApp
  : pathname.startsWith("/r/") || pathname.startsWith("/report/")
    ? PublicReportApp
    : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>,
);
