export const TERMS_VERSION = "2026-10-17";
export const PRIVACY_VERSION = "2026-10-17";
export const LEGAL_CONSENT_SESSION_KEY = "beatbond:legal-consent";

export type LegalConsent = {
  accepted: true;
  termsVersion: string;
  privacyVersion: string;
  emailMarketingOptIn: boolean;
};

export const readLegalConsent = (): LegalConsent | null => {
  try {
    const value = JSON.parse(sessionStorage.getItem(LEGAL_CONSENT_SESSION_KEY) || "null") as Partial<LegalConsent> | null;
    return value?.accepted === true && value.termsVersion === TERMS_VERSION && value.privacyVersion === PRIVACY_VERSION
      ? value as LegalConsent
      : null;
  } catch {
    return null;
  }
};
