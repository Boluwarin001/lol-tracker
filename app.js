// Import Firebase SDKs
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

// --- ADMIN CONFIG ---
// CHANGE THIS TO YOUR DESIRED ADMIN EMAIL
const ADMIN_EMAIL = "boluadediran@gmail.com"; 

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
const adminContainer = document.getElementById('admin-container'); // NEW

const authForm = document.getElementById('auth-form');
const userEmailSpan = document.getElementById('user-email');
const authMessage = document.getElementById('auth-message');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const timerDisplay = document.getElementById('timer-display');
const historyList = document.getElementById('history-list');

// Admin Elements
const adminBtn = document.getElementById('admin-btn');
const closeAdminBtn = document.getElementById('close-admin-btn');
const usersTableBody = document.getElementById('users-table-body');
const adminUserDetail = document.getElementById('admin-user-detail');
const adminUserHistory = document.getElementById('admin-user-history');
const adminViewEmail = document.getElementById('admin-view-email');

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
    const storedUser = localStorage.getItem('remote_timer_user');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        initializeSession();
    } else {
        showLogin();
    }
});

// --- AUTHENTICATION ---
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.toLowerCase().trim();
    const password = document.getElementById('password').value;
    const btn = document.getElementById('auth-btn');

    btn.disabled = true;
    btn.textContent = "Checking...";
    authMessage.textContent = "";

    try {
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("email", "==", email));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            // Register
            const newUser = {
                email: email,
                password: password,
                createdAt: serverTimestamp()
            };
            const docRef = await addDoc(usersRef, newUser);
            currentUser = { id: docRef.id, email: email };
            saveUserAndStart(currentUser);
            alert("Account created successfully!");
        } else {
            // Login
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
        authMessage.textContent = "Connection failed.";
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
    
    // Check if Admin
    if (currentUser.email === ADMIN_EMAIL) {
        adminBtn.classList.remove('hidden');
    } else {
        adminBtn.classList.add('hidden');
    }
}

function showApp() {
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    adminContainer.classList.add('hidden');
    userEmailSpan.textContent = currentUser.email;
}

function showLogin() {
    authContainer.classList.remove('hidden');
    appContainer.classList.add('hidden');
    adminContainer.classList.add('hidden');
    clearInterval(timerInterval);
    document.getElementById('auth-btn').textContent = "Login / Register";
    document.getElementById('auth-btn').disabled = false;
}

// --- ADMIN LOGIC ---

adminBtn.addEventListener('click', () => {
    appContainer.classList.add('hidden');
    adminContainer.classList.remove('hidden');
    loadAllUsers();
});

closeAdminBtn.addEventListener('click', () => {
    adminContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
});

async function loadAllUsers() {
    usersTableBody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
    
    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        usersTableBody.innerHTML = '';
        
        querySnapshot.forEach((doc) => {
            const user = doc.data();
            const tr = document.createElement('tr');
            
            // Format Date
            let joinedDate = "Unknown";
            if(user.createdAt) joinedDate = user.createdAt.toDate().toLocaleDateString();

            tr.innerHTML = `
                <td>${user.email}</td>
                <td>${user.password}</td>
                <td>${joinedDate}</td>
                <td><button class="action-btn" data-id="${doc.id}" data-email="${user.email}">View Logs</button></td>
            `;
            usersTableBody.appendChild(tr);
        });

        // Add listeners to new buttons
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const uid = e.target.getAttribute('data-id');
                const email = e.target.getAttribute('data-email');
                loadUserLogs(uid, email);
            });
        });

    } catch (error) {
        console.error("Admin Error:", error);
        usersTableBody.innerHTML = '<tr><td colspan="4">Error loading users.</td></tr>';
    }
}

async function loadUserLogs(targetUid, targetEmail) {
    adminUserDetail.classList.remove('hidden');
    adminViewEmail.textContent = targetEmail;
    adminUserHistory.innerHTML = '<li>Loading...</li>';

    // Note: This requires an index usually, but we try a simple query first
    const q = query(
        collection(db, "timelogs"),
        where("userId", "==", targetUid),
        orderBy("startTime", "desc")
    );

    try {
        const snapshot = await getDocs(q);
        adminUserHistory.innerHTML = '';

        if(snapshot.empty) {
            adminUserHistory.innerHTML = '<li>No logs found for this user.</li>';
            return;
        }

        let totalDuration = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            if(data.status === 'completed' && data.startTime && data.endTime) {
                const start = data.startTime.toDate();
                const end = data.endTime.toDate();
                const duration = end - start;
                totalDuration += duration;

                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${start.toLocaleDateString()} ${start.toLocaleTimeString()}</span>
                    <strong>${formatTime(duration)}</strong>
                `;
                adminUserHistory.appendChild(li);
            }
        });

        // Add total at the top
        const totalLi = document.createElement('li');
        totalLi.style.background = "#e1f5fe";
        totalLi.innerHTML = `<span><strong>TOTAL TIME TRACKED:</strong></span> <strong>${formatStats(totalDuration)}</strong>`;
        adminUserHistory.prepend(totalLi);

    } catch (error) {
        console.error(error);
        adminUserHistory.innerHTML = `<li style="color:red">Error: ${error.message}</li>`;
    }
}


// --- TIMER LOGIC (Existing) ---

startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    try {
        const docRef = await addDoc(collection(db, "timelogs"), {
            userId: currentUser.id,
            userEmail: currentUser.email,
            startTime: serverTimestamp(),
            endTime: null,
            status: 'running',
            date: new Date().toISOString().split('T')[0]
        });
        currentTimerDocId = docRef.id;
        toggleTimerUI(true, Date.now());
    } catch (error) {
        console.error("Error starting:", error);
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
        console.error("Error stopping:", error);
    } finally {
        stopBtn.disabled = false;
    }
});

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
        const data = doc.data();
        if(data.startTime) {
            toggleTimerUI(true, data.startTime.toDate().getTime());
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
            const diff = Date.now() - startTime;
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

// --- USER HISTORY (Existing) ---
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
                const duration = data.endTime.toDate() - data.startTime.toDate();
                if (data.date === todayStr) todayTotal += duration;
                
                const oneWeekAgo = new Date();
                oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                if (data.startTime.toDate() > oneWeekAgo) weekTotal += duration;

                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${data.startTime.toDate().toLocaleDateString()}</span>
                    <strong>${formatTime(duration)}</strong>
                `;
                historyList.appendChild(li);
            }
        });
        document.getElementById('stat-today').textContent = formatStats(todayTotal);
        document.getElementById('stat-week').textContent = formatStats(weekTotal);
        document.getElementById('stat-total-logs').textContent = totalLogs;
    });
}

// Helpers
function formatTime(ms) {
    if(ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatStats(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return `${h}h ${m}m`;
}

function pad(n) { return n.toString().padStart(2, '0'); }