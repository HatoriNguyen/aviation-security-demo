/**
 * ============================================
 * ROUTES: File Management (SEC 2)
 * ============================================
 * Upload, download, quản lý tài liệu khóa học
 * Tất cả endpoint đều yêu cầu xác thực
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { upload, validateFile } = require('../middleware/upload-validator');
const {
  uploadDocument,
  getDocuments,
  getDocumentById,
  toggleDocumentStatus,
  deleteDocument,
  getDocumentContent
} = require('../services/file-service');

const router = express.Router();

/**
 * POST /api/files/upload
 * Upload tài liệu mới cho khóa học
 * Requires: teacher hoặc admin
 * Body: multipart/form-data { file, courseId }
 */
router.post('/upload',
  authenticateToken,
  requireRole('admin', 'teacher'),
  upload.single('file'),
  validateFile,
  (req, res) => {
    try {
      const db = req.app.locals.db;
      const { courseId } = req.body;

      if (!courseId) {
        return res.status(400).json({
          success: false,
          error: 'Thiếu mã khóa học (courseId)',
          code: 'UPLOAD_MISSING_COURSE'
        });
      }

      const result = uploadDocument(db, {
        file: req.file,
        courseId: courseId,
        uploadedBy: req.user.id,
        ipAddress: req.ip
      });

      res.status(201).json({
        success: true,
        message: 'Upload tài liệu thành công',
        data: result
      });

    } catch (err) {
      console.error('[FILE] Upload error:', err.message);

      // Nếu upload thất bại, xóa file đã lưu
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
      }

      const statusCode = err.message.includes('không tồn tại') ? 404
        : err.message.includes('đã tồn tại') ? 409
        : 500;

      res.status(statusCode).json({
        success: false,
        error: err.message,
        code: 'UPLOAD_ERROR'
      });
    }
  }
);

/**
 * GET /api/files
 * Lấy danh sách tài liệu (lọc theo quyền)
 * Query params: courseId (optional)
 */
router.get('/', authenticateToken, (req, res) => {
  try {
    const db = req.app.locals.db;
    const { courseId } = req.query;

    const documents = getDocuments(db, {
      courseId: courseId,
      userId: req.user.id,
      role: req.user.role
    });

    res.json({
      success: true,
      data: {
        documents: documents,
        total: documents.length,
        courseId: courseId || 'all'
      }
    });

  } catch (err) {
    console.error('[FILE] List error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi lấy danh sách tài liệu',
      code: 'FILE_LIST_ERROR'
    });
  }
});

/**
 * GET /api/files/:id
 * Lấy chi tiết một tài liệu
 */
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const db = req.app.locals.db;
    const doc = getDocumentById(db, req.params.id);

    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Tài liệu không tồn tại',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Kiểm tra quyền truy cập (trừ admin)
    if (req.user.role !== 'admin') {
      const enrollment = db.prepare(`
        SELECT user_id FROM enrollments 
        WHERE user_id = ? AND course_id = ?
      `).get(req.user.id, doc.course_id);

      if (!enrollment) {
        return res.status(403).json({
          success: false,
          error: 'Bạn không có quyền xem tài liệu này',
          code: 'FILE_ACCESS_DENIED'
        });
      }
    }

    // Đồng nhất cấu trúc trả về camelCase bao gồm kết quả quét bảo mật
    let scanDetails = {};
    try {
      scanDetails = doc.scan_details ? JSON.parse(doc.scan_details) : {};
    } catch (e) {
      console.error('[FILE-ROUTE] Lỗi parse scan_details:', e.message);
    }

    const responseData = {
      id: doc.id,
      originalName: doc.original_name,
      mimeType: doc.mime_type,
      fileSize: doc.file_size,
      courseId: doc.course_id,
      courseName: doc.course_name,
      courseCode: doc.course_code,
      uploaderName: doc.uploader_name,
      isActive: doc.is_active,
      version: doc.version,
      uploadedAt: doc.uploaded_at,
      scanStatus: doc.scan_status || 'clean',
      scanDetections: doc.scan_detections || 0,
      scanTotal: doc.scan_total || 19,
      scanDetails: scanDetails,
      fileHash: doc.file_hash,
      storedName: req.user.role === 'admin' ? doc.stored_name : undefined
    };

    res.json({
      success: true,
      data: responseData
    });

  } catch (err) {
    console.error('[FILE] Get error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi lấy thông tin tài liệu',
      code: 'FILE_GET_ERROR'
    });
  }
});

/**
 * GET /api/files/:id/download
 * Download tài liệu (kiểm tra quyền)
 */
router.get('/:id/download', authenticateToken, (req, res) => {
  try {
    const db = req.app.locals.db;

    const result = getDocumentContent(db, {
      docId: req.params.id,
      userId: req.user.id,
      role: req.user.role,
      ipAddress: req.ip
    });

    // Kiểm tra file vật lý tồn tại
    if (!fs.existsSync(result.filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File không tìm thấy trên server (có thể là tài liệu mẫu)',
        code: 'FILE_PHYSICAL_NOT_FOUND'
      });
    }

    // Set headers cho download
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.originalName)}"`);
    res.setHeader('Content-Length', result.fileSize);

    // Stream file
    const fileStream = fs.createReadStream(result.filePath);
    fileStream.pipe(res);

  } catch (err) {
    console.error('[FILE] Download error:', err.message);

    const statusCode = err.message.includes('không tồn tại') ? 404
      : err.message.includes('quyền') ? 403
      : err.message.includes('vô hiệu hóa') ? 403
      : 500;

    res.status(statusCode).json({
      success: false,
      error: err.message,
      code: 'FILE_DOWNLOAD_ERROR'
    });
  }
});

/**
 * PATCH /api/files/:id/status
 * Bật/tắt trạng thái tài liệu
 * Requires: teacher (cùng khóa) hoặc admin
 */
router.patch('/:id/status', authenticateToken, requireRole('admin', 'teacher'), (req, res) => {
  try {
    const db = req.app.locals.db;

    const result = toggleDocumentStatus(db, {
      docId: req.params.id,
      userId: req.user.id,
      role: req.user.role,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: result.message,
      data: result
    });

  } catch (err) {
    console.error('[FILE] Toggle status error:', err.message);

    const statusCode = err.message.includes('không tồn tại') ? 404
      : err.message.includes('quyền') ? 403
      : 500;

    res.status(statusCode).json({
      success: false,
      error: err.message,
      code: 'FILE_STATUS_ERROR'
    });
  }
});

/**
 * DELETE /api/files/:id
 * Xóa tài liệu vĩnh viễn (chỉ admin)
 */
router.delete('/:id', authenticateToken, requireRole('admin', 'teacher'), (req, res) => {
  try {
    const db = req.app.locals.db;

    const result = deleteDocument(db, {
      docId: req.params.id,
      userId: req.user.id,
      role: req.user.role,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: result.message,
      data: result
    });

  } catch (err) {
    console.error('[FILE] Delete error:', err.message);

    const statusCode = err.message.includes('không tồn tại') ? 404
      : err.message.includes('quyền') ? 403
      : 500;

    res.status(statusCode).json({
      success: false,
      error: err.message,
      code: 'FILE_DELETE_ERROR'
    });
  }
});

// ── Xử lý lỗi multer ──
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: 'File vượt quá kích thước cho phép (tối đa 10MB)',
      code: 'UPLOAD_FILE_TOO_LARGE'
    });
  }

  if (err.code === 'UPLOAD_INVALID_EXTENSION' || err.code === 'UPLOAD_INVALID_MIME' || err.code === 'UPLOAD_MIME_MISMATCH') {
    return res.status(400).json({
      success: false,
      error: err.message,
      code: err.code
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      error: 'Field name không hợp lệ. Sử dụng "file" cho upload.',
      code: 'UPLOAD_WRONG_FIELD'
    });
  }

  next(err);
});

module.exports = router;
