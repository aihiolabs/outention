import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { HeaderContents, LeftRailContents } from "./components/AppChrome.js";

const header = document.querySelector<HTMLElement>(".site-header");
const leftRail = document.querySelector<HTMLElement>(".left-rail");

if (!header || !leftRail) throw new Error("Outention application shell is incomplete.");

// Render the first React-owned UI surfaces synchronously so the existing feed
// controller can bind its event handlers to the final DOM in the same frame.
flushSync(() => {
  createRoot(header).render(<HeaderContents />);
  createRoot(leftRail).render(<LeftRailContents />);
});

await import("./app.js");
