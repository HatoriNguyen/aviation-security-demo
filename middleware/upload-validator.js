/**
 * ============================================
 * MIDDLEWARE: Upload Validator (SEC 2 CORE)
 * ============================================
 * Xác thực và lọc file upload an toàn
 * - Giới hạn kích thước file
 * - Chỉ cho phép định dạng an toàn
 * - Kiểm tra MIME type khớp extension
 * - Lưu file với tên UUID để chống path traversal
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Đường dẫn thư mục lưu trữ riêng tư (không public)
const UPLOAD_DIR = path.join(__dirname, '..', 'private-storage');

// ── Mapping extension → MIME types được phép ──
const ALLOWED_TYPES = {
  '.pdf': ['application/pdf', 'application/octet-stream'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream',
    'application/x-zip-compressed',
    'application/zip'
  ],
  '.pptx': [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/octet-stream',
    'application/x-zip-compressed',
    'application/zip'
  ],
  '.txt': ['text/plain', 'application/octet-stream']
};

// Tập hợp tất cả extensions được phép
const ALLOWED_EXTENSIONS = Object.keys(ALLOWED_TYPES);

// Tập hợp tất cả MIME types được phép
const ALLOWED_MIME_TYPES = Object.values(ALLOWED_TYPES).flat();

// Kích thước file tối đa: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Cấu hình storage cho multer
 * File được lưu với tên UUID để ngăn path traversal và trùng tên
 */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Đảm bảo thư mục upload tồn tại
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    // Tạo tên file an toàn: UUID + extension gốc
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${uuidv4()}${ext}`;
    cb(null, safeName);
  }
});

/**
 * File filter - kiểm tra trước khi multer lưu file
 * Lọc theo extension và MIME type
 */
function fileFilter(req, file, cb) {
  // Lấy extension từ tên file gốc
  const ext = path.extname(file.originalname).toLowerCase();

  // Kiểm tra extension có được phép không
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    const error = new Error(`Định dạng file không được phép: ${ext}. Chỉ chấp nhận: ${ALLOWED_EXTENSIONS.join(', ')}`);
    error.code = 'UPLOAD_INVALID_EXTENSION';
    return cb(error, false);
  }

  // Kiểm tra MIME type có nằm trong danh sách cho phép không
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    const error = new Error(`MIME type không được phép: ${file.mimetype}`);
    error.code = 'UPLOAD_INVALID_MIME';
    return cb(error, false);
  }

  // Kiểm tra MIME type có khớp với extension không (ngăn giả mạo)
  const expectedMimes = ALLOWED_TYPES[ext];
  if (!expectedMimes || !expectedMimes.includes(file.mimetype)) {
    const error = new Error(`MIME type ${file.mimetype} không khớp với extension ${ext}. Có thể file đã bị giả mạo.`);
    error.code = 'UPLOAD_MIME_MISMATCH';
    return cb(error, false);
  }

  cb(null, true);
}

/**
 * Multer upload middleware đã cấu hình
 * - Lưu vào private-storage/
 * - Tên UUID
 * - Giới hạn 10MB
 * - Chỉ .pdf, .docx, .pptx, .txt
 */
const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1 // Chỉ cho phép 1 file mỗi request
  },
  fileFilter: fileFilter
});

/**
 * Hàm tạo báo cáo quét mã độc giả lập theo kiểu VirusTotal
 * @param {string} fileName - Tên file gốc
 * @param {string} fileHash - Mã băm SHA-256
 * @param {Buffer} fileBuffer - Buffer dữ liệu file
 */
function generateScanReport(fileName, fileHash, fileBuffer) {
  // Chỉ chuyển đổi 500KB đầu tiên để quét chữ ký, tránh lỗi tràn bộ nhớ (Out of Memory) với file lớn
  const maxBytesToScan = Math.min(fileBuffer.length, 500 * 1024);
  const content = fileBuffer.slice(0, maxBytesToScan).toString('utf8');
  
  // Danh sách các chữ ký mã độc và script nguy hiểm
  const threats = [
    { pattern: /X5O!P%@AP\[4\\PZX54\(P\^\)7CC\)7\}\$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!\$H\+H\*/, name: 'EICAR-Test-Signature', type: 'TestVirus' },
    { pattern: /<\?php/i, name: 'PHP.Webshell.Generic', type: 'Webshell' },
    { pattern: /<script\b[^>]*>/i, name: 'JS.Redirector.Generic', type: 'Trojan' },
    { pattern: /eval\s*\(/i, name: 'JS.Obfuscated.eval', type: 'Trojan' },
    { pattern: /exec\s*\(/i, name: 'OS.CommandInjection.exec', type: 'Exploit' },
    { pattern: /system\s*\(/i, name: 'OS.CommandInjection.system', type: 'Exploit' },
    { pattern: /WScript\.Shell/i, name: 'WSH.Downloader.Agent', type: 'Trojan' },
    { pattern: /powershell\.exe/i, name: 'PowerShell.Malicious.Agent', type: 'Trojan' }
  ];
  
  let detectedThreat = null;
  for (const t of threats) {
    if (t.pattern.test(content)) {
      detectedThreat = t;
      break;
    }
  }
  
  const engines = [
    'Kaspersky', 'Bitdefender', 'Microsoft', 'Symantec', 'Sophos', 
    'Avast', 'ESET-NOD32', 'CrowdStrike', 'TrendMicro', 'McAfee', 
    'Fortinet', 'ClamAV', 'Malwarebytes', 'PaloAlto', 'F-Secure',
    'AhnLab-V3', 'VIPRE', 'Webroot', 'SentinelOne'
  ];
  
  const scanDetails = {};
  let detections = 0;
  
  engines.forEach(engine => {
    if (detectedThreat) {
      // Dùng tên động cơ diệt virus + hash để sinh kết quả phát hiện ổn định cho cùng một file
      const engineIndex = engine.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const hashVal = fileHash.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const isDetecting = ((engineIndex + hashVal) % 10) > 1; // Tỉ lệ phát hiện ~80%
      
      if (isDetecting) {
        detections++;
        scanDetails[engine] = {
          status: 'malicious',
          result: `${detectedThreat.type}.${detectedThreat.name}`
        };
      } else {
        scanDetails[engine] = {
          status: 'clean',
          result: 'Undetected'
        };
      }
    } else {
      scanDetails[engine] = {
        status: 'clean',
        result: 'Undetected'
      };
    }
  });
  
  return {
    status: detectedThreat ? 'malicious' : 'clean',
    detections: detections,
    total: engines.length,
    details: scanDetails
  };
}

/**
 * Middleware kiểm tra bổ sung sau khi multer xử lý
 * Double-check để đảm bảo an toàn & Quét mã độc (VirusTotal)
 */
function validateFile(req, res, next) {
  // Kiểm tra file có tồn tại không
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'Không tìm thấy file trong request',
      code: 'UPLOAD_NO_FILE'
    });
  }

  const file = req.file;
  const ext = path.extname(file.originalname).toLowerCase();

  // ── Double-check: Extension hợp lệ ──
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    _removeFile(file.path);
    return res.status(400).json({
      success: false,
      error: `Extension ${ext} không được phép (post-upload check)`,
      code: 'UPLOAD_VALIDATION_EXTENSION'
    });
  }

  // ── Double-check: MIME type khớp extension ──
  const expectedMimes = ALLOWED_TYPES[ext];
  if (!expectedMimes || !expectedMimes.includes(file.mimetype)) {
    _removeFile(file.path);
    return res.status(400).json({
      success: false,
      error: `MIME type ${file.mimetype} không khớp extension ${ext} (post-upload check)`,
      code: 'UPLOAD_VALIDATION_MIME_MISMATCH'
    });
  }

  // ── Kiểm tra file thực sự tồn tại trên disk ──
  if (!fs.existsSync(file.path)) {
    return res.status(500).json({
      success: false,
      error: 'File không tồn tại sau khi upload',
      code: 'UPLOAD_FILE_NOT_FOUND'
    });
  }

  // ── Kiểm tra kích thước thực tế ──
  const stats = fs.statSync(file.path);
  if (stats.size > MAX_FILE_SIZE) {
    _removeFile(file.path);
    return res.status(400).json({
      success: false,
      error: `File vượt quá kích thước cho phép: ${(stats.size / 1024 / 1024).toFixed(2)}MB / ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      code: 'UPLOAD_FILE_TOO_LARGE'
    });
  }

  // ── Kiểm tra tên file gốc (Path Traversal & Ký tự nguy hiểm) ──
  const dangerousChars = /[<>:"/\\|?*\x00-\x1f]/;
  const pathTraversalPattern = /(\.\.[\/\\]|^\/|^[a-zA-Z]:\\|~)/;
  
  if (dangerousChars.test(path.basename(file.originalname, ext)) || pathTraversalPattern.test(file.originalname)) {
    _removeFile(file.path);
    return res.status(400).json({
      success: false,
      error: 'Tên file chứa ký tự không hợp lệ hoặc có dấu hiệu Path Traversal',
      code: 'UPLOAD_DANGEROUS_FILENAME'
    });
  }

  // ── Tính mã băm SHA-256 và Quét mã độc (VirusTotal style) ──
  try {
    const crypto = require('crypto');
    const fileBuffer = fs.readFileSync(file.path);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    const fileHash = hashSum.digest('hex');

    // Quét tệp tin
    const scanResult = generateScanReport(file.originalname, fileHash, fileBuffer);

    if (scanResult.status === 'malicious') {
      // Xóa file ngay lập tức
      _removeFile(file.path);

      const db = req.app && req.app.locals && req.app.locals.db;
      
      // Khóa tài khoản ngay lập tức
      if (db && req.user) {
        db.prepare('UPDATE users SET is_locked = 1 WHERE id = ?').run(req.user.id);
        
        try {
          db.prepare(`
            INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip_address, risk_level)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            req.user.id,
            'USER_LOCKED',
            'user',
            req.user.id,
            JSON.stringify({ reason: 'Tài khoản bị khóa ngay lập tức do upload tài liệu mã độc (SEC 2)' }),
            req.ip || 'unknown',
            'critical'
          );
        } catch (e) {
          console.error('[UPLOAD-VALIDATOR] Lỗi ghi log khóa tài khoản:', e.message);
        }
      }

      // Ghi nhật ký kiểm toán (Critical)
      const { logAction } = require('../services/audit-service');
      if (db) {
        logAction(db, {
          userId: req.user ? req.user.id : 'system',
          action: 'FILE_UPLOAD_BLOCKED_MALWARE',
          targetType: 'document',
          targetId: null,
          details: {
            originalName: file.originalname,
            mimeType: file.mimetype,
            fileSize: file.size,
            fileHash: fileHash,
            detections: scanResult.detections,
            total: scanResult.total,
            reason: 'Phát hiện mã độc trong nội dung tệp tin'
          },
          ipAddress: req.ip,
          riskLevel: 'critical'
        });
      }

      // Trả về kết quả quét lỗi 403
      return res.status(403).json({
        success: false,
        error: 'Tài khoản của bạn đã bị khóa do upload tài liệu chứa mã độc. Vui lòng liên hệ Admin.',
        code: 'AUTH_USER_LOCKED',
        data: {
          fileName: file.originalname,
          fileHash: fileHash,
          fileSize: file.size,
          scanStatus: 'malicious',
          scanDetections: scanResult.detections,
          scanTotal: scanResult.total,
          scanDetails: scanResult.details
        }
      });
    }

    // Nếu tệp an toàn, đính kèm thông tin băm và báo cáo quét vào req.file
    req.file.hash = fileHash;
    req.file.scanResult = scanResult;

  } catch (err) {
    console.error('[UPLOAD] Lỗi trong quá trình quét bảo mật:', err.message);
  }

  // Tất cả kiểm tra đều pass
  next();
}

/**
 * Xóa file an toàn, bỏ qua lỗi nếu file không tồn tại
 * @param {string} filePath - Đường dẫn file cần xóa
 */
function _removeFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('[UPLOAD] Lỗi khi xóa file:', err.message);
  }
}

module.exports = {
  upload,
  validateFile,
  ALLOWED_TYPES,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  UPLOAD_DIR
};
