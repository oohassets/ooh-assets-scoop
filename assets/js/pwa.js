if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("../service-worker.js")
    .then(reg => console.log("SW Registered:", reg))
    .catch(err => console.log("SW error:", err));
}
