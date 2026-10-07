/** Opens Together on a lens or in log mode, from anywhere in the app. */
export const OPEN_TOGETHER = "logan:open-together";
export type TogetherLens = "everyone" | "mine" | "log";
export interface OpenTogetherDetail { lens: TogetherLens; symptom?: string }
export function openTogether(detail: OpenTogetherDetail) {
  globalThis.dispatchEvent(new CustomEvent<OpenTogetherDetail>(OPEN_TOGETHER, { detail }));
}
