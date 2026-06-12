import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NewTab } from "@/components/NewTab";
import "@/assets/global.css";

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <NewTab />
  </StrictMode>,
);
