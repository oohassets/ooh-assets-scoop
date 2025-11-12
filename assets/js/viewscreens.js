function isInStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

const viewScreensBtn = document.getElementById('viewScreensBtn');
viewScreensBtn.addEventListener('click', () => {
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isInStandaloneMode()) {
    window.location.href = "asset-digital-content.html";
  } else if (isMobile) {
    const fullscreenWin = window.open(
      "asset-digital-content.html",
      "_blank",
      "toolbar=no,location=no,status=no,menubar=no,scrollbars=no,resizable=no,fullscreen=yes,width=" +
        screen.availWidth +
        ",height=" +
        screen.availHeight
    );
    if (fullscreenWin) fullscreenWin.focus();
  } else {
    window.open("asset-digital-content.html", "_blank");
  }
});

