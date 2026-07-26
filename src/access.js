import { applyLocale, bindLocaleToggle, locale, t } from "./i18n.js?v=0.1.1";

applyLocale();
bindLocaleToggle();

const basePath = document.querySelector('meta[name="app-base"]')?.content.replace(/\/$/, "") || "";
const form = document.querySelector("#access-form");
const status = document.querySelector("#access-status");

form.addEventListener("submit", async event => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true; status.textContent = t("Tarkistetaan…", "Checking…");
  try {
    const response = await fetch(`${basePath}/api/access`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-outention-request": "1", "x-outention-locale": locale },
      body: JSON.stringify({ code: new FormData(form).get("code") })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || t("Kutsukoodia ei voitu tarkistaa.", "The invite code could not be verified."));
    window.location.replace(`${basePath}/`);
  } catch (error) {
    status.textContent = error.message; form.elements.code.select(); button.disabled = false;
  }
});
