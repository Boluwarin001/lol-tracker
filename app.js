// Import Firebase SDKs (ONLY Firestore, no Auth SDK needed)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, doc, query, where, orderBy, onSnapshot, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDusstJWKBkaabFVole37AETp3krIrUqS4",
  authDomain: "remote-work-2d63d.firebaseapp.com",
  databaseURL: "https://remote-work-2d63d-default-rtdb.firebaseio.com",
  projectId: "remote-work-2d63d",
  storageBucket: "remote-work-2d63d.firebasestorage.app",
  messagingSenderId: "206255046290",
  appId: "1:206255046290:web:d4dc8e1ad252fd54e9304b",
  measurementId: "G-3S1TCQPNR8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- STATE MANAGEMENT ---
let currentUser = null;
let currentTimerDocId = null;
let timerInterval = null;

// --- DOM ELEMENTS ---
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const authForm = document.getElementById('auth-form');
const userEmailSpan = document.getElementById('user-email');
const authMessage = document.getElementById('auth-message');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const timerDisplay = document.getElementById('timer-display');
const historyList = document.getElementById('history-list');

// --- INITIALIZATION ---
// Check LocalStorage on page load to see if user is already "logged in"
window.addEventListener('DOMContentLoaded', () => {
    const storedUser = localStorage.getItem('remote_timer_user');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        initializeSession();
    } else {
        showLogin();
    }
});

// --- CUSTOM AUTHENTICATION (DATABASE BASED) ---

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.toLowerCase().trim();
    const password = document.getElementById('password').value;
    const btn = document.getElementById('auth-btn');

    btn.disabled = true;
    btn.textContent = "Checking...";
    authMessage.textContent = "";

    try {
        // 1. Check if user exists in the 'users' collection
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("email", "==", email));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            // --- REGISTER NEW USER ---
            // If email doesn't exist, we create it (Register)
            const newUser = {
                email: email,
                password: password, // Storing plain text (Only for prototype!)
                createdAt: serverTimestamp()
            };
            
            const docRef = await addDoc(usersRef, newUser);
            
            currentUser = { id: docRef.id, email: email };
            saveUserAndStart(currentUser);
            alert("Account created successfully!");
        } else {
            // --- LOGIN EXISTING USER ---
            // User exists, check password
            const userDoc = querySnapshot.docs[0];
            const userData = userDoc.data();

            if (userData.password === password) {
                currentUser = { id: userDoc.id, email: userData.email };
                saveUserAndStart(currentUser);
            } else {
                authMessage.textContent = "Incorrect password.";
                authMessage.style.color = "red";
                btn.disabled = false;
                btn.textContent = "Login / Register";
            }
        }
    } catch (error) {
        console.error("Auth Error", error);
        authMessage.textContent = "Connection failed. Check console.";
        btn.disabled = false;
        btn.textContent = "Login / Register";
    }
});

document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('remote_timer_user');
    currentUser = null;
    currentTimerDocId = null;
    showLogin();
});

function saveUserAndStart(userObj) {
    localStorage.setItem('remote_timer_user', JSON.stringify(userObj));
    initializeSession();
}

function initializeSession() {
    showApp();
    checkForActiveTimer();
    loadHistory();
}

function showApp() {
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    userEmailSpan.textContent = currentUser.email;
}

function showLogin() {
    authContainer.classList.remove('hidden');
    appContainer.classList.add('hidden');
    clearInterval(timerInterval);
    document.getElementById('auth-btn').textContent = "Login / Register";
    document.getElementById('auth-btn').disabled = false;
}

// --- TIMER LOGIC ---

startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    try {
        // Create a new document in 'timelogs'
        const docRef = await addDoc(collection(db, "timelogs"), {
            userId: currentUser.id, // Using our custom ID, not Auth UID
            userEmail: currentUser.email,
            startTime: serverTimestamp(),
            endTime: null,
            status: 'running',
            date: new Date().toISOString().split('T')[0]
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
        where("userId", "==", currentUser.id),
        where("status", "==", "running")
    );

    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        currentTimerDocId = doc.id;
        // Handle null startTime slightly gracefully if latency occurs
        const data = doc.data();
        if(data.startTime) {
            const start = data.startTime.toDate().getTime(); 
            toggleTimerUI(true, start);
        }
    } else {
        toggleTimerUI(false);
    }
}

function toggleTimerUI(isRunning, startTime = null) {
    if (isRunning) {
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        document.getElementById('status-msg').textContent = "Work in progress...";
        startBtn.disabled = false; 

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
        where("userId", "==", currentUser.id),
        orderBy("startTime", "desc")
    );

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

                if (data.date === todayStr) {
                    todayTotal += durationMs;
                }
                
                const oneWeekAgo = new Date();
                oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                if (start > oneWeekAgo) {
                    weekTotal += durationMs;
                }

                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${start.toLocaleDateString()} ${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    <strong>${formatTime(durationMs)}</strong>
                `;
                historyList.appendChild(li);
            }
        });

        document.getElementById('stat-today').textContent = formatStats(todayTotal);
        document.getElementById('stat-week').textContent = formatStats(weekTotal);
        document.getElementById('stat-total-logs').textContent = totalLogs;
    });
}

// Helper: Format milliseconds to HH:MM:SS
function formatTime(ms) {
    if(ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function formatStats(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

function pad(num) {
    return num.toString().padStart(2, '0');
}