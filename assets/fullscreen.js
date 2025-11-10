const wrapper = document.getElementById("mapWrapper");
const inventoryWrapper = document.getElementById("inventoryWrapper");

document.getElementById("fsBtn").onclick = async () => {
  if (!document.fullscreenElement) {
    await wrapper.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
};

document.getElementById("showInventoryBtn").onclick = async () => {
  if (!document.fullscreenElement) {
    inventoryWrapper.style.display = "block";
    try {
      await inventoryWrapper.requestFullscreen();
    } catch {
      inventoryWrapper.classList.add("fullscreen-wrapper");
      document.body.classList.add("no-scroll");
    }
  } else {
    document.exitFullscreen();
  }
};

document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement !== inventoryWrapper) {
    inventoryWrapper.style.display = "none";
    inventoryWrapper.classList.remove("fullscreen-wrapper");
    document.body.classList.remove("no-scroll");
  }
});

