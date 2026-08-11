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
        category: "ไฟฟ้า",
        title: "เทคนิคประหยัดไฟในออฟฟิศ 🔌",
        description: "เรียนรู้วิธีตั้งค่าการประหยัดพลังงานคอมพิวเตอร์ การปิดหน้าจอช่วงพักเที่ยง และการจัดการระบบสแตนด์บายของเครื่องใช้ไฟฟ้าอย่างถูกวิธี",
        url: "", // Leave blank for simulation
        duration: "3:45"
    },
    {
        id: "vid-2",
        category: "ไฟฟ้า",
        title: "ปรับอุณหภูมิแอร์ เพิ่มประสิทธิภาพการประหยัดแอร์ 🌱",
        description: "การปรับอุณหภูมิเครื่องปรับอากาศเป็น 26 องศาเซลเซียส พร้อมเปิดพัดลมควบคู่ ช่วยลดภาระการทำงานของแอร์และประหยัดค่าไฟลงได้มากกว่า 10%",
        url: "https://www.youtube.com/watch?v=kYJUp5WwFik", // Sample Youtube Video (clean energy / energy saving themed)
        duration: "5:20"
    },
    {
        id: "vid-3",
        category: "น้ำ",
        title: "หยดน้ำเล็กๆ ที่หายไป: รณรงค์การประหยัดน้ำในองค์กร 💧",
        description: "ชี้ให้เห็นถึงความสูญเสียจากอุปกรณ์ห้องน้ำที่ชำรุด วิธีแจ้งซ่อมอย่างรวดเร็ว และการใช้น้ำอย่างคุ้มค่าในจุดล้างจานและห้องน้ำส่วนกลาง",
        url: "",
        duration: "2:15"
    },
    {
        id: "vid-4",
        category: "กระดาษ/ขยะ",
        title: "ก้าวสู่ Paperless Office ด้วยกระดาษ 2 หน้า 📄",
        description: "แนวทางการทำงานแบบดิจิทัลเพื่อลดปริมาณการพิมพ์เอกสาร และการคัดแยกเศษกระดาษเพื่อนำมารีไซเคิลอย่างสร้างสรรค์เพื่อลดการทำลายทรัพยากรป่าไม้",
        url: "",
        duration: "4:05"
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
    "EMP001": ["vid-1", "vid-3"],
    "นางสาวสมหญิง ประหยัดดี": ["vid-1", "vid-2", "vid-3", "vid-4"]
};

// --- App State ---
let videos = [];
let participants = [];
let watchedLogs = {};
let currentUser = null;
let currentPlayingVideo = null;
let playSimInterval = null;

const UNITS = ["สก.ชธธ.","อบค.","อบฟ.","อบย.","อรอ.","อคม.","อหข.","อื่นๆ"];

// --- Initialize App ---
document.addEventListener("DOMContentLoaded", () => {
    initDatabase();
    checkSession();
    renderUserLobby();
    
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

    // Admin login overlay backdrop click close
    document.getElementById("admin-login-modal").addEventListener("click", (e) => {
        if (e.target.id === "admin-login-modal") closeAdminLogin();
    });
});

// Seed data storage if empty
function initDatabase() {
    // Database Versioning / Force Reset for default videos
    const DB_VERSION = "v1.3";
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
        
        renderAdminDashboard();
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

// --- User Registration ---
function handleRegistration(e) {
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
    
    // Check if participant already exists in logs (using normalized name for contractors)
    const normalizedRegName = normalizeName(name);
    const existingIndex = participants.findIndex(p => 
        (empId && p.empId === empId) || (!empId && normalizeName(p.name) === normalizedRegName && p.emptype === "ลูกจ้าง")
    );
    
    if (existingIndex === -1) {
        // Add new participant
        participants.push(newParticipant);
        localStorage.setItem(DB_USERS_KEY, JSON.stringify(participants));
    } else {
        // Update existing participant details
        participants[existingIndex] = newParticipant;
        localStorage.setItem(DB_USERS_KEY, JSON.stringify(participants));
    }
    
    // Unique log key is empId if exists, otherwise their Name
    const userKey = empId || name;
    
    // Initialize empty watched logs for this user if not exist
    if (!watchedLogs[userKey]) {
        watchedLogs[userKey] = [];
        localStorage.setItem(DB_WATCHED_KEY, JSON.stringify(watchedLogs));
    }
    
    // Set Current Session
    currentUser = newParticipant;
    localStorage.setItem(DB_CURRENT_USER_KEY, JSON.stringify(currentUser));
    
    showToast("ลงทะเบียนและเข้าชมสื่อได้สำเร็จ 🌱");
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

// Handle Returning User quick login by credentials
function handleReturningLogin(e) {
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
    
    // Normalize input name for comparison
    const normalizedInputName = normalizeName(name);

    // Find user in local database matching exactly (ignores Thai prefixes and double spaces)
    const user = participants.find(p => 
        p.emptype === emptype &&
        normalizeName(p.name) === normalizedInputName &&
        (emptype === "ลูกจ้าง" || (p.empId && p.empId === empId))
    );
    
    if (user) {
        currentUser = user;
        localStorage.setItem(DB_CURRENT_USER_KEY, JSON.stringify(currentUser));
        showToast(`ยินดีต้อนรับกลับมาครับ คุณ${user.name} 🌱`);
        checkSession();
        
        // Reset returning form
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

function markCurrentVideoWatched() {
    if (!currentUser || !currentPlayingVideo) return;
    
    const userKey = currentUser.empId || currentUser.name;
    const videoId = currentPlayingVideo.id;
    
    if (!watchedLogs[userKey]) {
        watchedLogs[userKey] = [];
    }
    
    if (!watchedLogs[userKey].includes(videoId)) {
        watchedLogs[userKey].push(videoId);
        localStorage.setItem(DB_WATCHED_KEY, JSON.stringify(watchedLogs));
        showToast("บันทึกการรับชมวิดีโอนี้เรียบร้อยแล้ว!");
    } else {
        showToast("คุณเคยบันทึกการรับชมวิดีโอนี้แล้ว");
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
        closeAdminLogin();
        showToast("เข้าสู่โหมดแอดมินสำเร็จ");
        switchView("admin");
    } else {
        document.getElementById("admin-login-error").classList.remove("hidden");
        document.getElementById("admin-pass").focus();
    }
}

function logoutAdmin() {
    showToast("ออกจากโหมดผู้ดูแลระบบแล้ว");
    checkSession(); // Will return to registration or lobby depending on session
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
        if (selectedUnit === "อื่นๆ") return p.dept === "อื่นๆ" || (p.dept && p.dept.startsWith("อื่นๆ:"));
        return p.dept === selectedUnit;
    });
    
    if (filteredParticipants.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center" style="padding: 2rem; color: var(--text-secondary);">
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
        if (selectedUnit === "อื่นๆ") return p.dept === "อื่นๆ" || (p.dept && p.dept.startsWith("อื่นๆ:"));
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
function clearAllParticipants() {
    if (confirm("⚠️ คำเตือน! คุณแน่ใจที่จะลบประวัติการลงทะเบียนทั้งหมดใช่หรือไม่? ข้อมูลนี้จะหายไปอย่างถาวร")) {
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
