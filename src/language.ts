const FINNISH_WORDS = new Set([
  "aivan", "eilen", "ei", "en", "että", "haluan", "ihan", "itse", "joka", "jotka", "jos", "juuri",
  "kaikki", "kun", "kyllä", "maailman", "me", "meidän", "mikä", "minä", "mitä", "miten", "mutta",
  "mun", "myös", "nämä", "nyt", "oli", "olisi", "olen", "ovat", "sain", "se", "sen", "siis", "sitä",
  "sitten", "taas", "tämä", "tässä", "tästä", "tuo", "tuon", "vaan", "vai", "vain", "vielä", "voi"
]);

const ENGLISH_WORDS = new Set([
  "a", "about", "after", "all", "an", "and", "are", "as", "at", "be", "been", "but", "by", "can",
  "do", "for", "from", "had", "has", "have", "he", "her", "here", "his", "i", "if", "in", "is",
  "it", "just", "me", "more", "my", "not", "now", "of", "on", "or", "our", "she", "so", "that",
  "the", "their", "there", "they", "this", "to", "was", "we", "were", "what", "when", "with", "you"
]);

export function reconcileContentLanguage(text, declaredLanguage = null) {
  const declared = primaryLanguage(declaredLanguage);
  if (!declared || !["fi", "en"].includes(declared)) return declaredLanguage || null;
  const tokens = String(text || "").toLocaleLowerCase("fi").match(/\p{L}+/gu) || [];
  if (tokens.length < 2) return declaredLanguage;

  let finnish = 0;
  let english = 0;
  for (const token of tokens) {
    if (FINNISH_WORDS.has(token)) finnish += 1;
    if (ENGLISH_WORDS.has(token)) english += 1;
    if (/[äö]/u.test(token)) finnish += 0.75;
    if (token.length >= 6 && /(?:ssa|ssä|sta|stä|lla|llä|lta|ltä|ksi|inen|taan|tään|mme|nne)$/u.test(token)) finnish += 0.5;
  }

  if (declared === "en" && finnish >= 3 && finnish >= english + 2) return "fi";
  if (declared === "fi" && english >= 4 && english >= finnish + 2.5) return "en";
  return declaredLanguage;
}

function primaryLanguage(value) {
  return String(value || "").trim().toLowerCase().split(/[-_]/)[0];
}
