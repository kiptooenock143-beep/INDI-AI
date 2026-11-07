# INDI AI - Android app

The GitHub workflow in `.github/workflows/build-apk.yml` builds the web app, wraps it
with Capacitor and produces `app-debug.apk`. The app needs no server: it calls the AI
providers directly over the phone's data or Wi-Fi connection. API keys are entered in
the app (menu -> Settings -> API) and stored only on the phone.
