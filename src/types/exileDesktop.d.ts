export {};

declare global {
  interface Window {
    exileDesktop?: {
      openDashboard: () => void;
      minimizeCompanion: () => void;
      closeCompanion: () => void;
      synthesizeVenom: (text: string, profileId?: "jarvis" | "venom") => Promise<string | null>;
    };
  }
}
