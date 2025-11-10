import { db } from "../../firebase/firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

export async function loadMapLinks() {
  const container = document.getElementById("assetLinks");
  const mapIframe = document.getElementById("mapIframe");

  container.innerHTML = "";

  const snapshot = await getDocs(collection(db, "maps"));
  let firstUrl = null;

  snapshot.forEach((docItem, index) => {
    const data = docItem.data();
    const a = document.createElement("a");
    a.textContent = data.name;
    a.dataset.map = data.url;
    a.href = "#";

    if (index === 0) firstUrl = data.url;

    container.appendChild(a);
  });

  if (firstUrl) {
    mapIframe.src = firstUrl;
    container.querySelector("a").classList.add("active");
  }

  attachMapEvents();
}

function attachMapEvents() {
  document.querySelectorAll("#assetLinks a").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();

      const mapIframe = document.getElementById("mapIframe");
      mapIframe.src = link.dataset.map;

      document.querySelectorAll("#assetLinks a").forEach(l => l.classList.remove("active"));
      link.classList.add("active");
    });
  });
}

