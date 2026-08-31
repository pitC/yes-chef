const FIREBASE_VERSION = '12.17.1';
const firebaseConfig = {
  apiKey: 'AIzaSyD_jSlv9np8EJvgVebvHLxGO-St68ZOwGY',
  authDomain: 'yes-chef-cookbook.firebaseapp.com',
  projectId: 'yes-chef-cookbook',
  storageBucket: 'yes-chef-cookbook.firebasestorage.app',
  messagingSenderId: '158345618336',
  appId: '1:158345618336:web:5846633ae0d4d529c13ac5',
};

let firestoreApiPromise = null;

export function getFirestoreApi() {
  if (!firestoreApiPromise) {
    firestoreApiPromise = Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
    ]).then(([firebaseApp, firestore]) => ({
      db: firestore.getFirestore(firebaseApp.initializeApp(firebaseConfig)),
      doc: firestore.doc,
      collection: firestore.collection,
      getDoc: firestore.getDoc,
      getDocs: firestore.getDocs,
    }));
  }
  return firestoreApiPromise;
}

export function _resetFirestoreApiForTests() {
  firestoreApiPromise = null;
}
