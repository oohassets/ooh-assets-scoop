document.addEventListener("DOMContentLoaded", () => {
  const viewScreensBtn = document.getElementById("viewScreensBtn");
  if (!viewScreensBtn) {
    console.warn("⚠️ viewScreensBtn not found in DOM.");
    return;
  }

  function isInStandaloneMode() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  viewScreensBtn.addEventListener("click", () => {
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    console.log("Standalone Mode:", isInStandaloneMode());
    console.log("Mobile Device:", isMobile);

    // PWA standalone
    if (isInStandaloneMode()) {
      window.location.href = "asset-digital-content.html";
      return;
    }

    // Mobile browser
    if (isMobile) {
      const fullscreenWin = window.open(
        "asset-digital-content.html",
        "_blank",
        `toolbar=no,location=no,status=no,menubar=no,
        scrollbars=no,resizable=no,fullscreen=yes,
        width=${screen.availWidth},height=${screen.availHeight}`
      );

      if (fullscreenWin) {
        fullscreenWin.focus();
      } else {
        alert("Please allow pop-ups for this site to open fullscreen view.");
      }

      return;
    }

    // Desktop fallback
    window.open("asset-digital-content.html", "_blank");
  });
});
