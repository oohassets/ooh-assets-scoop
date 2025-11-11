export function initFullscreen() {
  const fsBtn = document.getElementById("fsBtn");
  const wrapper = document.getElementById("mapWrapper");

  if (!fsBtn || !wrapper) {
    console.error("Fullscreen Button or Wrapper not found in DOM.");
    return;
  }

  fsBtn.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) {
        await wrapper.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen error:", err);
    }
  });
}
