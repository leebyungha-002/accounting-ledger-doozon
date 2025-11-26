import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./utils/checkSpacing";

createRoot(document.getElementById("root")!).render(<App />);
