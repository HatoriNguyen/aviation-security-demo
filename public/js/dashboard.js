/**
 * ============================================
 * DASHBOARD.JS - Dashboard Core Module
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
  const LOGIN_URL = 'index.html';

  // ============================================
  // GLOBAL STATE
  // ============================================
  window.AppState = {
    user: null,
    token: null,
    activeTab: 'overview',
    courses: [],
  };

  // ============================================
  // TOKEN & AUTH HELPERS (Global)
  // ============================================
  window.getToken = function () {
    return localStorage.getItem(TOKEN_KEY);
  };

  window.getUser = function () {
    const userData = localStorage.getItem(USER_KEY);
    try {
      return userData ? JSON.parse(userData) : null;
    } catch {
      return null;
    }
  };

  window.apiRequest = async function (url, options = {}) {
    const token = window.getToken();
    const defaultHeaders = {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
    };

    // Don't set Content-Type for FormData
    if (options.body instanceof FormData) {
      delete defaultHeaders['Content-Type'];
    }

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {}),
      },
    };

    try {
      const response = await fetch(url, config);

      if (response.status === 401) {
        // Token expired
        showToast('Phiên đăng nhập đã hết hạn', 'error');
        setTimeout(() => {
          logout();
        }, 1500);
        throw new Error('Unauthorized');
      }

      // 403 = không có quyền (role), không phải hết phiên
      // Trả response bình thường để caller xử lý

      return response;
    } catch (error) {
      if (error.message !== 'Unauthorized') {
        console.error('API request failed:', error);
      }
      throw error;
    }
  };

  // ============================================
  // AUTHENTICATION CHECK
  // ============================================
  async function checkAuth() {
    const token = window.getToken();
    if (!token) {
      window.location.href = LOGIN_URL;
      return false;
    }

    try {
      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      });

      if (!response.ok) {
        throw new Error('Invalid token');
      }

      const result = await response.json();
      // API trả về { success, data: { user, enrolledCourses } }
      const userData = (result.data && result.data.user) || result.user || result.data || result;
      window.AppState.user = userData;
      window.AppState.token = token;

      // Lưu enrolled courses nếu có
      if (result.data && result.data.enrolledCourses) {
        window.AppState.courses = result.data.enrolledCourses;
      }

      // Save updated user data
      localStorage.setItem(USER_KEY, JSON.stringify(window.AppState.user));

      return true;
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      window.location.href = LOGIN_URL;
      return false;
    }
  }

  // ============================================
  // USER INTERFACE UPDATE
  // ============================================
  function updateUserUI() {
    const user = window.AppState.user;
    if (!user) return;

    // Avatar initials
    const avatarEl = document.getElementById('userAvatar');
    if (avatarEl) {
      const name = user.fullName || user.username || 'U';
      const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      avatarEl.textContent = initials;
    }

    // User name
    const nameEl = document.getElementById('userName');
    if (nameEl) {
      nameEl.textContent = user.fullName || user.username;
    }

    // Role badge
    const roleEl = document.getElementById('userRole');
    if (roleEl) {
      const roleMap = {
        admin: { text: 'Quản trị viên', class: 'badge-admin' },
        teacher: { text: 'Giảng viên', class: 'badge-teacher' },
        student: { text: 'Sinh viên', class: 'badge-student' },
      };
      const role = roleMap[user.role] || { text: user.role, class: 'badge-student' };
      roleEl.textContent = role.text;
      roleEl.className = 'badge ' + role.class;
    }

    // Welcome message
    const welcomeEl = document.getElementById('welcomeName');
    if (welcomeEl) {
      welcomeEl.textContent = user.fullName || user.username;
    }
  }

  // ============================================
  // ROLE-BASED UI
  // ============================================
  function applyRoleBasedUI() {
    const user = window.AppState.user;
    if (!user) return;

    const role = user.role;

    // Elements visibility based on role
    document.querySelectorAll('[data-role]').forEach(el => {
      const allowedRoles = el.dataset.role.split(',').map(r => r.trim());
      if (!allowedRoles.includes(role)) {
        el.classList.add('d-none');
      } else {
        el.classList.remove('d-none');
      }
    });

    // Show/hide upload zone for students
    const uploadZone = document.getElementById('uploadSection');
    if (uploadZone && role === 'student') {
      uploadZone.classList.add('d-none');
    }

    // Show/hide audit tab for non-admins
    const auditNav = document.getElementById('navAudit');
    if (auditNav && role !== 'admin') {
      auditNav.classList.add('d-none');
    }

    // Show/hide delete buttons for non-admins
    if (role !== 'admin') {
      document.querySelectorAll('.admin-only').forEach(el => {
        el.classList.add('d-none');
      });
    }
  }

  // ============================================
  // TAB NAVIGATION
  // ============================================
  function setupTabNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-tab]');
    const tabContents = document.querySelectorAll('.tab-content');

    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const tabId = item.dataset.tab;

        // Skip hidden tabs
        if (item.classList.contains('d-none')) return;

        // Update active nav
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        // Show corresponding tab
        tabContents.forEach(tab => {
          tab.classList.remove('active');
          if (tab.id === 'tab-' + tabId) {
            tab.classList.add('active');
          }
        });

        window.AppState.activeTab = tabId;

        // Load tab data
        loadTabData(tabId);

        // Close mobile sidebar
        closeMobileSidebar();
      });
    });
  }

  function loadTabData(tabId) {
    switch (tabId) {
      case 'overview':
        loadOverviewData();
        break;
      case 'file-management':
        if (typeof window.loadDocuments === 'function') {
          window.loadDocuments();
        }
        break;
      case 'ai-chat':
        // Chat initializes itself
        break;
      case 'audit':
        if (typeof window.loadAuditLogs === 'function') {
          window.loadAuditLogs();
        }
        break;
      case 'security-demo':
        // Static content, no data to load
        break;
      case 'assignments':
        if (typeof window.loadAssignments === 'function') {
          window.loadAssignments();
        }
        break;
      case 'grades':
        if (typeof window.loadGrades === 'function') {
          window.loadGrades();
        }
        break;
      case 'admin-panel':
        if (typeof window.loadAdminPanel === 'function') {
          window.loadAdminPanel();
        }
        break;
    }
  }

  // ============================================
  // OVERVIEW DATA
  // ============================================
  async function loadOverviewData() {
    try {
      // Load stats
      const statsResponse = await window.apiRequest('/api/dashboard/stats');
      if (statsResponse.ok) {
        const stats = await statsResponse.json();
        updateStats(stats);
      }
    } catch (error) {
      console.error('Failed to load overview:', error);
      // Set default values
      updateStats({
        totalDocuments: '--',
        totalCourses: '--',
        totalChats: '--',
        securityAlerts: '--',
      });
    }

    try {
      // Load recent activity
      const activityResponse = await window.apiRequest('/api/audit/logs?limit=5');
      if (activityResponse.ok) {
        const activityData = await activityResponse.json();
        updateRecentActivity(activityData.logs || activityData);
      }
    } catch (error) {
      console.error('Failed to load activity:', error);
    }
  }

  function updateStats(stats) {
    const fields = {
      statDocuments: stats.totalDocuments ?? stats.documents ?? '--',
      statCourses: stats.totalCourses ?? stats.courses ?? '--',
      statChats: stats.totalChats ?? stats.chats ?? '--',
      statAlerts: stats.securityAlerts ?? stats.alerts ?? '--',
    };

    for (const [id, value] of Object.entries(fields)) {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = value;
      }
    }
  }

  function updateRecentActivity(logs) {
    const container = document.getElementById('recentActivity');
    if (!container || !Array.isArray(logs)) return;

    if (logs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📋</span>
          <p class="empty-title">Chưa có hoạt động nào</p>
        </div>
      `;
      return;
    }

    const iconMap = {
      login: '🔑',
      upload: '📤',
      download: '📥',
      chat: '💬',
      security: '🛡️',
      delete: '🗑️',
      default: '📌',
    };

    container.innerHTML = logs.slice(0, 8).map(log => {
      const icon = iconMap[log.action] || iconMap[log.actionType] || iconMap.default;
      const time = formatTime(log.timestamp || log.createdAt);
      const text = log.details || log.description || log.action || 'Hoạt động';
      const user = log.username || log.user || '';

      return `
        <div class="activity-item">
          <span class="activity-icon">${icon}</span>
          <span class="activity-text">${user ? '<strong>' + escapeHtml(user) + '</strong> - ' : ''}${escapeHtml(text)}</span>
          <span class="activity-time">${time}</span>
        </div>
      `;
    }).join('');
  }

  // ============================================
  // TOAST NOTIFICATION SYSTEM
  // ============================================
  window.showToast = function (message, type = 'info', duration = 4000) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const iconMap = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${iconMap[type] || iconMap.info}</span>
      <span class="toast-message">${escapeHtml(message)}</span>
      <span class="toast-close" onclick="this.parentElement.remove()">✕</span>
    `;

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, duration);

    // Click to dismiss
    toast.addEventListener('click', () => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    });
  };

  // ============================================
  // LOGOUT
  // ============================================
  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = LOGIN_URL;
  }

  function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
      });
    }
  }

  // ============================================
  // MOBILE SIDEBAR
  // ============================================
  function setupMobileSidebar() {
    const toggle = document.getElementById('mobileToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (toggle) {
      toggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('visible');
      });
    }

    if (overlay) {
      overlay.addEventListener('click', closeMobileSidebar);
    }
  }

  function closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('visible');
  }

  // ============================================
  // LOAD COURSES
  // ============================================
  async function loadCourses() {
    try {
      const response = await window.apiRequest('/api/courses');
      if (response.ok) {
        const result = await response.json();
        window.AppState.courses = result.data?.courses || result.courses || (Array.isArray(result) ? result : []);
        populateCourseSelectors();
      }
    } catch (error) {
      console.error('Failed to load courses:', error);
      window.AppState.courses = [];
    }
  }

  function populateCourseSelectors() {
    const selectors = document.querySelectorAll('.course-select');
    const courses = window.AppState.courses;

    selectors.forEach(select => {
      // Keep existing options (like "All" option)
      const defaultOption = select.querySelector('option[value=""]');
      select.innerHTML = '';

      if (defaultOption) {
        select.appendChild(defaultOption);
      } else {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '-- Tất cả môn học --';
        select.appendChild(opt);
      }

      courses.forEach(course => {
        const opt = document.createElement('option');
        opt.value = course.id || course._id;
        opt.textContent = course.name || course.courseName;
        select.appendChild(opt);
      });
    });
  }

  // ============================================
  // HELPER FUNCTIONS (Global)
  // ============================================
  window.escapeHtml = function (text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  };

  window.formatTime = function (timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;

    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  window.formatDateTime = function (timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ============================================
  // INITIALIZE
  // ============================================
  async function init() {
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) return;

    updateUserUI();
    applyRoleBasedUI();
    setupTabNavigation();
    setupLogout();
    setupMobileSidebar();

    // Load initial data
    await loadCourses();
    loadOverviewData();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
