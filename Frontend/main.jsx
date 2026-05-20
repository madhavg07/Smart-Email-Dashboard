import React from "react";
import { createRoot } from "react-dom/client";
import MailPulse from "./App.jsx";

function init() {
  const el = document.getElementById("root");
  if (!el) return console.error("#root element not found");
  const root = createRoot(el);
  root.render(<MailPulse />);
}

init();
