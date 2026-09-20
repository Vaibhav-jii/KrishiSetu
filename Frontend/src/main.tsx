  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { LanguageProvider } from "./contexts/LanguageContext";
  import { ClerkProvider } from "@clerk/clerk-react";

  const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

  if (!PUBLISHABLE_KEY) {
    console.error("Missing VITE_CLERK_PUBLISHABLE_KEY");
  }

  createRoot(document.getElementById("root")!).render(
    <ClerkProvider publishableKey={PUBLISHABLE_KEY || "placeholder_key"}>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ClerkProvider>
  );