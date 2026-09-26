import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AdminApp } from "./AdminApp";
import { PanelApp } from "./PanelApp";
import "./styles.css";

const isAdmin = location.pathname === "/admin" || location.pathname.startsWith("/admin/");
const forcedView = location.pathname === "/ha" || location.pathname.startsWith("/ha/") ? "ha" : undefined;

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isAdmin ? <AdminApp /> : <PanelApp forcedView={forcedView} />}</StrictMode>,
);
