import { auth, db } from "../../firebase/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

export async function loadInventory() {
  const ref = doc(db, "inventory", "contentInventory");
  const snap = await getDoc(ref);

  if (snap.exists()) {
    document.getElementById("inventoryIframe").src = snap.data().iframeUrl;
  } else {
    console.error("Inventory document not found in Firestore");
  }
}
