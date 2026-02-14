// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, doc, query, where, orderBy, onSnapshot, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- CONFIGURATION ---
// PASTE YOUR FIREBASE CONFIG HERE
// const firebaseConfig = {
//   apiKey: "AIzaSyDusstJWKBkaabFVole37AETp3krIrUqS4",
//   authDomain: "remote-work-2d63d.firebaseapp.com",
//   databaseURL: "https://remote-work-2d63d-default-rtdb.firebaseio.com",
//   projectId: "remote-work-2d63d",
//   storageBucket: "remote-work-2d63d.firebasestorage.app",
//   messagingSenderId: "206255046290",
//   appId: "1:206255046290:web:d4dc8e1ad252fd54e9304b",
//   measurementId: "G-3S1TCQPNR8"
// };


const firebaseConfig = {
  apiKey: "AIzaSyDbdnwzFoOXcvz0SEhDLPKLC6nzgcNoEvA",
  authDomain: "questions-9d203.firebaseapp.com",
  databaseURL: "https://questions-9d203-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "questions-9d203",
  storageBucket: "questions-9d203.firebasestorage.app",
  messagingSenderId: "367649057882",
  appId: "1:367649057882:web:beb5d05916764254227c63",
  measurementId: "G-VC1R07DTLY"
};




// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- STATE MANAGEMENT ---
let currentUser = null;
let currentTimerDocId = null; // ID of the active timer document in Firestore
let timerInterval = null;

// --- DOM ELEMENTS ---
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const authForm = document.getElementById('auth-form');
const userEmailSpan = document.getElementById('user-email');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const timerDisplay = document.getElementById('timer-display');
const historyList = document.getElementById('history-list');

// --- AUTHENTICATION ---

// Listen for Auth State Changes
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        showApp();
        checkForActiveTimer();
        loadHistory();
    } else {
        currentUser = null;
        showLogin();
    }
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        // Try to Login
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        // If user not found, try to Register
        try {
            await createUserWithEmailAndPassword(auth, email, password);
        } catch (regError) {
            alert(regError.message);
        }
    }
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

function showApp() {
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    userEmailSpan.textContent = currentUser.email;
}

function showLogin() {
    authContainer.classList.remove('hidden');
    appContainer.classList.add('hidden');
    clearInterval(timerInterval);
}

// --- TIMER LOGIC ---

startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    try {
        // Create a new document in 'timelogs'
        const docRef = await addDoc(collection(db, "timelogs"), {
            uid: currentUser.uid,
            startTime: serverTimestamp(),
            endTime: null,
            status: 'running',
            date: new Date().toISOString().split('T')[0] // For easier querying
        });
        
        currentTimerDocId = docRef.id;
        toggleTimerUI(true, Date.now());
    } catch (error) {
        console.error("Error starting timer:", error);
        startBtn.disabled = false;
    }
});

stopBtn.addEventListener('click', async () => {
    if (!currentTimerDocId) return;
    
    stopBtn.disabled = true;
    try {
        const logRef = doc(db, "timelogs", currentTimerDocId);
        
        // Update document with end time and calculate duration
        // Note: Real duration calculation should happen on backend or carefully here
        // For static, we grab the visual difference roughly, but Firestore serverTimestamp is truth
        await updateDoc(logRef, {
            endTime: serverTimestamp(),
            status: 'completed'
        });

        toggleTimerUI(false);
        currentTimerDocId = null;
    } catch (error) {
        console.error("Error stopping timer:", error);
    } finally {
        stopBtn.disabled = false;
    }
});

// Check if user refreshed page while timer was running
async function checkForActiveTimer() {
    const q = query(
        collection(db, "timelogs"),
        where("uid", "==", currentUser.uid),
        where("status", "==", "running")
    );

    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        currentTimerDocId = doc.id;
        // Firebase timestamps need conversion
        const start = doc.data().startTime.toDate().getTime(); 
        toggleTimerUI(true, start);
    } else {
        toggleTimerUI(false);
    }
}

function toggleTimerUI(isRunning, startTime = null) {
    if (isRunning) {
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        document.getElementById('status-msg').textContent = "Work in progress...";
        startBtn.disabled = false; // Reset for next time

        // Start counting visually
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            const now = Date.now();
            const diff = now - startTime;
            timerDisplay.textContent = formatTime(diff);
        }, 1000);
    } else {
        startBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
        document.getElementById('status-msg').textContent = "Ready to work?";
        clearInterval(timerInterval);
        timerDisplay.textContent = "00:00:00";
    }
}

// --- DASHBOARD & STATS ---

function loadHistory() {
    const q = query(
        collection(db, "timelogs"),
        where("uid", "==", currentUser.uid),
        orderBy("startTime", "desc")
    );

    // Real-time listener
    onSnapshot(q, (snapshot) => {
        historyList.innerHTML = '';
        let todayTotal = 0;
        let weekTotal = 0;
        let totalLogs = 0;
        
        const todayStr = new Date().toISOString().split('T')[0];

        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.status === 'completed' && data.startTime && data.endTime) {
                totalLogs++;
                const start = data.startTime.toDate();
                const end = data.endTime.toDate();
                const durationMs = end - start;

                // Calculate Stats
                // 1. Today
                if (data.date === todayStr) {
                    todayTotal += durationMs;
                }
                // 2. Simple "This Week" (last 7 days approx for simplicity)
                const oneWeekAgo = new Date();
                oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                if (start > oneWeekAgo) {
                    weekTotal += durationMs;
                }

                // Render List Item
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${start.toLocaleDateString()} ${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    <strong>${formatTime(durationMs)}</strong>
                `;
                historyList.appendChild(li);
            }
        });

        // Update Stats UI
        document.getElementById('stat-today').textContent = formatStats(todayTotal);
        document.getElementById('stat-week').textContent = formatStats(weekTotal);
        document.getElementById('stat-total-logs').textContent = totalLogs;
    });
}

// Helper: Format milliseconds to HH:MM:SS
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Helper: Format stats like "2h 30m"
function formatStats(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

function pad(num) {
    return num.toString().padStart(2, '0');
}