import { applyLocale, bindLocaleToggle, locale, t } from "./i18n.js";

applyLocale();
bindLocaleToggle();

const basePath = document.querySelector<HTMLMetaElement>('meta[name="app-base"]')?.content.replace(/\/$/, "") || "";
const form = document.querySelector<HTMLFormElement>("#access-form");
const status = document.querySelector<HTMLElement>("#access-status");

if (!form || !status) throw new Error("Outention access form is missing from the page.");

form.addEventListener("submit", async event => {
  event.preventDefault();
  const button = form.querySelector<HTMLButtonElement>("button");
  if (!button) return;
  button.disabled = true; status.textContent = t("Tarkistetaan…", "Checking…");
  try {
    const response = await fetch(`${basePath}/api/access`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-outention-request": "1", "x-outention-locale": locale },
      body: JSON.stringify({ code: new FormData(form).get("code") })
    });
    const data = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(data.error || t("Kutsukoodia ei voitu tarkistaa.", "The invite code could not be verified."));
    window.location.replace(`${basePath}/`);
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
    const codeInput = form.elements.namedItem("code");
    if (codeInput instanceof HTMLInputElement) codeInput.select();
    button.disabled = false;
  }
});
