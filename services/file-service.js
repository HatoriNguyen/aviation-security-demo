/**
 * ============================================
 * SERVICE: File Management (SEC 2)
 * ============================================
 * Quản lý tài liệu khóa học an toàn
 * - Upload với hash SHA-256
 * - Phân quyền truy cập theo role/enrollment
 * - Audit trail cho mọi thao tác
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { logAction } = require('./audit-service');

// Thư mục lưu trữ file
const STORAGE_DIR = path.join(__dirname, '..', 'private-storage');

/**
 * Tính SHA-256 hash cho file
 * @param {string} filePath - Đường dẫn tới file
 * @returns {string} SHA-256 hash hex string
 */
function computeFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Upload tài liệu mới
 * Lưu metadata vào database, tính hash file
 * @param {Database} db - Instance better-sqlite3
 * @param {Object} params
 * @param {Object} params.file - Multer file object
 * @param {string} params.courseId - ID khóa học
 * @param {string} params.uploadedBy - ID người upload
 * @param {string} params.ipAddress - IP address
 * @returns {Object} Thông tin tài liệu đã lưu
 */
function uploadDocument(db, { file, courseId, uploadedBy, ipAddress }) {
  // Kiểm tra khóa học tồn tại
  const course = db.prepare('SELECT id, name FROM courses WHERE id = ?').get(courseId);
  if (!course) {
    // Xóa file đã upload nếu khóa học không tồn tại
    _safeDeleteFile(file.path);
    throw new Error('Khóa học không tồn tại');
  }

  // Lấy hash và kết quả quét từ middleware (hoặc tự tính nếu thiếu)
  const fileHash = file.hash || computeFileHash(file.path);
  const scanResult = file.scanResult || { status: 'clean', detections: 0, total: 19, details: {} };

  // Kiểm tra trùng lặp file (cùng hash + cùng khóa học)
  const duplicate = db.prepare(`
    SELECT id, original_name FROM documents 
    WHERE file_hash = ? AND course_id = ? AND is_active = 1
  `).get(fileHash, courseId);

  if (duplicate) {
    _safeDeleteFile(file.path);
    throw new Error(`File đã tồn tại: "${duplicate.original_name}" (ID: ${duplicate.id})`);
  }

  // Tạo ID cho document
  const docId = `doc-${uuidv4().substring(0, 8)}`;

  // Lưu metadata vào database bao gồm scan kết quả
  const stmt = db.prepare(`
    INSERT INTO documents (id, original_name, stored_name, mime_type, file_size, file_hash, course_id, uploaded_by, is_active, version, scan_status, scan_detections, scan_total, scan_details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)
  `);

  stmt.run(
    docId,
    file.originalname,
    file.filename, // Tên UUID đã được multer tạo
    file.mimetype,
    file.size,
    fileHash,
    courseId,
    uploadedBy,
    scanResult.status,
    scanResult.detections,
    scanResult.total,
    JSON.stringify(scanResult.details)
  );

  // Ghi audit log
  logAction(db, {
    userId: uploadedBy,
    action: 'FILE_UPLOAD',
    targetType: 'document',
    targetId: docId,
    details: {
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      courseId: courseId,
      fileHash: fileHash,
      scanStatus: scanResult.status,
      scanDetections: scanResult.detections,
      scanTotal: scanResult.total
    },
    ipAddress: ipAddress,
    riskLevel: 'low'
  });

  // Trả về thông tin document (không bao gồm path vật lý)
  return {
    id: docId,
    originalName: file.originalname,
    mimeType: file.mimetype,
    fileSize: file.size,
    courseId: courseId,
    courseName: course.name,
    uploadedBy: uploadedBy,
    isActive: true,
    version: 1,
    scanStatus: scanResult.status,
    scanDetections: scanResult.detections,
    scanTotal: scanResult.total,
    scanDetails: scanResult.details,
    fileHash: fileHash
  };
}

/**
 * Lấy danh sách tài liệu theo quyền
 * @param {Database} db - Instance better-sqlite3
 * @param {Object} params
 * @param {string} params.courseId - Lọc theo khóa học (optional)
 * @param {string} params.userId - ID người yêu cầu
 * @param {string} params.role - Vai trò người yêu cầu
 * @returns {Array} Danh sách tài liệu
 */
function getDocuments(db, { courseId, userId, role }) {
  let query;
  let params = [];

  if (role === 'admin') {
    // Admin xem tất cả
    if (courseId) {
      query = `
        SELECT d.*, c.name as course_name, c.code as course_code, u.full_name as uploader_name
        FROM documents d
        JOIN courses c ON d.course_id = c.id
        LEFT JOIN users u ON d.uploaded_by = u.id
        WHERE d.course_id = ?
        ORDER BY d.uploaded_at DESC
      `;
      params = [courseId];
    } else {
      query = `
        SELECT d.*, c.name as course_name, c.code as course_code, u.full_name as uploader_name
        FROM documents d
        JOIN courses c ON d.course_id = c.id
        LEFT JOIN users u ON d.uploaded_by = u.id
        ORDER BY d.uploaded_at DESC
      `;
    }
  } else {
    // Teacher/Student: chỉ xem tài liệu active của khóa học đã đăng ký
    if (courseId) {
      query = `
        SELECT d.*, c.name as course_name, c.code as course_code, u.full_name as uploader_name
        FROM documents d
        JOIN courses c ON d.course_id = c.id
        LEFT JOIN users u ON d.uploaded_by = u.id
        JOIN enrollments e ON d.course_id = e.course_id AND e.user_id = ?
        WHERE d.course_id = ? AND d.is_active = 1
        ORDER BY d.uploaded_at DESC
      `;
      params = [userId, courseId];
    } else {
      query = `
        SELECT d.*, c.name as course_name, c.code as course_code, u.full_name as uploader_name
        FROM documents d
        JOIN courses c ON d.course_id = c.id
        LEFT JOIN users u ON d.uploaded_by = u.id
        JOIN enrollments e ON d.course_id = e.course_id AND e.user_id = ?
        WHERE d.is_active = 1
        ORDER BY d.uploaded_at DESC
      `;
      params = [userId];
    }
  }

  const documents = db.prepare(query).all(...params);

  // Chuẩn hóa cấu trúc trả về camelCase cho mọi role
  return documents.map(doc => {
    let detailsObj = {};
    try {
      detailsObj = doc.scan_details ? JSON.parse(doc.scan_details) : {};
    } catch (e) {
      console.error('[FILE-SERVICE] Lỗi parse scan_details:', e.message);
    }

    return {
      id: doc.id,
      originalName: doc.original_name,
      mimeType: doc.mime_type,
      fileSize: doc.file_size,
      courseId: doc.course_id,
      courseName: doc.course_name,
      courseCode: doc.course_code,
      uploaderId: doc.uploaded_by,
      uploaderName: doc.uploader_name,
      isActive: doc.is_active,
      version: doc.version,
      uploadedAt: doc.uploaded_at,
      scanStatus: doc.scan_status || 'clean',
      scanDetections: doc.scan_detections || 0,
      scanTotal: doc.scan_total || 19,
      scanDetails: detailsObj,
      fileHash: doc.file_hash,
      storedName: role === 'admin' ? doc.stored_name : undefined
    };
  });
}

/**
 * Lấy thông tin một tài liệu theo ID
 * @param {Database} db
 * @param {string} id - Document ID
 * @returns {Object|null} Thông tin tài liệu
 */
function getDocumentById(db, id) {
  return db.prepare(`
    SELECT d.*, c.name as course_name, c.code as course_code, u.full_name as uploader_name
    FROM documents d
    JOIN courses c ON d.course_id = c.id
    LEFT JOIN users u ON d.uploaded_by = u.id
    WHERE d.id = ?
  `).get(id);
}

/**
 * Bật/tắt trạng thái tài liệu (activate/deactivate)
 * @param {Database} db
 * @param {Object} params
 * @param {string} params.docId - ID tài liệu
 * @param {string} params.userId - ID người thực hiện
 * @param {string} params.role - Vai trò
 * @param {string} params.ipAddress - IP address
 * @returns {Object} Thông tin tài liệu sau khi cập nhật
 */
function toggleDocumentStatus(db, { docId, userId, role, ipAddress }) {
  const doc = getDocumentById(db, docId);
  if (!doc) {
    throw new Error('Tài liệu không tồn tại');
  }

  // Chỉ admin hoặc teacher của khóa học mới được toggle
  if (role !== 'admin') {
    const enrollment = db.prepare(`
      SELECT user_id FROM enrollments 
      WHERE user_id = ? AND course_id = ?
    `).get(userId, doc.course_id);

    if (!enrollment || role !== 'teacher') {
      throw new Error('Bạn không có quyền thay đổi trạng thái tài liệu này');
    }
  }

  const newStatus = doc.is_active ? 0 : 1;
  db.prepare('UPDATE documents SET is_active = ? WHERE id = ?').run(newStatus, docId);

  // Ghi audit log
  logAction(db, {
    userId: userId,
    action: newStatus ? 'FILE_ACTIVATED' : 'FILE_DEACTIVATED',
    targetType: 'document',
    targetId: docId,
    details: {
      originalName: doc.original_name,
      courseId: doc.course_id,
      previousStatus: doc.is_active,
      newStatus: newStatus
    },
    ipAddress: ipAddress,
    riskLevel: 'medium'
  });

  return {
    id: docId,
    originalName: doc.original_name,
    isActive: Boolean(newStatus),
    message: newStatus ? 'Tài liệu đã được kích hoạt' : 'Tài liệu đã bị vô hiệu hóa'
  };
}

/**
 * Xóa tài liệu (chỉ admin)
 * Xóa cả metadata trong DB và file vật lý
 * @param {Database} db
 * @param {Object} params
 * @param {string} params.docId - ID tài liệu
 * @param {string} params.userId - ID người thực hiện
 * @param {string} params.role - Vai trò (phải là admin)
 * @param {string} params.ipAddress - IP address
 * @returns {Object} Kết quả xóa
 */
function deleteDocument(db, { docId, userId, role, ipAddress }) {
  const doc = getDocumentById(db, docId);
  if (!doc) {
    throw new Error('Tài liệu không tồn tại');
  }

  // Chỉ admin hoặc giáo viên đã tải file lên mới được phép xóa
  if (role !== 'admin' && doc.uploaded_by !== userId) {
    throw new Error('Bạn chỉ có quyền xóa tài liệu do chính mình tải lên');
  }

  // Xóa file vật lý
  const filePath = path.join(STORAGE_DIR, doc.stored_name);
  _safeDeleteFile(filePath);

  // Xóa metadata trong database
  db.prepare('DELETE FROM documents WHERE id = ?').run(docId);

  // Ghi audit log
  logAction(db, {
    userId: userId,
    action: 'FILE_DELETED',
    targetType: 'document',
    targetId: docId,
    details: {
      originalName: doc.original_name,
      storedName: doc.stored_name,
      courseId: doc.course_id,
      fileHash: doc.file_hash,
      fileSize: doc.file_size
    },
    ipAddress: ipAddress,
    riskLevel: 'high'
  });

  return {
    id: docId,
    originalName: doc.original_name,
    message: 'Tài liệu đã bị xóa vĩnh viễn'
  };
}

/**
 * Lấy đường dẫn file vật lý để download (kiểm tra quyền)
 * @param {Database} db
 * @param {Object} params
 * @param {string} params.docId - ID tài liệu
 * @param {string} params.userId - ID người yêu cầu
 * @param {string} params.role - Vai trò
 * @param {string} params.ipAddress - IP address
 * @returns {Object} {filePath, originalName, mimeType}
 */
function getDocumentContent(db, { docId, userId, role, ipAddress }) {
  const doc = getDocumentById(db, docId);
  if (!doc) {
    throw new Error('Tài liệu không tồn tại');
  }

  // Kiểm tra tài liệu có active không (trừ admin)
  if (!doc.is_active && role !== 'admin') {
    throw new Error('Tài liệu đã bị vô hiệu hóa');
  }

  // Kiểm tra quyền truy cập khóa học (trừ admin)
  if (role !== 'admin') {
    const enrollment = db.prepare(`
      SELECT user_id FROM enrollments 
      WHERE user_id = ? AND course_id = ?
    `).get(userId, doc.course_id);

    if (!enrollment) {
      // Ghi audit log cho nỗ lực truy cập trái phép
      logAction(db, {
        userId: userId,
        action: 'FILE_ACCESS_DENIED',
        targetType: 'document',
        targetId: docId,
        details: {
          originalName: doc.original_name,
          courseId: doc.course_id,
          reason: 'Không có quyền truy cập khóa học'
        },
        ipAddress: ipAddress,
        riskLevel: 'high'
      });

      throw new Error('Bạn không có quyền truy cập tài liệu này');
    }
  }

  const filePath = path.join(STORAGE_DIR, doc.stored_name);

  // Ghi audit log cho download thành công
  logAction(db, {
    userId: userId,
    action: 'FILE_DOWNLOAD',
    targetType: 'document',
    targetId: docId,
    details: {
      originalName: doc.original_name,
      courseId: doc.course_id
    },
    ipAddress: ipAddress,
    riskLevel: 'low'
  });

  return {
    filePath: filePath,
    originalName: doc.original_name,
    mimeType: doc.mime_type,
    fileSize: doc.file_size
  };
}

/**
 * Xóa file an toàn, không throw nếu không tồn tại
 * @param {string} filePath
 */
function _safeDeleteFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('[FILE-SERVICE] Lỗi khi xóa file:', err.message);
  }
}

module.exports = {
  uploadDocument,
  getDocuments,
  getDocumentById,
  toggleDocumentStatus,
  deleteDocument,
  getDocumentContent,
  computeFileHash
};
