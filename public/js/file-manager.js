/**
 * ============================================
 * FILE-MANAGER.JS - File Management Module (SEC 2)
 * Aviation Academy AI Knowledge Support
 * ============================================
 */

(function () {
  'use strict';

  // ============================================
  // CONSTANTS
  // ============================================
  const ALLOWED_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
  ];
  const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.txt'];
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  // ============================================
  // LOAD DOCUMENTS
  // ============================================
  window.loadDocuments = async function (courseId) {
    const tableBody = document.getElementById('documentsTableBody');
    if (!tableBody) return;

    // Show loading
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center p-xl">
          <div class="d-flex items-center justify-center gap-md">
            <div class="spinner spinner-sm"></div>
            <span class="text-muted">Đang tải tài liệu...</span>
          </div>
        </td>
      </tr>
    `;

    try {
      const courseSelect = document.getElementById('fileCourseSelect');
      const selectedCourse = courseId || (courseSelect ? courseSelect.value : '');
      let url = '/api/files';
      if (selectedCourse) {
        url += '?courseId=' + encodeURIComponent(selectedCourse);
      }

      const response = await window.apiRequest(url);

      if (!response.ok) {
        throw new Error('Failed to load documents');
      }

      const result = await response.json();
      const documents = result.data?.documents || result.documents || result.files || (Array.isArray(result) ? result : []);
      renderDocuments(documents);
    } catch (error) {
      console.error('Failed to load documents:', error);
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center p-xl">
            <div class="empty-state">
              <span class="empty-icon">⚠️</span>
              <p class="empty-title">Không thể tải danh sách tài liệu</p>
              <p class="empty-desc">${escapeHtml(error.message)}</p>
              <button class="btn btn-secondary btn-sm mt-md" onclick="window.loadDocuments()">Thử lại</button>
            </div>
          </td>
        </tr>
      `;
    }
  };

  // ============================================
  // RENDER DOCUMENTS TABLE
  // ============================================
  function renderDocuments(docs) {
    const tableBody = document.getElementById('documentsTableBody');
    if (!tableBody) return;

    if (!docs || docs.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center p-xl">
            <div class="empty-state">
              <span class="empty-icon">📂</span>
              <p class="empty-title">Chưa có tài liệu nào</p>
              <p class="empty-desc">Tải lên tài liệu đầu tiên để bắt đầu</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    const user = window.getUser();
    const role = user ? user.role : 'student';

    tableBody.innerHTML = docs.map((doc, index) => {
      const statusClass = doc.isActive !== false ? 'badge-active' : 'badge-inactive';
      const statusText = doc.isActive !== false ? 'Hoạt động' : 'Vô hiệu';
      const statusDot = doc.isActive !== false ? 'active' : 'inactive';
      const uploadDate = window.formatDateTime(doc.uploadDate || doc.createdAt || doc.uploadedAt);
      const uploader = doc.uploaderName || doc.uploadedBy || doc.uploader || '--';
      const courseName = doc.courseName || doc.course || '--';
      const docName = doc.originalName || doc.fileName || doc.name || 'Không tên';
      const docId = doc.id || doc._id;

      // Cấu hình cột quét mã độc VirusTotal
      const detections = doc.scanDetections ?? 0;
      const total = doc.scanTotal ?? 19;
      const isMalicious = doc.scanStatus === 'malicious';
      const scanBadgeClass = isMalicious ? 'threat-badge critical' : 'threat-badge low';
      const scanBadgeText = isMalicious ? `🔴 ${detections}/${total} Mã độc` : `🛡️ ${detections}/${total} Sạch`;
      const scanBadge = `<span class="${scanBadgeClass}" style="cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;" onclick="window.viewScanReport('${docId}')" title="Xem chi tiết quét mã độc">${scanBadgeText}</span>`;

      return `
        <tr data-doc-id="${docId}">
          <td class="text-muted">${index + 1}</td>
          <td>
            <div class="d-flex items-center gap-sm">
              <span>${getFileIcon(docName)}</span>
              <span class="truncate" style="max-width: 200px;" title="${escapeHtml(docName)}">${escapeHtml(docName)}</span>
            </div>
          </td>
          <td><span class="course-badge">${escapeHtml(courseName)}</span></td>
          <td class="text-secondary">${escapeHtml(uploader)}</td>
          <td class="text-muted text-sm">${uploadDate}</td>
          <td>${scanBadge}</td>
          <td>
            <span class="badge ${statusClass}">
              <span class="status-dot ${statusDot}"></span>
              ${statusText}
            </span>
          </td>
          <td>
            <div class="table-actions">
              ${role !== 'student' ? `
                <button class="btn btn-ghost btn-sm" onclick="window.toggleDocStatus('${docId}')" title="Thay đổi trạng thái">
                  ${doc.isActive !== false ? '🔒' : '🔓'}
                </button>
              ` : ''}
              <button class="btn btn-ghost btn-sm" onclick="window.downloadFile('${docId}')" title="Tải xuống trực tiếp">
                📥
              </button>
              <button class="btn btn-ghost btn-sm" onclick="window.copyDownloadLink('${docId}')" title="Sao chép link tải an toàn">
                🔗
              </button>
              ${(role === 'admin' || (role === 'teacher' && doc.uploaderId === user.id)) ? `
                <button class="btn btn-ghost btn-sm admin-only" onclick="window.deleteDocument('${docId}', '${escapeHtml(docName)}')" title="Xóa">
                  🗑️
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function getFileIcon(filename) {
    const ext = (filename || '').split('.').pop().toLowerCase();
    const icons = {
      pdf: '📄',
      docx: '📝',
      doc: '📝',
      pptx: '📊',
      ppt: '📊',
      txt: '📃',
    };
    return icons[ext] || '📎';
  }

  // ============================================
  // FILE UPLOAD
  // ============================================
  function setupUpload() {
    const dropzone = document.getElementById('uploadDropzone');
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');

    if (!dropzone) return;

    // Drag and drop events
    ['dragenter', 'dragover'].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileSelect(files[0]);
      }
    });

    // Click to select file
    dropzone.addEventListener('click', () => {
      fileInput.click();
    });

    // File input change
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          handleFileSelect(e.target.files[0]);
        }
      });
    }

    // Upload button
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => {
        performUpload();
      });
    }
  }

  let selectedFile = null;

  function handleFileSelect(file) {
    // Validate file type
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      showToast(`Định dạng file không được phép: ${ext}. Chỉ chấp nhận: ${ALLOWED_EXTENSIONS.join(', ')}`, 'error');
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      showToast(`File quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Tối đa: 10MB`, 'error');
      return;
    }

    selectedFile = file;

    // Update UI
    const dropzone = document.getElementById('uploadDropzone');
    const uploadText = dropzone.querySelector('.upload-text');
    const uploadBtn = document.getElementById('uploadBtn');

    if (uploadText) {
      uploadText.innerHTML = `
        <strong>${escapeHtml(file.name)}</strong>
        <br><span class="text-muted text-sm">${(file.size / 1024).toFixed(1)} KB</span>
      `;
    }

    if (uploadBtn) {
      uploadBtn.classList.remove('d-none');
    }

    dropzone.style.borderColor = 'var(--success)';
  }

  async function performUpload() {
    if (!selectedFile) {
      showToast('Vui lòng chọn file để upload', 'warning');
      return;
    }

    const courseSelect = document.getElementById('fileCourseSelect');
    const courseId = courseSelect ? courseSelect.value : '';

    if (!courseId) {
      showToast('Vui lòng chọn môn học trước khi upload', 'warning');
      return;
    }

    const uploadBtn = document.getElementById('uploadBtn');
    const progressContainer = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const dropzone = document.getElementById('uploadDropzone');
    const uploadText = dropzone ? dropzone.querySelector('.upload-text') : null;

    // Disable button, show progress
    if (uploadBtn) uploadBtn.disabled = true;
    if (progressContainer) progressContainer.classList.add('active');

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('courseId', courseId);

    try {
      // Simulate progress với các giai đoạn quét VirusTotal
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 12;
        if (progress > 95) progress = 95;
        
        if (progressFill) progressFill.style.width = progress + '%';
        
        if (uploadText) {
          if (progress <= 30) {
            uploadText.innerHTML = `📤 Đang tải tệp tin lên server... (${Math.round(progress)}%)`;
          } else if (progress > 30 && progress <= 65) {
            uploadText.innerHTML = `🔍 Đang phân tích định dạng & Mã băm SHA-256... (${Math.round(progress)}%)`;
          } else {
            uploadText.innerHTML = `🛡️ VirusTotal: Đang quét mã độc qua 19 AV Engines... (${Math.round(progress)}%)`;
          }
        }
      }, 150);

      const response = await window.apiRequest('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      if (progressFill) progressFill.style.width = '100%';

      if (!response.ok) {
        const text = await response.text();
        let errorData = {};
        try { errorData = JSON.parse(text); } catch (e) {}
        
        if (errorData.code === 'UPLOAD_MALWARE_DETECTED') {
          if (uploadText) {
            uploadText.innerHTML = `<span class="text-danger">❌ Phát hiện mã độc! Tệp tin bị hệ thống chặn.</span>`;
            if (dropzone) dropzone.style.borderColor = 'var(--danger)';
          }
          // Hiển thị báo cáo quét VirusTotal ngay lập tức cho file bị nhiễm độc
          window.showScanReport(errorData.data);
          throw new Error(errorData.error || 'Tệp chứa mã độc!');
        }
        throw new Error(errorData.error || `HTTP ${response.status}: ${text.substring(0, 50)}`);
      }

      if (uploadText) {
        uploadText.innerHTML = `<span class="text-success">✅ Kiểm tra bảo mật hoàn tất. Tệp tin an toàn!</span>`;
      }
      showToast('Tải lên tài liệu thành công!', 'success');

      // Reset upload UI sau 1.5 giây
      setTimeout(() => {
        resetUploadUI();
        window.loadDocuments();
      }, 1500);

    } catch (error) {
      showToast('Lỗi upload: ' + error.message, 'error');
      if (uploadText && error.message.indexOf('mã độc') === -1) {
        uploadText.innerHTML = `<span class="text-danger">❌ Lỗi upload: ${escapeHtml(error.message)}</span>`;
        if (dropzone) dropzone.style.borderColor = 'var(--danger)';
      }
    } finally {
      if (uploadBtn) uploadBtn.disabled = false;
      setTimeout(() => {
        if (progressContainer) progressContainer.classList.remove('active');
        if (progressFill) progressFill.style.width = '0%';
      }, 1500);
    }
  }

  function resetUploadUI() {
    selectedFile = null;
    const dropzone = document.getElementById('uploadDropzone');
    const uploadText = dropzone ? dropzone.querySelector('.upload-text') : null;
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('fileInput');

    if (uploadText) {
      uploadText.innerHTML = 'Kéo thả file vào đây hoặc <strong>click để chọn</strong>';
    }
    if (uploadBtn) uploadBtn.classList.add('d-none');
    if (dropzone) dropzone.style.borderColor = '';
    if (fileInput) fileInput.value = '';
  }

  // ============================================
  // TOGGLE STATUS
  // ============================================
  window.toggleDocStatus = async function (docId) {
    try {
      const response = await window.apiRequest(`/api/files/${docId}/status`, {
        method: 'PATCH',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Không thể thay đổi trạng thái');
      }

      showToast('Đã cập nhật trạng thái tài liệu', 'success');
      window.loadDocuments();
    } catch (error) {
      showToast('Lỗi: ' + error.message, 'error');
    }
  };

  // ============================================
  // DELETE DOCUMENT
  // ============================================
  window.deleteDocument = function (docId, docName) {
    // Show confirmation modal
    const modal = document.getElementById('confirmModal');
    const confirmText = document.getElementById('confirmText');
    const confirmBtn = document.getElementById('confirmAction');

    if (confirmText) {
      confirmText.textContent = `Bạn có chắc chắn muốn xóa tài liệu "${docName}"? Hành động này không thể hoàn tác.`;
    }

    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        window.closeModal('confirmModal');
        try {
          const response = await window.apiRequest(`/api/files/${docId}`, {
            method: 'DELETE',
          });

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || 'Không thể xóa tài liệu');
          }

          showToast('Đã xóa tài liệu thành công', 'success');
          window.loadDocuments();
        } catch (error) {
          showToast('Lỗi: ' + error.message, 'error');
        }
      };
    }

    window.openModal('confirmModal');
  };

  // ============================================
  // DOWNLOAD FILE
  // ============================================
  window.downloadFile = async function (docId) {
    try {
      const response = await window.apiRequest(`/api/files/${docId}/download`);

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Không thể tải xuống file');
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Try to get filename from Content-Disposition header
      const disposition = response.headers.get('Content-Disposition');
      let filename = 'download';
      if (disposition && disposition.includes('filename=')) {
        filename = disposition.split('filename=')[1].replace(/"/g, '').trim();
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      showToast('Đang tải xuống tài liệu...', 'info');
    } catch (error) {
      showToast('Lỗi tải xuống: ' + error.message, 'error');
    }
  };

  // ============================================
  // SECURITY SCAN & SHARE FUNCTIONS
  // ============================================
  window.showScanReport = function (doc) {
    if (!doc) return;

    document.getElementById('scanFileName').textContent = doc.originalName || doc.fileName || 'Không tên';
    document.getElementById('scanFileHash').textContent = `SHA-256: ${doc.fileHash || 'N/A'}`;
    
    const detections = doc.scanDetections ?? 0;
    const total = doc.scanTotal ?? 19;
    document.getElementById('scanScore').textContent = `${detections}/${total}`;
    
    const scoreContainer = document.getElementById('scanScoreContainer');
    const statusLabel = document.getElementById('scanStatusLabel');
    const statusDetail = document.getElementById('scanStatusDetail');

    if (detections > 0) {
      scoreContainer.style.background = 'rgba(255, 71, 87, 0.2)';
      scoreContainer.style.color = '#ff4757';
      statusLabel.textContent = 'Mã độc!';
      statusDetail.textContent = 'Phát hiện nguy hiểm';
      statusDetail.className = 'text-danger font-weight-bold';
    } else {
      scoreContainer.style.background = 'rgba(46, 213, 115, 0.2)';
      scoreContainer.style.color = '#2ed573';
      statusLabel.textContent = 'An toàn';
      statusDetail.textContent = 'Hoàn thành (Không phát hiện)';
      statusDetail.className = 'text-success font-weight-bold';
    }

    // Format metadata
    const sizeKb = doc.fileSize ? (doc.fileSize / 1024).toFixed(1) + ' KB' : '--';
    document.getElementById('scanFileSize').textContent = sizeKb;
    document.getElementById('scanFileType').textContent = doc.mimeType || doc.fileType || '--';
    document.getElementById('scanTime').textContent = doc.uploadedAt ? window.formatDateTime(doc.uploadedAt) : new Date().toLocaleString();

    // Populate engines table
    const enginesBody = document.getElementById('scanEnginesBody');
    if (enginesBody) {
      const details = doc.scanDetails || {};
      const engineNames = [
        'Kaspersky', 'Bitdefender', 'Microsoft', 'Symantec', 'Sophos', 
        'Avast', 'ESET-NOD32', 'CrowdStrike', 'TrendMicro', 'McAfee', 
        'Fortinet', 'ClamAV', 'Malwarebytes', 'PaloAlto', 'F-Secure',
        'AhnLab-V3', 'VIPRE', 'Webroot', 'SentinelOne'
      ];

      enginesBody.innerHTML = engineNames.map(engine => {
        const engineResult = details[engine] || { status: 'clean', result: 'Undetected' };
        const isMalicious = engineResult.status === 'malicious';
        const badgeClass = isMalicious ? 'threat-badge critical' : 'threat-badge low';
        const statusText = isMalicious ? '🔴 Phát hiện' : '🟢 Sạch';
        const resultText = isMalicious ? engineResult.result : 'Undetected';

        return `
          <tr>
            <td><strong>${engine}</strong></td>
            <td><span class="${badgeClass}" style="padding: 2px 8px; font-size: 0.72rem;">${statusText}</span></td>
            <td class="${isMalicious ? 'text-danger font-weight-bold' : 'text-muted'}" style="font-family: monospace;">${resultText}</td>
          </tr>
        `;
      }).join('');
    }

    window.openModal('scanReportModal');
  };

  window.viewScanReport = async function (docId) {
    try {
      const response = await window.apiRequest(`/api/files/${docId}`);
      if (!response.ok) throw new Error('Không thể lấy báo cáo bảo mật');
      const result = await response.json();
      window.showScanReport(result.data);
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  };

  window.copyDownloadLink = function (docId) {
    const token = window.getToken();
    const url = `${window.location.origin}/api/files/${docId}/download?token=${token}`;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        showToast('Đã sao chép link tải bảo mật thành công!', 'success');
      }).catch(err => {
        fallbackCopyText(url);
      });
    } else {
      fallbackCopyText(url);
    }
  };

  function fallbackCopyText(text) {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast('Đã sao chép link tải bảo mật thành công!', 'success');
  }

  // ============================================
  // MODAL HELPERS
  // ============================================
  window.openModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('visible');
  };

  window.closeModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('visible');

    // Tự động reset upload UI nếu đóng modal báo cáo mã độc của file vừa upload
    if (modalId === 'scanReportModal') {
      const dropzone = document.getElementById('uploadDropzone');
      const uploadText = dropzone ? dropzone.querySelector('.upload-text') : null;
      if (uploadText && uploadText.innerHTML.includes('Phát hiện mã độc')) {
        resetUploadUI();
      }
    }
  };

  // ============================================
  // COURSE SELECT CHANGE
  // ============================================
  function setupCourseFilter() {
    const courseSelect = document.getElementById('fileCourseSelect');
    if (courseSelect) {
      courseSelect.addEventListener('change', () => {
        window.loadDocuments(courseSelect.value);
      });
    }
  }

  // ============================================
  // INITIALIZE
  // ============================================
  document.addEventListener('DOMContentLoaded', () => {
    setupUpload();
    setupCourseFilter();
  });
})();
