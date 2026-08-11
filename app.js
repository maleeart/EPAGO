// EnergySave Video Portal - Application Logic

// --- Constants & Config ---
const ADMIN_PASSWORD = "8888";
const DB_VIDEOS_KEY = "energysave_videos";
const DB_USERS_KEY = "energysave_participants";
const DB_CURRENT_USER_KEY = "energysave_current_user";
const DB_WATCHED_KEY = "energysave_watched_logs"; // Keyed by empId: [videoIds]

// Name normalization helper to ignore Thai prefix titles (นาย, นาง, นางสาว, ดร., etc.) and spacing
const normalizeName = name => {
    if (!name) return "";
    return name.trim()
        .replace(/^(นาย|นางสาว|นาง|ด\.ช\.|ด\.ญ\.|นายแพทย์|แพทย์หญิง|ดร\.)\s*/, "")
        .replace(/\s+/g, "");
};

// Default Video Seed Data
const DEFAULT_VIDEOS = [
    {
        id: "vid-1",
        category: "ทั่วไป",
        title: "12 วิธีประหยัดพลังงานในที่ทำงาน 💡",
        description: "เคล็ดลับการอนุรักษ์พลังงานในที่ทำงานและสำนักงานอย่างมีประสิทธิภาพสูงสุด 12 วิธีที่ทำตามได้จริงและเห็นผลลัพธ์ทันที",
        url: "", // Leave blank for simulation
        duration: "3:30"
    }
];

// Default Participants Seed Data for Demo
const DEFAULT_PARTICIPANTS = [
    {
        emptype: "พนักงาน",
        empId: "EMP001",
        name: "นายสมชาย รักษ์พลังงาน",
        dept: "ฝ่ายเทคโนโลยีสารสนเทศ",
        regTime: "2026-08-11 08:30"
    },
    {
        emptype: "ลูกจ้าง",
        empId: "",
        name: "นางสาวสมหญิง ประหยัดดี",
        dept: "ฝ่ายการเงินและบัญชี",
        regTime: "2026-08-11 09:15"
    }
];

const DEFAULT_WATCHED_LOGS = {
    "EMP001": ["vid-1"],
    "นางสาวสมหญิง ประหยัดดี": ["vid-1"]
};

// --- App State ---
let videos = [];
let participants = [];
let watchedLogs = {};
let currentUser = null;
let currentPlayingVideo = null;
let playSimInterval = null;
let isOnlineDb = false;
let adminPassword = "";

const UNITS = ["สก.ชธธ.","อบค.","อบฟ.","อบย.","อรอ.","อคม.","อหข.","อื่นๆ"];

// --- Initialize App ---
document.addEventListener("DOMContentLoaded", () => {
    initDatabase();
    checkSession();
    renderUserLobby();
    checkOnlineStatus();
    
    // Render units radio buttons
    const unitsWrapper = document.getElementById("units-wrapper");
    if (unitsWrapper) {
        unitsWrapper.innerHTML = UNITS.map(u => 
            `<label class="opt"><input type="radio" name="unit" value="${u}" required><span>${u}</span></label>`
        ).join("");
        
        unitsWrapper.addEventListener("change", (e) => {
            const otherInput = document.getElementById("reg-dept-other");
            if (e.target.name === "unit") {
                const isOther = e.target.value === "อื่นๆ";
                otherInput.classList.toggle("hidden", !isOther);
                otherInput.required = isOther;
                if (isOther) otherInput.focus();
            }
        });
    }

    // Toggle Employee ID field based on Staff Type
    const empTypeRadios = document.querySelectorAll('input[name="emptype"]');
    empTypeRadios.forEach(radio => {
        radio.addEventListener("change", (e) => {
            const isEmp = e.target.value === "พนักงาน";
            const empidGroup = document.getElementById("empid-group");
            const empidInput = document.getElementById("reg-empid");
            
            if (empidGroup && empidInput) {
                empidGroup.classList.toggle("hidden", !isEmp);
                empidInput.required = isEmp;
                if (!isEmp) empidInput.value = "";
            }
        });
    });

    // Toggle Employee ID field based on Staff Type for returning users
    const retEmpTypeRadios = document.querySelectorAll('input[name="ret-emptype"]');
    retEmpTypeRadios.forEach(radio => {
        radio.addEventListener("change", (e) => {
            const isEmp = e.target.value === "พนักงาน";
            const empidGroup = document.getElementById("ret-empid-group");
            const empidInput = document.getElementById("ret-empid");
            
            if (empidGroup && empidInput) {
                empidGroup.classList.toggle("hidden", !isEmp);
                empidInput.required = isEmp;
                if (!isEmp) empidInput.value = "";
            }
        });
    });

    // Toggle Employee ID field based on Staff Type for edit modal
    const editEmpTypeRadios = document.querySelectorAll('input[name="edit-emptype"]');
    editEmpTypeRadios.forEach(radio => {
        radio.addEventListener("change", (e) => {
            const isEmp = e.target.value === "พนักงาน";
            const empidGroup = document.getElementById("edit-empid-group");
            const empidInput = document.getElementById("edit-empid");
            
            if (empidGroup && empidInput) {
                empidGroup.classList.toggle("hidden", !isEmp);
                empidInput.required = isEmp;
                if (!isEmp) empidInput.value = "";
            }
        });
    });

    // Toggle custom department input for edit modal
    const editDeptSelect = document.getElementById("edit-dept");
    if (editDeptSelect) {
        editDeptSelect.addEventListener("change", (e) => {
            const isOther = e.target.value === "อื่นๆ";
            const otherGroup = document.getElementById("edit-dept-other-group");
            const otherInput = document.getElementById("edit-dept-other");
            
            if (otherGroup && otherInput) {
                otherGroup.classList.toggle("hidden", !isOther);
                otherInput.required = isOther;
                if (isOther) otherInput.focus();
            }
        });
    }

    // Backdrop click close for edit modal
    document.getElementById("participant-edit-modal").addEventListener("click", (e) => {
        if (e.target.id === "participant-edit-modal") closeParticipantEditModal();
    });

    // Admin login overlay backdrop click close
    document.getElementById("admin-login-modal").addEventListener("click", (e) => {
        if (e.target.id === "admin-login-modal") closeAdminLogin();
    });
});

// Check if the server API endpoints are available
async function checkOnlineStatus() {
    if (window.location.protocol === "file:") {
        isOnlineDb = false;
        console.log("EPAGO: Local file:// mode. Using LocalStorage database fallback.");
        return;
    }
    try {
        const res = await fetch("/api/login", { method: "HEAD" }).catch(() => null);
        isOnlineDb = res !== null && res.status !== 404;
        console.log("EPAGO: Database connection status: " + (isOnlineDb ? "ONLINE (Vercel Cloud)" : "OFFLINE (LocalStorage Fallback)"));
        
        if (isOnlineDb) {
            await migrateLocalDataToCloud();
            if (currentUser) {
                syncCurrentUserWatchedProgress();
            }
        }
    } catch (e) {
        isOnlineDb = false;
        console.log("EPAGO: Database check failed. Fallback to LocalStorage.");
    }
}

// Sync current user watched videos from cloud
async function syncCurrentUserWatchedProgress() {
    if (!currentUser || !isOnlineDb) return;
    try {
        const response = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                emptype: currentUser.emptype,
                name: currentUser.name,
                empId: currentUser.empId
            })
        });
        const resData = await response.json();
        if (response.ok && resData.ok && resData.user) {
            const userKey = currentUser.empId || currentUser.name;
            watchedLogs[userKey] = resData.user.watched || [];
            localStorage.setItem(DB_WATCHED_KEY, JSON.stringify(watchedLogs));
            renderUserLobby();
        }
    } catch (e) {
        console.warn("Failed to sync current user watch progress:", e);
    }
}

// Migrate local storage participants and watched logs to cloud Vercel Blob
async function migrateLocalDataToCloud() {
    if (!isOnlineDb) return;
    if (localStorage.getItem("db_migrated_v1.4_v2") === "true") return;
    
    const localParticipantsRaw = localStorage.getItem(DB_USERS_KEY);
    const localWatchedRaw = localStorage.getItem(DB_WATCHED_KEY);
    if (!localParticipantsRaw) {
        localStorage.setItem("db_migrated_v1.4_v2", "true");
        return;
    }
    
    try {
        const localParts = JSON.parse(localParticipantsRaw) || [];
        const localWatched = JSON.parse(localWatchedRaw) || {};
        
        if (localParts.length === 0) {
            localStorage.setItem("db_migrated_v1.4_v2", "true");
            return;
        }
        
        console.log("EPAGO: Migrating " + localParts.length + " local participants to cloud database...");
        
        for (const part of localParts) {
            const userKey = part.empId || part.name;
            const watched = localWatched[userKey] || [];
            
            await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    emptype: part.emptype || "พนักงาน",
                    empId: part.empId || "",
                    name: part.name,
                    dept: part.dept,
                    regTime: part.regTime,
                    watched: watched
                })
            }).catch(e => console.error("Migration failed for: " + part.name, e));
        }
        
        localStorage.setItem("db_migrated_v1.4_v2", "true");
        console.log("EPAGO: Cloud database migration complete!");
    } catch (e) {
        console.error("Migration error:", e);
    }
}

// Seed data storage if empty
function initDatabase() {
    // Database Versioning / Force Reset for default videos
    const DB_VERSION = "v1.4";
    if (localStorage.getItem("db_version") !== DB_VERSION) {
        localStorage.setItem(DB_VIDEOS_KEY, JSON.stringify(DEFAULT_VIDEOS));
        localStorage.setItem("db_version", DB_VERSION);
    }

    // Videos Init
    if (!localStorage.getItem(DB_VIDEOS_KEY)) {
        localStorage.setItem(DB_VIDEOS_KEY, JSON.stringify(DEFAULT_VIDEOS));
    }
    videos = JSON.parse(localStorage.getItem(DB_VIDEOS_KEY));

    // Participants Init
    if (!localStorage.getItem(DB_USERS_KEY)) {
        localStorage.setItem(DB_USERS_KEY, JSON.stringify(DEFAULT_PARTICIPANTS));
    }
    participants = JSON.parse(localStorage.getItem(DB_USERS_KEY));

    // Watched Logs Init
    if (!localStorage.getItem(DB_WATCHED_KEY)) {
        localStorage.setItem(DB_WATCHED_KEY, JSON.stringify(DEFAULT_WATCHED_LOGS));
    }
    watchedLogs = JSON.parse(localStorage.getItem(DB_WATCHED_KEY));
}

// Session Check
function checkSession() {
    const userSession = localStorage.getItem(DB_CURRENT_USER_KEY);
    const homeBtn = document.getElementById("nav-home-btn");
    const logoutBtn = document.getElementById("nav-logout-btn");
    
    if (userSession) {
        currentUser = JSON.parse(userSession);
        document.getElementById("user-display-name").innerText = `คุณ${currentUser.name}`;
        
        if (homeBtn) homeBtn.classList.remove("hidden");
        if (logoutBtn) logoutBtn.classList.remove("hidden");
        switchView("lobby");
    } else {
        if (homeBtn) homeBtn.classList.add("hidden");
        if (logoutBtn) logoutBtn.classList.add("hidden");
        switchView("register");
    }
}

// User Logout
function logoutUser() {
    if (confirm("คุณต้องการออกจากระบบผู้ใช้เพื่อกลับไปหน้าลงทะเบียนใช่หรือไม่?")) {
        localStorage.removeItem(DB_CURRENT_USER_KEY);
        currentUser = null;
        checkSession();
        showToast("ออกจากระบบผู้ใช้งานเรียบร้อยแล้ว");
    }
}

// --- View Router ---
function switchView(viewName) {
    // Hide all views
    document.querySelectorAll(".view-section").forEach(sec => sec.classList.remove("active"));
    
    const homeBtn = document.getElementById("nav-home-btn");
    const logoutBtn = document.getElementById("nav-logout-btn");
    
    // Show selected view
    if (viewName === "register") {
        document.getElementById("register-view").classList.add("active");
        document.body.classList.remove("admin-mode");
    } else if (viewName === "lobby") {
        document.getElementById("lobby-view").classList.add("active");
        document.body.classList.remove("admin-mode");
        renderUserLobby();
    } else if (viewName === "admin") {
        document.getElementById("admin-view").classList.add("active");
        document.body.classList.add("admin-mode");
        
        // Hide user nav buttons while in admin mode to prevent action conflicts
        if (homeBtn) homeBtn.classList.add("hidden");
        if (logoutBtn) logoutBtn.classList.add("hidden");
        
        refreshAdminDashboard();
    }
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Toast Notification System ---
function showToast(message, isError = false) {
    const toast = document.getElementById("toast");
    const toastMsg = document.getElementById("toast-message");
    const toastIcon = document.getElementById("toast-icon");
    
    toastMsg.innerText = message;
    
    if (isError) {
        toast.classList.add("toast-error");
        toastIcon.setAttribute("data-lucide", "alert-circle");
    } else {
        toast.classList.remove("toast-error");
        toastIcon.setAttribute("data-lucide", "check-circle");
    }
    
    lucide.createIcons();
    toast.classList.remove("hidden");
    
    // Auto hide after 3 seconds
    setTimeout(() => {
        toast.classList.add("hidden");
    }, 3000);
}

// Helper for local registration fallback when offline or APIs are missing
function localRegistrationFallback(newParticipant, existingIndex) {
    if (existingIndex === -1) {
        participants.push(newParticipant);
    } else {
        participants[existingIndex] = newParticipant;
    }
    localStorage.setItem(DB_USERS_KEY, JSON.stringify(participants));
    
    const userKey = newParticipant.empId || newParticipant.name;
    if (!watchedLogs[userKey]) {
        watchedLogs[userKey] = [];
        localStorage.setItem(DB_WATCHED_KEY, JSON.stringify(watchedLogs));
    }
    
    currentUser = newParticipant;
    localStorage.setItem(DB_CURRENT_USER_KEY, JSON.stringify(currentUser));
}

// --- User Registration ---
async function handleRegistration(e) {
    e.preventDefault();
    
    const emptypeEl = document.querySelector('input[name="emptype"]:checked');
    const name = document.getElementById("reg-name").value.trim();
    
    const emptype = emptypeEl ? emptypeEl.value : "";
    let empId = "";
    if (emptype === "พนักงาน") {
        empId = document.getElementById("reg-empid").value.trim().toUpperCase();
        if (!empId) {
            showToast("กรุณากรอกรหัสพนักงาน", true);
            return;
        }
    }
    
    const unitEl = document.querySelector('input[name="unit"]:checked');
    let dept = unitEl ? unitEl.value : "";
    if (dept === "อื่นๆ") {
        dept = document.getElementById("reg-dept-other").value.trim();
    }
    
    if (!emptype || !name || !dept) {
        showToast("กรุณากรอกข้อมูลให้ครบถ้วน", true);
        return;
    }
    
    // Format current date and time
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const newParticipant = {
        emptype,
        empId,
        name,
        dept,
        regTime: formattedDate
    };
    
    // Check if participant already exists in logs (using normalized name for contractors, robust for older schemas)
    const normalizedRegName = normalizeName(name);
    const existingIndex = participants.findIndex(p => {
        if (empId) {
            return p.empId && p.empId.toUpperCase() === empId.toUpperCase();
        } else {
            const dbHasNoId = !p.empId || p.empId === "";
            const typeMatches = !p.emptype || p.emptype === "ลูกจ้าง";
            return dbHasNoId && typeMatches && normalizeName(p.name) === normalizedRegName;
        }
    });

    const submitBtn = document.querySelector("#register-form button[type='submit']");
    
    if (isOnlineDb) {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "กำลังลงทะเบียน...";
        }
        try {
            const response = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newParticipant)
            });
            const resData = await response.json();
            if (response.ok && resData.ok && resData.user) {
                const serverUser = resData.user;
                
                if (existingIndex === -1) {
                    participants.push(serverUser);
                } else {
                    participants[existingIndex] = serverUser;
                }
                localStorage.setItem(DB_USERS_KEY, JSON.stringify(participants));
                
                const userKey = empId || name;
                watchedLogs[userKey] = serverUser.watched || [];
                localStorage.setItem(DB_WATCHED_KEY, JSON.stringify(watchedLogs));
                
                currentUser = serverUser;
                localStorage.setItem(DB_CURRENT_USER_KEY, JSON.stringify(currentUser));
                
                showToast("ลงทะเบียนและเข้าชมสื่อออนไลน์สำเร็จ 🌱");
            } else {
                throw new Error(resData.error || "failed");
            }
        } catch (err) {
            console.error("Cloud registration failed, falling back to local:", err);
            showToast("การเชื่อมต่อระบบล้มเหลว บันทึกข้อมูลแบบออฟไลน์ชั่วคราว", true);
            localRegistrationFallback(newParticipant, existingIndex);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "ลงทะเบียน";
            }
        }
    } else {
        localRegistrationFallback(newParticipant, existingIndex);
        showToast("ลงทะเบียนเสร็จสิ้น (โหมดออฟไลน์) 🌱");
    }
    
    checkSession();
    
    // Reset register form
    document.getElementById("register-form").reset();
    
    // Reset inputs visibility
    const otherInput = document.getElementById("reg-dept-other");
    if (otherInput) {
        otherInput.classList.add("hidden");
        otherInput.required = false;
    }
    const empidGroup = document.getElementById("empid-group");
    const empidInput = document.getElementById("reg-empid");
    if (empidGroup && empidInput) {
        empidGroup.classList.remove("hidden");
        empidInput.required = true;
    }
    
}

// Switch between New Registration and Returning User Login Mode
function switchRegisterMode(mode) {
    const regForm = document.getElementById("register-form");
    const returningForm = document.getElementById("returning-user-form");
    const regNewBtn = document.getElementById("tab-reg-new-btn");
    const regReturningBtn = document.getElementById("tab-reg-returning-btn");
    
    if (mode === 'new') {
        regForm.classList.remove("hidden");
        returningForm.classList.add("hidden");
        regNewBtn.classList.add("active");
        regReturningBtn.classList.remove("active");
    } else {
        regForm.classList.add("hidden");
        returningForm.classList.remove("hidden");
        regNewBtn.classList.remove("active");
        regReturningBtn.classList.add("active");
        
        // Reset inputs when switching to returning tab
        document.getElementById("returning-user-form").reset();
        const retEmpidGroup = document.getElementById("ret-empid-group");
        const retEmpidInput = document.getElementById("ret-empid");
        if (retEmpidGroup && retEmpidInput) {
            retEmpidGroup.classList.remove("hidden");
            retEmpidInput.required = true;
        }
    }
}

// Helper for local returning user login fallback
function localReturningLoginFallback(emptype, name, empId, normalizedInputName) {
    const user = participants.find(p => {
        const nameMatches = normalizeName(p.name) === normalizedInputName;
        if (!nameMatches) return false;
        
        if (emptype === "พนักงาน") {
            return p.empId && p.empId.toUpperCase() === empId.toUpperCase();
        } else {
            const dbHasNoId = !p.empId || p.empId === "";
            const typeMatches = !p.emptype || p.emptype === "ลูกจ้าง";
            return dbHasNoId && typeMatches;
        }
    });
    
    if (user) {
        currentUser = user;
        localStorage.setItem(DB_CURRENT_USER_KEY, JSON.stringify(currentUser));
        showToast(`ยินดีต้อนรับกลับมาครับ คุณ${user.name} 🌱`);
        checkSession();
        
        document.getElementById("returning-user-form").reset();
        const retEmpidGroup = document.getElementById("ret-empid-group");
        const retEmpidInput = document.getElementById("ret-empid");
        if (retEmpidGroup && retEmpidInput) {
            retEmpidGroup.classList.remove("hidden");
            retEmpidInput.required = true;
        }
    } else {
        showToast("ไม่พบข้อมูลลงทะเบียนในระบบ กรุณาตรวจสอบหรือลงทะเบียนใหม่", true);
    }
}

// Handle Returning User quick login by credentials
async function handleReturningLogin(e) {
    e.preventDefault();
    
    const emptypeEl = document.querySelector('input[name="ret-emptype"]:checked');
    const name = document.getElementById("ret-name").value.trim();
    
    if (!emptypeEl || !name) {
        showToast("กรุณากรอกประเภทบุคลากร และชื่อ-นามสกุล", true);
        return;
    }
    
    const emptype = emptypeEl.value;
    let empId = "";
    if (emptype === "พนักงาน") {
        empId = document.getElementById("ret-empid").value.trim().toUpperCase();
        if (!empId) {
            showToast("กรุณากรอกรหัสพนักงาน", true);
            return;
        }
    }
    
    const normalizedInputName = normalizeName(name);
    const submitBtn = document.querySelector("#returning-user-form button[type='submit']");
    
    if (isOnlineDb) {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "กำลังค้นหาข้อมูล...";
        }
        try {
            const response = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ emptype, name, empId })
            });
            const resData = await response.json();
            if (response.ok && resData.ok && resData.user) {
                currentUser = resData.user;
                localStorage.setItem(DB_CURRENT_USER_KEY, JSON.stringify(currentUser));
                
                // Sync to local representation
                const userKey = currentUser.empId || currentUser.name;
                watchedLogs[userKey] = currentUser.watched || [];
                localStorage.setItem(DB_WATCHED_KEY, JSON.stringify(watchedLogs));
                
                // Add to local participants if missing
                const existingIndex = participants.findIndex(p => {
                    if (currentUser.empId) {
                        return p.empId && p.empId.toUpperCase() === currentUser.empId.toUpperCase();
                    } else {
                        const dbHasNoId = !p.empId || p.empId === "";
                        const typeMatches = !p.emptype || p.emptype === "ลูกจ้าง";
                        return dbHasNoId && typeMatches && normalizeName(p.name) === normalizedInputName;
                    }
                });
                if (existingIndex === -1) {
                    participants.push(currentUser);
                } else {
                    participants[existingIndex] = currentUser;
                }
                localStorage.setItem(DB_USERS_KEY, JSON.stringify(participants));
                
                showToast(`ยินดีต้อนรับกลับมาครับ คุณ${currentUser.name} 🌱`);
                checkSession();
                
                document.getElementById("returning-user-form").reset();
                const retEmpidGroup = document.getElementById("ret-empid-group");
                const retEmpidInput = document.getElementById("ret-empid");
                if (retEmpidGroup && retEmpidInput) {
                    retEmpidGroup.classList.remove("hidden");
                    retEmpidInput.required = true;
                }
            } else {
                throw new Error("not found");
            }
        } catch (err) {
            console.warn("Cloud login failed, checking local database:", err);
            localReturningLoginFallback(emptype, name, empId, normalizedInputName);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "ตรวจสอบสิทธิ์เข้าชม";
            }
        }
    } else {
        localReturningLoginFallback(emptype, name, empId, normalizedInputName);
    }
}

// --- User Video Lobby rendering ---
function renderUserLobby() {
    if (!currentUser) return;
    
    const userKey = currentUser.empId || currentUser.name;
    const userWatched = watchedLogs[userKey] || [];
    const totalVideos = videos.length;
    const watchedCount = userWatched.filter(id => videos.some(v => v.id === id)).length;
    
    // Update Stats panel
    document.getElementById("user-watched-count").innerText = watchedCount;
    document.getElementById("user-progress-text").innerText = `${watchedCount}/${totalVideos} คลิป`;
    
    const progressPercent = totalVideos > 0 ? (watchedCount / totalVideos) * 100 : 0;
    document.getElementById("user-progress-bar").style.width = `${progressPercent}%`;
    
    // Render grid
    const grid = document.getElementById("video-grid");
    grid.innerHTML = "";
    
    if (videos.length === 0) {
        grid.innerHTML = `
            <div class="glass-card text-center" style="grid-column: 1/-1; padding: 3rem;">
                <i data-lucide="video-off" style="width: 3.5rem; height: 3.5rem; color: var(--text-secondary); margin-bottom: 1rem;"></i>
                <h3>ขณะนี้ไม่มีคลิปวิดีโอให้บริการ</h3>
                <p class="subtitle">กรุณารอแอดมินอัปโหลดไฟล์เข้าระบบเพื่อเริ่มต้นเรียนรู้</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }
    
    videos.forEach(video => {
        const isWatched = userWatched.includes(video.id);
        const card = document.createElement("div");
        card.className = "glass-card video-card";
        card.onclick = () => playVideo(video.id);
        
        card.innerHTML = `
            <div class="video-thumbnail">
                <span class="category-badge">${video.category}</span>
                <span class="duration-tag"><i data-lucide="clock" style="width: 10px; height: 10px; display: inline; vertical-align: middle;"></i> ${video.duration}</span>
                
                <div class="thumbnail-placeholder">
                    <i data-lucide="play-circle"></i>
                    <span>รับชมคลิปวิดีโอ</span>
                </div>
                
                <div class="play-overlay">
                    <i data-lucide="play"></i>
                </div>
            </div>
            <div class="video-card-content">
                <h4 class="video-card-title">${video.title}</h4>
                <p class="video-card-desc">${video.description}</p>
                <div class="video-card-footer">
                    <div class="watched-status-pill ${isWatched ? 'watched' : ''}">
                        <i data-lucide="${isWatched ? 'check-circle' : 'circle'}"></i>
                        <span>${isWatched ? 'รับชมแล้ว' : 'ยังไม่ได้ชม'}</span>
                    </div>
                    <span style="font-size: 0.8rem; color: var(--text-secondary);">คลิกเพื่อเข้าชม <i data-lucide="chevron-right" style="width: 12px; height: 12px; display: inline; vertical-align: middle;"></i></span>
                </div>
            </div>
        `;
        
        grid.appendChild(card);
    });
    
    lucide.createIcons();
}

// --- Video Player Functions ---
function playVideo(videoId) {
    const video = videos.find(v => v.id === videoId);
    if (!video) return;
    
    currentPlayingVideo = video;
    document.getElementById("player-title").innerText = video.title;
    document.getElementById("player-desc").innerText = video.description;
    
    const embedContainer = document.getElementById("video-embed-container");
    embedContainer.innerHTML = "";
    
    // Check if there is a real URL
    if (video.url && (video.url.includes("youtube.com") || video.url.includes("youtu.be"))) {
        // Parse YouTube URL
        const ytId = getYoutubeId(video.url);
        if (ytId) {
            embedContainer.innerHTML = `
                <iframe src="https://www.youtube.com/embed/${ytId}?autoplay=1&enablejsapi=1" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowfullscreen></iframe>
            `;
        } else {
            renderSimulatedPlayer(video);
        }
    } else if (video.url && video.url.endsWith(".mp4")) {
        embedContainer.innerHTML = `
            <video controls autoplay>
                <source src="${video.url}" type="video/mp4">
                เบราว์เซอร์ของคุณไม่สนับสนุนการเล่นวิดีโอ
            </video>
        `;
    } else {
        // Fallback: Custom premium simulated video player
        renderSimulatedPlayer(video);
    }
    
    // Show Modal
    document.getElementById("video-player-modal").classList.remove("hidden");
}

function getYoutubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function renderSimulatedPlayer(video) {
    const embedContainer = document.getElementById("video-embed-container");
    
    // Parse duration text (e.g. "3:45" or "03:45") to seconds
    const durationParts = video.duration.split(":");
    let totalSeconds = 120; // Default fallback 2 mins
    if (durationParts.length === 2) {
        totalSeconds = parseInt(durationParts[0], 10) * 60 + parseInt(durationParts[1], 10);
    } else if (durationParts.length === 1) {
        totalSeconds = parseInt(durationParts[0], 10);
    }
    
    embedContainer.innerHTML = `
        <div class="sim-player-placeholder">
            <div id="sim-play-btn" class="sim-player-icon-glowing" onclick="toggleSimPlay(${totalSeconds})">
                <i data-lucide="play" id="sim-play-btn-icon"></i>
            </div>
            <h4 id="sim-status-title" style="margin-bottom: 0.5rem; text-shadow: 0 0 10px rgba(255,255,255,0.1);">เครื่องเล่นจำลอง: ยังไม่ได้เริ่มเล่น</h4>
            <p style="font-size: 0.85rem; max-width: 80%;">[ไม่มีลิงก์วิดีโอจริง] กรุณากดปุ่มเล่นเพื่อจำลองการรับชมจนจบ หรือกดยืนยันด้านล่าง</p>
            
            <div class="sim-progress-row">
                <span class="sim-time" id="sim-time-current">0:00</span>
                <div class="sim-timeline-bg" onclick="seekSimPlayer(event, ${totalSeconds})">
                    <div id="sim-timeline-fill" class="sim-timeline-fill"></div>
                </div>
                <span class="sim-time" id="sim-time-total">${video.duration}</span>
            </div>
        </div>
    `;
    
    lucide.createIcons();
    
    // State reset for sim player
    window.simPlayState = {
        isPlaying: false,
        currentTime: 0,
        totalTime: totalSeconds
    };
}

function toggleSimPlay(totalSeconds) {
    const playBtn = document.getElementById("sim-play-btn");
    const playIcon = document.getElementById("sim-play-btn-icon");
    const statusTitle = document.getElementById("sim-status-title");
    
    if (!window.simPlayState.isPlaying) {
        // Start playing
        window.simPlayState.isPlaying = true;
        playBtn.classList.add("playing");
        playIcon.setAttribute("data-lucide", "pause");
        statusTitle.innerText = "กำลังรับชมสื่อความรู้...";
        
        // Sim ticking fast (10x speed so user doesn't wait forever, e.g. ticks 2.5 seconds every 250ms)
        const tickRate = 250; // ms
        const timeJump = Math.ceil(totalSeconds / 30); // finish video in approx 7.5 seconds
        
        playSimInterval = setInterval(() => {
            window.simPlayState.currentTime += timeJump;
            if (window.simPlayState.currentTime >= totalSeconds) {
                window.simPlayState.currentTime = totalSeconds;
                clearInterval(playSimInterval);
                // Video finished
                window.simPlayState.isPlaying = false;
                playBtn.classList.remove("playing");
                playIcon.setAttribute("data-lucide", "rotate-ccw");
                statusTitle.innerHTML = "<span style='color: var(--primary);'>รับชมวิดีโอจำลองสำเร็จแล้ว! 🎉</span>";
                showToast("จำลองการรับชมวิดีโอสำเร็จ");
            }
            
            updateSimPlayerUI();
        }, tickRate);
    } else {
        // Pause playing
        window.simPlayState.isPlaying = false;
        clearInterval(playSimInterval);
        playBtn.classList.remove("playing");
        playIcon.setAttribute("data-lucide", "play");
        statusTitle.innerText = "หยุดเล่นชั่วคราว";
    }
    lucide.createIcons();
}

function seekSimPlayer(e, totalSeconds) {
    if (playSimInterval) clearInterval(playSimInterval);
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const pct = clickX / width;
    
    window.simPlayState.currentTime = Math.round(pct * totalSeconds);
    window.simPlayState.isPlaying = false;
    
    const playBtn = document.getElementById("sim-play-btn");
    const playIcon = document.getElementById("sim-play-btn-icon");
    const statusTitle = document.getElementById("sim-status-title");
    playBtn.classList.remove("playing");
    playIcon.setAttribute("data-lucide", "play");
    statusTitle.innerText = "ย้ายช่วงเวลาแล้ว - กดเพื่อเล่นต่อ";
    
    updateSimPlayerUI();
    lucide.createIcons();
}

function updateSimPlayerUI() {
    const current = window.simPlayState.currentTime;
    const total = window.simPlayState.totalTime;
    
    // Update progress bar width
    const pct = (current / total) * 100;
    document.getElementById("sim-timeline-fill").style.width = `${pct}%`;
    
    // Update format time
    document.getElementById("sim-time-current").innerText = formatSeconds(current);
}

function formatSeconds(secs) {
    const minutes = Math.floor(secs / 60);
    const seconds = secs % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function closeVideoPlayer() {
    // Stop intervals / videos
    if (playSimInterval) clearInterval(playSimInterval);
    document.getElementById("video-embed-container").innerHTML = "";
    document.getElementById("video-player-modal").classList.add("hidden");
    currentPlayingVideo = null;
}

function localWatchFallback(userKey, videoId, isNewWatch) {
    if (isNewWatch) {
        watchedLogs[userKey].push(videoId);
        localStorage.setItem(DB_WATCHED_KEY, JSON.stringify(watchedLogs));
        showToast("บันทึกการรับชมวิดีโอนี้เรียบร้อยแล้ว!");
    } else {
        showToast("คุณเคยบันทึกการรับชมวิดีโอนี้แล้ว");
    }
}

// --- Video Progress Tracker ---
async function markCurrentVideoWatched() {
    if (!currentUser || !currentPlayingVideo) return;
    
    const userKey = currentUser.empId || currentUser.name;
    const videoId = currentPlayingVideo.id;
    
    if (!watchedLogs[userKey]) {
        watchedLogs[userKey] = [];
    }
    
    const isNewWatch = !watchedLogs[userKey].includes(videoId);
    
    if (isOnlineDb) {
        try {
            const response = await fetch("/api/watched", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    emptype: currentUser.emptype,
                    name: currentUser.name,
                    empId: currentUser.empId,
                    videoId: videoId
                })
            });
            const resData = await response.json();
            if (response.ok && resData.ok && resData.user) {
                currentUser = resData.user;
                localStorage.setItem(DB_CURRENT_USER_KEY, JSON.stringify(currentUser));
                
                watchedLogs[userKey] = currentUser.watched || [];
                localStorage.setItem(DB_WATCHED_KEY, JSON.stringify(watchedLogs));
                
                if (isNewWatch) {
                    showToast("บันทึกการรับชมวิดีโอนี้เรียบร้อยแล้ว! (เชื่อมต่อคลาวด์)");
                } else {
                    showToast("คุณเคยบันทึกการรับชมวิดีโอนี้แล้ว");
                }
            } else {
                throw new Error("failed to log");
            }
        } catch (err) {
            console.error("Cloud watch log failed, falling back to local:", err);
            showToast("การบันทึกลงคลาวด์มีปัญหา บันทึกแบบออฟไลน์เรียบร้อยแล้ว", true);
            localWatchFallback(userKey, videoId, isNewWatch);
        }
    } else {
        localWatchFallback(userKey, videoId, isNewWatch);
    }
    
    closeVideoPlayer();
    renderUserLobby();
}

// --- Admin Authentication ---
function openAdminLogin() {
    document.getElementById("admin-login-modal").classList.remove("hidden");
    document.getElementById("admin-pass").focus();
}

function closeAdminLogin() {
    document.getElementById("admin-login-modal").classList.add("hidden");
    document.getElementById("admin-pass").value = "";
    document.getElementById("admin-login-error").classList.add("hidden");
}

function handleAdminLogin(e) {
    e.preventDefault();
    const pass = document.getElementById("admin-pass").value;
    
    if (pass === ADMIN_PASSWORD) {
        adminPassword = pass;
        closeAdminLogin();
        showToast("เข้าสู่โหมดแอดมินสำเร็จ");
        switchView("admin");
    } else {
        document.getElementById("admin-login-error").classList.remove("hidden");
        document.getElementById("admin-pass").focus();
    }
}

function logoutAdmin() {
    adminPassword = "";
    showToast("ออกจากโหมดผู้ดูแลระบบแล้ว");
    checkSession(); // Will return to registration or lobby depending on session
}

// Fetch participants from Vercel Blob cloud database
async function fetchOnlineParticipants() {
    if (!isOnlineDb) return;
    try {
        const response = await fetch("/api/participants", {
            method: "GET",
            headers: {
                "x-admin-password": encodeURIComponent(adminPassword)
            }
        });
        const resData = await response.json();
        if (response.ok && resData.ok) {
            participants = resData.participants || [];
            
            // Recompile local watchedLogs mapping
            watchedLogs = {};
            participants.forEach(p => {
                const userKey = p.empId || p.name;
                watchedLogs[userKey] = p.watched || [];
            });
            
            // Backup/Cache in localStorage
            localStorage.setItem(DB_USERS_KEY, JSON.stringify(participants));
            localStorage.setItem(DB_WATCHED_KEY, JSON.stringify(watchedLogs));
        } else {
            console.error("Cloud fetch failed:", resData.error);
        }
    } catch (e) {
        console.error("Error fetching online participants:", e);
    }
}

// Refresh admin dashboard wrapper with cloud loading state
async function refreshAdminDashboard() {
    const totalPText = document.getElementById("admin-total-participants");
    const totalVText = document.getElementById("admin-total-views");
    
    if (isOnlineDb) {
        if (totalPText) totalPText.innerText = "กำลังโหลด...";
        if (totalVText) totalVText.innerText = "กำลังโหลด...";
        await fetchOnlineParticipants();
    }
    renderAdminDashboard();
}

// --- Admin Dashboard logic ---
function switchAdminTab(tabName) {
    document.getElementById("tab-videos-btn").classList.remove("active");
    document.getElementById("tab-users-btn").classList.remove("active");
    document.getElementById("admin-tab-videos").classList.remove("active");
    document.getElementById("admin-tab-users").classList.remove("active");
    
    if (tabName === 'videos') {
        document.getElementById("tab-videos-btn").classList.add("active");
        document.getElementById("admin-tab-videos").classList.add("active");
    } else {
        document.getElementById("tab-users-btn").classList.add("active");
        document.getElementById("admin-tab-users").classList.add("active");
    }
}

function renderAdminDashboard() {
    // Calculate total stats
    const totalParticipants = participants.length;
    const totalVideos = videos.length;
    
    let totalViews = 0;
    Object.values(watchedLogs).forEach(arr => {
        // Only count views for videos that actually exist
        const validViews = arr.filter(vId => videos.some(v => v.id === vId)).length;
        totalViews += validViews;
    });
    
    document.getElementById("admin-total-participants").innerText = totalParticipants;
    document.getElementById("admin-total-videos").innerText = totalVideos;
    document.getElementById("admin-total-views").innerText = totalViews;
    
    // Populate affiliation breakdown stats dropdown
    const statSelect = document.getElementById("admin-stat-unit-select");
    if (statSelect && statSelect.children.length === 0) {
        let options = `<option value="ทั้งหมด">ทั้งหมด (ทุกสังกัด)</option>`;
        UNITS.forEach(u => {
            options += `<option value="${u}">${u}</option>`;
        });
        statSelect.innerHTML = options;
    }
    
    // Render Tabs content
    renderAdminVideosTable();
    renderAdminParticipantsTable();
    renderAffiliationVideoStats();
}

function renderAdminVideosTable() {
    const tbody = document.getElementById("admin-video-table-body");
    tbody.innerHTML = "";
    
    if (videos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center" style="padding: 2rem; color: var(--text-secondary);">
                    ไม่มีวิดีโอในคลังสื่อขณะนี้ กรุณาคลิกปุ่ม "เพิ่มวิดีโอใหม่"
                </td>
            </tr>
        `;
        return;
    }
    
    videos.forEach((video) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><span class="category-pill">${video.category}</span></td>
            <td><strong style="color: var(--text-primary);">${video.title}</strong></td>
            <td><span style="font-size: 0.85rem; color: var(--text-secondary); display: block; max-height: 40px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 320px;">${video.description}</span></td>
            <td>
                ${video.url ? `<a href="${video.url}" target="_blank" style="color: var(--primary); text-decoration: none; display: flex; align-items: center; gap: 0.2rem;"><i data-lucide="external-link" style="width: 12px; height: 12px;"></i> ดูลิงก์จริง</a>` : `<span style="color: var(--text-secondary); font-style: italic;">ระบบเล่นจำลอง</span>`}
            </td>
            <td style="text-align: center;">
                <div class="button-group" style="justify-content: center;">
                    <button class="btn btn-outline" style="padding: 0.35rem 0.6rem; font-size: 0.8rem; border-radius: 0.4rem;" onclick="openVideoModal('${video.id}')">
                        <i data-lucide="edit" style="width: 12px; height: 12px;"></i> แก้ไข
                    </button>
                    <button class="btn btn-danger-outline" style="padding: 0.35rem 0.6rem; font-size: 0.8rem; border-radius: 0.4rem;" onclick="deleteVideo('${video.id}')">
                        <i data-lucide="trash" style="width: 12px; height: 12px;"></i> ลบ
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    lucide.createIcons();
}

function renderAdminParticipantsTable() {
    const tbody = document.getElementById("admin-users-table-body");
    tbody.innerHTML = "";
    
    // Read selected unit filter from dropdown if present
    const statSelect = document.getElementById("admin-stat-unit-select");
    const selectedUnit = statSelect ? statSelect.value : "ทั้งหมด";
    
    // Filter participants based on selected unit (robust matching for custom inputs under "อื่นๆ")
    const filteredParticipants = participants.filter(p => {
        if (selectedUnit === "ทั้งหมด") return true;
        if (selectedUnit === "อื่นๆ") return p.dept === "อื่นๆ" || (p.dept && p.dept.startsWith("อื่นๆ:")) || !UNITS.includes(p.dept);
        return p.dept === selectedUnit;
    });
    
    if (filteredParticipants.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center" style="padding: 2rem; color: var(--text-secondary);">
                    ไม่มีข้อมูลผู้ลงทะเบียนสำหรับสังกัดนี้
                </td>
            </tr>
        `;
        return;
    }
    
    // Sort by registration time descending (newest first)
    const sortedParticipants = [...filteredParticipants].sort((a,b) => b.regTime.localeCompare(a.regTime));
    
    sortedParticipants.forEach(user => {
        const userKey = user.empId || user.name;
        const userWatched = watchedLogs[userKey] || [];
        const totalCount = videos.length;
        const watchedCount = userWatched.filter(id => videos.some(v => v.id === id)).length;
        const blobUrl = user._blobUrl || "";
        
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><span class="category-pill" style="background-color: #fff8e0; border-color: rgba(253,197,0,0.25); color: var(--yellow-d);">${user.emptype || 'พนักงาน'}</span></td>
            <td style="font-family: 'Outfit', sans-serif; font-weight: 500;">${user.empId || '-'}</td>
            <td><strong>${user.name}</strong></td>
            <td>${user.dept}</td>
            <td style="font-family: 'Outfit', sans-serif; font-size: 0.85rem; color: var(--text-secondary);">${user.regTime}</td>
            <td>
                <span class="watched-status-pill ${watchedCount === totalCount && totalCount > 0 ? 'watched' : ''}" style="cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem;" onclick="showParticipantDetails('${userKey}')" title="คลิกดูประวัติรายบุคคล">
                    <i data-lucide="${watchedCount === totalCount && totalCount > 0 ? 'trophy' : 'eye'}"></i>
                    <span>ชมแล้ว ${watchedCount}/${totalCount} คลิป</span>
                </span>
            </td>
            <td style="text-align: center;">
                <div class="button-group" style="justify-content: center; gap: 0.3rem;">
                    <button class="btn btn-outline" style="padding: 0.25rem 0.45rem; font-size: 0.75rem; border-radius: 0.35rem;" onclick="openParticipantEditModal('${userKey}')" title="แก้ไขข้อมูล">
                        <i data-lucide="edit-2" style="width: 12px; height: 12px;"></i>
                    </button>
                    <button class="btn btn-danger-outline" style="padding: 0.25rem 0.45rem; font-size: 0.75rem; border-radius: 0.35rem;" onclick="deleteParticipant('${userKey}', '${blobUrl}')" title="ลบข้อมูล">
                        <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    lucide.createIcons();
}

function renderAffiliationVideoStats() {
    const selectedUnit = document.getElementById("admin-stat-unit-select").value;
    const tbody = document.getElementById("admin-stat-video-tbody");
    if (!tbody) return;
    
    tbody.innerHTML = "";
    
    // Filter participants in this affiliation (robust matching for custom inputs under "อื่นๆ")
    const filteredUsers = participants.filter(p => {
        if (selectedUnit === "ทั้งหมด") return true;
        if (selectedUnit === "อื่นๆ") return p.dept === "อื่นๆ" || (p.dept && p.dept.startsWith("อื่นๆ:")) || !UNITS.includes(p.dept);
        return p.dept === selectedUnit;
    });
    
    if (videos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="text-center" style="padding: 1rem; color: var(--text-secondary);">
                    ไม่มีคลิปวิดีโอในระบบ
                </td>
            </tr>
        `;
        return;
    }
    
    videos.forEach(video => {
        // Count how many of these filtered participants watched this video
        let watchedCount = 0;
        filteredUsers.forEach(user => {
            const userKey = user.empId || user.name;
            const watched = watchedLogs[userKey] || [];
            if (watched.includes(video.id)) {
                watchedCount++;
            }
        });
        
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong style="color: var(--blue-d);">${video.title}</strong></td>
            <td><span class="category-pill" style="font-size: 0.75rem; padding: 0.15rem 0.4rem;">${video.category}</span></td>
            <td style="text-align: center; font-weight: 700; font-family: 'Outfit', sans-serif; color: var(--blue);">
                ${watchedCount} / ${filteredUsers.length} คน
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Synchronize the bottom participants list table with this affiliation filter
    renderAdminParticipantsTable();
}

// Show popup details of watched/unwatched videos for a specific participant
function showParticipantDetails(userKey) {
    const user = participants.find(p => (p.empId && p.empId === userKey) || (!p.empId && p.name === userKey));
    if (!user) return;
    
    const userWatched = watchedLogs[userKey] || [];
    const totalCount = videos.length;
    
    const body = document.getElementById("participant-detail-body");
    if (!body) return;
    
    body.innerHTML = `
        <div style="background-color: var(--bg-light); padding: 0.9rem; border-radius: 0.5rem; margin-bottom: 1.25rem; border: 1px solid rgba(27,76,158,0.12);">
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.6rem 0.4rem; font-size: 0.92rem; color: var(--text-primary);">
                <div><strong>ประเภทบุคลากร:</strong> ${user.emptype}</div>
                <div><strong>รหัสพนักงาน:</strong> ${user.empId || '-'}</div>
                <div style="grid-column: 1/-1;"><strong>ชื่อ - สกุล:</strong> ${user.name}</div>
                <div><strong>สังกัด:</strong> ${user.dept}</div>
                <div><strong>เวลาลงทะเบียน:</strong> ${user.regTime}</div>
            </div>
        </div>
        
        <h4 style="color: var(--blue-d); margin-bottom: 0.55rem; font-size: 0.95rem; font-weight: 700; display: flex; align-items: center; gap: 0.3rem;">
            <i data-lucide="line-chart" style="width: 16px; height: 16px; color: var(--blue);"></i>
            ความคืบหน้าการรับชม (${userWatched.length}/${totalCount} คลิป)
        </h4>
        
        <div style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem; padding-right: 4px;">
            ${videos.length === 0 ? `
                <div style="text-align: center; color: var(--text-secondary); font-size: 0.9rem; padding: 1rem 0;">
                    ไม่มีคลิปวิดีโอในระบบ
                </div>
            ` : videos.map(video => {
                const isWatched = userWatched.includes(video.id);
                return `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.55rem 0.75rem; background-color: ${isWatched ? 'rgba(74,222,128,0.06)' : 'rgba(239,68,68,0.04)'}; border: 1px solid ${isWatched ? 'rgba(74,222,128,0.2)' : 'rgba(239,68,68,0.15)'}; border-radius: 0.4rem;">
                        <div style="font-size: 0.88rem; font-weight: 600; color: var(--text-primary); text-align: left; flex: 1; padding-right: 0.5rem; line-height: 1.35;">
                            ${video.title}
                        </div>
                        <div style="flex-shrink: 0;">
                            ${isWatched 
                                ? `<span style="color: var(--success); font-weight: 700; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.2rem;"><i data-lucide="check-circle" style="width:14px; height:14px;"></i> ชมแล้ว</span>` 
                                : `<span style="color: var(--red); font-weight: 700; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.2rem;"><i data-lucide="x-circle" style="width:14px; height:14px;"></i> ยังไม่ชม</span>`
                            }
                        </div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
    
    // Show Modal
    document.getElementById("participant-detail-modal").classList.remove("hidden");
    lucide.createIcons();
}

function closeParticipantDetailModal() {
    document.getElementById("participant-detail-modal").classList.add("hidden");
    document.getElementById("participant-detail-body").innerHTML = "";
}

// --- CRUD: Add / Edit Videos ---
function openVideoModal(videoId = "") {
    const modal = document.getElementById("video-edit-modal");
    const form = document.getElementById("video-form");
    const modalTitle = document.getElementById("video-modal-title");
    
    form.reset();
    
    if (videoId) {
        // Edit Mode
        const video = videos.find(v => v.id === videoId);
        if (!video) return;
        
        modalTitle.innerText = "แก้ไขข้อมูลคลิปวิดีโอ";
        document.getElementById("video-id").value = video.id;
        document.getElementById("video-category").value = video.category;
        document.getElementById("video-title").value = video.title;
        document.getElementById("video-description").value = video.description;
        document.getElementById("video-url").value = video.url;
        document.getElementById("video-duration").value = video.duration;
    } else {
        // Add Mode
        modalTitle.innerText = "เพิ่มวิดีโอการเรียนรู้ใหม่";
        document.getElementById("video-id").value = "";
    }
    
    modal.classList.remove("hidden");
}

function closeVideoModal() {
    document.getElementById("video-edit-modal").classList.add("hidden");
    document.getElementById("video-form").reset();
}

function handleVideoSave(e) {
    e.preventDefault();
    
    const id = document.getElementById("video-id").value;
    const category = document.getElementById("video-category").value;
    const title = document.getElementById("video-title").value.trim();
    const description = document.getElementById("video-description").value.trim();
    const url = document.getElementById("video-url").value.trim();
    const duration = document.getElementById("video-duration").value.trim();
    
    if (!title || !description || !duration) {
        showToast("กรุณากรอกข้อมูลวิดีโอที่จำเป็นให้ครบถ้วน", true);
        return;
    }
    
    if (id) {
        // Update Video
        const index = videos.findIndex(v => v.id === id);
        if (index !== -1) {
            videos[index] = { id, category, title, description, url, duration };
            showToast("แก้ไขข้อมูลคลิปวิดีโอสำเร็จแล้ว");
        }
    } else {
        // Create Video
        const newId = `vid-${Date.now()}`;
        const newVideo = { id: newId, category, title, description, url, duration };
        videos.push(newVideo);
        showToast("เพิ่มคลิปวิดีโอการเรียนรู้เข้าระบบสำเร็จ");
    }
    
    localStorage.setItem(DB_VIDEOS_KEY, JSON.stringify(videos));
    closeVideoModal();
    renderAdminDashboard();
}

function deleteVideo(videoId) {
    if (confirm("คุณแน่ใจหรือไม่ว่าต้องการลบคลิปวิดีโอนี้? การดำเนินการนี้ไม่สามารถย้อนกลับได้")) {
        videos = videos.filter(v => v.id !== videoId);
        localStorage.setItem(DB_VIDEOS_KEY, JSON.stringify(videos));
        showToast("ลบคลิปวิดีโอเรียบร้อยแล้ว");
        renderAdminDashboard();
    }
}

// --- Clear Participant Logs ---
async function clearAllParticipants() {
    if (confirm("⚠️ คำเตือน! คุณแน่ใจที่จะลบประวัติการลงทะเบียนทั้งหมดใช่หรือไม่? ข้อมูลนี้จะหายไปอย่างถาวร")) {
        if (isOnlineDb) {
            try {
                const response = await fetch("/api/clear-participants", {
                    method: "POST",
                    headers: {
                        "x-admin-password": encodeURIComponent(adminPassword)
                    }
                });
                const resData = await response.json();
                if (!response.ok || !resData.ok) {
                    throw new Error(resData.error || "failed");
                }
            } catch (err) {
                console.error("Cloud clear failed:", err);
                showToast("ไม่สามารถล้างข้อมูลในคลาวด์ได้เนื่องจากการเชื่อมต่อขัดข้อง", true);
                return;
            }
        }
        
        participants = [];
        watchedLogs = {};
        localStorage.setItem(DB_USERS_KEY, JSON.stringify(participants));
        localStorage.setItem(DB_WATCHED_KEY, JSON.stringify(watchedLogs));
        showToast("ล้างประวัติผู้เข้าร่วมกิจกรรมทั้งหมดแล้ว");
        renderAdminDashboard();
    }
}

// --- Export Participants Data to CSV ---
function exportParticipantsToCSV() {
    if (participants.length === 0) {
        showToast("ไม่มีข้อมูลผู้ลงทะเบียนสำหรับส่งออก", true);
        return;
    }
    
    // Header Row in Thai
    let csvContent = "ประเภทบุคลากร,รหัสพนักงาน,ชื่อ - สกุล,สังกัด,วันเวลาลงทะเบียน,จำนวนวิดีโอที่ดูเสร็จสิ้น,สถานะการชมคลังสื่อทั้งหมด\n";
    
    participants.forEach(user => {
        const userWatched = watchedLogs[user.empId] || [];
        const totalCount = videos.length;
        const watchedCount = userWatched.filter(id => videos.some(v => v.id === id)).length;
        const statusText = (watchedCount === totalCount && totalCount > 0) ? "รับชมครบถ้วน" : "กำลังรับชม";
        
        // Escape commas and double quotes for clean CSV
        const safeName = `"${user.name.replace(/"/g, '""')}"`;
        const safeDept = `"${user.dept.replace(/"/g, '""')}"`;
        const typeText = user.emptype || "พนักงาน";
        
        csvContent += `${typeText},${user.empId},${safeName},${safeDept},${user.regTime},${watchedCount}/${totalCount},${statusText}\n`;
    });
    
    // Add UTF-8 BOM byte sequence (EF BB BF) so Microsoft Excel opens it with proper Thai characters encoding
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `EnergySave_Participants_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast("ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว 📊");
}

// --- Delete Single Participant ---
async function deleteParticipant(userKey, blobUrl) {
    if (confirm("คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลผู้เข้าร่วมรายการนี้? การดำเนินการนี้ไม่สามารถย้อนกลับได้")) {
        if (isOnlineDb) {
            if (blobUrl) {
                try {
                    const response = await fetch("/api/delete-participant", {
                        method: "DELETE",
                        headers: {
                            "Content-Type": "application/json",
                            "x-admin-password": encodeURIComponent(adminPassword)
                        },
                        body: JSON.stringify({ url: blobUrl })
                    });
                    const resData = await response.json();
                    if (!response.ok || !resData.ok) {
                        throw new Error(resData.error || "failed to delete");
                    }
                } catch (err) {
                    console.error("Cloud delete failed:", err);
                    showToast("ไม่สามารถลบข้อมูลบนระบบคลาวด์ได้เนื่องจากการเชื่อมต่อขัดข้อง", true);
                    return;
                }
            }
        }
        
        // Remove locally
        participants = participants.filter(p => (p.empId || p.name) !== userKey);
        delete watchedLogs[userKey];
        
        localStorage.setItem(DB_USERS_KEY, JSON.stringify(participants));
        localStorage.setItem(DB_WATCHED_KEY, JSON.stringify(watchedLogs));
        
        if (currentUser && (currentUser.empId || currentUser.name) === userKey) {
            localStorage.removeItem(DB_CURRENT_USER_KEY);
            currentUser = null;
        }
        
        showToast("ลบข้อมูลผู้เข้าร่วมกิจกรรมเรียบร้อยแล้ว");
        refreshAdminDashboard();
    }
}

// --- Edit Participant Modal Controls ---
function openParticipantEditModal(userKey) {
    const user = participants.find(p => (p.empId || p.name) === userKey);
    if (!user) return;
    
    document.getElementById("edit-p-key").value = userKey;
    
    // Set Staff Type radio
    if (user.emptype === "ลูกจ้าง") {
        document.getElementById("edit-emptype-temp").checked = true;
        document.getElementById("edit-empid-group").classList.add("hidden");
        document.getElementById("edit-empid").required = false;
        document.getElementById("edit-empid").value = "";
    } else {
        document.getElementById("edit-emptype-emp").checked = true;
        document.getElementById("edit-empid-group").classList.remove("hidden");
        document.getElementById("edit-empid").required = true;
        document.getElementById("edit-empid").value = user.empId || "";
    }
    
    document.getElementById("edit-name").value = user.name || "";
    
    // Populate dropdown
    const editDeptSelect = document.getElementById("edit-dept");
    if (editDeptSelect) {
        let options = "";
        UNITS.forEach(u => {
            options += `<option value="${u}">${u}</option>`;
        });
        editDeptSelect.innerHTML = options;
        
        const isCustomDept = !UNITS.includes(user.dept);
        const otherGroup = document.getElementById("edit-dept-other-group");
        const otherInput = document.getElementById("edit-dept-other");
        
        if (isCustomDept) {
            editDeptSelect.value = "อื่นๆ";
            otherGroup.classList.remove("hidden");
            otherInput.required = true;
            otherInput.value = user.dept || "";
        } else {
            editDeptSelect.value = user.dept || "อื่นๆ";
            otherGroup.classList.add("hidden");
            otherInput.required = false;
            otherInput.value = "";
        }
    }
    
    document.getElementById("participant-edit-modal").classList.remove("hidden");
}

function closeParticipantEditModal() {
    document.getElementById("participant-edit-modal").classList.add("hidden");
    document.getElementById("participant-edit-form").reset();
}

async function handleParticipantEditSave(e) {
    e.preventDefault();
    
    const oldUserKey = document.getElementById("edit-p-key").value;
    const originalUser = participants.find(p => (p.empId || p.name) === oldUserKey);
    if (!originalUser) return;
    
    const emptype = document.querySelector('input[name="edit-emptype"]:checked').value;
    let empId = "";
    if (emptype === "พนักงาน") {
        empId = document.getElementById("edit-empid").value.trim().toUpperCase();
        if (!empId) {
            showToast("กรุณากรอกรหัสพนักงาน", true);
            return;
        }
    }
    
    const name = document.getElementById("edit-name").value.trim();
    let dept = document.getElementById("edit-dept").value;
    if (dept === "อื่นๆ") {
        dept = document.getElementById("edit-dept-other").value.trim();
    }
    
    if (!name || !dept) {
        showToast("กรุณากรอกข้อมูลให้ครบถ้วน", true);
        return;
    }
    
    const updatedUser = {
        emptype,
        empId,
        name,
        dept,
        regTime: originalUser.regTime,
        watched: originalUser.watched || []
    };
    
    const newUserKey = empId || name;
    const keyChanged = oldUserKey !== newUserKey;
    
    const submitBtn = document.querySelector("#participant-edit-form button[type='submit']");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "กำลังบันทึก...";
    }
    
    if (isOnlineDb) {
        try {
            if (keyChanged && originalUser._blobUrl) {
                await fetch("/api/delete-participant", {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json",
                        "x-admin-password": encodeURIComponent(adminPassword)
                    },
                    body: JSON.stringify({ url: originalUser._blobUrl })
                }).catch(err => console.error("Clean old record failed:", err));
            }
            
            const response = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedUser)
            });
            const resData = await response.json();
            if (response.ok && resData.ok && resData.user) {
                const serverUser = resData.user;
                
                const index = participants.findIndex(p => (p.empId || p.name) === oldUserKey);
                if (index !== -1) {
                    participants[index] = serverUser;
                }
                
                if (keyChanged) {
                    delete watchedLogs[oldUserKey];
                }
                watchedLogs[newUserKey] = serverUser.watched || [];
                
                localStorage.setItem(DB_USERS_KEY, JSON.stringify(participants));
                localStorage.setItem(DB_WATCHED_KEY, JSON.stringify(watchedLogs));
                
                if (currentUser && (currentUser.empId || currentUser.name) === oldUserKey) {
                    currentUser = serverUser;
                    localStorage.setItem(DB_CURRENT_USER_KEY, JSON.stringify(currentUser));
                }
                
                showToast("แก้ไขข้อมูลผู้ลงทะเบียนสำเร็จ 🌱");
                closeParticipantEditModal();
                refreshAdminDashboard();
            } else {
                throw new Error(resData.error || "failed");
            }
        } catch (err) {
            console.error("Cloud edit failed, falling back to local:", err);
            showToast("การเชื่อมต่อฐานข้อมูลล้มเหลว แก้ไขข้อมูลออฟไลน์เรียบร้อยแล้ว", true);
            localEditFallback(oldUserKey, newUserKey, keyChanged, updatedUser);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "บันทึกการแก้ไข";
            }
        }
    } else {
        localEditFallback(oldUserKey, newUserKey, keyChanged, updatedUser);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "บันทึกการแก้ไข";
        }
    }
}

function localEditFallback(oldUserKey, newUserKey, keyChanged, updatedUser) {
    const index = participants.findIndex(p => (p.empId || p.name) === oldUserKey);
    if (index !== -1) {
        participants[index] = updatedUser;
    }
    
    if (keyChanged) {
        delete watchedLogs[oldUserKey];
    }
    watchedLogs[newUserKey] = updatedUser.watched || [];
    
    localStorage.setItem(DB_USERS_KEY, JSON.stringify(participants));
    localStorage.setItem(DB_WATCHED_KEY, JSON.stringify(watchedLogs));
    
    if (currentUser && (currentUser.empId || currentUser.name) === oldUserKey) {
        currentUser = updatedUser;
        localStorage.setItem(DB_CURRENT_USER_KEY, JSON.stringify(currentUser));
    }
    
    showToast("แก้ไขข้อมูลสำเร็จ (โหมดออฟไลน์) 🌱");
    closeParticipantEditModal();
    refreshAdminDashboard();
}
