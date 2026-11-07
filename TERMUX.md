# INDI AI on Termux

1. Install Termux from F-Droid (the Play Store build is outdated).
2. Unzip this folder in Termux's home folder, then:
   ```
   cd ~/INDI-AI-main/INDI-AI-main
   bash termux-setup.sh        # one time
   bash termux-start.sh        # every time (first run builds the app)
   ```
3. Open http://localhost:8787 in Chrome, or use the INDI AI APK (see apk-builder).
4. Add API keys in the app: Settings -> API.

After updating any files: `bash termux-start.sh rebuild`

Voices: Settings -> Voice has JARVIS (calm British butler style) and GOKU
(upbeat, high-energy style). They use your phone's built-in text-to-speech with
tuned pitch and speed, so the exact sound depends on the voices installed on the
phone (Android: Settings -> System -> Languages -> Text-to-speech).

Notes
- Desktop-only features (Electron window, Windows process tools, local GPU image
  generation) do not run on Android.
- If the phone kills Termux in the background, enable "Acquire wakelock" in the
  Termux notification.
