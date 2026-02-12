importScripts("https://www.gstatic.com/firebasejs/11.0.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyA4amK6CZuiU3_Nfaw4OLD17BqWrX0VYAA",
  authDomain: "scoopassets.firebaseapp.com",
  projectId: "scoopassets",
  storageBucket: "scoopassets.firebasestorage.app",
  messagingSenderId: "989559041483",
  appId: "1:989559041483:web:0feba5f279189f03791a4",
  databaseURL: "https://scoopassets-default-rtdb.firebaseio.com/"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: "/logo.png"
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
