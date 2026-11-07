const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("exileDesktop", {
openDashboard: () => ipcRenderer.send("exile:open-dashboard"),
minimizeCompanion: () => ipcRenderer.send("exile:minimize-companion"),
closeCompanion: () => ipcRenderer.send("exile:close-companion"),
  synthesizeVenom: (text, profileId) => ipcRenderer.invoke("exile:venom-synthesize", text, profileId),
});
