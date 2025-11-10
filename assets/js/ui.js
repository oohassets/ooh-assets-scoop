window.addEventListener("load", () => {
  const spl = document.getElementById("splash-screen");
  const logo = document.getElementById("splash-logo");

  logo.classList.add("visible");

  setTimeout(() => {
    spl.classList.add("fade-out");
    setTimeout(() => spl.remove(), 800);
  }, 2200);
});

