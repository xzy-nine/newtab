import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Popup } from "@/components/Popup";
import "@/assets/global.css";

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
