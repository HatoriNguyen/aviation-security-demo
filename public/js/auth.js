/**
 * ============================================
 * AUTH.JS - Authentication Module
 * Aviation Academy AI Knowledge Support
 * ============================================
 */

(function () {
  'use strict';

  // ============================================
  // CONSTANTS
  // ============================================
  const TOKEN_KEY = 'aviation_token';
  const USER_KEY = 'aviation_user';
  const API_LOGIN = '/api/auth/login';
  const DASHBOARD_URL = 'dashboard.html';

  // ============================================
  // TOKEN MANAGEMENT
  // ============================================
  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  function setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  // ============================================
  // CHECK EXISTING AUTH
  // ============================================
  function checkExistingAuth() {
    const token = getToken();
    if (token) {
      // Verify token is still valid
      fetch('/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      })
        .then(res => {
          if (res.ok) {
            window.location.href = DASHBOARD_URL;
          } else {
            clearAuth();
          }
        })
        .catch(() => {
          // Token invalid or server down, stay on login
          clearAuth();
        });
    }
  }

  // ============================================
  // LOGIN HANDLER
  // ============================================
  async function handleLogin(username, password) {
    const loginBtn = document.getElementById('loginBtn');
    const loginBtnText = document.getElementById('loginBtnText');
    const loginSpinner = document.getElementById('loginSpinner');
    const loginError = document.getElementById('loginError');
    const loginErrorText = document.getElementById('loginErrorText');

    // Show loading state
    loginBtn.disabled = true;
    loginBtnText.textContent = 'Đang xác thực...';
    loginSpinner.classList.remove('d-none');
    loginError.classList.remove('visible');

    try {
      const response = await fetch(API_LOGIN, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      // API trả về { success, data: { token, user } }
      const token = data.token || (data.data && data.data.token);
      const user = data.user || (data.data && data.data.user);

      if (response.ok && token) {
        // Success - store token and user info
        setToken(token);
        if (user) {
          setUser(user);
        }

        // Success animation
        loginBtn.style.background = 'var(--success)';
        loginBtnText.textContent = '✓ Đăng nhập thành công!';
        loginSpinner.classList.add('d-none');

        // Redirect after brief delay
        setTimeout(() => {
          window.location.href = DASHBOARD_URL;
        }, 500);
      } else {
        // Error
        throw new Error(data.message || 'Tên đăng nhập hoặc mật khẩu không đúng');
      }
    } catch (error) {
      // Show error
      loginErrorText.textContent = error.message || 'Lỗi kết nối đến máy chủ. Vui lòng thử lại.';
      loginError.classList.add('visible');

      // Reset button
      loginBtn.disabled = false;
      loginBtnText.textContent = 'Đăng nhập';
      loginSpinner.classList.add('d-none');
      loginBtn.style.background = '';

      // Shake animation
      loginError.style.animation = 'none';
      loginError.offsetHeight; // Force reflow
      loginError.style.animation = 'shake 0.3s ease';
    }
  }

  // ============================================
  // QUICK LOGIN
  // ============================================
  function setupQuickLogin() {
    const quickButtons = document.querySelectorAll('.quick-login-btn');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    quickButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const username = btn.dataset.username;
        const password = btn.dataset.password;

        // Fill in credentials with animation
        usernameInput.value = '';
        passwordInput.value = '';

        // Typing effect
        let i = 0;
        const typeUsername = () => {
          if (i < username.length) {
            usernameInput.value += username[i];
            i++;
            setTimeout(typeUsername, 40);
          } else {
            let j = 0;
            const typePassword = () => {
              if (j < password.length) {
                passwordInput.value += password[j];
                j++;
                setTimeout(typePassword, 30);
              } else {
                // Auto submit after a short delay
                setTimeout(() => {
                  handleLogin(username, password);
                }, 200);
              }
            };
            typePassword();
          }
        };
        typeUsername();

        // Highlight the selected button
        quickButtons.forEach(b => b.style.borderColor = '');
        btn.style.borderColor = 'var(--accent)';
      });
    });
  }

  // ============================================
  // FORM SUBMISSION
  // ============================================
  function setupForm() {
    const loginForm = document.getElementById('loginForm');

    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value.trim();

      if (!username || !password) {
        const loginError = document.getElementById('loginError');
        const loginErrorText = document.getElementById('loginErrorText');
        loginErrorText.textContent = 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu';
        loginError.classList.add('visible');
        return;
      }

      handleLogin(username, password);
    });

    // Enter key on password field
    document.getElementById('password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loginForm.dispatchEvent(new Event('submit'));
      }
    });
  }

  // ============================================
  // INITIALIZE
  // ============================================
  document.addEventListener('DOMContentLoaded', () => {
    checkExistingAuth();
    setupForm();
    setupQuickLogin();

    // Focus username input
    setTimeout(() => {
      document.getElementById('username').focus();
    }, 600);
  });
})();
