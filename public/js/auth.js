// Client-side authentication helpers

const Auth = {
    getToken() {
        return localStorage.getItem('cv_token');
    },

    setToken(token) {
        localStorage.setItem('cv_token', token);
    },

    getUser() {
        const u = localStorage.getItem('cv_user');
        return u ? JSON.parse(u) : null;
    },

    setUser(user) {
        localStorage.setItem('cv_user', JSON.stringify(user));
    },

    clear() {
        localStorage.removeItem('cv_token');
        localStorage.removeItem('cv_user');
    },

    fetchWithAuth(url, options = {}) {
        const token = this.getToken();
        const headers = options.headers ? { ...options.headers } : {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return fetch(url, { ...options, headers });
    },

    async checkSession() {
        const token = this.getToken();
        if (!token) return null;

        try {
            const res = await fetch('/api/auth/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!res.ok) {
                this.clear();
                return null;
            }

            const data = await res.json();
            this.setUser(data.user);
            return data;
        } catch (err) {
            console.error('Session check failed:', err);
            return null;
        }
    },

    async logout() {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (e) {
            console.error(e);
        }
        this.clear();
        window.location.href = '/login.html';
    },

    requireAuth(allowedRole = null) {
        const token = this.getToken();
        const user = this.getUser();

        if (!token || !user) {
            window.location.href = '/login.html';
            return;
        }

        if (allowedRole && user.role !== allowedRole) {
            if (user.role === 'admin') {
                window.location.href = '/admin.html';
            } else {
                window.location.href = '/dashboard.html';
            }
        }
    }
};

window.Auth = Auth;
