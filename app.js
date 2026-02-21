
// ====================== CODEXX - FULL app.js ======================

const firebaseConfig = {
  apiKey: "AIzaSyAgO51F_N7FMy8apY-DsTamCPjZc7--3GQ",
  authDomain: "codexx-6f22d.firebaseapp.com",
  projectId: "codexx-6f22d",
  storageBucket: "codexx-6f22d.firebasestorage.app",
  messagingSenderId: "727460200642",
  appId: "1:727460200642:web:da3e5ab7e703a1bc493b5b"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let currentChatId = null;
let currentHTML = "";

// DEFAULT MODEL
const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

// ====================== AUTHENTICATION ======================
function initAuth() {
  auth.onAuthStateChanged(async (user) => {
    const appWrapper = document.getElementById("app-wrapper");
    const loginModal = document.getElementById("login-modal");

    if (user) {
      currentUser = user;
      
      // Hide login, show app
      if (loginModal) loginModal.classList.add("hidden");
      if (appWrapper) appWrapper.style.display = "flex";
      
      // Update UI with user email and initial
      document.getElementById("user-email").textContent = user.email || "User";
      document.getElementById("user-initial").textContent = user.email ? user.email.charAt(0).toUpperCase() : "U";

      await loadChatHistory(); 
    } else {
      currentUser = null;
      if (appWrapper) appWrapper.style.display = "none";
      if (loginModal) {
        loginModal.classList.remove("hidden");
        loginModal.classList.add("flex"); // Restores the flex layout for centering
      }
    }
  });
}

// Error handling helper
function handleAuthError(error) {
  const errorBox = document.getElementById("auth-error");
  errorBox.textContent = error.message;
  errorBox.classList.remove("hidden");
}

function hideAuthError() {
  const errorBox = document.getElementById("auth-error");
  errorBox.classList.add("hidden");
}

window.loginEmail = function() {
  hideAuthError();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) return handleAuthError({ message: "Please enter an email and password." });
  
  auth.signInWithEmailAndPassword(email, password).catch(handleAuthError);
};

window.signUpEmail = function() {
  hideAuthError();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) return handleAuthError({ message: "Please enter an email and password." });
  
  auth.createUserWithEmailAndPassword(email, password).catch(handleAuthError);
};

window.googleSignIn = function() {
  hideAuthError();
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(handleAuthError);
};

window.logout = function() {
  auth.signOut();
  currentChatId = null;
};

// ====================== UI & LAYOUT HELPERS ======================
window.toggleSidebar = function() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  if(sidebar.classList.contains('-translate-x-full')) {
    sidebar.classList.remove('-translate-x-full');
    overlay.classList.remove('hidden');
  } else {
    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
  }
};

window.switchTab = function(tabIndex) {
  // Switch Tab styling
  for(let i = 0; i < 3; i++) {
    const tabBtn = document.getElementById(`tab-${i}`);
    if (tabBtn) {
      if(i === tabIndex) tabBtn.classList.add('active', 'text-white', 'border-b-2', 'border-violet-500');
      else tabBtn.classList.remove('active', 'text-white', 'border-b-2', 'border-violet-500');
    }
    
    // Switch Panels
    const panel = document.getElementById(`panel-${i}`);
    if (panel) {
      if(i === tabIndex) {
        panel.classList.remove('hidden');
        panel.classList.add('flex');
      } else {
        panel.classList.add('hidden');
        panel.classList.remove('flex');
      }
    }
  }
};

window.copyCode = function() {
  if(!currentHTML) return alert("No code generated yet to copy!");
  navigator.clipboard.writeText(currentHTML).then(() => {
    alert("Code copied to clipboard!");
  });
};

window.downloadCode = function() {
  if(!currentHTML) return alert("No code generated yet to download!");
  const blob = new Blob([currentHTML], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "index.html";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ====================== MODEL SETTINGS ======================
window.showSettings = function() {
  document.getElementById("settings-modal").classList.remove("hidden");
  document.getElementById("settings-modal").classList.add("flex");
  const savedModel = localStorage.getItem("codexx_model") || DEFAULT_MODEL;
  document.getElementById("model-select").value = savedModel;
};

window.closeSettings = function() {
  // Save before closing
  const selectedModel = document.getElementById("model-select").value;
  localStorage.setItem("codexx_model", selectedModel);
  
  // Hide modal
  document.getElementById("settings-modal").classList.add("hidden");
  document.getElementById("settings-modal").classList.remove("flex");
};

// ====================== CHAT LOGIC ======================
window.sendMessage = async function() {
  const input = document.getElementById("user-input");
  const text = input.value.trim();
  const sendBtn = document.getElementById("send-btn");

  if (!text) return;

  const selectedModel = localStorage.getItem("codexx_model") || DEFAULT_MODEL;

  if (!currentChatId) {
    await window.newChat();
    if (!currentChatId) return;
  }

  const chatRef = db.collection(`users/${currentUser.uid}/chats`).doc(currentChatId);
  let docSnap = await chatRef.get();
  let chatData = docSnap.exists ? docSnap.data() : { messages: [] };
  
  if (!chatData.messages) chatData.messages = [];

  // Add user message
  chatData.messages.push({ role: "user", content: text });
  
  // Update Title if it's the first message
  if (chatData.messages.length === 1) {
    chatData.title = text.substring(0, 30) + (text.length > 30 ? "..." : "");
  }
  
  await chatRef.set({ 
    messages: chatData.messages,
    title: chatData.title || "New Chat",
    timestamp: chatData.timestamp || Date.now()
  }, { merge: true });

  input.value = "";
  if (sendBtn) sendBtn.disabled = true;

  // Optimistic UI Render
  renderMessages(chatData.messages);
  await loadChatHistory(); 

  try {
    const res = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: chatData.messages,
        model: selectedModel
      })
    });

    if (!res.ok) throw new Error("API Route Failed");

    const data = await res.json();
    const aiText = data.content;

    chatData.messages.push({ role: "assistant", content: aiText });
    await chatRef.update({ messages: chatData.messages });

    renderMessages(chatData.messages);
    extractAndSetCode(aiText);

  } catch (err) {
    console.error(err);
    alert("AI Error. Check OpenRouter key or Netlify function.");
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
};

async function loadChatHistory() {
  if (!currentUser) return;
  
  // FIXED: Changed ID to match HTML ("history-list")
  const historyContainer = document.getElementById("history-list");
  if (!historyContainer) return; 

  const snapshot = await db.collection(`users/${currentUser.uid}/chats`)
    .orderBy("timestamp", "desc")
    .get();

  historyContainer.innerHTML = "";

  snapshot.forEach(doc => {
    const chat = doc.data();
    const div = document.createElement("div");
    div.className = `cursor-pointer p-3 rounded-2xl mb-2 text-sm truncate transition-colors ${doc.id === currentChatId ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`;
    div.innerHTML = `<i class="fas fa-message mr-2"></i> ${chat.title || "New Chat"}`;
    div.onclick = () => selectChat(doc.id, chat);
    historyContainer.appendChild(div);
  });
}

window.selectChat = function(chatId, chatData) {
  currentChatId = chatId;
  renderMessages(chatData.messages || []);
  
  // Find the last AI message to render the code
  if (chatData.messages && chatData.messages.length > 0) {
    const lastAiMsg = [...chatData.messages].reverse().find(m => m.role === 'assistant');
    if (lastAiMsg) extractAndSetCode(lastAiMsg.content);
  } else {
    document.getElementById("preview-iframe").srcdoc = "";
    document.getElementById("code-content").textContent = "";
  }
  
  // Close mobile sidebar after selecting chat
  if(window.innerWidth < 768) {
    window.toggleSidebar();
  }
  
  loadChatHistory(); 
};

window.newChat = async function() {
  currentChatId = db.collection(`users/${currentUser.uid}/chats`).doc().id;
  await db.collection(`users/${currentUser.uid}/chats`)
    .doc(currentChatId)
    .set({
      title: "New Chat",
      timestamp: Date.now(),
      messages: []
    });

  renderMessages([]);
  
  const iframe = document.getElementById("preview-iframe");
  const codeEl = document.getElementById("code-content");
  if (iframe) iframe.srcdoc = "";
  if (codeEl) {
    codeEl.textContent = "";
    currentHTML = "";
  }
  
  // Close mobile sidebar after new chat
  if(window.innerWidth < 768) {
    window.toggleSidebar();
  }
  
  await loadChatHistory(); 
};

// ====================== RENDER & PARSE ======================
function renderMessages(msgs) {
  const container = document.getElementById("messages");
  if (!container) return;
  
  container.innerHTML = "";

  msgs.forEach(m => {
    const div = document.createElement("div");
    div.className = `flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`;
    
    if(m.role === 'user') {
      div.innerHTML = `
        <div class="bg-violet-600 text-white px-5 py-4 rounded-3xl rounded-tr-sm max-w-[85%] md:max-w-[75%] shadow-md break-words">
          ${escapeHTML(m.content)}
        </div>
      `;
    } else {
      div.innerHTML = `
        <div class="bg-zinc-800 text-zinc-100 px-5 py-4 rounded-3xl rounded-tl-sm max-w-[95%] md:max-w-[85%] shadow-md whitespace-pre-wrap">
          ${escapeHTML(m.content)}
        </div>
      `;
    }
    container.appendChild(div);
  });

  container.scrollTop = container.scrollHeight;
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function extractAndSetCode(text) {
  const match = text.match(/```html\s*([\s\S]*?)\s*```/i);
  if (match) {
    currentHTML = match[1].trim();
    
    const iframe = document.getElementById("preview-iframe");
    if (iframe) iframe.srcdoc = currentHTML;

    const codeEl = document.getElementById("code-content");
    if (codeEl) {
      codeEl.textContent = currentHTML;
      if (window.Prism) Prism.highlightElement(codeEl);
    }
  }
}

// ====================== EVENT LISTENERS ======================
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("user-input");
  if (input) {
    input.addEventListener("keypress", function(event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault(); 
        window.sendMessage();
      }
    });
  }
});

// ====================== START ======================
initAuth();
