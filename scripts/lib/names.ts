/** "google-cloud" → "GoogleCloudLogo", "1password" → "Logo1password". */
export function componentName(slug: string) {
  const pascal = slug
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return /^\d/.test(pascal) ? `Logo${pascal}` : `${pascal}Logo`;
}

/** Public site the generated components point back to. */
export const SITE_URL = "https://logoforge.terravidhal.me";
