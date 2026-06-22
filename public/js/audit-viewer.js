/**
 * ============================================
 * AUDIT-VIEWER.JS - Audit Log Module
 * Aviation Academy AI Knowledge Support
 * ============================================
 */

(function () {
  'use strict';

  // ============================================
  // STATE
  // ============================================
  let currentPage = 1;
  let totalPages = 1;
  const pageSize = 15;
  let autoRefreshInterval = null;

  // ============================================
  // LOAD AUDIT LOGS
  // ============================================
  window.loadAuditLogs = async function (filters = {}) {
    const tableBody = document.getElementById('auditTableBody');
    if (!tableBody) return;

    // Gather filter values
    const dateFrom = document.getElementById('filterDateFrom');
    const dateTo = document.getElementById('filterDateTo');
    const filterUser = document.getElementById('filterUser');
    const filterAction = document.getElementById('filterAction');
    const filterRisk = document.getElementById('filterRisk');

    const params = new URLSearchParams();
    params.set('page', filters.page || currentPage);
    params.set('limit', pageSize);

    if (dateFrom && dateFrom.value) params.set('dateFrom', dateFrom.value);
    if (dateTo && dateTo.value) params.set('dateTo', dateTo.value);
    if (filterUser && filterUser.value) params.set('username', filterUser.value);
    if (filterAction && filterAction.value) params.set('action', filterAction.value);
    if (filterRisk && filterRisk.value) params.set('riskLevel', filterRisk.value);

    // Show loading
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center p-xl">
          <div class="d-flex items-center justify-center gap-md">
            <div class="spinner spinner-sm"></div>
            <span class="text-muted">Đang tải nhật ký...</span>
          </div>
        </td>
      </tr>
    `;

    try {
      const response = await window.apiRequest('/api/audit/logs?' + params.toString());

      if (!response.ok) {
        throw new Error('Không thể tải nhật ký audit');
      }

      const result = await response.json();
      const responseData = result.data || result;
      const logs = responseData.logs || responseData.entries || responseData || [];
      
      const pagination = responseData.pagination || {};
      totalPages = pagination.totalPages || responseData.totalPages || Math.ceil((pagination.total || responseData.total || logs.length) / pageSize) || 1;
      currentPage = pagination.page || responseData.currentPage || currentPage;

      renderAuditTable(logs);
      renderPagination();
    } catch (error) {
      console.error('Failed to load audit logs:', error);
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center p-xl">
            <div class="empty-state">
              <span class="empty-icon">⚠️</span>
              <p class="empty-title">Không thể tải nhật ký audit</p>
              <p class="empty-desc">${escapeHtml(error.message)}</p>
              <button class="btn btn-secondary btn-sm mt-md" onclick="window.loadAuditLogs()">Thử lại</button>
            </div>
          </td>
        </tr>
      `;
    }
  };

  // Helper để format cột Details từ JSON sang text dễ đọc
  function formatDetails(details, action) {
    if (!details || details === '--') return '--';
    
    try {
      const trimmed = details.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const obj = JSON.parse(trimmed);
        
        // Nhóm hành động File
        if (action.includes('FILE_') || action.includes('UPLOAD') || action.includes('DOWNLOAD')) {
          const parts = [];
          if (obj.originalName) parts.push(`File: ${obj.originalName}`);
          if (obj.courseId) parts.push(`Môn học: ${obj.courseId}`);
          if (obj.fileHash) parts.push(`Hash: ${obj.fileHash.substring(0, 8)}...`);
          if (obj.reason) parts.push(`Lý do: ${obj.reason}`);
          if (obj.detections !== undefined) parts.push(`Phát hiện: ${obj.detections}/${obj.total}`);
          if (obj.previousStatus !== undefined) parts.push(`Trạng thái cũ: ${obj.previousStatus ? 'Bật' : 'Tắt'}`);
          if (obj.newStatus !== undefined) parts.push(`Trạng thái mới: ${obj.newStatus ? 'Bật' : 'Tắt'}`);
          return parts.join(' | ');
        }
        
        // Nhóm hành động AI Chat
        if (action.includes('AI_CHAT') || action.includes('PROMPT')) {
          const parts = [];
          if (obj.courseId) parts.push(`Môn: ${obj.courseId}`);
          if (obj.threatType) parts.push(`Đe dọa: ${obj.threatType}`);
          if (obj.threatScore !== undefined) parts.push(`Điểm đe dọa: ${obj.threatScore}/100`);
          if (obj.reason) parts.push(`Lý do: ${obj.reason}`);
          return parts.join(' | ');
        }

        // Nhóm hành động User Enroll / Course
        if (action.includes('USER_') || action.includes('ENROLL')) {
          const parts = [];
          if (obj.userId) parts.push(`User: ${obj.userId}`);
          if (obj.courseId) parts.push(`Môn: ${obj.courseId}`);
          if (obj.username) parts.push(`Tên: ${obj.username}`);
          return parts.join(' | ');
        }

        // Điểm số / Bài tập
        if (action.includes('GRADE') || action.includes('ASSIGNMENT')) {
          const parts = [];
          if (obj.submissionId) parts.push(`Bài nộp: ${obj.submissionId}`);
          if (obj.score !== undefined) parts.push(`Điểm: ${obj.score}/${obj.maxScore || 10}`);
          if (obj.title) parts.push(`Bài tập: ${obj.title}`);
          return parts.join(' | ');
        }

        return Object.entries(obj)
          .map(([key, val]) => `${key}: ${typeof val === 'object' ? JSON.stringify(val) : val}`)
          .join(', ');
      }
    } catch (e) {
      // Bỏ qua lỗi parse và trả về text gốc
    }
    return details;
  }

  // ============================================
  // RENDER AUDIT TABLE
  // ============================================
  function renderAuditTable(logs) {
    const tableBody = document.getElementById('auditTableBody');
    if (!tableBody) return;

    if (!logs || logs.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center p-xl">
            <div class="empty-state">
              <span class="empty-icon">📋</span>
              <p class="empty-title">Không có nhật ký nào</p>
              <p class="empty-desc">Thử thay đổi bộ lọc để tìm kết quả</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = logs.map(log => {
      const timestamp = window.formatDateTime(log.timestamp || log.createdAt);
      const username = log.username || log.user || '--';
      const action = log.action || log.actionType || '--';
      
      // Tính toán Target hiển thị kết hợp target_type và target_id
      const targetType = log.target_type || log.targetType || '';
      const targetId = log.target_id || log.targetId || '';
      const target = targetType && targetId ? `${targetType} (${targetId})` : (targetId || targetType || '--');

      const rawDetails = log.details || log.description || log.message || '--';
      const formattedDetails = formatDetails(rawDetails, action);
      const riskLevel = log.riskLevel || log.risk || log.severity || 'low';

      return `
        <tr>
          <td class="text-muted text-sm">${timestamp}</td>
          <td>
            <strong class="text-primary">${escapeHtml(username)}</strong>
          </td>
          <td>
            <span class="course-badge" style="font-size: 0.72rem;">${escapeHtml(formatAction(action))}</span>
          </td>
          <td class="text-secondary truncate" style="max-width: 180px;" title="${escapeHtml(target)}">
            ${escapeHtml(target)}
          </td>
          <td class="text-secondary text-sm truncate" style="max-width: 250px;" title="${escapeHtml(formattedDetails)}">
            ${escapeHtml(formattedDetails)}
          </td>
          <td>${renderRiskBadge(riskLevel)}</td>
        </tr>
      `;
    }).join('');
  }

  // ============================================
  // RISK BADGE
  // ============================================
  function renderRiskBadge(level) {
    const normalized = (level || 'low').toLowerCase();
    const labels = {
      low: 'Thấp',
      medium: 'Trung bình',
      high: 'Cao',
      critical: 'Nguy cấp',
    };

    return `<span class="threat-badge ${normalized}">${labels[normalized] || normalized}</span>`;
  }

  // ============================================
  // FORMAT ACTION
  // ============================================
  function formatAction(action) {
    const actionMap = {
      'LOGIN': '🔑 Đăng nhập',
      'LOGOUT': '🚪 Đăng xuất',
      'FILE_UPLOAD': '📤 Tải lên',
      'FILE_DOWNLOAD': '📥 Tải xuống',
      'FILE_DELETED': '🗑️ Xóa file',
      'FILE_ACTIVATED': '🔓 Kích hoạt file',
      'FILE_DEACTIVATED': '🔒 Vô hiệu file',
      'FILE_ACCESS_DENIED': '❌ Chặn truy cập file',
      'FILE_UPLOAD_BLOCKED_MALWARE': '🛡️ Chặn tải mã độc',
      'AI_CHAT': '💬 Chat AI',
      'AI_CHAT_BLOCKED': '🛡️ Chặn Prompt Inj.',
      'DATABASE_INITIALIZED': '⚙️ Khởi tạo hệ thống',
      'USER_DELETED': '🗑️ Xóa người dùng',
      'USER_ENROLLED': '➕ Đăng ký môn học',
      'USER_UNENROLLED': '➖ Hủy đăng ký môn',
      'ASSIGNMENT_CREATED': '📝 Tạo bài tập',
      'ASSIGNMENT_SUBMITTED': '📤 Nộp bài tập',
      'GRADE_SUBMITTED': '💯 Chấm điểm'
    };

    const upperAction = (action || '').toUpperCase();
    return actionMap[upperAction] || action;
  }

  // ============================================
  // PAGINATION
  // ============================================
  function renderPagination() {
    const container = document.getElementById('auditPagination');
    if (!container) return;

    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    let html = '';

    // Previous button
    html += `<button class="page-btn" ${currentPage <= 1 ? 'disabled' : ''} onclick="window.goToPage(${currentPage - 1})">‹</button>`;

    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);

    if (startPage > 1) {
      html += `<button class="page-btn" onclick="window.goToPage(1)">1</button>`;
      if (startPage > 2) html += `<span class="text-muted p-sm">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="window.goToPage(${i})">${i}</button>`;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += `<span class="text-muted p-sm">...</span>`;
      html += `<button class="page-btn" onclick="window.goToPage(${totalPages})">${totalPages}</button>`;
    }

    // Next button
    html += `<button class="page-btn" ${currentPage >= totalPages ? 'disabled' : ''} onclick="window.goToPage(${currentPage + 1})">›</button>`;

    container.innerHTML = html;
  }

  window.goToPage = function (page) {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    window.loadAuditLogs({ page });
  };

  // ============================================
  // AUDIT STATS
  // ============================================
  window.loadAuditStats = async function () {
    try {
      const response = await window.apiRequest('/api/audit/stats');
      if (response.ok) {
        const stats = await response.json();
        // Update stats display if exists
        const statsEl = document.getElementById('auditStatsDisplay');
        if (statsEl && stats) {
          statsEl.innerHTML = `
            <div class="d-flex gap-lg flex-wrap">
              <div class="text-center">
                <div class="text-lg font-weight-bold text-primary">${stats.total || 0}</div>
                <div class="text-xs text-muted">Tổng</div>
              </div>
              <div class="text-center">
                <div class="text-lg font-weight-bold text-warning">${stats.warnings || 0}</div>
                <div class="text-xs text-muted">Cảnh báo</div>
              </div>
              <div class="text-center">
                <div class="text-lg font-weight-bold text-danger">${stats.critical || 0}</div>
                <div class="text-xs text-muted">Nghiêm trọng</div>
              </div>
            </div>
          `;
        }
      }
    } catch (error) {
      console.error('Failed to load audit stats:', error);
    }
  };

  // ============================================
  // FILTERS
  // ============================================
  function setupFilters() {
    const applyBtn = document.getElementById('applyFilters');
    const clearBtn = document.getElementById('clearFilters');

    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        currentPage = 1;
        window.loadAuditLogs();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const filterInputs = document.querySelectorAll('.filters-row .form-input, .filters-row .form-select');
        filterInputs.forEach(input => {
          input.value = '';
        });
        currentPage = 1;
        window.loadAuditLogs();
      });
    }

    // Enter key on filter inputs
    document.querySelectorAll('.filters-row .form-input').forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          currentPage = 1;
          window.loadAuditLogs();
        }
      });
    });
  }

  // ============================================
  // AUTO REFRESH
  // ============================================
  function setupAutoRefresh() {
    const toggle = document.getElementById('autoRefreshToggle');
    if (toggle) {
      toggle.addEventListener('change', () => {
        if (toggle.checked) {
          autoRefreshInterval = setInterval(() => {
            window.loadAuditLogs();
          }, 10000); // Every 10 seconds
          showToast('Tự động làm mới: BẬT (10 giây)', 'info');
        } else {
          clearInterval(autoRefreshInterval);
          autoRefreshInterval = null;
          showToast('Tự động làm mới: TẮT', 'info');
        }
      });
    }
  }

  // ============================================
  // INITIALIZE
  // ============================================
  document.addEventListener('DOMContentLoaded', () => {
    setupFilters();
    setupAutoRefresh();
  });
})();
