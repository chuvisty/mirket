const firebaseConfig = {
  apiKey: "AIzaSyCtJy0JBOPkSw-w7f4Y-5j98hrqENkAj00",
  authDomain: "mirket-team.firebaseapp.com",
  projectId: "mirket-team",
  storageBucket: "mirket-team.firebasestorage.app",
  messagingSenderId: "749350560942",
  appId: "1:749350560942:web:9e1a9a4c187e03367eb93f",
  measurementId: "G-WJT4JXJS23"
};

async function initFirebase() {
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js");
  const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithCustomToken, onAuthStateChanged, signOut } = await import("https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js");
  const { getFirestore, doc, setDoc, getDoc, serverTimestamp, collection, addDoc, getDocs, query, where, updateDoc, deleteDoc, orderBy } = await import("https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js");
  const { getFunctions, httpsCallable, connectFunctionsEmulator } = await import("https://www.gstatic.com/firebasejs/9.22.1/firebase-functions.js");

  const app = initializeApp(firebaseConfig);
  window.auth = getAuth(app);
  window.db = getFirestore(app);
  window.functions = getFunctions(app, "europe-west3");

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    connectFunctionsEmulator(window.functions, "127.0.0.1", 5001);
    console.log("Firebase Functions Emulator connected.");
  }

  window.firebaseAuth = {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithCustomToken,
    onAuthStateChanged,
    signOut
  };
  window.firebaseFirestore = {
    doc,
    setDoc,
    getDoc,
    serverTimestamp,
    collection,
    addDoc,
    getDocs,
    query,
    where,
    updateDoc,
    deleteDoc,
    orderBy
  };
  window.firebaseFunctions = {
    httpsCallable
  };
}


