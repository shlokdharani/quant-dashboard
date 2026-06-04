import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, getDocs, updateDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCxeIHFjdav-jCS556F_2RUVEGnQ0kcLSA",
  authDomain: "option-trading-db.firebaseapp.com",
  projectId: "option-trading-db",
  storageBucket: "option-trading-db.firebasestorage.app",
  messagingSenderId: "262956220710",
  appId: "1:262956220710:web:a1302f5c6b9eb590abc1e7",
  measurementId: "G-WKKXSMVXVL"
};

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export {
  app,
  auth,
  db,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  updateDoc
};
