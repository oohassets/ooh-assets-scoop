if ('serviceWorker' in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/ooh-assets-scoop/service-worker.js")
      .then(reg => {
        console.log("Service Worker registered:", reg);
      })
      .catch(err => {
        console.error("SW error:", err);
      });
  });
}
