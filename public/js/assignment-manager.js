/**
 * ============================================
 * ASSIGNMENT-MANAGER.JS - Assignment Management Module
 * Aviation Academy AI Knowledge Support
 * ============================================
 */

(function () {
  'use strict';

  // ============================================
  // HELPERS
  // ============================================
  function getRole() {
    return (window.AppState && window.AppState.user && window.AppState.user.role) || 'student';
  }

  function isTeacherOrAdmin() {
    const role = getRole();
    return role === 'admin' || role === 'teacher';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function getDeadlineStatus(dueDate) {
    if (!dueDate) return { text: 'Không có hạn', class: 'badge-info', icon: '' };
    const now = new Date();
    const due = new Date(dueDate);
    const diff = due - now;
    const hours = diff / (1000 * 60 * 60);

    if (diff < 0) {
      return { text: 'Quá hạn', class: 'badge-danger', icon: '🔴' };
    } else if (hours < 24) {
      return { text: 'Sắp hết hạn', class: 'badge-warning', icon: '⚠️' };
    } else {
      const days = Math.floor(hours / 24);
      return { text: `Còn ${days} ngày`, class: 'badge-success', icon: '🟢' };
    }
  }

  function getTypeLabel(type) {
    switch (type) {
      case 'homework': return '📚 Bài tập';
      case 'test': return '📝 Kiểm tra';
      case 'project': return '📂 Đồ án';
      default: return '📄 Khác';
    }
  }

  function getSubmissionStatusBadge(status) {
    switch (status) {
      case 'submitted': return '<span class="badge badge-info">📤 Đã nộp</span>';
      case 'graded': return '<span class="badge badge-success">✅ Đã chấm</span>';
      case 'late': return '<span class="badge badge-warning">⏰ Nộp muộn</span>';
      case 'returned': return '<span class="badge badge-purple">🔄 Trả lại</span>';
      default: return '<span class="badge badge-secondary">⏳ Chưa nộp</span>';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ============================================
  // LOAD ASSIGNMENTS
  // ============================================
  window.loadAssignments = async function () {
    const listEl = document.getElementById('assignmentsList');
    const createSection = document.getElementById('createAssignmentSection');

    if (!listEl) return;

    // Show/hide teacher section
    if (createSection) {
      createSection.style.display = isTeacherOrAdmin() ? 'block' : 'none';
    }

    // Show loading
    listEl.innerHTML = `
      <div class="glass-card text-center p-xl">
        <div class="d-flex items-center justify-center gap-md">
          <div class="spinner spinner-sm"></div>
          <span class="text-muted">Đang tải bài tập...</span>
        </div>
      </div>
    `;

    try {
      const response = await window.apiRequest('/api/assignments');
      const result = await response.json();

      if (!result.success || !result.data) {
        listEl.innerHTML = '<div class="glass-card text-center p-xl text-muted">Không thể tải dữ liệu bài tập</div>';
        return;
      }

      const assignments = result.data.assignments || [];

      if (assignments.length === 0) {
        listEl.innerHTML = `
          <div class="glass-card text-center p-xl">
            <div style="font-size: 3rem; margin-bottom: var(--space-md);">📝</div>
            <p class="text-muted">Chưa có bài tập nào</p>
          </div>
        `;
        return;
      }

      renderAssignmentsList(assignments, listEl);
      loadCourseDropdowns();
    } catch (error) {
      console.error('Error loading assignments:', error);
      listEl.innerHTML = `
        <div class="glass-card text-center p-xl">
          <span class="text-muted">❌ Lỗi tải bài tập: ${escapeHtml(error.message)}</span>
        </div>
      `;
    }
  };

  // ============================================
  // RENDER ASSIGNMENTS LIST
  // ============================================
  function renderAssignmentsList(assignments, container) {
    let html = '';

    assignments.forEach(a => {
      const dueDate = a.due_date || a.dueDate;
      const maxScore = a.max_score || a.maxScore || 10;
      const assignType = a.assignment_type || a.assignmentType || a.type;
      const courseName = a.course_name || a.courseName || '';
      const assignId = a._id || a.id;
      const deadline = getDeadlineStatus(dueDate);
      const typeLabel = getTypeLabel(assignType);
      // Backend returns userSubmission for students (with score/feedback from JOIN)
      const sub = a.userSubmission || a.submission || null;
      const submissionStatus = sub ? getSubmissionStatusBadge(sub.status) : getSubmissionStatusBadge(null);
      const subIsGraded = sub && (sub.status === 'graded' || (sub.score !== undefined && sub.score !== null));

      html += `
        <div class="glass-card mb-md" style="transition: all 0.3s ease;">
          <div class="d-flex justify-between items-start" style="flex-wrap: wrap; gap: var(--space-sm);">
            <div style="flex: 1; min-width: 200px;">
              <h3 style="margin: 0 0 var(--space-xs) 0; color: var(--text-bright);">
                ${typeLabel} ${escapeHtml(a.title)}
              </h3>
              <p class="text-sm text-muted" style="margin: 0 0 var(--space-sm) 0;">
                ${escapeHtml(a.description || 'Không có mô tả')}
              </p>
              <div class="d-flex gap-sm items-center" style="flex-wrap: wrap;">
                <span class="badge ${deadline.class}">${deadline.icon} ${deadline.text}</span>
                <span class="text-sm text-muted">📅 Hạn nộp: ${formatDate(dueDate)}</span>
                <span class="text-sm text-muted">💯 Điểm tối đa: ${maxScore}</span>
                ${courseName ? `<span class="text-sm text-muted">📚 ${escapeHtml(courseName)}</span>` : ''}
                ${isTeacherOrAdmin() && a.submissionCount !== undefined ? `<span class="text-sm text-muted">📬 ${a.submissionCount} bài nộp</span>` : ''}
              </div>
            </div>
            <div class="d-flex gap-sm items-center" style="flex-wrap: wrap;">
              ${!isTeacherOrAdmin() ? submissionStatus : ''}
              ${!isTeacherOrAdmin() && (!sub || !subIsGraded) ? `
                <button class="btn btn-primary btn-sm" onclick="window.showSubmitForm('${assignId}')">
                  📤 Nộp bài
                </button>
              ` : ''}
              ${isTeacherOrAdmin() ? `
                <button class="btn btn-secondary btn-sm" onclick="window.viewSubmissions('${assignId}')">
                  📋 Xem bài nộp
                </button>
                <button class="btn btn-danger btn-sm" onclick="window.deleteAssignment('${assignId}')">
                  🗑️ Xóa
                </button>
              ` : ''}
            </div>
          </div>

          ${subIsGraded ? `
            <div style="margin-top: var(--space-md); padding-top: var(--space-md); border-top: 1px solid rgba(255,255,255,0.1);">
              <div class="d-flex gap-md items-center" style="flex-wrap: wrap;">
                <span style="font-size: 1.2rem; font-weight: 600; color: ${getGradeColor(sub.score, maxScore)};">
                  📊 Điểm: ${sub.score}/${maxScore}
                  (${Math.round((sub.score / (maxScore || 10)) * 100)}%)
                </span>
                ${sub.feedback ? `
                  <span class="text-sm text-muted">💬 ${escapeHtml(sub.feedback)}</span>
                ` : ''}
              </div>
            </div>
          ` : ''}

          <!-- Submission form (hidden by default) -->
          <div id="submitForm-${assignId}" style="display:none; margin-top: var(--space-md); padding-top: var(--space-md); border-top: 1px solid rgba(255,255,255,0.1);">
            <h4 style="margin-bottom: var(--space-sm);">📤 Nộp bài tập</h4>
            <div class="form-group">
              <label class="form-label">Nội dung bài làm</label>
              <textarea class="form-input" id="submitContent-${assignId}" rows="5" placeholder="Nhập nội dung bài làm..."></textarea>
            </div>
            <p class="text-sm text-muted" style="margin-bottom: var(--space-sm);">
              💡 Bạn cũng có thể tải file lên qua mục Quản lý Tài liệu
            </p>
            <div class="d-flex gap-sm">
              <button class="btn btn-primary btn-sm" onclick="window.submitAssignment('${assignId}')">
                ✅ Nộp bài
              </button>
              <button class="btn btn-ghost btn-sm" onclick="document.getElementById('submitForm-${assignId}').style.display='none'">
                ❌ Hủy
              </button>
            </div>
          </div>

          <!-- Submissions list (teacher, hidden by default) -->
          <div id="submissionsList-${assignId}" style="display:none; margin-top: var(--space-md); padding-top: var(--space-md); border-top: 1px solid rgba(255,255,255,0.1);">
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function getGradeColor(score, maxScore) {
    const pct = (score / (maxScore || 10)) * 100;
    if (pct >= 80) return 'var(--success)';
    if (pct >= 50) return 'var(--warning)';
    return 'var(--danger)';
  }

  // ============================================
  // SHOW SUBMIT FORM
  // ============================================
  window.showSubmitForm = function (assignmentId) {
    const form = document.getElementById('submitForm-' + assignmentId);
    if (form) {
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }
  };

  // ============================================
  // SUBMIT ASSIGNMENT
  // ============================================
  window.submitAssignment = async function (assignmentId) {
    const contentEl = document.getElementById('submitContent-' + assignmentId);
    if (!contentEl) return;

    const content = contentEl.value.trim();
    if (!content) {
      window.showToast('Vui lòng nhập nội dung bài làm', 'warning');
      return;
    }

    try {
      const response = await window.apiRequest('/api/assignments/' + assignmentId + '/submit', {
        method: 'POST',
        body: JSON.stringify({ content: content })
      });

      const result = await response.json();

      if (result.success) {
        window.showToast('✅ Nộp bài thành công!', 'success');
        window.loadAssignments();
      } else {
        window.showToast('❌ ' + (result.message || 'Lỗi khi nộp bài'), 'error');
      }
    } catch (error) {
      console.error('Error submitting assignment:', error);
      window.showToast('❌ Lỗi khi nộp bài: ' + error.message, 'error');
    }
  };

  // ============================================
  // CREATE ASSIGNMENT (Teacher/Admin)
  // ============================================
  function setupCreateAssignment() {
    const btn = document.getElementById('btnCreateAssignment');
    if (!btn) return;

    btn.addEventListener('click', async function () {
      const title = document.getElementById('assignTitle').value.trim();
      const courseId = document.getElementById('assignCourse').value;
      const dueDate = document.getElementById('assignDueDate').value;
      const maxScore = parseInt(document.getElementById('assignMaxScore').value) || 10;
      const assignmentType = document.getElementById('assignType').value;
      const autoGrade = document.getElementById('assignAutoGrade').checked;
      const description = document.getElementById('assignDescription').value.trim();

      // Validation
      if (!title) {
        window.showToast('Vui lòng nhập tiêu đề bài tập', 'warning');
        return;
      }
      if (!courseId) {
        window.showToast('Vui lòng chọn môn học', 'warning');
        return;
      }
      if (!dueDate) {
        window.showToast('Vui lòng chọn hạn nộp', 'warning');
        return;
      }

      btn.disabled = true;
      btn.textContent = '⏳ Đang tạo...';

      try {
        const response = await window.apiRequest('/api/assignments', {
          method: 'POST',
          body: JSON.stringify({
            title: title,
            description: description,
            courseId: courseId,
            dueDate: dueDate,
            maxScore: maxScore,
            assignmentType: assignmentType,
            autoGrade: autoGrade
          })
        });

        const result = await response.json();

        if (result.success) {
          window.showToast('✅ Tạo bài tập thành công!', 'success');
          // Clear form
          document.getElementById('assignTitle').value = '';
          document.getElementById('assignDescription').value = '';
          document.getElementById('assignDueDate').value = '';
          document.getElementById('assignMaxScore').value = '10';
          document.getElementById('assignAutoGrade').checked = false;
          // Reload list
          window.loadAssignments();
        } else {
          window.showToast('❌ ' + (result.message || 'Lỗi khi tạo bài tập'), 'error');
        }
      } catch (error) {
        console.error('Error creating assignment:', error);
        window.showToast('❌ Lỗi: ' + error.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '➕ Tạo bài tập';
      }
    });
  }

  // ============================================
  // VIEW SUBMISSIONS (Teacher/Admin)
  // ============================================
  window.viewSubmissions = async function (assignmentId) {
    const container = document.getElementById('submissionsList-' + assignmentId);
    if (!container) return;

    // Toggle visibility
    if (container.style.display !== 'none' && container.innerHTML !== '') {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    container.innerHTML = `
      <div class="d-flex items-center gap-sm">
        <div class="spinner spinner-sm"></div>
        <span class="text-muted">Đang tải bài nộp...</span>
      </div>
    `;

    try {
      const response = await window.apiRequest('/api/assignments/' + assignmentId + '/submissions');
      const result = await response.json();

      if (!result.success || !result.data) {
        container.innerHTML = '<p class="text-muted">Không thể tải dữ liệu</p>';
        return;
      }

      const submissions = result.data.submissions || [];
      const assignment = result.data.assignment || null;

      if (submissions.length === 0) {
        container.innerHTML = '<p class="text-muted">📭 Chưa có bài nộp nào</p>';
        return;
      }

      let html = `
        <h4 style="margin-bottom: var(--space-sm);">📋 Danh sách bài nộp (${submissions.length})</h4>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Học viên</th>
                <th>Ngày nộp</th>
                <th>Trạng thái</th>
                <th>Điểm</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
      `;

      submissions.forEach(s => {
        const subId = s._id || s.id;
        const studentName = s.student_name || (s.student && s.student.fullName) || s.studentName || s.userId || 'N/A';
        const studentUsername = s.student_username || '';
        const submittedDate = s.submitted_at || s.submittedAt || s.createdAt || s.created_at;
        const contentPreview = s.content ? (s.content.length > 120 ? s.content.substring(0, 120) + '...' : s.content) : '';
        const maxScore = assignment ? (assignment.max_score || assignment.maxScore || 10) : 10;
        html += `
          <tr>
            <td>
              <div>${escapeHtml(studentName)}</div>
              ${studentUsername ? `<div class="text-sm text-muted">@${escapeHtml(studentUsername)}</div>` : ''}
            </td>
            <td>${formatDate(submittedDate)}</td>
            <td>${getSubmissionStatusBadge(s.status)}</td>
            <td style="font-weight: 600; color: ${s.score !== undefined && s.score !== null ? 'var(--success)' : 'var(--text-muted)'};">
              ${s.score !== undefined && s.score !== null ? s.score + '/' + maxScore : '--'}
            </td>
            <td>
              <button class="btn btn-primary btn-sm" onclick="window.showQuickGrade('${subId}', '${assignmentId}')">
                ✏️ Chấm điểm
              </button>
            </td>
          </tr>
          ${contentPreview ? `
          <tr>
            <td colspan="5" style="padding: 4px var(--space-sm); background: rgba(255,255,255,0.02);">
              <details>
                <summary class="text-sm text-muted" style="cursor: pointer;">📄 Xem nội dung bài nộp</summary>
                <div style="margin-top: var(--space-xs); padding: var(--space-sm); background: rgba(0,0,0,0.2); border-radius: var(--radius-sm); white-space: pre-wrap; font-size: 0.85rem; max-height: 200px; overflow-y: auto;">${escapeHtml(s.content)}</div>
              </details>
            </td>
          </tr>
          ` : ''}
          <tr id="gradeForm-${subId}" style="display:none;">
            <td colspan="5">
              <div style="padding: var(--space-sm) 0;">
                <div class="d-flex gap-sm items-end" style="flex-wrap: wrap;">
                  <div class="form-group" style="min-width: 100px;">
                    <label class="form-label">Điểm (tối đa ${maxScore})</label>
                    <input type="number" class="form-input" id="gradeScore-${subId}" 
                      value="${s.score || ''}" min="0" max="${maxScore}" placeholder="Điểm" step="0.5">
                  </div>
                  <div class="form-group" style="flex: 1; min-width: 200px;">
                    <label class="form-label">Nhận xét</label>
                    <textarea class="form-input" id="gradeFeedback-${subId}" rows="2"
                      placeholder="Nhận xét cho học viên...">${escapeHtml(s.feedback || '')}</textarea>
                  </div>
                  <div class="d-flex gap-sm">
                    <button class="btn btn-primary btn-sm" onclick="window.saveGrade('${subId}')">
                      💾 Lưu điểm
                    </button>
                    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('gradeForm-${subId}').style.display='none'">
                      ❌
                    </button>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        `;
      });

      html += '</tbody></table></div>';
      container.innerHTML = html;
    } catch (error) {
      console.error('Error loading submissions:', error);
      container.innerHTML = '<p class="text-muted">❌ Lỗi tải bài nộp</p>';
    }
  };

  // ============================================
  // QUICK GRADE
  // ============================================
  window.showQuickGrade = function (submissionId) {
    const row = document.getElementById('gradeForm-' + submissionId);
    if (row) {
      row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
    }
  };

  window.saveGrade = async function (submissionId) {
    const scoreEl = document.getElementById('gradeScore-' + submissionId);
    const feedbackEl = document.getElementById('gradeFeedback-' + submissionId);

    if (!scoreEl) return;

    const score = parseFloat(scoreEl.value);
    if (isNaN(score) || score < 0) {
      window.showToast('Vui lòng nhập điểm hợp lệ', 'warning');
      return;
    }

    const feedback = feedbackEl ? feedbackEl.value.trim() : '';

    try {
      const response = await window.apiRequest('/api/grades', {
        method: 'POST',
        body: JSON.stringify({
          submissionId: submissionId,
          score: score,
          feedback: feedback
        })
      });

      const result = await response.json();

      if (result.success) {
        window.showToast('✅ Đã lưu điểm!', 'success');
        // Hide grade form
        const row = document.getElementById('gradeForm-' + submissionId);
        if (row) row.style.display = 'none';
        // Reload
        window.loadAssignments();
      } else {
        window.showToast('❌ ' + (result.message || 'Lỗi lưu điểm'), 'error');
      }
    } catch (error) {
      console.error('Error saving grade:', error);
      window.showToast('❌ Lỗi: ' + error.message, 'error');
    }
  };

  // ============================================
  // DELETE ASSIGNMENT (Teacher/Admin)
  // ============================================
  window.deleteAssignment = async function (assignmentId) {
    if (!confirm('Bạn có chắc chắn muốn xóa bài tập này?')) return;

    try {
      const response = await window.apiRequest('/api/assignments/' + assignmentId, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        window.showToast('✅ Đã xóa bài tập', 'success');
        window.loadAssignments();
      } else {
        window.showToast('❌ ' + (result.message || 'Lỗi khi xóa'), 'error');
      }
    } catch (error) {
      console.error('Error deleting assignment:', error);
      window.showToast('❌ Lỗi: ' + error.message, 'error');
    }
  };

  // ============================================
  // LOAD COURSE DROPDOWNS
  // ============================================
  async function loadCourseDropdowns() {
    const selectors = ['assignCourse', 'gradeCourseFilter', 'enrollCourseId'];
    
    try {
      let courses = window.AppState.courses || [];

      if (!courses.length) {
        const response = await window.apiRequest('/api/courses');
        const result = await response.json();
        if (result.success && result.data) {
          courses = result.data.courses || result.data || [];
          window.AppState.courses = courses;
        }
      }

      selectors.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        // Keep first option
        const firstOption = select.options[0];
        select.innerHTML = '';
        select.appendChild(firstOption);
        
        courses.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c._id || c.id;
          opt.textContent = c.name || c.title || 'Khóa học';
          select.appendChild(opt);
        });
      });
    } catch (error) {
      console.error('Error loading courses for dropdowns:', error);
    }
  }

  // ============================================
  // ADMIN PANEL
  // ============================================
  window.loadAdminPanel = async function () {
    if (getRole() !== 'admin') {
      window.showToast('⛔ Bạn không có quyền truy cập', 'error');
      return;
    }

    loadAdminStats();
    loadAdminUsers();
    loadAdminCourses();
    loadCourseDropdowns();
    loadUserDropdown();
  };

  async function loadAdminStats() {
    try {
      const response = await window.apiRequest('/api/dashboard/stats');
      const result = await response.json();
      if (result.success && result.data) {
        const d = result.data;
        setTextSafe('adminUserCount', d.totalUsers || d.users || 0);
        setTextSafe('adminCourseCount', d.totalCourses || d.courses || 0);
        setTextSafe('adminAssignCount', d.totalAssignments || d.assignments || 0);
      }
    } catch (error) {
      console.error('Error loading admin stats:', error);
    }
  }

  async function loadAdminUsers() {
    const tbody = document.getElementById('adminUsersTable');
    if (!tbody) return;

    try {
      const response = await window.apiRequest('/api/admin/users');
      const result = await response.json();

      if (!result.success || !result.data) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Không thể tải dữ liệu</td></tr>';
        return;
      }

      const users = result.data.users || result.data || [];

      if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Không có người dùng</td></tr>';
        return;
      }

      let html = '';
      users.forEach(u => {
        const roleBadge = u.role === 'admin' ? 'badge-danger' :
                          u.role === 'teacher' ? 'badge-warning' : 'badge-info';
        const roleLabel = u.role === 'admin' ? '🔑 Admin' :
                          u.role === 'teacher' ? '👨‍🏫 Giáo viên' : '🎓 Học viên';
        
        // Thêm trạng thái khóa tài khoản
        const lockBadge = u.is_locked === 1 
          ? ' <span class="badge badge-danger" style="margin-left: 5px;">🔒 Bị khóa</span>' 
          : '';

        html += `
          <tr>
            <td>${escapeHtml(u.username)}</td>
            <td>${escapeHtml(u.fullName || u.name || '--')}</td>
            <td>
              <span class="badge ${roleBadge}">${roleLabel}</span>
              ${lockBadge}
            </td>
            <td>${formatDate(u.createdAt)}</td>
            <td>
              <div class="table-actions">
                ${u.is_locked === 1 ? `
                  <button class="btn btn-success btn-xs" onclick="window.unlockUser('${u.id}', '${escapeHtml(u.username)}')" title="Mở khóa tài khoản" style="padding: 2px 6px; font-size: 0.75rem;">
                    🔓 Mở khóa
                  </button>
                ` : `
                  <button class="btn btn-ghost btn-sm" onclick="window.showToast('Tính năng đang phát triển', 'info')" title="Sửa">
                    ✏️
                  </button>
                `}
              </div>
            </td>
          </tr>
        `;
      });

      tbody.innerHTML = html;
    } catch (error) {
      console.error('Error loading admin users:', error);
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">❌ Lỗi tải dữ liệu</td></tr>';
    }
  }

  // Hàm mở khóa tài khoản (expose ra global)
  window.unlockUser = async function (userId, username) {
    if (!confirm(`Bạn có chắc chắn muốn mở khóa tài khoản cho học sinh "${username}"?`)) return;

    try {
      const response = await window.apiRequest(`/api/admin/users/${userId}/unlock`, {
        method: 'POST'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Lỗi không thể mở khóa');
      }

      showToast(`Mở khóa thành công tài khoản "${username}"!`, 'success');
      loadAdminUsers();
      loadUserDropdown(); // Tải lại danh sách dropdown học sinh
    } catch (error) {
      showToast('Lỗi: ' + error.message, 'error');
    }
  };

  async function loadAdminCourses() {
    const container = document.getElementById('adminCoursesContent');
    if (!container) return;

    try {
      let courses = window.AppState.courses || [];
      if (!courses.length) {
        const response = await window.apiRequest('/api/courses');
        const result = await response.json();
        if (result.success && result.data) {
          courses = result.data.courses || result.data || [];
          window.AppState.courses = courses;
        }
      }

      if (courses.length === 0) {
        container.innerHTML = '<p class="text-muted">Chưa có khóa học nào</p>';
        return;
      }

      let html = '<div class="d-flex gap-sm" style="flex-wrap: wrap;">';
      courses.forEach(c => {
        html += `
          <div class="glass-card-sm" style="min-width: 200px; flex: 1;">
            <strong>${escapeHtml(c.name || c.title)}</strong>
            <p class="text-sm text-muted">${escapeHtml(c.description || '')}</p>
            <span class="text-sm text-muted">👥 ${c.enrolledCount || c.studentCount || 0} học viên</span>
          </div>
        `;
      });
      html += '</div>';

      container.innerHTML = html;
    } catch (error) {
      console.error('Error loading admin courses:', error);
      container.innerHTML = '<p class="text-muted">❌ Lỗi tải khóa học</p>';
    }
  }

  async function loadUserDropdown() {
    const select = document.getElementById('enrollUserId');
    if (!select) return;

    try {
      const response = await window.apiRequest('/api/admin/users');
      const result = await response.json();

      if (result.success && result.data) {
        const users = result.data.users || result.data || [];
        // Keep first option
        const firstOption = select.options[0];
        select.innerHTML = '';
        select.appendChild(firstOption);

        users.forEach(u => {
          if (u.role === 'student') {
            const opt = document.createElement('option');
            opt.value = u._id || u.id;
            opt.textContent = (u.fullName || u.username) + ' (' + u.username + ')';
            select.appendChild(opt);
          }
        });
      }
    } catch (error) {
      console.error('Error loading users for dropdown:', error);
    }
  }

  // ============================================
  // ENROLL STUDENT
  // ============================================
  function setupEnrollButton() {
    const btn = document.getElementById('btnEnroll');
    if (!btn) return;

    btn.addEventListener('click', async function () {
      const userId = document.getElementById('enrollUserId').value;
      const courseId = document.getElementById('enrollCourseId').value;

      if (!userId || !courseId) {
        window.showToast('Vui lòng chọn người dùng và khóa học', 'warning');
        return;
      }

      btn.disabled = true;
      btn.textContent = '⏳ Đang đăng ký...';

      try {
        const response = await window.apiRequest('/api/enrollments', {
          method: 'POST',
          body: JSON.stringify({ userId: userId, courseId: courseId })
        });

        const result = await response.json();

        if (result.success) {
          window.showToast('✅ Đăng ký thành công!', 'success');
          loadAdminCourses();
        } else {
          window.showToast('❌ ' + (result.message || 'Lỗi đăng ký'), 'error');
        }
      } catch (error) {
        console.error('Error enrolling student:', error);
        window.showToast('❌ Lỗi: ' + error.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '➕ Đăng ký';
      }
    });
  }

  // ============================================
  // HELPER: Safe set text
  // ============================================
  function setTextSafe(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ============================================
  // INIT
  // ============================================
  document.addEventListener('DOMContentLoaded', function () {
    setupCreateAssignment();
    setupEnrollButton();
  });

})();
