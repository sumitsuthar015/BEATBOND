export const TERMS_VERSION = "2026-10-17";
export const PRIVACY_VERSION = "2026-10-17";

export const isCurrentLegalConsent = (value) =>
  value?.accepted === true
  && value.termsVersion === TERMS_VERSION
  && value.privacyVersion === PRIVACY_VERSION;
