/**
 * ============================================
 * GRADE-MANAGER.JS - Grade Management Module
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

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }

  function getPercentage(score, maxScore) {
    if (!maxScore || maxScore === 0) return 0;
    return Math.round((score / maxScore) * 100);
  }

  function getGradeColor(percentage) {
    if (percentage >= 80) return 'var(--success)';
    if (percentage >= 50) return 'var(--warning)';
    return 'var(--danger)';
  }

  function getGradeBgColor(percentage) {
    if (percentage >= 80) return 'var(--success-bg)';
    if (percentage >= 50) return 'var(--warning-bg)';
    return 'var(--danger-bg)';
  }

  function getGradeBorderColor(percentage) {
    if (percentage >= 80) return 'var(--success-border)';
    if (percentage >= 50) return 'var(--warning-border)';
    return 'var(--danger-border)';
  }

  function getGradeEmoji(percentage) {
    if (percentage >= 90) return '🌟';
    if (percentage >= 80) return '✅';
    if (percentage >= 70) return '👍';
    if (percentage >= 50) return '⚠️';
    return '❌';
  }

  function getLetterGrade(percentage) {
    if (percentage >= 90) return 'A';
    if (percentage >= 80) return 'B';
    if (percentage >= 70) return 'C';
    if (percentage >= 60) return 'D';
    if (percentage >= 50) return 'E';
    return 'F';
  }

  // ============================================
  // LOAD GRADES
  // ============================================
  window.loadGrades = async function () {
    const contentEl = document.getElementById('gradesContent');
    const studentSummary = document.getElementById('gradesSummaryStudent');
    const teacherFilter = document.getElementById('gradesTeacherFilter');

    if (!contentEl) return;

    // Show/hide role-specific sections
    if (studentSummary) {
      studentSummary.style.display = isTeacherOrAdmin() ? 'none' : 'block';
    }
    if (teacherFilter) {
      teacherFilter.style.display = isTeacherOrAdmin() ? 'block' : 'none';
    }

    // Show loading
    contentEl.innerHTML = `
      <div class="glass-card text-center p-xl">
        <div class="d-flex items-center justify-center gap-md">
          <div class="spinner spinner-sm"></div>
          <span class="text-muted">Đang tải bảng điểm...</span>
        </div>
      </div>
    `;

    try {
      // Load grades
      const courseFilter = document.getElementById('gradeCourseFilter');
      let url = '/api/grades';
      if (courseFilter && courseFilter.value) {
        url += '?courseId=' + encodeURIComponent(courseFilter.value);
      }

      const response = await window.apiRequest(url);
      const result = await response.json();

      if (!result.success || !result.data) {
        contentEl.innerHTML = '<div class="glass-card text-center p-xl text-muted">Không thể tải dữ liệu điểm</div>';
        return;
      }

      const grades = result.data.grades || result.data || [];

      if (grades.length === 0) {
        contentEl.innerHTML = `
          <div class="glass-card text-center p-xl">
            <div style="font-size: 3rem; margin-bottom: var(--space-md);">📊</div>
            <p class="text-muted">Chưa có dữ liệu điểm</p>
          </div>
        `;
        return;
      }

      if (isTeacherOrAdmin()) {
        renderTeacherGrades(grades, contentEl);
        loadGradesSummary();
      } else {
        renderStudentGrades(grades, contentEl);
        updateStudentSummary(grades);
      }

      // Load course dropdown for filter
      loadCourseFilterDropdown();
    } catch (error) {
      console.error('Error loading grades:', error);
      contentEl.innerHTML = `
        <div class="glass-card text-center p-xl">
          <span class="text-muted">❌ Lỗi tải bảng điểm: ${escapeHtml(error.message)}</span>
        </div>
      `;
    }
  };

  // ============================================
  // RENDER STUDENT GRADES (Cards)
  // ============================================
  function renderStudentGrades(grades, container) {
    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-md);">';

    grades.forEach(g => {
      const score = g.score !== undefined ? g.score : 0;
      const maxScore = g.max_score || g.maxScore || g.grade_max_score || 10;
      const pct = getPercentage(score, maxScore);
      const color = getGradeColor(pct);
      const bgColor = getGradeBgColor(pct);
      const borderColor = getGradeBorderColor(pct);
      const emoji = getGradeEmoji(pct);
      const letter = getLetterGrade(pct);
      const assignTitle = g.assignment_title || g.assignmentTitle || g.title || 'Bài tập';
      const courseName = g.course_name || g.courseName || '';

      html += `
        <div class="glass-card" style="border-left: 4px solid ${color}; position: relative; overflow: hidden;">
          <div style="position: absolute; top: 0; right: 0; padding: var(--space-sm) var(--space-md);
            background: ${bgColor}; border-bottom-left-radius: var(--radius-md);
            font-size: 1.5rem; font-weight: 700; color: ${color};">
            ${letter}
          </div>
          
          <h4 style="margin: 0 0 var(--space-xs) 0; padding-right: 60px; color: var(--text-bright);">
            ${emoji} ${escapeHtml(assignTitle)}
          </h4>
          
          ${courseName ? `<p class="text-sm text-muted" style="margin: 0 0 var(--space-sm) 0;">📚 ${escapeHtml(courseName)}</p>` : ''}
          
          <!-- Score Bar -->
          <div style="margin: var(--space-sm) 0;">
            <div class="d-flex justify-between items-center" style="margin-bottom: 4px;">
              <span class="text-sm" style="color: ${color}; font-weight: 600;">
                ${score} / ${maxScore} điểm
              </span>
              <span class="text-sm" style="color: ${color}; font-weight: 700;">
                ${pct}%
              </span>
            </div>
            <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden;">
              <div style="width: ${pct}%; height: 100%; background: ${color}; border-radius: 4px;
                transition: width 0.8s ease; box-shadow: 0 0 8px ${color}40;"></div>
            </div>
          </div>
          
          ${g.feedback ? `
            <div style="margin-top: var(--space-sm); padding: var(--space-sm); 
              background: rgba(255,255,255,0.04); border-radius: var(--radius-sm); 
              border: 1px solid ${borderColor};">
              <span class="text-sm text-muted">💬 Nhận xét: </span>
              <span class="text-sm">${escapeHtml(g.feedback)}</span>
            </div>
          ` : ''}
          
          <div class="text-sm text-muted" style="margin-top: var(--space-sm);">
            📅 ${formatDate(g.graded_at || g.gradedAt || g.createdAt)}
          </div>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  }

  // ============================================
  // UPDATE STUDENT SUMMARY
  // ============================================
  function updateStudentSummary(grades) {
    if (!grades || grades.length === 0) return;

    const scoredGrades = grades.filter(g => g.score !== undefined && g.score !== null);

    if (scoredGrades.length === 0) return;

    // Calculate GPA (average percentage)
    let totalPct = 0;
    let passCount = 0;

    scoredGrades.forEach(g => {
      const pct = getPercentage(g.score, g.max_score || g.maxScore || 10);
      totalPct += pct;
      if (pct >= 50) passCount++;
    });

    const avgPct = Math.round(totalPct / scoredGrades.length);

    // Convert to 10-point scale
    const gpa = (avgPct / 10).toFixed(1);

    setTextSafe('studentGPA', gpa + '/10');
    setTextSafe('studentPassed', passCount + '/' + scoredGrades.length);
    setTextSafe('studentTotal', grades.length);
  }

  // ============================================
  // RENDER TEACHER GRADES (Table)
  // ============================================
  function renderTeacherGrades(grades, container) {
    let html = '';

    // Summary stats first
    html += '<div id="gradesSummaryTeacher" class="mb-lg"></div>';

    // Grades table
    html += `
      <div class="glass-card">
        <h3 style="margin-bottom: var(--space-md);">📋 Bảng điểm chi tiết</h3>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Học viên</th>
                <th>Bài tập</th>
                <th>Môn học</th>
                <th>Điểm</th>
                <th>Phần trăm</th>
                <th>Nhận xét</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
    `;

    grades.forEach(g => {
      const score = g.score !== undefined ? g.score : '--';
      const maxScore = g.max_score || g.maxScore || g.grade_max_score || 10;
      const pct = g.score !== undefined ? getPercentage(g.score, maxScore) : '--';
      const color = g.score !== undefined ? getGradeColor(pct) : 'var(--text-muted)';
      const studentName = g.student_name || g.studentName || (g.student && g.student.fullName) || 'N/A';
      const assignTitle = g.assignment_title || g.assignmentTitle || g.title || 'N/A';
      const courseName = g.course_name || g.courseName || '';
      const submissionId = g.submission_id || g.submissionId || g._id || g.id;

      html += `
        <tr>
          <td>${escapeHtml(studentName)}</td>
          <td>${escapeHtml(assignTitle)}</td>
          <td>${escapeHtml(courseName)}</td>
          <td style="font-weight: 600; color: ${color};">${score}/${maxScore}</td>
          <td>
            ${pct !== '--' ? `
              <div class="d-flex items-center gap-sm">
                <div style="width: 60px; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
                  <div style="width: ${pct}%; height: 100%; background: ${color}; border-radius: 3px;"></div>
                </div>
                <span class="text-sm" style="color: ${color};">${pct}%</span>
              </div>
            ` : '--'}
          </td>
          <td class="text-sm">${escapeHtml(g.feedback || '--')}</td>
          <td>
            <button class="btn btn-primary btn-sm" onclick="window.showInlineGrade('${submissionId}')">
              ✏️ Sửa
            </button>
          </td>
        </tr>
        <tr id="inlineGrade-${submissionId}" style="display: none;">
          <td colspan="7">
            <div class="d-flex gap-sm items-end" style="padding: var(--space-sm) 0;">
              <div class="form-group" style="min-width: 100px;">
                <label class="form-label">Điểm</label>
                <input type="number" class="form-input" id="inlineScore-${submissionId}" 
                  value="${g.score || ''}" min="0" max="${maxScore}" placeholder="Điểm">
              </div>
              <div class="form-group" style="flex: 1;">
                <label class="form-label">Nhận xét</label>
                <textarea class="form-input" id="inlineFeedback-${submissionId}" rows="2"
                  placeholder="Nhận xét cho học viên...">${escapeHtml(g.feedback || '')}</textarea>
              </div>
              <div class="d-flex gap-sm">
                <button class="btn btn-primary btn-sm" onclick="window.saveInlineGrade('${submissionId}')">
                  💾 Lưu
                </button>
                <button class="btn btn-ghost btn-sm" onclick="document.getElementById('inlineGrade-${submissionId}').style.display='none'">
                  ❌
                </button>
              </div>
            </div>
          </td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Now render summary stats
    renderTeacherSummaryStats(grades);
  }

  // ============================================
  // TEACHER SUMMARY STATS
  // ============================================
  function renderTeacherSummaryStats(grades) {
    const container = document.getElementById('gradesSummaryTeacher');
    if (!container) return;

    const scoredGrades = grades.filter(g => g.score !== undefined && g.score !== null);

    if (scoredGrades.length === 0) {
      container.innerHTML = '';
      return;
    }

    const scores = scoredGrades.map(g => getPercentage(g.score, g.max_score || g.maxScore || 10));
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const highest = Math.max(...scores);
    const lowest = Math.min(...scores);
    const passRate = Math.round((scores.filter(s => s >= 50).length / scores.length) * 100);

    container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card glass-card accent">
          <div class="stat-icon">📊</div>
          <div class="stat-value" style="color: ${getGradeColor(avg)};">${avg}%</div>
          <div class="stat-label">Điểm trung bình</div>
        </div>
        <div class="stat-card glass-card">
          <div class="stat-icon">🏆</div>
          <div class="stat-value" style="color: var(--success);">${highest}%</div>
          <div class="stat-label">Điểm cao nhất</div>
        </div>
        <div class="stat-card glass-card">
          <div class="stat-icon">📉</div>
          <div class="stat-value" style="color: ${getGradeColor(lowest)};">${lowest}%</div>
          <div class="stat-label">Điểm thấp nhất</div>
        </div>
        <div class="stat-card glass-card">
          <div class="stat-icon">✅</div>
          <div class="stat-value" style="color: ${passRate >= 70 ? 'var(--success)' : 'var(--warning)'};">${passRate}%</div>
          <div class="stat-label">Tỷ lệ đạt (≥50%)</div>
        </div>
      </div>
    `;
  }

  // ============================================
  // LOAD GRADES SUMMARY (API)
  // ============================================
  async function loadGradesSummary() {
    try {
      const response = await window.apiRequest('/api/grades/summary');
      const result = await response.json();
      if (result.success && result.data) {
        // Summary data is available from API — data contains studentAverages & courseStats
        console.log('Grades summary loaded:', result.data);
      }
    } catch (error) {
      // Summary endpoint is optional, fail silently
      console.log('Grades summary not available');
    }
  }

  // ============================================
  // INLINE GRADE (Teacher)
  // ============================================
  window.showInlineGrade = function (submissionId) {
    const row = document.getElementById('inlineGrade-' + submissionId);
    if (row) {
      row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
    }
  };

  window.saveInlineGrade = async function (submissionId) {
    const scoreEl = document.getElementById('inlineScore-' + submissionId);
    const feedbackEl = document.getElementById('inlineFeedback-' + submissionId);

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
        window.showToast('✅ Đã cập nhật điểm!', 'success');
        // Hide inline form
        const row = document.getElementById('inlineGrade-' + submissionId);
        if (row) row.style.display = 'none';
        // Reload grades
        window.loadGrades();
      } else {
        window.showToast('❌ ' + (result.message || 'Lỗi cập nhật điểm'), 'error');
      }
    } catch (error) {
      console.error('Error saving grade:', error);
      window.showToast('❌ Lỗi: ' + error.message, 'error');
    }
  };

  // ============================================
  // LOAD COURSE FILTER DROPDOWN
  // ============================================
  async function loadCourseFilterDropdown() {
    const select = document.getElementById('gradeCourseFilter');
    if (!select) return;

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
    } catch (error) {
      console.error('Error loading courses for filter:', error);
    }
  }

  // ============================================
  // HELPER: Safe set text
  // ============================================
  function setTextSafe(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

})();
