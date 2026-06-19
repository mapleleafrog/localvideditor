import React from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "./Editor";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");
createRoot(el).render(
  <React.StrictMode>
    <Editor />
  </React.StrictMode>,
);
