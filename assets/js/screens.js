export function initFullscreen() {
  const fsBtn = document.getElementById("fsBtn");
  const wrapper = document.getElementById("mapWrapper");

  fsBtn.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) {
        await wrapper.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn(err);
    }
  });
}

