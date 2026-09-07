import { initializeApp } from "firebase/app";
import { getFirestore, doc, collection, getDoc, getDocs } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

let firestoreApiPromise = null;

export function getFirestoreApi() {
  if (!firestoreApiPromise) {
    firestoreApiPromise = Promise.resolve({
      db,
      doc,
      collection,
      getDoc,
      getDocs,
    });
  }
  return firestoreApiPromise;
}

export function _resetFirestoreApiForTests() {
  firestoreApiPromise = null;
}
