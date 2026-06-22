/**
 * ============================================
 * MIDDLEWARE: Image Guard (SEC 2/6 Extended)
 * ============================================
 * Phát hiện và ngăn chặn mã độc nhúng trong hình ảnh (Steganography & Polyglots)
 */

const MALICIOUS_PATTERNS = [
  /<\?php/i,                    
  /<script\b[^>]*>[\s\S]*?<\/script>/gi, 
  /javascript:/i,               
  /eval\s*\(/i,                 
  /System\.out\.println/i,      
  /exec\s*\(/i,                 
  /passthru\s*\(/i,             
  /shell_exec\s*\(/i,           
  /base64_decode/i              
];

function isValidImageSignature(buffer) {
  if (!buffer || buffer.length < 4) return false;
  const hex = buffer.toString('hex', 0, 4).toUpperCase();
  if (hex.startsWith('FFD8FF')) return true;
  if (hex === '89504E47') return true;
  if (hex === '47494638') return true;
  const riff = buffer.toString('hex', 0, 4).toUpperCase();
  const webp = buffer.toString('hex', 8, 12).toUpperCase();
  if (riff === '52494646' && webp === '57454250') return true;
  return false;
}

function scanBufferForMalware(buffer) {
  const content = buffer.toString('binary');
  for (const pattern of MALICIOUS_PATTERNS) {
    if (pattern.test(content)) {
      return { isSafe: false, reason: `Phát hiện chữ ký mã độc: ${pattern.toString()}` };
    }
  }
  let asciiCount = 0;
  for (let i = 0; i < Math.min(content.length, 10000); i++) {
    const charCode = content.charCodeAt(i);
    if (charCode >= 32 && charCode <= 126) asciiCount++;
  }
  if (content.length > 100 && (asciiCount / Math.min(content.length, 10000)) > 0.8) {
    return { isSafe: false, reason: 'Tỷ lệ văn bản/nhị phân bất thường (nghi ngờ script)' };
  }
  return { isSafe: true, reason: 'Ảnh an toàn' };
}

function detectImageMalware(req, res, next) {
  if (!req.file) return next();
  const file = req.file;
  if (file.size > 5 * 1024 * 1024) {
    return res.status(400).json({ success: false, error: 'Kích thước ảnh quá lớn. Tối đa 5MB.', code: 'IMAGE_TOO_LARGE', securityStatus: 'BLOCKED' });
  }
  if (!isValidImageSignature(file.buffer)) {
    const scanResult = scanBufferForMalware(file.buffer);
    const threatReason = 'Sai Magic Bytes' + (!scanResult.isSafe ? ` & ${scanResult.reason}` : '');
    _logImageThreat(req, threatReason);
    if (req.user && req.user.role === 'admin') {
      req.imageStatus = 'INVALID_SIGNATURE_BUT_ALLOWED_FOR_TESTING';
      req.threatAssessment = {
        status: 'WARNING',
        score: 90,
        reason: `${threatReason} (Admin Testing)`,
        riskLevel: 'critical',
        matches: [{ type: 'invalid_image_signature', description: threatReason }]
      };
      return next();
    }
    const db = req.app && req.app.locals && req.app.locals.db;
    if (db && req.user && req.user.role !== 'admin') {
      const userRecord = db.prepare('SELECT injection_warnings FROM users WHERE id = ?').get(req.user.id);
      const warnings = (userRecord ? userRecord.injection_warnings : 0) + 1;
      if (warnings > 3) {
        db.prepare('UPDATE users SET is_locked = 1 WHERE id = ?').run(req.user.id);
        return res.status(403).json({ success: false, error: 'Tài khoản của bạn đã bị khóa do cố tình tải lên tệp giả mạo nhiều lần. Vui lòng liên hệ Admin.', code: 'AUTH_USER_LOCKED', securityStatus: 'BLOCKED' });
      } else {
        db.prepare('UPDATE users SET injection_warnings = ? WHERE id = ?').run(warnings, req.user.id);
      }
    }
    return res.status(403).json({ success: false, error: 'Phát hiện tệp giả mạo. Định dạng tệp không khớp với phần mở rộng.', code: 'INVALID_IMAGE_SIGNATURE', securityStatus: 'BLOCKED', message: threatReason });
  }
  const scanResult = scanBufferForMalware(file.buffer);
  if (!scanResult.isSafe) {
    _logImageThreat(req, scanResult.reason);
    const db = req.app && req.app.locals && req.app.locals.db;
    if (db && req.user && req.user.role !== 'admin') {
      const userRecord = db.prepare('SELECT injection_warnings FROM users WHERE id = ?').get(req.user.id);
      const warnings = (userRecord ? userRecord.injection_warnings : 0) + 1;
      if (warnings > 3) {
        db.prepare('UPDATE users SET is_locked = 1 WHERE id = ?').run(req.user.id);
        return res.status(403).json({ success: false, error: 'Tài khoản của bạn đã bị khóa do cố tình tải lên mã độc nhiều lần. Vui lòng liên hệ Admin.', code: 'AUTH_USER_LOCKED', securityStatus: 'BLOCKED' });
      } else {
        db.prepare('UPDATE users SET injection_warnings = ? WHERE id = ?').run(warnings, req.user.id);
      }
    }
    if (req.user && req.user.role === 'admin') {
      req.imageStatus = 'SUSPICIOUS_BUT_ALLOWED_FOR_TESTING';
      req.threatAssessment = {
        status: 'WARNING',
        score: 85,
        reason: `Mã độc hình ảnh (Admin Testing): ${scanResult.reason}`,
        riskLevel: 'critical',
        matches: [{ type: 'image_malware', description: scanResult.reason }]
      };
      return next();
    }
    return res.status(403).json({ success: false, error: `⚠️ Phát hiện mã độc nhúng trong hình ảnh. Yêu cầu đã bị chặn!`, code: 'MALWARE_IMAGE_DETECTED', securityStatus: 'BLOCKED', message: scanResult.reason });
  }
  req.imageStatus = 'SAFE';
  next();
}

function _logImageThreat(req, reason) {
  try {
    const db = req.app && req.app.locals && req.app.locals.db;
    if (db) {
      db.prepare(`INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip_address, risk_level) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(req.user ? req.user.id : 'anonymous', 'MALICIOUS_IMAGE_BLOCKED', 'ai_chat', req.body.courseId || 'unknown', JSON.stringify({ fileName: req.file.originalname, mimeType: req.file.mimetype, reason: reason }), req.ip || req.connection.remoteAddress || 'unknown', 'critical');
    }
  } catch (err) {
    console.error('[IMAGE-GUARD] Lỗi ghi audit log:', err.message);
  }
}

module.exports = { detectImageMalware, scanBufferForMalware, isValidImageSignature };
