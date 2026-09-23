import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SidePanel } from "@/components/SidePanel";
import "@/assets/global.css";

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <SidePanel />
  </StrictMode>,
);
