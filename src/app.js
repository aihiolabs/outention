import { applyLocale, bindLocaleToggle, locale, t } from "./i18n.js?v=0.1.3";

applyLocale();
bindLocaleToggle();

const DEFAULT_CONTROLS = Object.freeze({ relevance: 45, freshness: 20, familiarity_target: 70, engagement: 5, max_per_author: 2 });
const BASE_PATH = document.querySelector('meta[name="app-base"]')?.content.replace(/\/$/, "") || "";
const PRESETS = {
  familiar: { relevance: 45, freshness: 18, familiarity_target: 90, engagement: 3, max_per_author: 3 },
  balanced: DEFAULT_CONTROLS,
  discovery: { relevance: 58, freshness: 28, familiarity_target: 20, engagement: 4, max_per_author: 1 }
};
const WORKSPACE_STORAGE_KEY = "outention.workspace.v1";
const LEGACY_WORKSPACE_STORAGE_KEY = "curamator.workspace.v1";
const ONBOARDING_STORAGE_KEY = "outention.onboarding.v1";
const MAX_PERSISTED_ITEMS = 30;
const MODEL_DEFAULTS = Object.freeze({
  openai: "gpt-5.6-luna",
  anthropic: "claude-haiku-4-5-20251001",
  gemini: "gemini-3.6-flash",
  openrouter: "openai/gpt-5.6-luna",
  local: ""
});
const MODEL_PRESETS = Object.freeze({
  openai: [
    ["gpt-5.6-luna", "GPT-5.6 Luna · efficient"],
    ["gpt-5.6-terra", "GPT-5.6 Terra · balanced"],
    ["gpt-5.6-sol", "GPT-5.6 Sol · highest capability"]
  ],
  anthropic: [
    ["claude-haiku-4-5-20251001", "Claude Haiku 4.5 · efficient"],
    ["claude-sonnet-5", "Claude Sonnet 5 · balanced"]
  ],
  gemini: [
    ["gemini-3.6-flash", "Gemini 3.6 Flash · balanced"],
    ["gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite · efficient"]
  ],
  openrouter: [
    ["openai/gpt-5.6-luna", "OpenAI GPT-5.6 Luna"],
    ["google/gemini-3.6-flash", "Google Gemini 3.6 Flash"],
    ["anthropic/claude-haiku-4.5", "Anthropic Claude Haiku 4.5"]
  ],
  local: []
});

const state = {
  status: null, program: null, items: [], runId: null, lastIntent: "",
  pagination: null, history: [], activeHistoryId: null, savedFeeds: [], profileContext: "", locationContext: "", loading: false, loadingMore: false, localModels: [],
  onboardingStep: 0, onboardingResumeStep: null
};

const elements = {
  connectPanel: document.querySelector("#connect-panel"), connectForm: document.querySelector("#connect-form"),
  connectStatus: document.querySelector("#connect-status"), globalStatus: document.querySelector("#global-status"),
  intentForm: document.querySelector("#intent-form"), intentInput: document.querySelector("#intent-input"),
  listenButton: document.querySelector(".listen-button"), feedShell: document.querySelector("#feed-shell"),
  feedList: document.querySelector("#feed-list"), lensChips: document.querySelector("#lens-chips"),
  resultCount: document.querySelector("#result-count"), refineForm: document.querySelector("#refine-form"),
  refineInput: document.querySelector("#refine-input"), sourceList: document.querySelector("#source-list"),
  dialog: document.querySelector("#library-dialog"), libraryGrid: document.querySelector("#library-grid"),
  mastodonForm: document.querySelector("#mastodon-form"), rssForm: document.querySelector("#rss-form"), opmlForm: document.querySelector("#opml-form"),
  locationewsForm: document.querySelector("#locationews-form"), libraryStatus: document.querySelector("#library-status"),
  algorithmControls: document.querySelector("#algorithm-controls"), controlDeck: document.querySelector("#control-deck"), controlSummary: document.querySelector("#control-summary"),
  controlBody: document.querySelector("#control-body"), toggleControls: document.querySelector("#toggle-controls"),
  historyPanel: document.querySelector("#history-panel"), historyList: document.querySelector("#history-list"),
  undoChange: document.querySelector("#undo-change"), resetControls: document.querySelector("#reset-controls"),
  resetSession: document.querySelector("#reset-session"), template: document.querySelector("#feed-card-template"),
  notice: document.querySelector("#notice"), mediaDialog: document.querySelector("#media-dialog"),
  mediaDialogImage: document.querySelector("#media-dialog-image"), mediaDialogCaption: document.querySelector("#media-dialog-caption"),
  continuation: document.querySelector("#feed-continuation"), continuationSentinel: document.querySelector("#continuation-sentinel"),
  loadMore: document.querySelector("#load-more"), continuationNote: document.querySelector("#continuation-note"),
  currentFeedIntent: document.querySelector("#current-feed-intent"), saveFeed: document.querySelector("#save-feed"),
  savedDialog: document.querySelector("#saved-dialog"), savedFeedList: document.querySelector("#saved-feed-list"), savedEmpty: document.querySelector("#saved-empty"),
  importLens: document.querySelector("#import-lens"), importLensFile: document.querySelector("#import-lens-file"),
  publisherDialog: document.querySelector("#publisher-dialog"), publisherForm: document.querySelector("#publisher-form"),
  publisherText: document.querySelector("#publisher-text"), publisherCount: document.querySelector("#publisher-count"),
  publisherDestinations: document.querySelector("#publisher-destinations"), publisherStatus: document.querySelector("#publisher-status"), publisherSubmit: document.querySelector("#publisher-submit"),
  profileDialog: document.querySelector("#profile-dialog"), profileForm: document.querySelector("#profile-form"), profileContext: document.querySelector("#profile-context"),
  profileStatus: document.querySelector("#profile-status"), profileLocation: document.querySelector("#profile-location"), clearProfile: document.querySelector("#clear-profile"),
  accountButton: document.querySelector("#account-button"), accountDialog: document.querySelector("#account-dialog"), accountForm: document.querySelector("#account-form"),
  accountDialogTitle: document.querySelector("#account-dialog-title"), accountDialogIntro: document.querySelector("#account-dialog-intro"),
  accountRegister: document.querySelector("#account-register"), accountSigned: document.querySelector("#account-signed"), accountIdentity: document.querySelector("#account-identity"),
  accountModeLabel: document.querySelector("#account-mode-label"), modelPersistOption: document.querySelector("#model-persist-option"),
  accountLogout: document.querySelector("#account-logout"), accountStatus: document.querySelector("#account-status"),
  modelKeyForm: document.querySelector("#model-key-form"), modelProvider: document.querySelector("#model-provider"), modelName: document.querySelector("#model-name"),
  modelHint: document.querySelector("#model-hint"), modelApiKey: document.querySelector("#model-api-key"), modelPersist: document.querySelector("#model-persist"),
  modelBaseUrlField: document.querySelector("#model-base-url-field"), modelBaseUrl: document.querySelector("#model-base-url"),
  modelPersistTitle: document.querySelector("#model-persist-title"), modelPersistDetail: document.querySelector("#model-persist-detail"),
  modelKeyStatus: document.querySelector("#model-key-status"), modelKeyRemove: document.querySelector("#model-key-remove"),
  accountPasswordForm: document.querySelector("#account-password-form"), accountExport: document.querySelector("#account-export"), accountDeleteForm: document.querySelector("#account-delete-form"),
  helpButton: document.querySelector("#help-button"), onboardingDialog: document.querySelector("#onboarding-dialog"),
  onboardingStepLabel: document.querySelector("#onboarding-step-label"), onboardingBack: document.querySelector("#onboarding-back"),
  onboardingNext: document.querySelector("#onboarding-next"), onboardingSkip: document.querySelector("#onboarding-skip"),
  onboardingModelTitle: document.querySelector("#onboarding-model-title"), onboardingModelDetail: document.querySelector("#onboarding-model-detail"),
  onboardingModelDot: document.querySelector("#onboarding-model-dot"), onboardingSourceStatus: document.querySelector("#onboarding-source-status"),
  onboardingIntentInput: document.querySelector("#onboarding-intent-input"), mobileTailnetUrl: document.querySelector("#mobile-tailnet-url"),
  mobileCopyStatus: document.querySelector("#mobile-copy-status"), tailscaleCommand: document.querySelector("#tailscale-command")
};

async function api(path, options = {}) {
  const response = await fetch(`${BASE_PATH}${path}`, { ...options, headers: { "content-type": "application/json", "x-outention-request": "1", "x-outention-locale": locale, ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && data.accessRequired) { window.location.href = `${BASE_PATH}/access`; throw new Error(t("Beta-kutsu vaaditaan.", "Beta access is required.")); }
  if (!response.ok) throw new Error(data.error || t("Pyyntö epäonnistui.", "Request failed."));
  return data;
}

async function loadStatus() {
  state.status = await api("/api/status");
  renderStatus();
}

function renderStatus() {
  const blueskyConnected = state.status?.bluesky?.connected;
  const mastodonConnected = state.status?.mastodon?.connected;
  const threadsDiscovery = state.status?.threads?.discovery;
  const rssCount = state.status?.rss?.feeds?.length || 0;
  const publicDiscovery = Boolean(state.status?.publicDiscovery?.connected);
  const customCount = state.status?.customConnectors?.sources?.length || 0;
  const hasSources = Boolean(publicDiscovery || blueskyConnected || mastodonConnected || threadsDiscovery || state.status?.reddit?.discovery || rssCount || state.status?.yle?.connected || state.status?.hackernews?.connected || state.status?.locationews?.connected || customCount);
  const sourceCount = Number(Boolean(publicDiscovery)) + Number(Boolean(blueskyConnected)) + Number(Boolean(mastodonConnected)) + Number(Boolean(threadsDiscovery)) + Number(Boolean(state.status?.reddit?.discovery)) + rssCount + Number(Boolean(state.status?.yle?.connected)) + Number(Boolean(state.status?.hackernews?.connected)) + Number(Boolean(state.status?.locationews?.connected)) + customCount;
  elements.connectPanel.hidden = blueskyConnected;
  elements.intentInput.disabled = !hasSources || state.loading;
  elements.listenButton.disabled = !hasSources || state.loading;
  elements.refineInput.disabled = state.loading;
  document.querySelectorAll("[data-intent]").forEach(button => { button.disabled = !hasSources || state.loading; });
  elements.globalStatus.className = `global-status ${hasSources ? "is-live" : ""}`;
  elements.globalStatus.textContent = hasSources
    ? `● ${sourceCount} ${sourceCount === 1 ? t("lähde", "source") : t("lähdettä", "sources")}`
    : t("○ Ei lähteitä", "○ No sources");
  elements.sourceList.replaceChildren();
  if (publicDiscovery) elements.sourceList.append(sourceRow("◎", t("Julkinen löytö", "Public discovery"), ["Bluesky", "Mastodon", ...(threadsDiscovery ? ["Threads"] : [])].join(" · "), "#315f50"));
  if (blueskyConnected) elements.sourceList.append(sourceRow("🦋", "Bluesky", state.status.bluesky.handle, "#1685fe"));
  if (mastodonConnected) elements.sourceList.append(sourceRow("M", "Mastodon", state.status.mastodon.handle, "#6364ff"));
  if (threadsDiscovery) elements.sourceList.append(sourceRow("@", "Threads", state.status.threads.username ? `@${state.status.threads.username} · ${t("julkinen haku", "public search")}` : t("Julkinen haku", "Public search"), "#111111"));
  if (state.status?.reddit?.discovery) elements.sourceList.append(sourceRow("R", "Reddit", state.status.reddit.connected ? t("Koko Reddit + oma Best", "All Reddit + your Best") : t("Koko Redditin haku", "Search all Reddit"), "#ff4500"));
  for (const feed of state.status?.rss?.feeds || []) elements.sourceList.append(sourceRow(feed.url.includes("youtube.com") ? "▶" : "◌", feed.name || "RSS", new URL(feed.url).hostname, feed.url.includes("youtube.com") ? "#ff0000" : "#6a7b70"));
  if (state.status?.yle?.connected) elements.sourceList.append(sourceRow("Y", "Yle Uutiset", t("Tuoreimmat", "Latest"), "#00a4b8"));
  if (state.status?.hackernews?.connected) elements.sourceList.append(sourceRow("Y", "Hacker News", "Best", "#ff6600"));
  if (state.status?.locationews?.connected) elements.sourceList.append(sourceRow("⌖", "Locationews", state.status.locationews.placeName || t("Valtakunnallinen", "National"), "#c5552d"));
  for (const connector of state.status?.customConnectors?.sources || []) elements.sourceList.append(sourceRow("◇", connector.name, t("Paikallinen connector", "Local connector"), "#725a9a"));
  const curator = state.status?.curator;
  const modelState = curator?.configured
    ? curator.verified ? curator.model : `${curator.model} · ${t("tarkistamatta", "not verified")}`
    : t("Malliyhteys puuttuu", "Model connection missing");
  elements.sourceList.append(sourceRow("✦", t("Kuraattori", "Curator"), modelState, curator?.verified ? "#19392d" : "#b56a30", curator?.verified ? "connected" : curator?.configured ? "warning" : "missing"));
  renderLibrary();
  renderPublisherDestinations();
  renderAccount();
  renderOnboardingStatus();
}

function connectedSourceCount() {
  return Number(Boolean(state.status?.publicDiscovery?.connected))
    + Number(Boolean(state.status?.bluesky?.connected))
    + Number(Boolean(state.status?.mastodon?.connected))
    + Number(Boolean(state.status?.threads?.discovery))
    + Number(Boolean(state.status?.reddit?.discovery))
    + (state.status?.rss?.feeds?.length || 0)
    + Number(Boolean(state.status?.yle?.connected))
    + Number(Boolean(state.status?.hackernews?.connected))
    + Number(Boolean(state.status?.locationews?.connected))
    + (state.status?.customConnectors?.sources?.length || 0);
}

function renderOnboardingStatus() {
  const curator = state.status?.curator;
  const modelReady = Boolean(curator?.configured);
  elements.onboardingModelTitle.textContent = modelReady ? t("Malliyhteys on valmis", "Model connection is ready") : t("Malliyhteys puuttuu", "Model connection missing");
  elements.onboardingModelDetail.textContent = modelReady
    ? `${providerName(curator.provider)} · ${curator.model}`
    : t("Valitse OpenAI, Anthropic, Gemini, OpenRouter tai paikallinen malli.", "Choose OpenAI, Anthropic, Gemini, OpenRouter, or a local model.");
  elements.onboardingModelDot.classList.toggle("is-ready", modelReady);
  const sources = connectedSourceCount();
  elements.onboardingSourceStatus.textContent = sources
    ? `${sources} ${sources === 1 ? t("lähde valittu", "source selected") : t("lähdettä valittu", "sources selected")}`
    : t("Ei vielä lähteitä", "No sources yet");
  elements.onboardingSourceStatus.classList.toggle("is-ready", sources > 0);
}

function showOnboardingStep(step) {
  state.onboardingStep = Math.max(0, Math.min(4, step));
  elements.onboardingDialog.querySelectorAll("[data-onboarding-step]").forEach(panel => {
    const active = Number(panel.dataset.onboardingStep) === state.onboardingStep;
    panel.hidden = !active; panel.classList.toggle("is-active", active);
  });
  elements.onboardingDialog.querySelectorAll(".onboarding-progress i").forEach((dot, index) => dot.classList.toggle("is-active", index <= state.onboardingStep));
  const labels = [t("Perusidea", "The idea"), t("Malliyhteys", "Model"), t("Lähteet", "Sources"), t("Ensimmäinen intentio", "First intention"), t("Mobiilikäyttö", "Mobile access")];
  const headingIds = ["onboarding-title", "onboarding-model-heading", "onboarding-sources-heading", "onboarding-intent-heading", "onboarding-mobile-heading"];
  elements.onboardingDialog.setAttribute("aria-labelledby", headingIds[state.onboardingStep]);
  elements.onboardingStepLabel.textContent = `${labels[state.onboardingStep]} · ${state.onboardingStep + 1}/5`;
  elements.onboardingBack.hidden = state.onboardingStep === 0;
  elements.onboardingSkip.textContent = state.onboardingStep === 3
    ? t("Mobiilikäytön ohje", "Mobile setup")
    : state.onboardingStep === 4
      ? t("Teen tämän myöhemmin", "I'll do this later")
      : t("Ohita opastus", "Skip guide");
  elements.onboardingNext.innerHTML = state.onboardingStep >= 3
    ? `${t("Rakenna ensimmäinen feedi", "Build my first feed")} <span aria-hidden="true">→</span>`
    : `${t("Jatka", "Continue")} <span aria-hidden="true">→</span>`;
  renderOnboardingStatus();
}

function openOnboarding(step = 0) {
  showOnboardingStep(step);
  if (!elements.onboardingDialog.open) elements.onboardingDialog.showModal();
  if (state.onboardingStep === 3) setTimeout(() => elements.onboardingIntentInput.focus(), 50);
}

function completeOnboarding({ runFeed = false } = {}) {
  const intent = elements.onboardingIntentInput.value.trim();
  if (intent) elements.intentInput.value = intent;
  localStorage.setItem(ONBOARDING_STORAGE_KEY, "complete");
  elements.onboardingDialog.close();
  if (runFeed && intent) requestFeed(intent, { kind: "intent", label: intent });
  else elements.intentInput.focus();
}

function openOnboardingSetup(dialog, returnStep) {
  state.onboardingResumeStep = returnStep;
  elements.onboardingDialog.close();
  dialog.showModal();
}

function resumeOnboardingAfterDialog() {
  if (state.onboardingResumeStep === null) return;
  const step = state.onboardingResumeStep; state.onboardingResumeStep = null;
  setTimeout(() => openOnboarding(step), 0);
}

function renderAccount() {
  const account = state.status?.account;
  const personal = Boolean(state.status?.accountFeatures?.personalMode);
  elements.accountButton.textContent = personal ? t("Asetukset", "Settings") : account ? t("Tili", "Account") : t("Kirjaudu", "Sign in");
  elements.accountButton.classList.toggle("is-signed-in", Boolean(account));
  elements.accountForm.hidden = Boolean(account || personal);
  elements.accountSigned.hidden = !(account || personal);
  elements.accountDialogTitle.textContent = personal ? t("Outention-asetukset", "Outention settings") : t("Outention-tili", "Outention account");
  elements.accountDialogIntro.textContent = personal
    ? t("Määritä tämän paikallisen asennuksen malliyhteys. Outention-tiliä ei tarvita.", "Configure the model connection for this local installation. No Outention account is required.")
    : t("Oma tilisi ei riipu mistään somepalvelusta. Lähteet liitetään siihen erikseen.", "Your account does not depend on any social platform. Sources are connected separately.");
  elements.accountModeLabel.textContent = personal ? t("Paikallinen asennus", "Local installation") : t("Kirjautuneena", "Signed in as");
  elements.accountIdentity.textContent = personal ? t("Henkilökohtainen tila · ei Outention-tiliä", "Personal mode · no Outention account") : account?.email || "";
  elements.modelPersistOption.hidden = false;
  elements.modelPersistTitle.textContent = personal ? t("Tallenna tämän koneen .env.local-tiedostoon", "Save to this machine's .env.local file") : t("Säilytä salattuna tilillä", "Store encrypted with your account");
  elements.modelPersistDetail.textContent = personal
    ? `${t("Tallennetaan paikallisesti polkuun", "Stored locally at")} ${state.status?.accountFeatures?.localConfigPath || ".env.local"}. ${t("Tiedostoa ei lähetetä Outentionille.", "The file is not sent to Outention.")}`
    : t("Muuten avain poistuu palvelimen muistista uloskirjautuessa tai istunnon vanhetessa.", "Otherwise the key leaves server memory when you sign out or the session expires.");
  elements.accountSigned.querySelectorAll("[data-account-only]").forEach(element => { element.hidden = personal; });
  const byok = state.status?.accountFeatures?.byok;
  if (byok?.configured) {
    elements.modelProvider.value = byok.provider;
    elements.modelName.value = byok.model;
    if (byok.baseUrl) elements.modelBaseUrl.value = byok.baseUrl;
    elements.modelPersist.checked = byok.persisted;
    elements.modelKeyStatus.textContent = `${t("Käytössä", "Active")}: ${providerName(byok.provider)} · ${byok.model} · ${byok.persisted ? personal ? ".env.local" : t("salattu tallennus", "encrypted storage") : t("vain tämä istunto", "this session only")}`;
  } else {
    const curator = state.status?.curator;
    if (personal && curator?.configured) {
      elements.modelProvider.value = curator.provider;
      elements.modelName.value = curator.model;
      updateModelSuggestion(false);
    } else updateModelSuggestion(true);
    elements.modelPersist.checked = personal;
    elements.modelKeyStatus.textContent = personal && curator?.configured
      ? `${t("Paikallinen ympäristö", "Local environment")}: ${providerName(curator.provider)} · ${curator.model}`
      : personal
        ? t("Tallenna API-avain tämän koneen paikalliseen asetustiedostoon.", "Save an API key to this machine's local configuration file.")
        : t("Outentionin malliyhteys on käytössä.", "Outention's model connection is active.");
  }
  updateModelSuggestion(false);
  elements.modelKeyRemove.disabled = !byok?.configured;
}

function providerName(provider) {
  return ({ openai: "OpenAI", anthropic: "Anthropic", gemini: "Google Gemini", openrouter: "OpenRouter", local: t("Paikallinen malli", "Local model") })[provider] || provider;
}

function updateModelSuggestion(force = false) {
  const local = elements.modelProvider.value === "local";
  const suggestion = local ? state.localModels[0] || "" : MODEL_DEFAULTS[elements.modelProvider.value];
  if (force || !elements.modelName.value || Object.values(MODEL_DEFAULTS).filter(Boolean).includes(elements.modelName.value)) elements.modelName.value = suggestion;
  const presets = document.querySelector("#model-presets");
  const modelOptions = local ? state.localModels.map(value => [value, value]) : MODEL_PRESETS[elements.modelProvider.value] || [];
  presets.replaceChildren(...modelOptions.map(([value, label]) => {
    const option = document.createElement("option"); option.value = value; option.label = label; return option;
  }));
  elements.modelHint.textContent = local
    ? suggestion ? `${t("Asennettu", "Installed")}: ${state.localModels.length}` : t("Asenna ensin malli Ollamalla, LM Studiolla tai vLLM:llä", "Install a model with Ollama, LM Studio, or vLLM first")
    : `${t("Esimerkki", "Example")}: ${suggestion}`;
  updateModelFields();
}

async function refreshLocalModels(selectFirst) {
  elements.modelKeyStatus.textContent = t("Haetaan asennettuja paikallisia malleja…", "Looking for installed local models…");
  try {
    const baseUrl = elements.modelBaseUrl.value || "http://127.0.0.1:11434/v1";
    const result = await api(`/api/models/local?baseUrl=${encodeURIComponent(baseUrl)}`);
    state.localModels = Array.isArray(result.models) ? result.models : [];
    updateModelSuggestion(Boolean(selectFirst && state.localModels.length));
    elements.modelKeyStatus.textContent = state.localModels.length
      ? t(`Löytyi ${state.localModels.length} paikallista mallia. Tallennus testaa valitun mallin.`, `${state.localModels.length} local model(s) found. Saving will test the selected model.`)
      : t("Mallipalvelu vastasi, mutta asennettuja malleja ei löytynyt.", "The local model service responded, but no installed models were found.");
  } catch (error) {
    state.localModels = []; updateModelSuggestion(false);
    setInlineStatus(elements.modelKeyStatus, error.message, "error");
  }
}

function updateModelFields() {
  const local = elements.modelProvider.value === "local";
  const configured = state.status?.accountFeatures?.byok?.configured
    ? state.status.accountFeatures.byok
    : state.status?.curator;
  const canReuseKey = Boolean(configured?.configured && configured.provider === elements.modelProvider.value);
  elements.modelBaseUrlField.hidden = !local;
  elements.modelApiKey.required = !local && !canReuseKey;
  elements.modelApiKey.minLength = local ? 0 : 16;
  elements.modelApiKey.placeholder = canReuseKey
    ? t("Jätä tyhjäksi säilyttääksesi nykyisen avaimen", "Leave blank to keep the current key")
    : "";
  const keyLabel = elements.modelKeyForm.querySelector('label[for="model-api-key"] span');
  keyLabel.textContent = local || canReuseKey ? t("Valinnainen", "Optional") : t("Ei koskaan näytetä uudelleen", "Never shown again");
}

async function authenticateAccount(action) {
  if (!elements.accountForm.reportValidity()) return;
  const data = new FormData(elements.accountForm);
  elements.accountStatus.textContent = action === "register" ? t("Luodaan tiliä…", "Creating account…") : t("Kirjaudutaan…", "Signing in…");
  elements.accountForm.querySelectorAll("button").forEach(button => { button.disabled = true; });
  try {
    const result = await api(`/api/account/${action}`, { method: "POST", body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) });
    elements.accountForm.reset(); await loadStatus();
    elements.accountStatus.textContent = action === "register" ? t("Tili luotiin ja olet kirjautuneena.", "Account created. You are signed in.") : t("Olet kirjautuneena.", "You are signed in.");
  } catch (error) { elements.accountStatus.textContent = error.message; }
  finally { elements.accountForm.querySelectorAll("button").forEach(button => { button.disabled = false; }); }
}

function renderPublisherDestinations() {
  elements.publisherDestinations.replaceChildren();
  for (const destination of state.status?.publishing?.destinations || []) {
    const label = document.createElement("label"); label.className = "publisher-destination";
    const input = document.createElement("input"); input.type = "checkbox"; input.name = "destination"; input.value = destination.id;
    input.disabled = !destination.connected || !destination.available; input.checked = destination.connected && destination.available;
    const copy = document.createElement("span"); const name = document.createElement("strong"); name.textContent = destination.name;
    const detail = document.createElement("small"); detail.textContent = destination.connected
      ? t("Yhdistetty", "Connected")
      : destination.id === "eulesia"
        ? t("OAuth/API valmistellaan", "OAuth/API in preparation")
        : destination.note || t("Yhdistä ensin", "Connect first");
    copy.append(name, detail); label.append(input, copy); elements.publisherDestinations.append(label);
  }
  const available = [...elements.publisherDestinations.querySelectorAll("input")].some(input => !input.disabled);
  elements.publisherSubmit.disabled = !available;
}

function sourceRow(markText, nameText, detailText, color, connectionState = "connected") {
  const row = document.createElement("div"); row.className = "source-row";
  const mark = document.createElement("span"); mark.className = "source-mark"; mark.textContent = markText; mark.style.setProperty("--source-color", color);
  const copy = document.createElement("div");
  const name = document.createElement("strong"); name.textContent = nameText;
  const detail = document.createElement("span"); detail.textContent = detailText;
  copy.append(name, detail);
  const dot = document.createElement("span"); dot.className = `connected-dot is-${connectionState}`;
  dot.title = connectionState === "connected" ? t("Yhdistetty", "Connected") : connectionState === "warning" ? t("Määritetty, ei vielä testattu", "Configured, not yet tested") : t("Ei yhdistetty", "Not connected");
  row.append(mark, copy, dot); return row;
}

function renderLibrary() {
  elements.libraryGrid.replaceChildren();
  const sources = [
    ["🦋", "Bluesky", state.status?.bluesky?.connected ? t("Oma Home + julkinen haku", "Your Home + public search") : t("Julkinen haku · Home etusivulta", "Public search · connect Home from the front page"), true, null, true],
    ["R", "Reddit", state.status?.reddit?.connected ? t("Koko Reddit + oma Best", "All Reddit + your Best") : state.status?.reddit?.configured ? t("Koko Redditin haku · oma Best valinnainen", "Search all Reddit · your Best is optional") : t("API-tunnukset tarvitaan", "API credentials required"), Boolean(state.status?.reddit?.connected || state.status?.reddit?.configured), "reddit", Boolean(state.status?.reddit?.discovery)],
    ["M", "Mastodon + fediverse", state.status?.mastodon?.connected ? t("Oma Home + julkinen haku", "Your Home + public search") : t("Julkinen hashtag-haku", "Public hashtag search"), true, "mastodon", true],
    ["⌖", "Locationews", state.status?.locationews?.connected ? (state.status.locationews.placeName || t("Valtakunnallinen", "National")) : t("Ei käytössä", "Disabled"), true, "locationews", Boolean(state.status?.locationews?.connected)],
    ["Y", "Yle Uutiset", state.status?.yle?.connected ? t("Tuoreimmat käytössä", "Latest enabled") : t("Julkinen RSS · ei tunnuksia", "Public RSS · no credentials"), true, "yle", Boolean(state.status?.yle?.connected)],
    ["▶", "YouTube", t("Kanavat Atom-syötteellä", "Channels via Atom feeds"), true, "rss", Boolean(state.status?.rss?.feeds?.some(feed => feed.url.includes("youtube.com")))],
    ["◌", "RSS / podcast", `${state.status?.rss?.feeds?.length || 0} ${t("lisättyä syötettä", "feeds added")}`, true, "rss", Boolean(state.status?.rss?.feeds?.length)],
    ["Y", "Hacker News", state.status?.hackernews?.connected ? t("Best käytössä", "Best enabled") : t("Julkinen API", "Public API"), true, "hackernews", Boolean(state.status?.hackernews?.connected)],
    ["E", "Eulesia", t("Varmennettu kansalaiskeskustelu", "Verified civic discussion"), false, null, false],
    ["@", "Threads", state.status?.threads?.connected
      ? `${state.status.threads.username ? `@${state.status.threads.username} · ` : ""}${t("julkinen intentiohaku", "public intention search")}`
      : state.status?.threads?.configured
        ? t("Julkinen haku Meta OAuthilla", "Public search via Meta OAuth")
        : t("Meta-sovelluksen tunnukset tarvitaan", "Meta app credentials required"),
    Boolean(state.status?.threads?.connected || state.status?.threads?.configured), "threads", Boolean(state.status?.threads?.connected)]
  ];
  for (const [markText, nameText, detailText, available, action, connected] of sources) {
    const card = document.createElement("button"); card.type = "button"; card.className = `library-source${connected ? " is-connected" : " is-available"}`; card.disabled = !available;
    const mark = document.createElement("span"); mark.className = "source-mark"; mark.textContent = markText;
    const copy = document.createElement("span"); const name = document.createElement("strong"); name.textContent = nameText; const detail = document.createElement("small"); detail.textContent = detailText; copy.append(name, detail);
    const status = document.createElement("span"); status.className = "library-source-state"; status.textContent = connected
      ? t("Käytössä", "Enabled")
      : available
        ? t("Saatavilla", "Available")
        : action
          ? t("Määritä", "Configure")
          : t("Tulossa", "Coming soon");
    card.append(mark, copy, status); elements.libraryGrid.append(card);
    if (action === "mastodon") card.addEventListener("click", () => elements.mastodonForm.querySelector("input").focus());
    if (action === "rss") card.addEventListener("click", () => elements.rssForm.elements.url.focus());
    if (action === "locationews") card.addEventListener("click", () => elements.locationewsForm.elements.context.focus());
    if (action === "reddit") card.addEventListener("click", () => { if (!state.status?.reddit?.connected) window.location.href = `${BASE_PATH}/api/connect/reddit/start`; });
    if (action === "threads") card.addEventListener("click", () => toggleThreads());
    if (action === "yle" || action === "hackernews") card.addEventListener("click", () => toggleSimpleSource(action));
  }
}

async function toggleThreads() {
  if (!state.status?.threads?.connected) {
    window.location.href = `${BASE_PATH}/api/connect/threads/start`;
    return;
  }
  setInlineStatus(elements.libraryStatus, t("Poistetaan Threads-yhteys…", "Removing Threads connection…"));
  try {
    await api("/api/connect/threads", { method: "DELETE" });
    await loadStatus();
    setInlineStatus(elements.libraryStatus, t("Threads-yhteys poistettiin.", "Threads connection removed."), "success");
  } catch (error) { setInlineStatus(elements.libraryStatus, error.message, "error"); }
}

async function toggleSimpleSource(source) {
  const connected = Boolean(state.status?.[source]?.connected);
  elements.libraryStatus.textContent = connected ? t("Poistetaan lähde…", "Removing source…") : t("Lisätään lähde…", "Adding source…");
  try {
    await api(`/api/connect/${source}`, { method: connected ? "DELETE" : "POST", body: connected ? undefined : "{}" });
    await loadStatus(); elements.libraryStatus.textContent = connected ? t("Lähde poistettu.", "Source removed.") : t("Lähde on nyt mukana feedissä.", "Source is now included in the feed.");
  } catch (error) { elements.libraryStatus.textContent = error.message; }
}

async function requestFeed(intent, { scroll = true, kind = "intent", label = intent, append = false, excludeIds = [] } = {}) {
  if (state.loading) return false;
  const hadFeed = state.items.length > 0;
  const controls = controlsPayload();
  setLoading(true); showNotice("", "");
  const slowNotice = window.setTimeout(() => {
    if (!state.loading) return;
    elements.resultCount.textContent = state.status?.curator?.provider === "local"
      ? t("Paikallinen malli järjestää rajattua ehdokasjoukkoa…", "The local model is ranking a bounded candidate set…")
      : t("Lähteitä haetaan yhä…", "Sources are still being retrieved…");
  }, 8000);
  if (!hadFeed && !append) {
    elements.feedShell.hidden = false; document.body.classList.add("has-feed"); renderSkeletons();
    if (scroll) elements.feedShell.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  try {
    const data = await api("/api/feed", { method: "POST", body: JSON.stringify({
      intent,
      previousProgram: kind === "intent" ? null : state.program,
      profileContext: state.profileContext,
      controls, excludeIds
    }) });
    if (data.clarificationNeeded) {
      showNotice(data.clarificationQuestion, "question");
      if (!hadFeed) { elements.feedShell.hidden = true; document.body.classList.remove("has-feed"); }
      elements.intentInput.focus();
      return false;
    }
    applyFeedResult(data, { intent, kind, label, append });
    if (scroll && hadFeed) elements.feedShell.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  } catch (error) {
    showNotice(error.message, "error");
    if (!hadFeed) { elements.feedShell.hidden = true; document.body.classList.remove("has-feed"); }
    return false;
  } finally { window.clearTimeout(slowNotice); setLoading(false); }
}

function applyFeedResult(data, { intent, kind, label, append = false }) {
  state.lastIntent = intent; state.program = data.program;
  state.items = append ? uniqueItems([...state.items, ...(data.items || [])]) : data.items || [];
  state.runId = data.runId || null; state.pagination = data.pagination || null;
  renderProgram(state.program); renderFeed(state.items);
  elements.feedShell.hidden = false; document.body.classList.add("has-feed");
  pushHistory({ label, kind, intent, program: state.program, items: state.items, runId: state.runId, pagination: state.pagination });
  renderCurrentFeed(); persistWorkspace();
}

function renderProgram(program) {
  elements.lensChips.replaceChildren();
  const languageNames = locale === "fi"
    ? { fi: "suomeksi", en: "englanniksi", sv: "ruotsiksi", fr: "ranskaksi", de: "saksaksi", es: "espanjaksi" }
    : { fi: "Finnish", en: "English", sv: "Swedish", fr: "French", de: "German", es: "Spanish" };
  const languages = (program.languages || []).map(code => languageNames[String(code).toLowerCase()] || code);
  const values = [...languages, ...(program.include || []), ...(program.tone || []), ...(program.social_scope || []), ...(program.content_forms || []), ...(program.exclude || []).map(item => `${t("ei", "not")} ${item}`)];
  for (const label of [...new Set(values)].slice(0, 10)) {
    const chip = document.createElement("span"); chip.textContent = label; elements.lensChips.append(chip);
  }
  setControls({
    relevance: program.weights?.relevance ?? DEFAULT_CONTROLS.relevance,
    freshness: program.weights?.freshness ?? DEFAULT_CONTROLS.freshness,
    familiarity_target: program.familiarity_target ?? DEFAULT_CONTROLS.familiarity_target,
    engagement: program.weights?.engagement ?? DEFAULT_CONTROLS.engagement,
    max_per_author: program.diversity?.max_per_author ?? DEFAULT_CONTROLS.max_per_author
  });
}

function renderCurrentFeed() {
  const intent = baseIntent(state.lastIntent);
  elements.currentFeedIntent.textContent = intent;
  elements.currentFeedIntent.title = intent;
  elements.saveFeed.disabled = !intent || !state.program;
  const saved = state.savedFeeds.some(feed => feed.intent === intent && sameProgram(feed.program, state.program));
  elements.saveFeed.textContent = saved ? t("Tallennettu ✓", "Saved ✓") : t("Tallenna", "Save");
  elements.saveFeed.classList.toggle("is-saved", saved);
}

function renderFeed(items) {
  elements.feedList.replaceChildren();
  elements.resultCount.textContent = `${items.length} ${items.length === 1 ? t("valinta", "selection") : t("valintaa", "selections")}`;
  for (const item of items) elements.feedList.append(createFeedCard(item));
  if (!items.length) {
    const empty = document.createElement("div"); empty.className = "empty-state";
    const mark = document.createElement("span"); mark.textContent = "◎";
    const title = document.createElement("strong"); title.textContent = t("Tästä joukosta ei löytynyt sopivaa sisältöä.", "Nothing in this set matched well enough.");
    const detail = document.createElement("span"); detail.textContent = t("Väljennä intentiota tai siirrä painotusta kohti uusia löytöjä.", "Broaden your intention or shift the ranking toward discovery.");
    empty.append(mark, title, detail); elements.feedList.append(empty);
  }
  renderContinuation();
}

function createFeedCard(item) {
  const fragment = elements.template.content.cloneNode(true); const card = fragment.querySelector(".feed-card");
  const socialContext = card.querySelector(".social-context");
  if (item.socialContext) { socialContext.textContent = item.socialContext; socialContext.hidden = false; }
  const avatar = card.querySelector(".author-avatar");
  if (item.author.avatar) { const image = document.createElement("img"); image.src = item.author.avatar; image.alt = ""; image.loading = "lazy"; avatar.append(image); }
  else avatar.textContent = initials(item.author.name);
  card.querySelector(".author-name").textContent = item.author.name;
  card.querySelector(".author-handle").textContent = item.author.handle;
  const badge = card.querySelector(".source-badge"); badge.textContent = item.sourceName || item.sourceType;
  for (const type of ["reddit", "locationews", "mastodon", "youtube", "hackernews"]) badge.classList.toggle(`is-${type}`, item.sourceType === type);
  badge.classList.toggle("is-yle", item.sourceName === "Yle Uutiset");
  const postText = card.querySelector(".post-text"); postText.textContent = item.text;
  const expand = card.querySelector(".expand-text");
  if (item.text.length > 620 || item.text.split("\n").length > 8) {
    postText.classList.add("is-collapsed"); expand.hidden = false;
    expand.addEventListener("click", () => {
      const collapsed = postText.classList.toggle("is-collapsed");
      expand.textContent = collapsed ? t("Näytä lisää", "Show more") : t("Näytä vähemmän", "Show less");
    });
  }
  renderMedia(card.querySelector(".media-host"), item);
  card.querySelector(".published-at").textContent = relativeTime(item.publishedAt);
  const activity = [];
  if (item.engagement?.replies) activity.push(`↩ ${compactNumber(item.engagement.replies)}`);
  if (item.engagement?.reposts) activity.push(`↻ ${compactNumber(item.engagement.reposts)}`);
  if (item.engagement?.likes) activity.push(`♡ ${compactNumber(item.engagement.likes)}`);
  card.querySelector(".engagement").textContent = activity.join("  ");
  const language = card.querySelector(".language"); language.textContent = languageLabel(item.language);
  const why = card.querySelector(".why-panel");
  const components = item.components ? Object.entries(item.components).map(([key, value]) => `${componentLabel(key)} ${value}`).join(" · ") : "";
  why.textContent = [(item.reasons || []).join(" · "), components].filter(Boolean).join(" — ");
  const whyButton = card.querySelector(".why-button");
  whyButton.textContent = t("Miksi tämä?", "Why this?");
  whyButton.addEventListener("click", () => {
    why.hidden = !why.hidden; whyButton.setAttribute("aria-expanded", String(!why.hidden));
    whyButton.textContent = why.hidden ? t("Miksi tämä?", "Why this?") : t("Piilota peruste", "Hide reason");
  });
  const link = card.querySelector(".original-link"); const canonicalUrl = safeExternalUrl(item.canonicalUrl);
  if (canonicalUrl) { link.href = canonicalUrl; link.textContent = t("Avaa alkuperäinen", "Open original"); }
  else link.hidden = true;
  return fragment;
}

function renderMedia(host, item) {
  const media = item.media || [];
  const youtubeVideoId = item.sourceType === "youtube" ? parseYouTubeId(item.canonicalUrl) : null;
  if (youtubeVideoId) {
    const preview = document.createElement("button"); preview.type = "button"; preview.className = "video-preview"; preview.setAttribute("aria-label", t("Toista YouTube-video tässä feedissä", "Play YouTube video in this feed"));
    const thumbnail = media[0]?.thumbnailUrl;
    if (thumbnail) preview.style.backgroundImage = `url(${JSON.stringify(thumbnail)})`;
    const play = document.createElement("span"); play.className = "play-button"; play.textContent = "▶";
    const label = document.createElement("span"); label.className = "play-label"; label.textContent = t("Toista tässä", "Play here");
    preview.append(play, label); host.append(preview);
    preview.addEventListener("click", () => {
      const frame = document.createElement("iframe"); frame.className = "inline-video"; frame.title = item.text.split("\n")[0] || t("YouTube-video", "YouTube video");
      frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeVideoId)}?autoplay=1`;
      frame.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"; frame.allowFullscreen = true;
      preview.replaceWith(frame);
    });
    return;
  }

  const visualMedia = media.filter(entry => ["image", "video", "gifv", "audio"].includes(entry.type));
  const links = media.filter(entry => entry.type === "link");
  const quotes = media.filter(entry => entry.type === "quote");
  if (visualMedia.length) {
    const grid = document.createElement("div"); grid.className = `media-grid count-${Math.min(visualMedia.length, 4)}`;
    for (const entry of visualMedia.slice(0, 4)) {
      if (entry.type === "image") grid.append(imageButton(entry));
      else if (entry.type === "audio") {
        const audio = document.createElement("audio"); audio.controls = true; audio.preload = "none"; audio.src = entry.url; audio.setAttribute("aria-label", entry.alt || t("Äänitiedosto", "Audio")); grid.append(audio);
      } else {
        const video = document.createElement("video"); video.controls = true; video.playsInline = true; video.preload = "metadata";
        if (entry.thumbnailUrl) video.poster = entry.thumbnailUrl;
        if (entry.url) video.src = entry.url;
        video.setAttribute("aria-label", entry.alt || "Video"); grid.append(video);
      }
    }
    host.append(grid);
  }
  for (const entry of quotes.slice(0, 1)) host.append(quotePreview(entry));
  for (const entry of links.slice(0, 1)) host.append(externalPreview(entry));
}

function imageButton(entry) {
  const button = document.createElement("button"); button.type = "button"; button.className = "media-image"; button.setAttribute("aria-label", entry.alt ? `${t("Avaa kuva", "Open image")}: ${entry.alt}` : t("Avaa kuva", "Open image"));
  const image = document.createElement("img"); image.src = entry.thumbnailUrl || entry.url; image.alt = entry.alt || ""; image.loading = "lazy"; button.append(image);
  button.addEventListener("click", () => openImage(entry.url || entry.thumbnailUrl, entry.alt || ""));
  return button;
}

function externalPreview(entry) {
  const safeUrl = safeExternalUrl(entry.url); const link = document.createElement(safeUrl ? "a" : "div"); link.className = "external-preview";
  if (safeUrl) { link.href = safeUrl; link.target = "_blank"; link.rel = "noreferrer"; }
  if (entry.thumbnailUrl) { const image = document.createElement("img"); image.src = entry.thumbnailUrl; image.alt = ""; image.loading = "lazy"; link.append(image); }
  const copy = document.createElement("span");
  const title = document.createElement("strong"); title.textContent = entry.title || hostname(entry.url);
  const description = document.createElement("small"); description.textContent = entry.description || hostname(entry.url);
  copy.append(title, description); const arrow = document.createElement("i"); arrow.textContent = "↗"; link.append(copy, arrow); return link;
}

function quotePreview(entry) {
  const safeUrl = safeExternalUrl(entry.url); const link = document.createElement(safeUrl ? "a" : "div"); link.className = "quote-preview";
  if (safeUrl) { link.href = safeUrl; link.target = "_blank"; link.rel = "noreferrer"; }
  const header = document.createElement("span"); const name = document.createElement("strong"); name.textContent = entry.title || "Bluesky";
  const handle = document.createElement("small"); handle.textContent = entry.handle || t("lainattu julkaisu", "quoted post"); header.append(name, handle);
  const text = document.createElement("p"); text.textContent = entry.description || ""; link.append(header, text); return link;
}

function openImage(url, caption) {
  elements.mediaDialogImage.src = url; elements.mediaDialogImage.alt = caption;
  elements.mediaDialogCaption.textContent = caption; elements.mediaDialogCaption.hidden = !caption;
  elements.mediaDialog.showModal();
}

function renderSkeletons() {
  elements.resultCount.textContent = t("Haetaan ja järjestetään…", "Finding and ranking…"); elements.feedList.replaceChildren();
  for (let index = 0; index < 3; index++) {
    const skeleton = document.createElement("div"); skeleton.className = "feed-card skeleton";
    for (const width of ["44%", "92%", index === 1 ? "70%" : "82%"] ) { const line = document.createElement("span"); line.style.width = width; skeleton.append(line); }
    elements.feedList.append(skeleton);
  }
}

function renderContinuation() {
  const hasFeed = state.items.length > 0;
  elements.continuation.hidden = !hasFeed;
  if (!hasFeed) return;
  const buffered = Boolean(state.runId && state.pagination?.hasMore);
  elements.loadMore.dataset.mode = buffered ? "buffer" : "search";
  elements.loadMore.querySelector(".load-more-label").textContent = buffered ? t("Lataa lisää", "Load more") : state.runId ? t("Laajenna hakua", "Expand search") : t("Hae lisää", "Find more");
  elements.loadMore.querySelector("[aria-hidden]").textContent = buffered ? "↓" : "✦";
  elements.continuationNote.textContent = !state.runId
    ? t("Palautettu feedi tarvitsee uuden rajatun haun ennen jatkamista. Jo näytetyt julkaisut ohitetaan.", "A restored feed needs a new scoped search to continue. Posts already shown will be skipped.")
    : buffered
    ? t("Seuraava erä on jo järjestetty — ei uutta mallikutsua.", "The next batch is already ranked — no new model call.")
    : t("Nykyinen puskuri loppui. Uusi rajattu haku käyttää kuraattoria vain hakusuunnan tarkentamiseen.", "The current buffer is empty. A scoped search uses the curator only to refine retrieval.");
  elements.loadMore.disabled = state.loadingMore || state.loading;
}

async function loadMore() {
  if (state.loadingMore || state.loading) return;
  if (!state.runId || !state.pagination?.hasMore) {
    const shownIds = state.items.map(item => item.id);
    const continuationIntent = `${intentWithoutContinuation(state.lastIntent)}\n${t("Jatkohaku: laajenna hakutermejä hieman, säilytä sama intentio ja vältä jo nähtyä sisältöä.", "Continue search: broaden the retrieval terms slightly, preserve the same intention, and avoid content already shown.")}`;
    return requestFeed(continuationIntent, {
      scroll: false, kind: "continuation", label: t("Jatkohaku: uusia tuloksia", "Expanded search: new results"), append: true, excludeIds: shownIds
    });
  }
  state.loadingMore = true; renderContinuation();
  elements.loadMore.querySelector(".load-more-label").textContent = t("Ladataan…", "Loading…");
  try {
    const result = await api("/api/feed/more", { method: "POST", body: JSON.stringify({ runId: state.runId, offset: state.pagination.nextOffset }) });
    const existingIds = new Set(state.items.map(item => item.id));
    const additions = (result.items || []).filter(item => !existingIds.has(item.id));
    state.items.push(...additions); state.pagination = result.pagination || null;
    for (const item of additions) elements.feedList.append(createFeedCard(item));
    elements.resultCount.textContent = `${state.items.length} ${t("valintaa", "selections")}`;
    const active = state.history.find(entry => entry.id === state.activeHistoryId);
    if (active) { active.items = clone(state.items); active.pagination = clone(state.pagination); }
    persistWorkspace();
  } catch (error) { showNotice(error.message, "error"); }
  finally { state.loadingMore = false; renderContinuation(); }
}

function pushHistory({ label, kind, intent, program, items, runId, pagination }) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, label: cleanHistoryLabel(label), kind, intent,
    program: clone(program), items: clone(items), runId, pagination: clone(pagination), createdAt: new Date()
  };
  state.history.push(entry); if (state.history.length > 12) state.history.shift();
  state.activeHistoryId = entry.id; renderHistory(); persistWorkspace();
}

function renderHistory() {
  elements.historyPanel.hidden = state.history.length === 0; elements.historyList.replaceChildren();
  state.history.forEach((entry, index) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "history-item";
    if (entry.id === state.activeHistoryId) { button.classList.add("is-active"); button.setAttribute("aria-current", "step"); }
    const step = document.createElement("span"); step.textContent = String(index + 1);
    const copy = document.createElement("span"); const label = document.createElement("strong"); label.textContent = entry.label;
    const detail = document.createElement("small"); detail.textContent = historyKind(entry.kind);
    copy.append(label, detail); button.append(step, copy); button.title = `${t("Palauta", "Restore")}: ${entry.label}`;
    button.addEventListener("click", () => restoreHistory(entry.id)); elements.historyList.append(button);
  });
  const activeIndex = state.history.findIndex(entry => entry.id === state.activeHistoryId);
  elements.undoChange.disabled = !state.runId || activeIndex <= 0;
  updateControlAvailability();
}

function updateControlAvailability() {
  const unavailable = !state.runId || state.loading;
  elements.controlDeck.classList.toggle("is-readonly", !state.runId);
  elements.algorithmControls.querySelectorAll("input").forEach(input => { input.disabled = unavailable; });
  document.querySelectorAll("[data-preset]").forEach(button => { button.disabled = unavailable; });
  elements.resetControls.disabled = unavailable;
  const activeIndex = state.history.findIndex(entry => entry.id === state.activeHistoryId);
  elements.undoChange.disabled = unavailable || activeIndex <= 0;
}

function restoreHistory(id) {
  const entry = state.history.find(item => item.id === id); if (!entry || state.loading) return;
  state.activeHistoryId = entry.id; state.lastIntent = entry.intent; state.program = clone(entry.program); state.items = clone(entry.items); state.runId = entry.runId; state.pagination = clone(entry.pagination);
  elements.intentInput.value = baseIntent(entry.intent); renderProgram(state.program); renderFeed(state.items); renderHistory();
  elements.feedShell.hidden = false; document.body.classList.add("has-feed");
  renderCurrentFeed(); persistWorkspace();
  showNotice(`${t("Palautettu", "Restored")}: ${entry.label}`, "question");
}

async function rerank(label) {
  if (!state.program || state.loading) return;
  if (!state.runId) return showNotice(t("Päivitä palautettu feedi ennen järjestyksen muuttamista.", "Update the restored feed before changing its ranking."), "question");
  const controls = controlsPayload();
  setLoading(true); showNotice("", "");
  try {
    const result = await api("/api/rerank", { method: "POST", body: JSON.stringify({ runId: state.runId, ...controls }) });
    state.program = result.program; state.items = result.items || []; state.runId = result.runId || state.runId; state.pagination = result.pagination || null;
    renderProgram(state.program); renderFeed(state.items);
    pushHistory({ label, kind: "algorithm", intent: state.lastIntent, program: state.program, items: state.items, runId: state.runId, pagination: state.pagination });
    renderCurrentFeed();
  } catch (error) { showNotice(error.message, "error"); }
  finally { setLoading(false); }
}

function controlsPayload() {
  const values = readControls();
  return {
    weights: { relevance: values.relevance, freshness: values.freshness, engagement: values.engagement },
    familiarity_target: values.familiarity_target, max_per_author: values.max_per_author
  };
}

function readControls() {
  const data = new FormData(elements.algorithmControls); const values = {};
  for (const key of Object.keys(DEFAULT_CONTROLS)) values[key] = Number(data.get(key));
  return values;
}

function setControls(values) {
  for (const [name, fallback] of Object.entries(DEFAULT_CONTROLS)) {
    const input = elements.algorithmControls.elements[name]; const value = Number.isFinite(Number(values[name])) ? Number(values[name]) : fallback;
    input.value = value; updateControlOutput(input);
  }
  updateControlSummary(); renderPresetState();
}

function updateControlOutput(input) {
  const value = Number(input.value); const output = input.closest("label").querySelector("output");
  output.value = input.name === "familiarity_target" ? `${value < 45 ? t("löydöt", "discovery") : value > 75 ? t("tutut", "familiar") : t("sekoitus", "mix")} ${value}` : value;
}

function updateControlSummary() {
  const values = readControls();
  const social = values.familiarity_target > 78 ? t("Enimmäkseen omien ihmisten ääniä", "Mostly voices from your people") : values.familiarity_target < 38 ? t("Rohkeasti uusia tekijöitä", "Boldly discovering new voices") : t("Tasapainoinen kattaus omista ihmisistä ja uusista löydöistä", "A balanced mix of your people and new discoveries");
  const priority = values.freshness > 55 ? t(", tuoreus edellä", ", prioritizing freshness") : values.relevance > 65 ? t(", tarkka osuvuus edellä", ", prioritizing precise relevance") : "";
  elements.controlSummary.textContent = `${social}${priority}.`;
}

function renderPresetState() {
  const values = readControls();
  document.querySelectorAll("[data-preset]").forEach(button => {
    const preset = PRESETS[button.dataset.preset];
    button.classList.toggle("is-active", Object.keys(DEFAULT_CONTROLS).every(key => Number(preset[key]) === Number(values[key])));
  });
}

function setLoading(value) {
  state.loading = value;
  elements.listenButton.querySelector(".button-label").textContent = value ? t("Rakennetaan…", "Building…") : t("Päivitä feedi", "Update feed");
  elements.feedList.classList.toggle("is-loading", value);
  elements.feedList.setAttribute("aria-busy", String(value));
  updateControlAvailability();
  renderStatus(); renderContinuation();
}

async function resetSession() {
  if (state.loading) return;
  await api("/api/feed", { method: "DELETE" }).catch(() => null);
  state.program = null; state.items = []; state.runId = null; state.lastIntent = ""; state.pagination = null; state.history = []; state.activeHistoryId = null;
  elements.feedShell.hidden = true; document.body.classList.remove("has-feed"); elements.intentInput.value = ""; elements.refineInput.value = "";
  setControls(DEFAULT_CONTROLS); renderHistory(); showNotice(t("Istunnon feedi ja korjaushistoria nollattiin.", "The session feed and change history were cleared."), "question");
  renderCurrentFeed(); persistWorkspace();
  window.scrollTo({ top: 0, behavior: "smooth" }); elements.intentInput.focus();
}

function showNotice(message, type) { elements.notice.textContent = message; elements.notice.className = `notice ${type || ""}`; elements.notice.hidden = !message; }
function setInlineStatus(element, message, kind = "") { element.textContent = message; element.classList.toggle("success", kind === "success"); element.classList.toggle("error", kind === "error"); }
function setFormBusy(form, busy) { form.setAttribute("aria-busy", String(busy)); form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach(control => { control.disabled = busy; }); }
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function uniqueItems(items) { return [...new Map(items.map(item => [item.id, item])).values()]; }
function initials(name = "") { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?"; }
function compactNumber(value) { return Intl.NumberFormat(locale === "fi" ? "fi-FI" : "en-US", { notation: value > 999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value); }
function relativeTime(date) { const hours = Math.max(0, Math.round((Date.now() - new Date(date)) / 3_600_000)); return hours < 1 ? t("juuri nyt", "just now") : hours === 1 ? t("tunti sitten", "an hour ago") : hours < 24 ? `${hours} ${t("tuntia sitten", "hours ago")}` : `${Math.round(hours / 24)} ${t("pv sitten", "days ago")}`; }
function componentLabel(key) { return ({ relevance: t("osuvuus", "relevance"), tone: t("sävy", "tone"), freshness: t("tuoreus", "freshness"), familiarity: t("tuttu/löytö", "familiar/discovery"), engagement: t("suosio", "popularity") })[key] || key; }
function languageLabel(code) { return ({ fi: "FI", en: "EN", sv: "SV", fr: "FR", de: "DE", es: "ES" })[String(code || "").toLowerCase().split("-")[0]] || ""; }
function hostname(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return t("Ulkoinen linkki", "External link"); } }
function safeExternalUrl(value) { try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; } catch { return null; } }
function intentWithoutContinuation(intent) { return String(intent || "").split(/\n(?:Jatkohaku|Continue search):/)[0]; }
function baseIntent(intent) { return intentWithoutContinuation(intent).split(/\n(?:Tarkennus|Refinement):/)[0]; }
function cleanHistoryLabel(value) { const clean = String(value || t("Uusi feedi", "New feed")).replace(/\s+/g, " ").trim(); return clean.length > 52 ? `${clean.slice(0, 49)}…` : clean; }
function historyKind(kind) { return ({ intent: t("uusi intentio", "new intention"), refinement: t("kielellinen korjaus", "natural-language refinement"), algorithm: t("algoritmin säätö", "ranking adjustment"), continuation: t("laajennettu jatkohaku", "expanded search") })[kind] || t("feediversio", "feed version"); }
function controlLabel(name, value) { return ({ relevance: `${t("Osuvuus", "Relevance")} ${value}`, freshness: `${t("Tuoreus", "Freshness")} ${value}`, familiarity_target: `${t("Tutut ↔ löydöt", "Familiar ↔ discovery")} ${value}`, engagement: `${t("Suosio", "Popularity")} ${value}`, max_per_author: `${value} / ${t("tekijä", "author")}` })[name] || t("Algoritmia säädetty", "Ranking adjusted"); }
function parseYouTubeId(value) { try { const url = new URL(value); if (url.hostname === "youtu.be") return url.pathname.split("/")[1] || null; if (url.hostname.endsWith("youtube.com")) return url.searchParams.get("v") || url.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/)?.[1] || null; } catch {} return null; }

function sameProgram(left, right) {
  if (!left || !right) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

function persistWorkspace() {
  try {
    const history = state.history.slice(-10).map(entry => ({ ...entry, items: (entry.items || []).slice(0, MAX_PERSISTED_ITEMS) }));
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({
      version: 1, lastIntent: state.lastIntent, program: state.program,
      items: state.items.slice(0, MAX_PERSISTED_ITEMS), pagination: state.pagination,
      history, activeHistoryId: state.activeHistoryId, savedFeeds: state.savedFeeds,
      profileContext: state.profileContext, locationContext: state.locationContext, updatedAt: new Date().toISOString()
    }));
  } catch (error) {
    console.warn("Feedin paikallinen tallennus epäonnistui", error);
  }
}

function restoreWorkspace() {
  try {
    if (!localStorage.getItem(WORKSPACE_STORAGE_KEY) && localStorage.getItem(LEGACY_WORKSPACE_STORAGE_KEY)) {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, localStorage.getItem(LEGACY_WORKSPACE_STORAGE_KEY));
    }
    const saved = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) || "null");
    if (!saved || saved.version !== 1) return;
    state.savedFeeds = Array.isArray(saved.savedFeeds) ? saved.savedFeeds.slice(0, 24) : [];
    state.profileContext = String(saved.profileContext || "").slice(0, 1500);
    state.locationContext = String(saved.locationContext || "").slice(0, 500);
    elements.profileContext.value = state.profileContext;
    if (!saved.lastIntent || !saved.program || !Array.isArray(saved.items)) return renderSavedFeeds();
    state.lastIntent = saved.lastIntent; state.program = saved.program; state.items = saved.items;
    state.pagination = saved.pagination || null; state.history = Array.isArray(saved.history) ? saved.history.map(entry => ({ ...entry, runId: null })) : [];
    state.activeHistoryId = saved.activeHistoryId || state.history.at(-1)?.id || null; state.runId = null;
    elements.intentInput.value = baseIntent(state.lastIntent); renderProgram(state.program); renderFeed(state.items); renderHistory(); renderCurrentFeed();
    elements.feedShell.hidden = false; document.body.classList.add("has-feed");
    showNotice(t("Viimeisin feedisi palautettiin tältä laitteelta. Päivitä se hakeaksesi uusimmat julkaisut.", "Your latest feed was restored from this device. Update it to fetch the newest posts."), "question");
    renderSavedFeeds();
  } catch (error) {
    console.warn("Tallennetun feedin palautus epäonnistui", error);
  }
}

function saveCurrentFeed() {
  const intent = baseIntent(state.lastIntent);
  if (!intent || !state.program) return;
  const existing = state.savedFeeds.find(feed => feed.intent === intent && sameProgram(feed.program, state.program));
  if (existing) {
    state.savedFeeds = [existing, ...state.savedFeeds.filter(feed => feed.id !== existing.id)];
  } else {
    state.savedFeeds.unshift({ id: crypto.randomUUID(), name: cleanHistoryLabel(intent), intent, program: clone(state.program), createdAt: new Date().toISOString() });
    state.savedFeeds = state.savedFeeds.slice(0, 24);
  }
  renderSavedFeeds(); renderCurrentFeed(); persistWorkspace();
  showNotice(t("Feedi tallennettiin tälle laitteelle.", "Feed saved on this device."), "question");
}

function renderSavedFeeds() {
  elements.savedFeedList.replaceChildren(); elements.savedEmpty.hidden = state.savedFeeds.length > 0;
  for (const feed of state.savedFeeds) {
    const row = document.createElement("div"); row.className = "saved-feed-row";
    const open = document.createElement("button"); open.type = "button"; open.className = "saved-feed-open";
    const copy = document.createElement("span"); const title = document.createElement("strong"); title.textContent = feed.name;
    const detail = document.createElement("small"); detail.textContent = `${(feed.program.languages || []).join(", ").toUpperCase() || t("Kaikki kielet", "All languages")} · ${t("hae uusimmat", "fetch latest")}`;
    copy.append(title, detail); const arrow = document.createElement("span"); arrow.textContent = "→"; open.append(copy, arrow);
    open.addEventListener("click", () => {
      elements.savedDialog.close(); setControls({
        relevance: feed.program.weights?.relevance, freshness: feed.program.weights?.freshness,
        familiarity_target: feed.program.familiarity_target, engagement: feed.program.weights?.engagement,
        max_per_author: feed.program.diversity?.max_per_author
      });
      elements.intentInput.value = feed.intent; requestFeed(feed.intent, { kind: "intent", label: feed.name });
    });
    const actions = document.createElement("span"); actions.className = "saved-feed-row-actions";
    const exportButton = document.createElement("button"); exportButton.type = "button"; exportButton.className = "saved-feed-export"; exportButton.textContent = t("Vie", "Export");
    exportButton.setAttribute("aria-label", `${t("Vie intentiolasi", "Export intent lens")} ${feed.name}`);
    exportButton.addEventListener("click", () => exportIntentLens(feed));
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "saved-feed-remove"; remove.textContent = t("Poista", "Remove");
    remove.setAttribute("aria-label", `${t("Poista tallennettu feedi", "Remove saved feed")} ${feed.name}`);
    remove.addEventListener("click", () => { state.savedFeeds = state.savedFeeds.filter(item => item.id !== feed.id); renderSavedFeeds(); renderCurrentFeed(); persistWorkspace(); });
    actions.append(exportButton, remove); row.append(open, actions); elements.savedFeedList.append(row);
  }
}

function exportIntentLens(feed) {
  const document = {
    schema: "https://outention.com/schemas/intent-lens-v1.json",
    version: 1,
    name: String(feed.name || cleanHistoryLabel(feed.intent)).slice(0, 80),
    intent: String(feed.intent || "").slice(0, 2000),
    program: clone(feed.program),
    exportedAt: new Date().toISOString()
  };
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(document, null, 2)}\n`], { type: "application/json" }));
  const link = documentElement("a", { href: url, download: `${lensFilename(document.name)}.outention-lens.json` });
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  showNotice(t("Intentiolasi vietiin ilman lähdetunnuksia tai julkaisuja.", "Intent lens exported without source credentials or posts."), "question");
}

async function importIntentLens(file) {
  if (!file || file.size > 100_000) throw new Error(t("Intentiolasitiedosto on liian suuri.", "The intent lens file is too large."));
  const parsed = JSON.parse(await file.text());
  if (parsed?.version !== 1 || typeof parsed.intent !== "string" || !parsed.intent.trim() || parsed.intent.length > 2000 || !parsed.program || typeof parsed.program !== "object") {
    throw new Error(t("Tiedosto ei ole kelvollinen Outention-intentiolasi.", "This is not a valid Outention intent lens."));
  }
  if (JSON.stringify(parsed.program).length > 40_000) throw new Error(t("Intentiolasitiedosto on liian suuri.", "The intent lens file is too large."));
  const feed = {
    id: crypto.randomUUID(),
    name: String(parsed.name || cleanHistoryLabel(parsed.intent)).replace(/[\u0000-\u001F]/g, "").trim().slice(0, 80),
    intent: parsed.intent.trim(), program: clone(parsed.program), createdAt: new Date().toISOString()
  };
  state.savedFeeds = [feed, ...state.savedFeeds.filter(item => !(item.intent === feed.intent && sameProgram(item.program, feed.program)))].slice(0, 24);
  renderSavedFeeds(); persistWorkspace();
  showNotice(t("Intentiolasi tuotiin. Se ei muuttanut lähdeyhteyksiäsi.", "Intent lens imported. It did not change your source connections."), "question");
}

function lensFilename(value) {
  const clean = String(value || "outention-lens").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return clean.slice(0, 60) || "outention-lens";
}

function documentElement(tag, attributes) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

function renderProfileLocation(location = state.status?.locationews) {
  const placeName = location?.name || location?.placeName;
  elements.profileLocation.hidden = !placeName;
  elements.profileLocation.textContent = placeName ? `${t("Paikalliskonteksti", "Local context")}: ${placeName}` : "";
}

async function syncContext() {
  try {
    if (state.locationContext) {
      await api("/api/connect/locationews", { method: "POST", body: JSON.stringify({ context: state.locationContext }) });
    } else {
      await api("/api/profile/context", { method: "POST", body: JSON.stringify({ context: state.profileContext }) });
    }
    await loadStatus(); renderProfileLocation();
  } catch (error) {
    console.warn("Paikalliskontekstin palautus epäonnistui", error);
  }
}

async function saveProfile() {
  state.profileContext = elements.profileContext.value.trim().slice(0, 1500);
  persistWorkspace(); setInlineStatus(elements.profileStatus, t("Tallennetaan…", "Saving…")); setFormBusy(elements.profileForm, true);
  try {
    const data = await api("/api/profile/context", { method: "POST", body: JSON.stringify({ context: state.profileContext, keepLocation: Boolean(state.locationContext) }) });
    elements.profileDialog.close();
    await loadStatus(); renderProfileLocation(state.locationContext ? state.status?.locationews : data.location);
    showNotice(state.profileContext ? t("Oma konteksti tallennettiin tälle laitteelle.", "Your context was saved on this device.") : t("Oma konteksti tyhjennettiin.", "Your context was cleared."), "question");
  } catch (error) { setInlineStatus(elements.profileStatus, error.message, "error"); }
  finally { setFormBusy(elements.profileForm, false); }
}

async function publishPost() {
  const text = elements.publisherText.value.trim();
  const destinations = [...elements.publisherForm.querySelectorAll('input[name="destination"]:checked')].map(input => input.value);
  if (!text || !destinations.length) return;
  elements.publisherSubmit.disabled = true; setInlineStatus(elements.publisherStatus, t("Julkaistaan…", "Posting…"));
  try {
    const response = await api("/api/publish", { method: "POST", body: JSON.stringify({ text, destinations, visibility: "public" }) });
    const succeeded = response.results.filter(result => result.ok); const failed = response.results.filter(result => !result.ok);
    if (succeeded.length && !failed.length) {
      elements.publisherForm.reset(); elements.publisherCount.textContent = t("0 merkkiä", "0 characters"); elements.publisherDialog.close();
      showNotice(`${t("Julkaistu", "Posted")}: ${succeeded.map(item => item.destination).join(", ")}.`, "question");
      return;
    }
    const failedIds = new Set(failed.map(item => item.destination));
    elements.publisherDestinations.querySelectorAll('input[name="destination"]').forEach(input => { input.checked = failedIds.has(input.value); });
    setInlineStatus(elements.publisherStatus, succeeded.length
      ? `${t("Julkaistu", "Posted")}: ${succeeded.map(item => item.destination).join(", ")}. ${t("Yritä uudelleen vain näihin", "Retry only these")}: ${failed.map(item => `${item.destination} (${item.error})`).join(", ")}.`
      : failed.map(item => `${item.destination}: ${item.error}`).join(" "), "error");
  } catch (error) { setInlineStatus(elements.publisherStatus, error.message, "error"); }
  finally { elements.publisherSubmit.disabled = ![...elements.publisherDestinations.querySelectorAll('input[name="destination"]')].some(input => input.checked && !input.disabled); }
}

elements.connectForm.addEventListener("submit", async event => {
  event.preventDefault(); const data = new FormData(elements.connectForm); setInlineStatus(elements.connectStatus, t("Yhdistetään…", "Connecting…")); setFormBusy(elements.connectForm, true);
  try {
    await api("/api/connect/bluesky", { method: "POST", body: JSON.stringify({ identifier: data.get("identifier"), password: data.get("password") }) });
    elements.connectForm.reset(); elements.connectStatus.textContent = ""; await loadStatus(); elements.intentInput.focus();
  } catch (error) { setInlineStatus(elements.connectStatus, error.message, "error"); }
  finally { setFormBusy(elements.connectForm, false); }
});

elements.helpButton.addEventListener("click", () => openOnboarding(0));
elements.onboardingBack.addEventListener("click", () => showOnboardingStep(state.onboardingStep - 1));
elements.onboardingNext.addEventListener("click", () => {
  if (state.onboardingStep === 1 && !state.status?.curator?.configured) return openOnboardingSetup(elements.accountDialog, 1);
  if (state.onboardingStep < 3) return showOnboardingStep(state.onboardingStep + 1);
  if (!elements.onboardingIntentInput.value.trim()) {
    elements.onboardingIntentInput.value = t(
      "Mitkä tärkeät keskustelut ja tapahtumat ovat käynnissä tänään? Eri näkökulmia ja alkuperäisiä julkaisuja, ei klikkiotsikoita.",
      "What important conversations and events are happening today? Different perspectives and original posts, no clickbait."
    );
  }
  completeOnboarding({ runFeed: true });
});
elements.onboardingSkip.addEventListener("click", () => {
  if (state.onboardingStep === 3) return showOnboardingStep(4);
  completeOnboarding();
});
elements.onboardingDialog.querySelector("[data-close-onboarding]").addEventListener("click", () => elements.onboardingDialog.close());
elements.onboardingDialog.addEventListener("click", event => { if (event.target === elements.onboardingDialog) elements.onboardingDialog.close(); });
elements.onboardingDialog.querySelector("[data-onboarding-model]").addEventListener("click", () => openOnboardingSetup(elements.accountDialog, 1));
elements.onboardingDialog.querySelector("[data-onboarding-sources]").addEventListener("click", () => openOnboardingSetup(elements.dialog, 2));
elements.onboardingDialog.querySelectorAll("[data-onboarding-intent]").forEach(button => button.addEventListener("click", () => {
  elements.onboardingIntentInput.value = button.dataset.onboardingIntent;
  elements.onboardingIntentInput.focus();
}));
elements.onboardingDialog.querySelectorAll("[data-mobile-route]").forEach(button => button.addEventListener("click", () => {
  const route = button.dataset.mobileRoute;
  elements.onboardingDialog.querySelectorAll("[data-mobile-route]").forEach(option => {
    const active = option === button; option.classList.toggle("is-active", active); option.setAttribute("aria-selected", String(active));
  });
  elements.onboardingDialog.querySelectorAll("[data-mobile-panel]").forEach(panel => { panel.hidden = panel.dataset.mobilePanel !== route; });
}));
elements.onboardingDialog.querySelector("[data-copy-tailscale]").addEventListener("click", async event => {
  try {
    await navigator.clipboard.writeText(elements.tailscaleCommand.textContent);
    event.currentTarget.textContent = t("Kopioitu", "Copied"); elements.mobileCopyStatus.textContent = t("Komento kopioitiin leikepöydälle.", "Command copied to the clipboard.");
  } catch {
    elements.mobileCopyStatus.textContent = t("Valitse ja kopioi komento käsin.", "Select and copy the command manually.");
  }
});
elements.onboardingDialog.querySelector("[data-open-mobile-url]").addEventListener("click", () => {
  try {
    const url = new URL(elements.mobileTailnetUrl.value.trim());
    if (url.protocol !== "https:" || !url.hostname.endsWith(".ts.net")) throw new Error();
    window.open(url.toString(), "_blank", "noopener,noreferrer");
    elements.mobileCopyStatus.textContent = t("Jos Outention avautui, yhteys toimii. Lisää se seuraavaksi puhelimen Koti-valikkoon.", "If Outention opened, the connection works. Next, add it to your phone's Home Screen.");
  } catch {
    elements.mobileCopyStatus.textContent = t("Anna Tailscale Serven tulostama https://…ts.net-osoite.", "Enter the https://…ts.net address printed by Tailscale Serve.");
  }
});

elements.intentForm.addEventListener("submit", event => {
  event.preventDefault(); const intent = elements.intentInput.value.trim(); if (intent) requestFeed(intent, { kind: "intent", label: intent });
});
elements.intentInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); elements.intentForm.requestSubmit(); }
});

elements.refineForm.addEventListener("submit", async event => {
  event.preventDefault(); const refinement = elements.refineInput.value.trim(); if (!refinement || !state.lastIntent) return;
  const intent = `${intentWithoutContinuation(state.lastIntent)}\n${t("Tarkennus", "Refinement")}: ${refinement}`;
  const succeeded = await requestFeed(intent, { scroll: false, kind: "refinement", label: `${t("Tarkennus", "Refinement")}: ${refinement}` });
  if (succeeded) elements.refineInput.value = "";
});

document.querySelectorAll("[data-intent]").forEach(button => button.addEventListener("click", () => {
  elements.intentInput.value = button.dataset.intent; requestFeed(button.dataset.intent, { kind: "intent", label: button.textContent.trim() });
}));

elements.algorithmControls.addEventListener("input", event => {
  if (event.target.type !== "range") return; updateControlOutput(event.target); updateControlSummary(); renderPresetState();
});
elements.algorithmControls.addEventListener("change", event => {
  if (event.target.type !== "range") return; rerank(controlLabel(event.target.name, event.target.value));
});

document.querySelectorAll("[data-preset]").forEach(button => button.addEventListener("click", () => {
  setControls(PRESETS[button.dataset.preset]); rerank(`${t("Painotus", "Emphasis")}: ${button.textContent.trim()}`);
}));
elements.resetControls.addEventListener("click", () => { setControls(DEFAULT_CONTROLS); rerank(t("Algoritmin oletukset", "Ranking defaults")); });
elements.resetSession.addEventListener("click", resetSession);
elements.saveFeed.addEventListener("click", saveCurrentFeed);
elements.importLens.addEventListener("click", () => elements.importLensFile.click());
elements.importLensFile.addEventListener("change", async () => {
  try { await importIntentLens(elements.importLensFile.files?.[0]); }
  catch (error) { showNotice(error instanceof SyntaxError ? t("Intentiolasitiedosto ei ole kelvollista JSON-muotoa.", "The intent lens file is not valid JSON.") : error.message, "error"); }
  finally { elements.importLensFile.value = ""; }
});
elements.loadMore.addEventListener("click", loadMore);
elements.undoChange.addEventListener("click", () => {
  const activeIndex = state.history.findIndex(entry => entry.id === state.activeHistoryId); if (activeIndex > 0) restoreHistory(state.history[activeIndex - 1].id);
});

elements.toggleControls.addEventListener("click", () => {
  const expanded = elements.toggleControls.getAttribute("aria-expanded") === "true";
  elements.toggleControls.setAttribute("aria-expanded", String(!expanded)); elements.toggleControls.textContent = expanded ? "+" : "−";
  elements.toggleControls.setAttribute("aria-label", expanded ? t("Avaa feediohjain", "Open feed controls") : t("Pienennä feediohjain", "Collapse feed controls")); elements.controlBody.hidden = expanded;
  if (!expanded && !state.runId && state.program) showNotice(t("Päivitä palautettu feedi ennen järjestyksen muuttamista.", "Update the restored feed before changing its ranking."), "question");
});

document.querySelectorAll("[data-open-library]").forEach(button => button.addEventListener("click", () => elements.dialog.showModal()));
document.querySelectorAll("[data-open-saved]").forEach(button => button.addEventListener("click", () => { renderSavedFeeds(); elements.savedDialog.showModal(); }));
document.querySelector("[data-close-saved]").addEventListener("click", () => elements.savedDialog.close());
elements.savedDialog.addEventListener("click", event => { if (event.target === elements.savedDialog) elements.savedDialog.close(); });
document.querySelectorAll("[data-open-publisher]").forEach(button => button.addEventListener("click", () => {
  renderPublisherDestinations(); elements.publisherStatus.textContent = ""; elements.publisherDialog.showModal(); elements.publisherText.focus();
}));
document.querySelector("[data-close-publisher]").addEventListener("click", () => elements.publisherDialog.close());
elements.publisherDialog.addEventListener("click", event => { if (event.target === elements.publisherDialog) elements.publisherDialog.close(); });
elements.publisherText.addEventListener("input", () => { const count = [...elements.publisherText.value].length; elements.publisherCount.textContent = `${count} ${t("merkkiä", "characters")}`; });
elements.publisherForm.addEventListener("submit", event => { event.preventDefault(); publishPost(); });
document.querySelectorAll("[data-open-profile]").forEach(button => button.addEventListener("click", () => {
  elements.profileContext.value = state.profileContext; elements.profileStatus.textContent = ""; renderProfileLocation(); elements.profileDialog.showModal(); elements.profileContext.focus();
}));
document.querySelector("[data-close-profile]").addEventListener("click", () => elements.profileDialog.close());
elements.profileDialog.addEventListener("click", event => { if (event.target === elements.profileDialog) elements.profileDialog.close(); });
elements.profileForm.addEventListener("submit", event => { event.preventDefault(); saveProfile(); });
elements.clearProfile.addEventListener("click", () => { elements.profileContext.value = ""; saveProfile(); });
document.querySelectorAll("[data-open-account]").forEach(button => button.addEventListener("click", async () => {
  renderAccount(); elements.accountStatus.textContent = ""; elements.accountDialog.showModal();
  if (state.status?.accountFeatures?.personalMode) {
    if (elements.modelProvider.value === "local") await refreshLocalModels(false);
    (elements.modelProvider.value === "local" ? elements.modelName : elements.modelApiKey).focus();
  }
  else if (!state.status?.account) elements.accountForm.elements.email.focus();
}));
document.querySelector("[data-close-account]").addEventListener("click", () => elements.accountDialog.close());
elements.accountDialog.addEventListener("click", event => { if (event.target === elements.accountDialog) elements.accountDialog.close(); });
elements.accountForm.addEventListener("submit", event => { event.preventDefault(); authenticateAccount("login"); });
elements.accountRegister.addEventListener("click", () => authenticateAccount("register"));
elements.modelProvider.addEventListener("change", async () => {
  updateModelSuggestion(true);
  if (elements.modelProvider.value === "local") await refreshLocalModels(true);
});
elements.modelBaseUrl.addEventListener("change", async () => { if (elements.modelProvider.value === "local") await refreshLocalModels(false); });
elements.modelKeyForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!elements.modelKeyForm.reportValidity()) return;
  elements.modelKeyStatus.textContent = t("Testataan malliyhteyttä ja rakenteista vastausta…", "Testing the model connection and structured output…");
  elements.modelKeyForm.querySelectorAll("button,input,select").forEach(control => { control.disabled = true; });
  try {
    const result = await api("/api/account/model-key", { method: "POST", body: JSON.stringify({
      provider: elements.modelProvider.value, model: elements.modelName.value, apiKey: elements.modelApiKey.value,
      baseUrl: elements.modelBaseUrl.value, persist: elements.modelPersist.checked
    }) });
    state.status.accountFeatures.byok = result;
    state.status.curator = { configured: true, provider: result.provider, model: result.model, keySource: "user", verified: result.verified };
    elements.modelApiKey.value = "";
    elements.accountDialog.close(); renderStatus();
    showNotice(t("Malliyhteys testattiin ja tallennettiin.", "Model connection tested and saved."), "question");
  } catch (error) { setInlineStatus(elements.modelKeyStatus, error.message, "error"); }
  finally { elements.modelKeyForm.querySelectorAll("button,input,select").forEach(control => { control.disabled = false; }); elements.modelKeyRemove.disabled = !state.status?.accountFeatures?.byok?.configured; }
});
elements.modelKeyRemove.addEventListener("click", async () => {
  elements.modelKeyStatus.textContent = t("Poistetaan malliyhteyttä…", "Removing model connection…");
  try {
    const result = await api("/api/account/model-key", { method: "DELETE", body: "{}" });
    state.status.accountFeatures.byok = result;
    elements.modelApiKey.value = "";
    await loadStatus();
    elements.modelKeyStatus.textContent = t("Oma API-avain poistettiin.", "Your API key was removed.");
  } catch (error) { elements.modelKeyStatus.textContent = error.message; }
});
elements.accountPasswordForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!elements.accountPasswordForm.reportValidity()) return;
  const data = new FormData(elements.accountPasswordForm);
  elements.accountStatus.textContent = t("Vaihdetaan salasanaa…", "Changing password…");
  try {
    await api("/api/account/password", { method: "POST", body: JSON.stringify({ currentPassword: data.get("currentPassword"), newPassword: data.get("newPassword") }) });
    elements.accountPasswordForm.reset();
    elements.accountStatus.textContent = t("Salasana vaihdettiin. Muut istunnot kirjattiin ulos.", "Password changed. Other sessions were signed out.");
  } catch (error) { elements.accountStatus.textContent = error.message; }
});
elements.accountExport.addEventListener("click", async () => {
  elements.accountStatus.textContent = t("Kootaan tietojasi…", "Preparing your data…");
  try {
    const data = await api("/api/account/export");
    data.localWorkspace = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) || "null");
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `outention-export-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    elements.accountStatus.textContent = t("Tietosi ladattiin. Salaiset yhteysavaimet eivät kuulu vientiin.", "Your data was downloaded. Secret connection credentials are excluded.");
  } catch (error) { elements.accountStatus.textContent = error.message; }
});
elements.accountDeleteForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!elements.accountDeleteForm.reportValidity()) return;
  if (!window.confirm(t("Poistetaanko Outention-tilisi ja kaikki salatut yhteydet pysyvästi?", "Permanently delete your Outention account and all encrypted connections?"))) return;
  const data = new FormData(elements.accountDeleteForm);
  elements.accountStatus.textContent = t("Poistetaan tiliä…", "Deleting account…");
  try {
    await api("/api/account", { method: "DELETE", body: JSON.stringify({ password: data.get("password") }) });
    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    elements.accountDeleteForm.reset();
    await loadStatus();
    elements.accountStatus.textContent = t("Tili poistettiin.", "Account deleted.");
  } catch (error) { elements.accountStatus.textContent = error.message; }
});
elements.accountLogout.addEventListener("click", async () => {
  elements.accountStatus.textContent = t("Kirjaudutaan ulos…", "Signing out…");
  try {
    await api("/api/account/logout", { method: "POST", body: "{}" });
    await loadStatus(); elements.accountStatus.textContent = t("Olet kirjautunut ulos.", "You are signed out.");
  } catch (error) { elements.accountStatus.textContent = error.message; }
});
elements.dialog.querySelector(".dialog-close").addEventListener("click", () => elements.dialog.close());
elements.dialog.addEventListener("click", event => { if (event.target === elements.dialog) elements.dialog.close(); });
elements.dialog.addEventListener("close", resumeOnboardingAfterDialog);
elements.accountDialog.addEventListener("close", resumeOnboardingAfterDialog);
elements.mediaDialog.querySelector(".media-close").addEventListener("click", () => elements.mediaDialog.close());
elements.mediaDialog.addEventListener("click", event => { if (event.target === elements.mediaDialog) elements.mediaDialog.close(); });
elements.mastodonForm.addEventListener("submit", event => {
  event.preventDefault(); const instance = new FormData(elements.mastodonForm).get("instance").trim();
  window.location.href = `${BASE_PATH}/api/connect/mastodon/start?instance=${encodeURIComponent(instance)}`;
});
elements.rssForm.addEventListener("submit", async event => {
  event.preventDefault(); const data = new FormData(elements.rssForm); setInlineStatus(elements.libraryStatus, t("Tarkistetaan syötettä…", "Checking feed…")); setFormBusy(elements.rssForm, true);
  try {
    await api("/api/connect/rss", { method: "POST", body: JSON.stringify({ name: data.get("name"), url: data.get("url") }) });
    elements.rssForm.reset(); await loadStatus(); setInlineStatus(elements.libraryStatus, t("Syöte lisättiin ja on nyt mukana feedissä.", "Feed added and now included."), "success"); elements.rssForm.elements.url.focus();
  } catch (error) { setInlineStatus(elements.libraryStatus, error.message, "error"); }
  finally { setFormBusy(elements.rssForm, false); }
});
elements.opmlForm.addEventListener("submit", async event => {
  event.preventDefault();
  const file = elements.opmlForm.elements.opml.files[0];
  if (!file) return;
  if (file.size > 500_000) { setInlineStatus(elements.libraryStatus, t("OPML-tiedosto on liian suuri.", "The OPML file is too large."), "error"); return; }
  setInlineStatus(elements.libraryStatus, t("Tarkistetaan OPML-syötteitä…", "Checking OPML feeds…")); setFormBusy(elements.opmlForm, true);
  try {
    const result = await api("/api/connect/opml", { method: "POST", body: JSON.stringify({ opml: await file.text() }) });
    elements.opmlForm.reset(); await loadStatus();
    setInlineStatus(elements.libraryStatus, `${result.added} ${t("syötettä lisättiin", "feeds added")}${result.failed ? ` · ${result.failed} ${t("ohitettiin", "skipped")}` : ""}.`, result.added ? "success" : "error");
  } catch (error) { setInlineStatus(elements.libraryStatus, error.message, "error"); }
  finally { setFormBusy(elements.opmlForm, false); }
});
elements.locationewsForm.addEventListener("submit", async event => {
  event.preventDefault(); const context = new FormData(elements.locationewsForm).get("context").trim(); setInlineStatus(elements.libraryStatus, t("Tunnistetaan paikkakunta…", "Resolving location…")); setFormBusy(elements.locationewsForm, true);
  try {
    const data = await api("/api/connect/locationews", { method: "POST", body: JSON.stringify({ context }) });
    state.locationContext = context; persistWorkspace(); await loadStatus(); renderProfileLocation();
    setInlineStatus(elements.libraryStatus, data.placeName ? `${t("Locationewsin paikalliskonteksti on", "Locationews local context is")} ${data.placeName}.` : t("Locationewsin valtakunnallinen virta on käytössä.", "Locationews national feed is enabled."), "success");
  } catch (error) { setInlineStatus(elements.libraryStatus, error.message, "error"); }
  finally { setFormBusy(elements.locationewsForm, false); }
});

const continuationObserver = new IntersectionObserver(entries => {
  if (entries.some(entry => entry.isIntersecting) && state.runId && state.pagination?.hasMore && !state.loadingMore && !state.loading) loadMore();
}, { rootMargin: "500px 0px" });
continuationObserver.observe(elements.continuationSentinel);

setControls(DEFAULT_CONTROLS);
await loadStatus();
restoreWorkspace();
if (state.profileContext || state.locationContext) await syncContext();
if (new URLSearchParams(window.location.search).get("mastodon") === "connected") {
  showNotice(t("Mastodon yhdistetty. Oma Home-timelinesi on nyt mukana kuuntelussa.", "Mastodon connected. Your Home timeline is now included."), "question"); history.replaceState({}, "", `${BASE_PATH}/`);
}
if (new URLSearchParams(window.location.search).get("reddit") === "connected") {
  showNotice(t("Reddit yhdistetty. Oma Best/Home-listauksesi on nyt mukana kuuntelussa.", "Reddit connected. Your Best/Home feed is now included."), "question"); history.replaceState({}, "", `${BASE_PATH}/`);
}
if (new URLSearchParams(window.location.search).get("threads") === "connected") {
  showNotice(t("Threads yhdistetty. Julkinen Threads-haku on nyt mukana intentiohauissa.", "Threads connected. Public Threads search is now included in intention searches."), "question"); history.replaceState({}, "", `${BASE_PATH}/`);
}
if (!localStorage.getItem(ONBOARDING_STORAGE_KEY) && !elements.onboardingDialog.open) openOnboarding(0);

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register(`${BASE_PATH}/sw.js`).catch(() => {});
}
