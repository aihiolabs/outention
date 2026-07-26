import { Fragment } from "react";
import { locale, t } from "../i18n.js";

export function HeaderContents() {
  return (
    <Fragment>
      <a className="brand" href="#top" aria-label={t("Outention etusivu", "Outention home")}>
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <span>outention</span>
      </a>
      <nav aria-label={t("Päänavigaatio", "Main navigation")}>
        <button className="locale-toggle" type="button" data-locale-toggle aria-label={t("Switch to English", "Vaihda suomeksi")}>{locale === "en" ? "FI" : "EN"}</button>
        <button className="help-button" id="help-button" type="button" aria-label={t("Mikä Outention on?", "What is Outention?")} title={t("Mikä Outention on?", "What is Outention?")}>?</button>
        <span className="global-status" id="global-status">{t("○ Ei lähteitä", "○ No sources")}</span>
        <button className="nav-button account-button" id="account-button" type="button" data-open-account>{t("Kirjaudu", "Sign in")}</button>
        <button className="nav-button publish-button" type="button" data-open-publisher>{t("Julkaise", "Post")}</button>
        <button className="nav-button source-button" type="button" data-open-library>{t("Yhteydet", "Connections")}</button>
        <button className="avatar" type="button" data-open-profile aria-label={t("Oma konteksti", "Your context")}>●</button>
      </nav>
    </Fragment>
  );
}

export function LeftRailContents() {
  return (
    <Fragment>
      <a className="rail-item is-active" href="#top"><span aria-hidden="true">⌂</span><strong>{t("Koti", "Home")}</strong></a>
      <a className="rail-item" href="#feed-shell"><span aria-hidden="true">≋</span><strong>{t("Feedi", "Feed")}</strong></a>
      <button className="rail-item" type="button" data-open-saved><span aria-hidden="true">☆</span><strong>{t("Tallennetut", "Saved")}</strong></button>
      <button className="rail-item" type="button" data-open-publisher><span aria-hidden="true">＋</span><strong>{t("Julkaise", "Post")}</strong></button>
      <a className="rail-item" href="#control-deck"><span aria-hidden="true">☷</span><strong>{t("Järjestys", "Ranking")}</strong></a>
      <button className="rail-item" type="button" data-open-library><span aria-hidden="true">＋</span><strong>{t("Yhteydet", "Connections")}</strong></button>
      <button className="rail-item" type="button" data-open-profile><span aria-hidden="true">●</span><strong>{t("Oma konteksti", "Your context")}</strong></button>
    </Fragment>
  );
}
