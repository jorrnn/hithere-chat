const $ = (selector) => document.querySelector(selector);
const state = { user: null, mode: "login", conversations: [], activeId: null, activeUser: null, socket: null, online: new Set(), replyingTo: null };
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();
async function api(url, options = {}) {
  const response = await fetch(url, { credentials:"same-origin", headers:{ "Content-Type":"application/json", ...(options.headers||{}) }, ...options });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
let toastTimer;
function toast(message) { const el=$("#toast"); el.textContent=message; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2600); }
function showAuth(mode="login") {
  state.mode=mode;
  $("#authView").classList.remove("hidden"); $("#appView").classList.add("hidden");
  const signup=mode==="register";
  $("#authEyebrow").textContent=signup?"YOUR NEXT CHAPTER":"WELCOME BACK";
  $("#authTitle").textContent=signup?"Create your account":"Sign in";
  $("#authSubtitle").textContent=signup?"A little space for the people who matter.":"Pick up right where you left off.";
  $("#nameField").classList.toggle("hidden",!signup);
  $("#usernameField").classList.toggle("hidden",!signup);
  $("#emailLabel").textContent=signup?"Email address":"Email or username";
  $("#loginEmail").placeholder=signup?"you@example.com":"you@example.com";
  $("#authSubmit").innerHTML=signup?'Create account <span>→</span>':'Sign in <span>→</span>';
  $("#switchText").innerHTML=signup?'Already have an account? <button id="switchAuth" type="button">Sign in</button>':'New to HiThere? <button id="switchAuth" type="button">Create an account</button>';
  $("#switchAuth").addEventListener("click",()=>showAuth(signup?"login":"register"));
  $("#authError").textContent="";
}
$("#authForm").addEventListener("submit", async (event)=>{
  event.preventDefault(); $("#authError").textContent="";
  const signup=state.mode==="register";
  const body=signup?{
    displayName:$("#displayName").value, username:$("#username").value,
    email:$("#loginEmail").value, password:$("#password").value
  }:{ login:$("#loginEmail").value, password:$("#password").value };
  try {
    const result=await api(`/api/auth/${signup?"register":"login"}`,{method:"POST",body:JSON.stringify(body)});
    await enterApp(result.user);
  } catch(err) { $("#authError").textContent=err.message; }
});

async function enterApp(user) {
  state.user = user;

  $("#authView").classList.add("hidden");
  $("#appView").classList.remove("hidden");

  $("#myName").textContent = user.displayName;
  $("#myHandle").textContent = "@" + user.username;
  $("#myAvatar").textContent = initials(user.displayName);
  $("#myAvatar").style.background = user.avatarColor;

  state.socket = io();

  state.socket.on("presence:list", userIds => {
    state.online = new Set(userIds.map(Number));
    renderConversations();
    renderOnlinePeople();

    if (state.activeUser) {
      renderActiveHeader();
      renderDetails();
    }
  });

  state.socket.on("connect_error", () => {
    toast("Live connection interrupted. Refresh if messages stop updating.");
  });

  
state.socket.on("message:new", message => {
  const conversationId = Number(message.conversation_id);
  const isActiveConversation =
    conversationId === Number(state.activeId);

  const isOwnMessage =
    Number(message.sender_id) === Number(state.user.id);

  // Update the conversation preview and move it to the top.
  const conversation = state.conversations.find(
    c => Number(c.id) === conversationId
  );

  if (conversation) {
    conversation.last_message = message.body;
    conversation.last_message_at =
      message.created_at || new Date().toISOString();

    // Count unread messages only when the conversation is not open.
    if (!isOwnMessage && !isActiveConversation) {
      conversation.unread_count =
        Number(conversation.unread_count || 0) + 1;
    }

    state.conversations.sort((a, b) =>
      new Date(b.last_message_at || 0) -
      new Date(a.last_message_at || 0)
    );

    renderConversations();
  }

  if (isActiveConversation) {
    appendMessage(message);
  }

  if (!isOwnMessage) {
    state.socket.emit("message:delivered", {
      messageId: message.id
    });

    if (isActiveConversation && !document.hidden) {
      state.socket.emit("message:read", {
        messageId: message.id
      });
    }

    if (!notificationPreferences.notificationsEnabled) return;
    if (isActiveConversation && !document.hidden) return;

    if ("Notification" in window &&
        Notification.permission === "granted") {
      new Notification(message.sender_name || "New message", {
        body: message.body,
        icon: "/favicon.ico"
      });
    }

    if (notificationPreferences.notificationSound) {
      const audio = new Audio("/notification.mp3");
      audio.play().catch(() => {});
    }
  }
});

  state.socket.on("conversation:updated", () => {
    loadConversations();
  });

  state.socket.on("presence:update", event => {
    const userId = Number(event.userId);

    if (event.online === true) {
      state.online.add(userId);
    } else {
      state.online.delete(userId);
    }

    renderConversations();
    renderOnlinePeople();

    if (
      state.activeUser &&
      Number(state.activeUser.id) === userId
    ) {
      renderActiveHeader();
      renderDetails();
    }
  });

  await loadConversations();

  // Load the three settings using one request.
  try {
    const data = await api("/api/settings");
    const settings = data.settings;

    const theme = settings.theme || "light";
    const wallpaper = settings.wallpaper || "default";

    $("#settingsTheme").value = theme;
    $("#settingsWallpaper").value = wallpaper;
    applyAppearance(theme, wallpaper);

    notificationPreferences = {
      notificationsEnabled: settings.notifications_enabled,
      notificationSound: settings.notification_sound
    };

    $("#settingsNotifications").checked =
      notificationPreferences.notificationsEnabled;

    $("#settingsSound").checked =
      notificationPreferences.notificationSound;

    $("#settingsOnlineStatus").checked =
      settings.show_online_status;

  } catch (error) {
    console.error("Could not load user settings:", error);
  }
}

async function loadConversations() {
  const data=await api("/api/conversations"); 
  state.conversations=data.conversations;

  renderConversations();
  renderOnlinePeople();

  if(state.activeId && !state.conversations.some(c=>Number(c.id)===Number(state.activeId))) {
    state.activeId=null; state.activeUser=null; $("#messagePanel").classList.add("hidden"); $("#welcomePanel").classList.remove("hidden");
  }
}
function conversationName(c) { return c.is_group?c.title:(c.other_user?.displayName || "Conversation"); }

function renderConversations() {
  const query = $("#chatSearch").value.trim().toLowerCase();

  const items = state.conversations.filter(c =>
    conversationName(c).toLowerCase().includes(query) ||
    (c.other_user?.username || "").includes(query)
  );

  $("#conversationList").innerHTML = items.length
    ? items.map(c => {
        const u = c.other_user || {};
        const name = conversationName(c);
        const online = u.id && !c.is_group && isUserOnline(u.id);
        const unread = Number(c.unread_count || 0);

        return `
          <div class="conversation-item ${Number(c.id) === Number(state.activeId) ? "active" : ""} ${unread > 0 ? "unread" : ""}" data-id="${c.id}">
            <div class="avatar-presence">
              <div class="avatar" style="background:${escapeHtml(u.avatarColor || "#7868e6")}">
                ${escapeHtml(initials(name))}
              </div>

              ${u.id && !c.is_group
                ? `<span class="presence-dot ${online ? "online" : "offline"}"></span>`
                : ""}
            </div>

            <div class="conversation-meta">
              <strong>${escapeHtml(name)}</strong>
              <small>${escapeHtml(c.last_message || "Say hello 👋")}</small>
            </div>

            ${unread > 0
              ? `<span class="unread-badge">${unread > 99 ? "99+" : unread}</span>`
              : ""}
          </div>
        `;
      }).join("")
    : '<div class="empty-side">No conversations yet. Start one with the + button.</div>';

  document.querySelectorAll(".conversation-item").forEach(el => {
    el.addEventListener("click", () =>
      openConversation(Number(el.dataset.id))
    );
  });
}

function isUserOnline(userId) {
  return state.online.has(Number(userId));
}

function renderOnlinePeople() {
  const container = $("#onlinePeople");
  const count = $("#onlineCount");

  if (!container || !count) return;

  const people = new Map();

  state.conversations.forEach(c => {
    const user = c.other_user;

    if (user && user.id && !c.is_group && isUserOnline(user.id)) {
      people.set(Number(user.id), {
        user,
        conversationId: c.id
      });
    }
  });

  const onlinePeople = [...people.values()];
  count.textContent = onlinePeople.length;

  if (!onlinePeople.length) {
    container.innerHTML =
      '<div class="online-empty">No one online right now</div>';
    return;
  }

  container.innerHTML = onlinePeople.map(({ user, conversationId }) => `
    <div class="online-person" data-conversation-id="${conversationId}">
      <div class="online-avatar-wrap">
        <div class="online-avatar" style="display:flex;align-items:center;justify-content:center;color:white;font-weight:700;background:${escapeHtml(user.avatarColor || "#eee9ff")}">
          ${escapeHtml(initials(user.displayName))}
        </div>
        <span class="online-dot"></span>
      </div>
      <span class="online-person-name">
        ${escapeHtml(user.displayName.split(" ")[0])}
      </span>
    </div>
  `).join("");

  container.querySelectorAll(".online-person").forEach(person => {
    person.addEventListener("click", () => {
      openConversation(Number(person.dataset.conversationId));
    });
  });
}

function renderOnlinePeople() {
  const container = $("#onlinePeople");
  const count = $("#onlineCount");

  if (!container || !count) return;

  // Get unique people from existing conversations.
  const people = new Map();

  state.conversations.forEach(c => {
    const user = c.other_user;

    if (
      user &&
      user.id &&
      !c.is_group &&
      isUserOnline(user.id)
    ) {
      people.set(Number(user.id), {
        user,
        conversationId: c.id
      });
    }
  });

  const onlinePeople = [...people.values()];

  count.textContent = onlinePeople.length;

  if (!onlinePeople.length) {
    container.innerHTML =
      '<div class="online-empty">No one online right now</div>';
    return;
  }

  container.innerHTML = onlinePeople.map(({ user, conversationId }) => `
    <div class="online-person" data-conversation-id="${conversationId}" title="${escapeHtml(user.displayName)}">
      <div class="online-avatar-wrap">
        <div class="online-avatar" style="background:${escapeHtml(user.avatarColor || "#eee9ff")}; display:flex; align-items:center; justify-content:center; color:white; font-weight:700;">
          ${escapeHtml(initials(user.displayName))}
        </div>
        <span class="online-dot"></span>
      </div>
      <span class="online-person-name">
        ${escapeHtml(user.displayName.split(" ")[0])}
      </span>
    </div>
  `).join("");

  container.querySelectorAll(".online-person").forEach(person => {
    person.addEventListener("click", () => {
      openConversation(Number(person.dataset.conversationId));
    });
  });
}


function renderActiveHeader() {
  const user = state.activeUser;
  const conversation = state.conversations.find(
    c => Number(c.id) === Number(state.activeId)
  );

  if (!conversation) return;

  const name = conversationName(conversation);
  const online = user && !conversation.is_group && isUserOnline(user.id);

  $("#activeChatHead").innerHTML = `
    <div class="avatar-presence">
      <div class="avatar" style="background:${escapeHtml(user?.avatarColor || "#7868e6")}">
        ${escapeHtml(initials(name))}
      </div>
      ${user && !conversation.is_group
        ? `<span class="presence-dot ${online ? "online" : "offline"}"></span>`
        : ""}
    </div>
    <div class="chat-user-info">
      <strong>${escapeHtml(name)}</strong>
      <small class="${user && !conversation.is_group ? (online ? "online-text" : "offline-text") : ""}">
        ${user && !conversation.is_group ? (online ? "Online" : "Offline") : "Group conversation"}
      </small>
    </div>
  `;
}

async function openConversation(id) {
  const c=state.conversations.find(x=>Number(x.id)===id); if(!c)return;
  state.activeId=id; 
  $(".app-shell")?.classList.add("chat-open");
  $("#appView").classList.add("chat-open");
  state.activeUser=c.other_user||null;
  $("#welcomePanel").classList.add("hidden"); $("#messagePanel").classList.remove("hidden");
  renderActiveHeader();
  renderConversations(); renderDetails();
  state.socket.emit("conversation:join",id);
  const data=await api(`/api/conversations/${id}/messages`);
  if(state.activeId!==id)return;
  $("#messages").innerHTML="";
 
data.messages.forEach(message => {
  appendMessage(message);

  // Mark messages from other users as read.
  if (Number(message.sender_id) !== Number(state.user.id)) {
    state.socket.emit("message:read", {
      messageId: message.id
    });
  }
});

// Clear the unread badge immediately.
c.unread_count = 0;
renderConversations();


$("#messages").scrollTop = $("#messages").scrollHeight;
  $("#messageInput").focus();
}
function appendMessage(message) {
  if (Number(message.conversation_id) !== Number(state.activeId)) return;
  if (document.querySelector(`[data-message-id="${message.id}"]`)) return;

  const mine = Number(message.sender_id) === Number(state.user.id);
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  let receipt = "";

  if (mine) {
    const recipients = Number(message.recipient_count || 0);
    const delivered = Number(message.delivered_count || 0);
    const read = Number(message.read_count || 0);

    if (recipients > 0 && read === recipients) {
      receipt = '<span class="message-receipt read" title="Read">✓✓</span>';
    } else if (recipients > 0 && delivered === recipients) {
      receipt = '<span class="message-receipt delivered" title="Delivered">✓✓</span>';
    } else {
      receipt = '<span class="message-receipt sent" title="Sent">✓</span>';
    }
  }

  const el = document.createElement("div");
  el.className = `message ${mine ? "mine" : ""}`;
  el.dataset.messageId = message.id;

  el.innerHTML = `
  ${message.reply_body ? `
    <div class="reply-quote">
      <strong>${escapeHtml(message.reply_sender_name || "User")}</strong>
      <span>${escapeHtml(message.reply_body)}</span>
    </div>
  ` : ""}

  <div class="message-bubble">${escapeHtml(message.body)}</div>

  <button class="reply-message-btn" type="button">
    Reply
  </button>

  <span class="message-time">
      ${mine ? "You" : escapeHtml(message.sender_name || "")} · ${time}
      ${receipt}
    </span>
  `;

  $("#messages").appendChild(el);
  el.querySelector(".reply-message-btn").addEventListener("click", () => {
  state.replyingTo = message;

$("#replyPreviewName").textContent =
  `Replying to ${message.sender_name || "User"}`;

$("#replyPreviewText").textContent = message.body;

$("#replyPreview").style.display = "flex";

$("#messageInput").placeholder = "Write your reply...";

$("#messageInput").focus();
});
  $("#messages").scrollTop = $("#messages").scrollHeight;
}

$("#cancelReplyBtn").addEventListener("click", () => {
  state.replyingTo = null;

  $("#replyPreview").style.display = "none";
  $("#messageInput").placeholder = "Write a message...";
});

$("#messageForm").addEventListener("submit",event=>{
  event.preventDefault(); const body=$("#messageInput").value.trim();
  if(!body||!state.activeId)return;
  state.socket.emit("message:send", {
  conversationId: state.activeId,
  body,
  replyToId: state.replyingTo?.id || null
}, result => {
  if (!result?.ok) {
    toast(result?.error || "Message could not be sent.");
    return;
  }

  $("#messageInput").value = "";
  state.replyingTo = null;
$("#replyPreview").style.display = "none";
$("#messageInput").placeholder = "Write a message...";
});
});
function renderDetails() {
  const u=state.activeUser; const c=state.conversations.find(x=>Number(x.id)===Number(state.activeId));
  if(!u||!c){ $("#detailsContent").innerHTML='<div class="detail-placeholder">Your conversation details will appear here.</div>';return; }
  const online = isUserOnline(u.id);

$("#detailsContent").innerHTML = `
  <div class="avatar detail-avatar" style="background:${escapeHtml(u.avatarColor)}">
    ${escapeHtml(initials(u.displayName))}
  </div>
  <h3>${escapeHtml(u.displayName)}</h3>
  <p>@${escapeHtml(u.username)}</p>
  <p class="online-label ${online ? "online-text" : "offline-text"}">
    <span class="presence-dot ${online ? "online" : "offline"}"></span>
    ${online ? "Online" : "Offline"}
  </p>
`;
}
function openModal() { $("#searchModal").classList.remove("hidden"); $("#userSearch").value=""; $("#userResults").innerHTML='<p class="search-prompt">Type at least 2 characters to find people.</p>'; $("#userSearch").focus(); }
function closeModal() { $("#searchModal").classList.add("hidden"); }
$("#newChatBtn").addEventListener("click",openModal); $("#welcomeNewChat").addEventListener("click",openModal);
$("#closeModal").addEventListener("click",closeModal); $("#searchModal").addEventListener("click",e=>{if(e.target.dataset.close)closeModal();});
$("#closeDetails").addEventListener("click",()=>$("#detailsPanel").classList.add("hidden"));
$("#detailsBtn").addEventListener("click",()=>$("#detailsPanel").classList.toggle("hidden"));
$("#chatSearch").addEventListener("input",renderConversations);
let searchDelay;
$("#userSearch").addEventListener("input",()=>{
  clearTimeout(searchDelay); const q=$("#userSearch").value.trim();
  if(q.length<2){$("#userResults").innerHTML='<p class="search-prompt">Type at least 2 characters to find people.</p>';return;}
  searchDelay=setTimeout(async()=>{
    try{
      const data=await api(`/api/users/search?q=${encodeURIComponent(q)}`);
      $("#userResults").innerHTML=data.users.length?data.users.map(u=>`<div class="user-result"><div class="avatar" style="background:${escapeHtml(u.avatarColor)}">${escapeHtml(initials(u.displayName))}</div><div class="user-result-info"><strong>${escapeHtml(u.displayName)}</strong><small>@${escapeHtml(u.username)}</small></div><button data-user-id="${u.id}">Message</button></div>`).join(""):'<p class="search-prompt">No people found. Try another name.</p>';
      document.querySelectorAll("[data-user-id]").forEach(btn=>btn.addEventListener("click",async()=>{
        try{const result=await api("/api/conversations",{method:"POST",body:JSON.stringify({userId:Number(btn.dataset.userId)})});closeModal();await loadConversations();await openConversation(result.conversationId);}
        catch(err){toast(err.message);}
      }));
    }catch(err){toast(err.message);}
  },250);
});
$("#logoutBtn").addEventListener("click",async()=>{
  try{await api("/api/auth/logout",{method:"POST"});}catch(e){}
  if(state.socket)state.socket.disconnect(); state.socket=null; state.user=null; state.activeId=null; showAuth("login");
});
(async()=>{
  showAuth("login");
  try{const data=await api("/api/me");if(data.user)await enterApp(data.user);}catch(err){console.error(err);}
})();


// Mobile bottom navigation
$("#navChats")?.addEventListener("click", () => {
  $("#conversationList")?.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });

  document.querySelectorAll(".bottom-nav-item")
    .forEach(item => item.classList.remove("active"));

  $("#navChats")?.classList.add("active");
});

$("#navSearch")?.addEventListener("click", () => {
  $("#chatSearch")?.focus();

  document.querySelectorAll(".bottom-nav-item")
    .forEach(item => item.classList.remove("active"));

  $("#navSearch")?.classList.add("active");
});

$("#navNewChat")?.addEventListener("click", () => {
  $("#newChatBtn")?.click();

  document.querySelectorAll(".bottom-nav-item")
    .forEach(item => item.classList.remove("active"));

  $("#navNewChat")?.classList.add("active");
});


$("#backToChats")?.addEventListener("click", () => {
  // Return to the conversations screen.
  $("#appView")?.classList.remove("chat-open");

  // Clear the active conversation.
  state.activeId = null;
  state.activeUser = null;

  // Show the welcome screen.
  $("#messagePanel")?.classList.add("hidden");
  $("#welcomePanel")?.classList.remove("hidden");

  // Refresh the conversation list.
  renderConversations();
});



// ========================================
// HITHERE SETTINGS NAVIGATION
// ========================================

const settingsView = $("#settingsView");

function openSettings() {
  if (!settingsView) return;

  settingsView.classList.remove("hidden");

  // Fill in the current user's profile
  if (state.user) {
    $("#settingsDisplayName").value = state.user.displayName || "";
    $("#settingsUsername").value = state.user.username || "";
    $("#settingsProfileName").textContent = state.user.displayName || "Your name";
    $("#settingsProfileHandle").textContent = "@" + (state.user.username || "username");

    $("#settingsAvatar").textContent = initials(state.user.displayName);
    $("#settingsAvatar").style.background = state.user.avatarColor || "#7868e6";

    $("#settingsAvatarColor").value = state.user.avatarColor || "#7868e6";
  }

  document.querySelectorAll(".bottom-nav-item")
    .forEach(item => item.classList.remove("active"));

  $("#navSettings")?.classList.add("active");
}

function closeSettings() {
  settingsView?.classList.add("hidden");

  document.querySelectorAll(".bottom-nav-item")
    .forEach(item => item.classList.remove("active"));

  $("#navChats")?.classList.add("active");
}

// Desktop settings button
$("#settingsBtn")?.addEventListener("click", openSettings);

// Mobile settings button
$("#navSettings")?.addEventListener("click", openSettings);

// Close settings
$("#closeSettings")?.addEventListener("click", closeSettings);


// ========================================
// SETTINGS SECTION NAVIGATION
// ========================================

document.querySelectorAll(".settings-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const section = tab.dataset.setting;

    document.querySelectorAll(".settings-tab")
      .forEach(item => item.classList.remove("active"));

    document.querySelectorAll(".settings-panel")
      .forEach(panel => panel.classList.remove("active"));

    tab.classList.add("active");

    const selectedPanel = $("#setting-" + section);

    if (selectedPanel) {
      selectedPanel.classList.add("active");
    }
  });
});


// ========================================
// PROFILE PREVIEW
// ========================================

$("#settingsDisplayName")?.addEventListener("input", event => {
  $("#settingsProfileName").textContent =
    event.target.value.trim() || "Your name";

  $("#settingsAvatar").textContent =
    initials(event.target.value);
});

$("#settingsUsername")?.addEventListener("input", event => {
  $("#settingsProfileHandle").textContent =
    "@" + event.target.value.trim();
});

$("#settingsAvatarColor")?.addEventListener("change", event => {
  $("#settingsAvatar").style.background = event.target.value;
});


// ========================================
// PASSWORD FORM VISIBILITY
// ========================================

$("#openPasswordForm")?.addEventListener("click", () => {
  const form = $("#passwordSettingsForm");

  form?.classList.toggle("hidden");

  if (!form?.classList.contains("hidden")) {
    $("#currentPassword")?.focus();
  }
});

// ========================================
// SAVE PROFILE SETTINGS
// ========================================

const profileForm = $("#profileSettingsForm");

profileForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = $("#profileSettingsMessage");

  const profile = {
    displayName: $("#settingsDisplayName").value.trim(),
    username: $("#settingsUsername").value.trim().toLowerCase(),
    avatarColor: $("#settingsAvatarColor").value
  };

  try {
    message.textContent = "Saving your profile...";

    const result = await api("/api/profile", {
      method: "PUT",
      body: JSON.stringify(profile)
    });

    // Update the current user
    state.user = result.user;

    // Update the sidebar profile
    $("#myName").textContent = result.user.displayName;
    $("#myHandle").textContent = "@" + result.user.username;
    $("#myAvatar").textContent = initials(result.user.displayName);
    $("#myAvatar").style.background = result.user.avatarColor;

    // Update the settings preview
    $("#settingsProfileName").textContent = result.user.displayName;
    $("#settingsProfileHandle").textContent = "@" + result.user.username;
    $("#settingsAvatar").textContent = initials(result.user.displayName);
    $("#settingsAvatar").style.background = result.user.avatarColor;

    message.textContent = "Profile updated successfully!";
    toast("Your profile has been updated.");

  } catch (error) {
    message.textContent = error.message;
    toast(error.message);
  }
});

// ========================================
// HITHERE APPEARANCE SETTINGS
// ========================================

function applyAppearance(theme, wallpaper) {
  // Apply theme
  document.body.classList.toggle("dark-mode", theme === "dark");

  // Apply chat wallpaper
  const messages = $("#messages");

  if (messages) {
    messages.classList.remove(
      "wallpaper-default",
      "wallpaper-lavender",
      "wallpaper-cream",
      "wallpaper-mint"
    );

    messages.classList.add(`wallpaper-${wallpaper}`);
  }
}


// Load saved appearance preferences
async function loadAppearanceSettings() {
  try {
    const data = await api("/api/settings");
    const settings = data.settings;

    const theme = settings.theme || "light";
    const wallpaper = settings.wallpaper || "default";

    $("#settingsTheme").value = theme;
    $("#settingsWallpaper").value = wallpaper;

    applyAppearance(theme, wallpaper);

  } catch (error) {
    console.error("Could not load appearance settings:", error);
  }
}


// Save appearance preferences
async function saveAppearanceSettings() {
  const theme = $("#settingsTheme").value;
  const wallpaper = $("#settingsWallpaper").value;

  applyAppearance(theme, wallpaper);

  try {
    await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ theme, wallpaper })
    });

    toast("Appearance settings saved.");

  } catch (error) {
    toast(error.message);
  }
}


// Listen for theme changes
$("#settingsTheme")?.addEventListener("change", saveAppearanceSettings);


// Listen for wallpaper changes
$("#settingsWallpaper")?.addEventListener("change", saveAppearanceSettings);


// ========================================
// HITHERE NOTIFICATION SETTINGS
// ========================================

let notificationPreferences = {
  notificationsEnabled: true,
  notificationSound: true
};

async function loadNotificationSettings() {
  try {
    const data = await api("/api/settings");
    const settings = data.settings;
    if (
      settings.notifications_enabled &&
      "Notification" in window &&
      Notification.permission === "default"
) {
      await Notification.requestPermission();
}

    notificationPreferences = {
      notificationsEnabled: settings.notifications_enabled,
      notificationSound: settings.notification_sound
    };

    $("#settingsNotifications").checked =
      notificationPreferences.notificationsEnabled;

    $("#settingsSound").checked =
      notificationPreferences.notificationSound;

  } catch (error) {
    console.error("Could not load notification settings:", error);
  }
}

async function saveNotificationSettings() {
  const notificationsEnabled = $("#settingsNotifications").checked;
  const notificationSound = $("#settingsSound").checked;

  try {
    await api("/api/settings/notifications", {
      method: "PUT",
      body: JSON.stringify({
        notificationsEnabled,
        notificationSound
      })
    });

    notificationPreferences = {
      notificationsEnabled,
      notificationSound
    };

    if (
      notificationsEnabled &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      await Notification.requestPermission();
    }

    toast("Notification settings saved.");

  } catch (error) {
    toast(error.message);
  }
}
$("#settingsNotifications")?.addEventListener(
  "change",
  saveNotificationSettings
);

$("#settingsSound")?.addEventListener(
  "change",
  saveNotificationSettings
);

// LOAD PRIVACY SETTINGS
async function loadPrivacySettings() {
  try {
    const data = await api("/api/settings");
    $("#settingsOnlineStatus").checked =
      data.settings.show_online_status;
  } catch (error) {
    console.error("Could not load privacy settings:", error);
  }
}

// SAVE PRIVACY SETTINGS
async function savePrivacySettings() {
  const showOnlineStatus = $("#settingsOnlineStatus").checked;

  try {
    await api("/api/settings/privacy", {
      method: "PUT",
      body: JSON.stringify({ showOnlineStatus })
    });

    toast("Privacy settings saved.");
  } catch (error) {
    toast(error.message);
  }
}

$("#settingsOnlineStatus")?.addEventListener(
  "change",
  savePrivacySettings
);

// CHANGE PASSWORD
$("#passwordSettingsForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const currentPassword = $("#currentPassword").value;
  const newPassword = $("#newPassword").value;
  const confirmPassword = $("#confirmPassword").value;
  const message = $("#passwordSettingsMessage");

  message.textContent = "";

  try {
    const data = await api("/api/settings/password", {
      method: "PUT",
      body: JSON.stringify({
        currentPassword,
        newPassword,
        confirmPassword
      })
    });

    message.textContent = data.message;
    message.style.color = "green";

    $("#passwordSettingsForm").reset();

    toast("Password changed successfully.");

  } catch (error) {
    message.textContent = error.message;
    message.style.color = "#d64545";
  }
});