/**
 * Holds the most recently generated image for the current app session.
 * Kept in memory rather than localStorage because data URLs can be large.
 */

export interface GeneratedImage {
  dataUrl: string;
  prompt: string;
  createdAt: number;
}

let latestGeneratedImage: GeneratedImage | null = null;

export function rememberGeneratedImage(dataUrl: string, prompt: string): void {
  if (!dataUrl.startsWith("data:image/")) return;

  latestGeneratedImage = {
    dataUrl,
    prompt: prompt.slice(0, 8000),
    createdAt: Date.now(),
  };
}

export function getLatestGeneratedImage(): GeneratedImage | null {
  return latestGeneratedImage;
}

export function clearLatestGeneratedImage(): void {
  latestGeneratedImage = null;
}
