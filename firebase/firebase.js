// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getDatabase, ref, get, child } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

export const firebaseConfig = {
  apiKey: "AIzaSyA4amK6CZuiU3_Nfaw4OLD17BqWrX0VYAA",
  authDomain: "scoopassets.firebaseapp.com",
  projectId: "scoopassets",
  storageBucket: "scoopassets.firebasestorage.app",
  messagingSenderId: "989559041483",
  appId: "1:989559041483:web:0feba5f279189f03791a4",
  measurementId: "G-6HYVW2NG5K"
};

databaseURL: "https://scoopassets-default-rtdb.firebaseio.com/"

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);

