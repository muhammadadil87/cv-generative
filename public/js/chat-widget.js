/**
 * Student CV Builder & Admin Portal - Live Chat Widget
 * Accessible before and after login across all pages.
 */
(function() {
    // Generate or retrieve persistent visitor session ID
    let sessionId = localStorage.getItem('cv_portal_chat_session');
    if (!sessionId) {
        sessionId = 'sess_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        localStorage.setItem('cv_portal_chat_session', sessionId);
    }

    let visitorName = localStorage.getItem('cv_chat_user_name') || '';
    let visitorEmail = localStorage.getItem('cv_chat_user_email') || '';
    let isChatOpen = false;
    let pollInterval = null;
    let lastRenderedCount = 0;

    // Check if user is logged in via Auth helper
    function getLoggedInUser() {
        try {
            if (window.Auth && typeof window.Auth.getUser === 'function') {
                const u = window.Auth.getUser();
                if (u && u.name) return u;
            }
            const localU = localStorage.getItem('cv_user');
            if (localU) return JSON.parse(localU);
        } catch (e) {}
        return null;
    }

    const currentUser = getLoggedInUser();
    if (currentUser) {
        visitorName = currentUser.name;
        visitorEmail = currentUser.email;
    }

    // Inject Widget HTML
    const widgetContainer = document.createElement('div');
    widgetContainer.id = 'cv-live-chat-root';
    widgetContainer.className = 'fixed bottom-5 right-5 z-50 flex flex-col items-end font-sans';
    widgetContainer.innerHTML = `
        <!-- Chat Window Panel -->
        <div id="cv-chat-window" class="hidden mb-3 w-[360px] sm:w-[390px] max-w-[calc(100vw-30px)] h-[540px] max-h-[calc(100vh-100px)] bg-white rounded-2xl shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden transition-all transform origin-bottom-right duration-200">
            <!-- Header -->
            <div class="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 text-white p-4 flex items-center justify-between shadow-sm flex-shrink-0">
                <div class="flex items-center space-x-3">
                    <div class="relative w-10 h-10 rounded-full overflow-hidden border-2 border-white/80 shadow-inner flex-shrink-0 bg-indigo-200">
                        <img src="/images/creator-profile.jpg" alt="Muhammad Adil" class="w-full h-full object-cover object-top" onerror="this.src='https://ui-avatars.com/api/?name=Muhammad+Adil&background=4f46e5&color=fff'">
                        <span class="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-white rounded-full"></span>
                    </div>
                    <div>
                        <h4 class="font-bold text-sm leading-tight flex items-center gap-1.5">
                            Muhammad Adil
                            <span class="text-[9px] bg-white/20 px-1.5 py-0.5 rounded-full font-medium">Admin</span>
                        </h4>
                        <p class="text-[11px] text-indigo-100/90 flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                            Online & Ready to Help
                        </p>
                    </div>
                </div>
                <div class="flex items-center space-x-1">
                    <button id="cv-chat-refresh" title="Refresh messages" class="w-8 h-8 rounded-lg hover:bg-white/10 text-white/80 hover:text-white flex items-center justify-center transition">
                        <i class="fa-solid fa-arrows-rotate text-xs"></i>
                    </button>
                    <button id="cv-chat-close" title="Close chat" class="w-8 h-8 rounded-lg hover:bg-white/10 text-white/80 hover:text-white flex items-center justify-center transition">
                        <i class="fa-solid fa-xmark text-sm"></i>
                    </button>
                </div>
            </div>

            <!-- Pre-chat Identity Banner (only if visitor is not identified) -->
            <div id="cv-chat-identity-box" class="${(visitorName && visitorEmail) ? 'hidden' : ''} bg-indigo-50/90 border-b border-indigo-100 p-3 flex-shrink-0">
                <p class="text-[11px] font-semibold text-indigo-900 mb-2">👋 Welcome! Enter your details to start chatting:</p>
                <div class="space-y-1.5">
                    <input type="text" id="cv-visitor-name" placeholder="Your Name" value="${escapeHtml(visitorName)}" class="w-full px-2.5 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    <input type="email" id="cv-visitor-email" placeholder="Your Email (for notification replies)" value="${escapeHtml(visitorEmail)}" class="w-full px-2.5 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                </div>
            </div>

            <!-- Messages Conversation Stage -->
            <div id="cv-chat-messages" class="flex-1 p-3.5 overflow-y-auto space-y-3 bg-slate-50 text-xs">
                <!-- Welcome greeting -->
                <div class="flex items-start space-x-2">
                    <img src="/images/creator-profile.jpg" class="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5 border border-slate-200" onerror="this.src='https://ui-avatars.com/api/?name=Muhammad+Adil&background=4f46e5&color=fff'">
                    <div class="bg-white border border-slate-200 text-slate-800 p-3 rounded-2xl rounded-tl-sm shadow-xs max-w-[85%]">
                        <p class="font-bold text-[11px] text-indigo-600 mb-1">Muhammad Adil (Creator)</p>
                        <p class="leading-relaxed">Assalam-o-Alaikum! 👋 How can I help you with your CV, university format, or portal account today?</p>
                        <span class="block text-[9px] text-slate-400 mt-1.5">Just now</span>
                    </div>
                </div>
            </div>

            <!-- Input Box & Actions -->
            <form id="cv-chat-form" class="p-3 bg-white border-t border-slate-200 flex items-center space-x-2 flex-shrink-0">
                <input type="text" id="cv-chat-input" placeholder="Type your message..." autocomplete="off" required
                    class="flex-1 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition">
                <button type="submit" id="cv-chat-send-btn" class="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white flex items-center justify-center shadow-md hover:shadow-indigo-200 transition flex-shrink-0">
                    <i class="fa-solid fa-paper-plane text-xs"></i>
                </button>
            </form>
        </div>

        <!-- Floating Chat Bubble Trigger Button -->
        <button id="cv-chat-trigger" class="group relative flex items-center gap-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-4 py-3 rounded-full shadow-xl hover:shadow-indigo-300 transition-all transform hover:-translate-y-0.5 active:scale-95">
            <span class="relative flex h-3 w-3">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div class="w-7 h-7 rounded-full overflow-hidden border border-white/60 -ml-1">
                <img src="/images/creator-profile.jpg" alt="Muhammad Adil" class="w-full h-full object-cover object-top" onerror="this.src='https://ui-avatars.com/api/?name=Muhammad+Adil&background=4f46e5&color=fff'">
            </div>
            <span class="font-bold text-xs tracking-wide">Live Chat</span>
            <span id="cv-chat-badge" class="hidden px-1.5 py-0.2 bg-red-500 text-white text-[10px] font-extrabold rounded-full">1</span>
        </button>
    `;

    document.body.appendChild(widgetContainer);

    // Elements
    const chatWindow = document.getElementById('cv-chat-window');
    const chatTrigger = document.getElementById('cv-chat-trigger');
    const chatClose = document.getElementById('cv-chat-close');
    const chatRefresh = document.getElementById('cv-chat-refresh');
    const chatForm = document.getElementById('cv-chat-form');
    const chatInput = document.getElementById('cv-chat-input');
    const messagesStage = document.getElementById('cv-chat-messages');
    const identityBox = document.getElementById('cv-chat-identity-box');
    const inputName = document.getElementById('cv-visitor-name');
    const inputEmail = document.getElementById('cv-visitor-email');
    const chatBadge = document.getElementById('cv-chat-badge');

    function toggleChat(open) {
        isChatOpen = (typeof open === 'boolean') ? open : !isChatOpen;
        if (isChatOpen) {
            chatWindow.classList.remove('hidden');
            chatTrigger.classList.add('scale-95', 'opacity-90');
            chatBadge.classList.add('hidden');
            chatBadge.innerText = '0';
            fetchMessages();
            startPolling();
            setTimeout(() => chatInput.focus(), 150);
        } else {
            chatWindow.classList.add('hidden');
            chatTrigger.classList.remove('scale-95', 'opacity-90');
            stopPolling();
        }
    }

    chatTrigger.addEventListener('click', () => toggleChat());
    chatClose.addEventListener('click', () => toggleChat(false));
    chatRefresh.addEventListener('click', () => fetchMessages());

    // Send Message
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;

        // Ensure name and email
        let finalName = visitorName;
        let finalEmail = visitorEmail;
        if (!finalName && inputName) finalName = inputName.value.trim();
        if (!finalEmail && inputEmail) finalEmail = inputEmail.value.trim();

        if (!finalName) finalName = 'Student Visitor';
        if (!finalEmail) finalEmail = 'visitor@student.portal';

        // Persist locally
        visitorName = finalName;
        visitorEmail = finalEmail;
        localStorage.setItem('cv_chat_user_name', visitorName);
        localStorage.setItem('cv_chat_user_email', visitorEmail);
        if (identityBox) identityBox.classList.add('hidden');

        // Optimistic UI Append
        chatInput.value = '';
        appendMessageUI({
            sender_type: 'student',
            sender_name: 'You',
            message: text,
            created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

        try {
            const u = getLoggedInUser();
            const res = await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    name: visitorName,
                    email: visitorEmail,
                    message: text,
                    user_id: u ? u.id : null
                })
            });

            const data = await res.json();
            if (!res.ok) {
                console.error('Chat send error:', data.error);
            } else {
                fetchMessages();
            }
        } catch (err) {
            console.error('Network error sending chat:', err);
        }
    });

    // Fetch Messages
    async function fetchMessages() {
        try {
            const res = await fetch(`/api/chat/messages/${encodeURIComponent(sessionId)}`);
            const data = await res.json();
            if (data.success && data.messages) {
                renderMessages(data.messages);
            }
        } catch (err) {
            console.error('Error fetching chat messages:', err);
        }
    }

    function renderMessages(messages) {
        if (!messagesStage) return;

        // If count has changed or unread admin message arrived
        if (messages.length > lastRenderedCount && !isChatOpen) {
            const unreadAdmin = messages.slice(lastRenderedCount).filter(m => m.sender_type === 'admin');
            if (unreadAdmin.length > 0) {
                chatBadge.innerText = String(unreadAdmin.length);
                chatBadge.classList.remove('hidden');
            }
        }

        lastRenderedCount = messages.length;

        // Render welcoming banner plus all DB messages
        let html = `
            <div class="flex items-start space-x-2">
                <img src="/images/creator-profile.jpg" class="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5 border border-slate-200" onerror="this.src='https://ui-avatars.com/api/?name=Muhammad+Adil&background=4f46e5&color=fff'">
                <div class="bg-white border border-slate-200 text-slate-800 p-3 rounded-2xl rounded-tl-sm shadow-xs max-w-[85%]">
                    <p class="font-bold text-[11px] text-indigo-600 mb-1">Muhammad Adil (Creator)</p>
                    <p class="leading-relaxed">Assalam-o-Alaikum! 👋 How can I help you with your CV, university format, or portal account today?</p>
                    <span class="block text-[9px] text-slate-400 mt-1.5">Support Desk</span>
                </div>
            </div>
        `;

        messages.forEach(m => {
            const isStudent = (m.sender_type === 'student');
            const timeStr = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

            if (isStudent) {
                html += `
                    <div class="flex items-end justify-end space-x-2">
                        <div class="bg-indigo-600 text-white p-3 rounded-2xl rounded-tr-sm shadow-xs max-w-[85%]">
                            <p class="leading-relaxed whitespace-pre-wrap">${escapeHtml(m.message)}</p>
                            <span class="block text-[9px] text-indigo-200 text-right mt-1">${timeStr}</span>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="flex items-start space-x-2">
                        <img src="/images/creator-profile.jpg" class="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5 border border-slate-200" onerror="this.src='https://ui-avatars.com/api/?name=Muhammad+Adil&background=4f46e5&color=fff'">
                        <div class="bg-white border border-slate-200 text-slate-800 p-3 rounded-2xl rounded-tl-sm shadow-xs max-w-[85%]">
                            <p class="font-bold text-[11px] text-purple-600 mb-1">Muhammad Adil</p>
                            <p class="leading-relaxed whitespace-pre-wrap">${escapeHtml(m.message)}</p>
                            <span class="block text-[9px] text-slate-400 mt-1">${timeStr}</span>
                        </div>
                    </div>
                `;
            }
        });

        messagesStage.innerHTML = html;
        messagesStage.scrollTop = messagesStage.scrollHeight;
    }

    function appendMessageUI(msg) {
        if (!messagesStage) return;
        const div = document.createElement('div');
        div.className = 'flex items-end justify-end space-x-2';
        div.innerHTML = `
            <div class="bg-indigo-600 text-white p-3 rounded-2xl rounded-tr-sm shadow-xs max-w-[85%]">
                <p class="leading-relaxed whitespace-pre-wrap">${escapeHtml(msg.message)}</p>
                <span class="block text-[9px] text-indigo-200 text-right mt-1">${msg.created_at}</span>
            </div>
        `;
        messagesStage.appendChild(div);
        messagesStage.scrollTop = messagesStage.scrollHeight;
    }

    function startPolling() {
        stopPolling();
        pollInterval = setInterval(fetchMessages, 3500);
    }

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    function escapeHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Auto-fetch once on load to see if previous conversation exists
    fetchMessages();
})();
