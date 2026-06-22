/**
 * ============================================
 * MIDDLEWARE: Prompt Guard (SEC 6 CORE)
 * ============================================
 * Phát hiện và ngăn chặn prompt injection attacks
 * Đây là middleware BẢO MẬT QUAN TRỌNG NHẤT của hệ thống
 * 
 * Các loại tấn công được phát hiện:
 * 1. Direct prompt injection (thay đổi hành vi AI)
 * 2. Indirect prompt injection (chèn qua dữ liệu)
 * 3. SQL injection qua prompt
 * 4. XSS qua prompt
 * 5. System information disclosure
 * 6. Role manipulation / jailbreak
 * 7. Data exfiltration attempts
 * 8. Vietnamese language attacks
 */

// ══════════════════════════════════════════════
// INJECTION PATTERNS - 30+ mẫu phát hiện
// ══════════════════════════════════════════════

const INJECTION_PATTERNS = [
  // ── 1. DIRECT PROMPT OVERRIDE (Ghi đè lệnh trực tiếp) ──
  { pattern: /ignore\s+(all\s+)?previous/i, weight: 90, type: 'prompt_override', description: 'Attempt to ignore previous instructions' },
  { pattern: /ignore\s+(all\s+)?above/i, weight: 90, type: 'prompt_override', description: 'Attempt to ignore above instructions' },
  { pattern: /forget\s+(your\s+)?instructions/i, weight: 95, type: 'prompt_override', description: 'Attempt to forget instructions' },
  { pattern: /disregard\s+(all\s+)?(previous|prior|above)/i, weight: 90, type: 'prompt_override', description: 'Attempt to disregard instructions' },
  { pattern: /override\s+(your\s+)?(instructions|rules|system)/i, weight: 85, type: 'prompt_override', description: 'Attempt to override system rules' },
  { pattern: /new\s+instructions?\s*:/i, weight: 80, type: 'prompt_override', description: 'Injecting new instructions' },

  // ── 2. JAILBREAK & BYPASS (Vượt qua giới hạn) ──
  { pattern: /bypass\s+(security|filter|safety|restriction)/i, weight: 95, type: 'jailbreak', description: 'Attempt to bypass security' },
  { pattern: /disable\s+safety/i, weight: 95, type: 'jailbreak', description: 'Attempt to disable safety' },
  { pattern: /jailbreak/i, weight: 100, type: 'jailbreak', description: 'Direct jailbreak attempt' },
  { pattern: /DAN\s+mode/i, weight: 95, type: 'jailbreak', description: 'DAN jailbreak attempt' },
  { pattern: /developer\s+mode\s+(enabled|on|activate)/i, weight: 90, type: 'jailbreak', description: 'Developer mode jailbreak' },
  { pattern: /unlock\s+(your\s+)?(full\s+)?potential/i, weight: 70, type: 'jailbreak', description: 'Unlock potential jailbreak' },

  // ── 3. SYSTEM PROMPT EXTRACTION (Trích xuất system prompt) ──
  { pattern: /reveal\s+(your\s+)?system\s+prompt/i, weight: 95, type: 'info_disclosure', description: 'Attempt to reveal system prompt' },
  { pattern: /show\s+(me\s+)?(your\s+)?instructions/i, weight: 80, type: 'info_disclosure', description: 'Attempt to show instructions' },
  { pattern: /what\s+are\s+your\s+rules/i, weight: 75, type: 'info_disclosure', description: 'Attempting to extract rules' },
  { pattern: /repeat\s+(your\s+)?(system|initial)\s+(prompt|instructions|message)/i, weight: 90, type: 'info_disclosure', description: 'Attempt to repeat system prompt' },
  { pattern: /print\s+(your\s+)?(system|initial)\s+prompt/i, weight: 90, type: 'info_disclosure', description: 'Attempt to print system prompt' },

  // ── 4. DATA EXFILTRATION (Đánh cắp dữ liệu) ──
  { pattern: /show\s+(me\s+)?all\s+documents/i, weight: 80, type: 'data_exfiltration', description: 'Attempt to access all documents' },
  { pattern: /give\s+me\s+all\s+files/i, weight: 85, type: 'data_exfiltration', description: 'Attempt to get all files' },
  { pattern: /dump\s+(the\s+)?database/i, weight: 95, type: 'data_exfiltration', description: 'Database dump attempt' },
  { pattern: /list\s+(all\s+)?users/i, weight: 80, type: 'data_exfiltration', description: 'User list extraction attempt' },
  { pattern: /export\s+(all\s+)?data/i, weight: 75, type: 'data_exfiltration', description: 'Data export attempt' },

  // ── 5. CREDENTIAL THEFT (Đánh cắp thông tin xác thực) ──
  { pattern: /admin\s+password/i, weight: 95, type: 'credential_theft', description: 'Admin password request' },
  { pattern: /api\s+key/i, weight: 90, type: 'credential_theft', description: 'API key request' },
  { pattern: /secret\s+key/i, weight: 90, type: 'credential_theft', description: 'Secret key request' },
  { pattern: /access\s+token/i, weight: 85, type: 'credential_theft', description: 'Access token request' },
  { pattern: /jwt\s+secret/i, weight: 95, type: 'credential_theft', description: 'JWT secret request' },
  { pattern: /database\s+(password|credentials)/i, weight: 95, type: 'credential_theft', description: 'Database credential request' },

  // ── 6. CODE EXECUTION (Thực thi mã) ──
  { pattern: /execute\s+command/i, weight: 95, type: 'code_execution', description: 'Command execution attempt' },
  { pattern: /run\s+code/i, weight: 85, type: 'code_execution', description: 'Code execution attempt' },
  { pattern: /eval\s*\(/i, weight: 95, type: 'code_execution', description: 'eval() injection' },
  { pattern: /system\s*\(/i, weight: 95, type: 'code_execution', description: 'system() injection' },
  { pattern: /exec\s*\(/i, weight: 90, type: 'code_execution', description: 'exec() injection' },
  { pattern: /require\s*\(\s*['"]child_process/i, weight: 100, type: 'code_execution', description: 'child_process injection' },

  // ── 7. SQL INJECTION (Chèn SQL) ──
  { pattern: /DROP\s+TABLE/i, weight: 100, type: 'sql_injection', description: 'DROP TABLE SQL injection' },
  { pattern: /DELETE\s+FROM/i, weight: 90, type: 'sql_injection', description: 'DELETE FROM SQL injection' },
  { pattern: /SELECT\s+\*\s+FROM/i, weight: 85, type: 'sql_injection', description: 'SELECT * FROM SQL injection' },
  { pattern: /INSERT\s+INTO/i, weight: 80, type: 'sql_injection', description: 'INSERT INTO SQL injection' },
  { pattern: /UNION\s+SELECT/i, weight: 95, type: 'sql_injection', description: 'UNION SELECT SQL injection' },
  { pattern: /;\s*DROP/i, weight: 100, type: 'sql_injection', description: 'Chained DROP SQL injection' },
  { pattern: /'\s*OR\s+'1'\s*=\s*'1/i, weight: 95, type: 'sql_injection', description: 'Classic OR 1=1 injection' },
  { pattern: /--\s*$/m, weight: 50, type: 'sql_injection', description: 'SQL comment injection' },

  // ── 8. ROLE MANIPULATION (Thay đổi vai trò) ──
  { pattern: /act\s+as\s+(an?\s+)?/i, weight: 75, type: 'role_manipulation', description: 'Act as role manipulation' },
  { pattern: /pretend\s+(you\s+are|to\s+be)/i, weight: 80, type: 'role_manipulation', description: 'Pretend to be manipulation' },
  { pattern: /roleplay\s+as/i, weight: 80, type: 'role_manipulation', description: 'Roleplay manipulation' },
  { pattern: /you\s+are\s+now\s+(a|an|the)/i, weight: 85, type: 'role_manipulation', description: 'You are now manipulation' },
  { pattern: /from\s+now\s+on\s+you\s+(are|will)/i, weight: 80, type: 'role_manipulation', description: 'From now on manipulation' },

  // ── 9. XSS INJECTION ──
  { pattern: /<script[\s>]/i, weight: 100, type: 'xss', description: 'Script tag XSS injection' },
  { pattern: /javascript\s*:/i, weight: 95, type: 'xss', description: 'JavaScript protocol XSS' },
  { pattern: /onerror\s*=/i, weight: 90, type: 'xss', description: 'Event handler XSS' },
  { pattern: /onload\s*=/i, weight: 90, type: 'xss', description: 'Onload event XSS' },
  { pattern: /onclick\s*=/i, weight: 85, type: 'xss', description: 'Onclick event XSS' },
  { pattern: /<iframe/i, weight: 90, type: 'xss', description: 'iframe injection' },

  // ── 10. VIETNAMESE PATTERNS (Tấn công bằng tiếng Việt) ──
  { pattern: /bỏ\s*qua\s*(tất\s*cả\s*)?(lệnh|hướng\s*dẫn|quy\s*tắc)/i, weight: 90, type: 'prompt_override_vi', description: 'Vietnamese: Bỏ qua lệnh' },
  { pattern: /hiện\s*(tất\s*cả|hết)\s*(tài\s*liệu|file|dữ\s*liệu)/i, weight: 85, type: 'data_exfiltration_vi', description: 'Vietnamese: Hiện tất cả' },
  { pattern: /cho\s*tôi\s*xem\s*hết/i, weight: 80, type: 'data_exfiltration_vi', description: 'Vietnamese: Cho tôi xem hết' },
  { pattern: /(?:mật\s*khẩu|password|passphrase|mật\s*mã\s*truy\s*cập)/i, weight: 85, type: 'credential_theft_vi', description: 'Password request attempt' },
  { pattern: /bỏ\s*qua\s*bảo\s*mật/i, weight: 95, type: 'jailbreak_vi', description: 'Vietnamese: Bỏ qua bảo mật' },
  { pattern: /vượt\s*qua\s*(giới\s*hạn|bảo\s*mật|an\s*toàn)/i, weight: 90, type: 'jailbreak_vi', description: 'Vietnamese: Vượt qua giới hạn' },
  { pattern: /tiết\s*lộ\s*(thông\s*tin|hệ\s*thống|cấu\s*hình)/i, weight: 85, type: 'info_disclosure_vi', description: 'Vietnamese: Tiết lộ thông tin' },
  { pattern: /xóa\s*(hết\s*)?(dữ\s*liệu|bảng|cơ\s*sở)/i, weight: 95, type: 'sql_injection_vi', description: 'Vietnamese: Xóa dữ liệu' },

  // ── 11. MALICIOUS PATHS (Đường dẫn cục bộ nguy hiểm) ──
  { pattern: /(\/etc\/(passwd|shadow|hosts|group))/i, weight: 100, type: 'malicious_path', description: 'Attempt to access Linux critical files' },
  { pattern: /(C:\\Windows\\System32|\\windows\\system32)/i, weight: 100, type: 'malicious_path', description: 'Attempt to access Windows system files' },
  { pattern: /(\.\.\/|\.\.\\){2,}/, weight: 90, type: 'malicious_path', description: 'Path traversal sequence' },
  { pattern: /(\/var\/log\/|C:\\xampp\\|\\inetpub\\)/i, weight: 85, type: 'malicious_path', description: 'Attempt to access sensitive directories' },

  // ── 12. MALICIOUS URLs & DOMAINS (Đường dẫn độc hại/Lừa đảo) ──
  { pattern: /(ngrok\.io|serveo\.net|localtunnel\.me)/i, weight: 95, type: 'malicious_url', description: 'Use of tunneling services' },
  { pattern: /(evil\.com|phishing\.site|malware\.net)/i, weight: 100, type: 'malicious_url', description: 'Known malicious domains' },
  { pattern: /(bit\.ly|tinyurl\.com|t\.co|goo\.gl)\/[a-zA-Z0-9]+/i, weight: 60, type: 'suspicious_url', description: 'URL shorteners (suspicious)' },
  { pattern: /http:\/\/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/i, weight: 70, type: 'suspicious_url', description: 'Direct IP address URL' },

  // ── 13. GENERAL DATA EXPLOITATION & LEAKAGE (Khai thác & rò rỉ dữ liệu tổng quát - Tiếng Anh) ──
  { pattern: /(?:show|list|retrieve|get|view|download|extract|dump|print|reveal|output)\s+(?:all\s+)?(?:database|users|students|teachers|passwords|secrets|credentials|keys|tables|settings|configurations)/i, weight: 85, type: 'data_exploitation', description: 'General attempt to query system database or users' },
  { pattern: /(?:reveal|show|print|output|extract|read)\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions|rules|directives|constraints)/i, weight: 85, type: 'system_prompt_exploitation', description: 'Attempt to extract system prompt' },

  // ── 14. GENERAL DATA EXPLOITATION & LEAKAGE (Khai thác & rò rỉ dữ liệu tổng quát - Tiếng Việt) ──
  { pattern: /(?:hiển\s*thị|xem|liệt\s*kê|tải|lấy|xuất|truy\s*xuất|in\s*ra|tiết\s*lộ|đọc|đưa|cho|gửi|cung\s*cấp|xin|show)\s+(?:tất\s*cả\s+|toàn\s*bộ\s+|hết\s+|mọi\s+)?(?:cơ\s*sở\s*dữ\s*liệu|tài\s*khoản|mật\s*khẩu|người\s*dùng|học\s*sinh|sinh\s*viên|giáo\s*viên|database|bảng|users|key|token|bí\s*mật|cấu\s*hình)/i, weight: 85, type: 'data_exploitation_vi', description: 'Vietnamese: Tìm cách truy vấn database hoặc thông tin nhạy cảm' },
  { pattern: /(?:tiết\s*lộ|hiện|in\s*ra|cho\s*xem|trích\s*xuất|đọc)\s+(?:chỉ\s*thị|lệnh\s*hệ\s*thống|prompt\s*hệ\s*thống|system\s*prompt|quy\s*tắc\s*hệ\s*thống)/i, weight: 85, type: 'system_prompt_exploitation_vi', description: 'Vietnamese: Tìm cách trích xuất system prompt hoặc lệnh hệ thống' },

  // ── 15. ADVANCED SYSTEM & OS INJECTION (Tấn công OS/Mã độc nâng cao) ──
  { pattern: /(?:\|\s*(?:bash|sh|cmd|powershell|pwsh))/i, weight: 100, type: 'os_command_injection', description: 'Pipe to shell attempt' },
  { pattern: /(?:curl|wget)\s+(?:http|https):\/\/[^\s]+\s*(?:\||>) ?(?:bash|sh|cmd)?/i, weight: 100, type: 'os_command_injection', description: 'Download and execute payload' },
  { pattern: /`.*?`/i, weight: 60, type: 'suspicious_backticks', description: 'Backtick command substitution attempt' },
  { pattern: /(?:\$\(.*\))/i, weight: 70, type: 'os_command_injection', description: 'Command substitution execution attempt' },

  // ── 16. OBFUSCATION & EVASION (Kỹ thuật lẩn tránh & mã hóa) ──
  { pattern: /(?:b\s*a\s*s\s*e\s*6\s*4|u\s*t\s*f\s*8)/i, weight: 80, type: 'evasion', description: 'Obfuscated encoding string' },
  { pattern: /eval\s*\(\s*(?:atob|btoa)\s*\(/i, weight: 100, type: 'code_execution_encoded', description: 'Encoded code execution attempt' },
  { pattern: /Buffer\.from\([^,]+,\s*['"]base64['"]\)/i, weight: 95, type: 'code_execution_encoded', description: 'NodeJS Base64 decode attempt' },
  { pattern: /I\s+G\s+N\s+O\s+R\s+E\s+A\s+L\s+L/i, weight: 95, type: 'evasion_prompt_override', description: 'Spaced out ignore command' },

  // ── 17. ADVANCED XSS & SSRF (Tấn công XSS nâng cao & SSRF) ──
  { pattern: /\[.*\]\(\s*javascript:/i, weight: 100, type: 'xss_markdown', description: 'Markdown javascript link XSS' },
  { pattern: /<img[^>]+src=[^>]+onerror=/i, weight: 100, type: 'xss', description: 'Image onerror XSS payload' },
  { pattern: /(?:file|gopher|dict|ftp|ssh):\/\//i, weight: 95, type: 'ssrf', description: 'SSRF / LFI wrapper attempt' },
  { pattern: /169\.254\.169\.254/i, weight: 100, type: 'ssrf_cloud_metadata', description: 'Cloud metadata extraction attempt (AWS/GCP/Azure)' },

  // ── 18. NODEJS/RUNTIME EXPLOITATION (Khai thác môi trường Node.js) ──
  { pattern: /process\.(?:env|mainModule|exit|kill)/i, weight: 100, type: 'runtime_exploitation', description: 'NodeJS process manipulation' },
  { pattern: /require\s*\(\s*['"](?:fs|net|http|tls|crypto)['"]\s*\)/i, weight: 95, type: 'runtime_exploitation', description: 'NodeJS core module require attempt' },
  { pattern: /__dirname|__filename/i, weight: 85, type: 'runtime_exploitation', description: 'NodeJS path extraction attempt' }
];

// Độ dài tối đa cho một tin nhắn
const MAX_MESSAGE_LENGTH = 500;

/**
 * Tính điểm đe dọa cho một đoạn text
 * @param {string} text - Nội dung cần kiểm tra
 * @returns {Object} {score, matches, highestThreat}
 */
function calculateThreatScore(text) {
  if (!text || typeof text !== 'string') {
    return { score: 0, matches: [], highestThreat: null };
  }

  const normalizedText = text.toLowerCase().trim();
  const matches = [];
  let totalScore = 0;
  let highestWeight = 0;
  let highestThreat = null;

  for (const rule of INJECTION_PATTERNS) {
    if (rule.pattern.test(text)) {
      matches.push({
        type: rule.type,
        description: rule.description,
        weight: rule.weight
      });
      totalScore += rule.weight;

      if (rule.weight > highestWeight) {
        highestWeight = rule.weight;
        highestThreat = rule.type;
      }
    }
  }

  // Normalize score to 0-100 range
  // Nếu có nhiều pattern match, score tăng lên nhưng cap ở 100
  const normalizedScore = Math.min(100, totalScore);

  // Bonus: kiểm tra tỷ lệ ký tự đặc biệt cao bất thường
  const specialCharRatio = (text.match(/[{}\[\]<>()'"`;|&$]/g) || []).length / text.length;
  const specialCharBonus = specialCharRatio > 0.15 ? 20 : 0;

  // Bonus: kiểm tra encoding obfuscation (base64-like, hex)
  const encodingPatterns = /(?:base64|0x[0-9a-f]{4,}|\\u[0-9a-f]{4}|&#x?[0-9a-f]+;)/i;
  const encodingBonus = encodingPatterns.test(text) ? 25 : 0;

  const finalScore = Math.min(100, normalizedScore + specialCharBonus + encodingBonus);

  return {
    score: finalScore,
    matches: matches,
    matchCount: matches.length,
    highestThreat: highestThreat,
    specialCharRatio: specialCharRatio.toFixed(3),
    hasEncodingObfuscation: encodingBonus > 0
  };
}

/**
 * Xác định mức rủi ro dựa trên điểm đe dọa
 * @param {number} score - Điểm đe dọa 0-100
 * @returns {string} Mức rủi ro
 */
function getRiskLevel(score) {
  if (score >= 70) return 'critical';
  if (score >= 40) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
}

/**
 * MIDDLEWARE: Phát hiện prompt injection
 * Áp dụng cho tất cả request tới AI chat endpoint
 * 
 * Flow:
 * 1. Kiểm tra độ dài tin nhắn
 * 2. Tính điểm đe dọa
 * 3. Score > 70: BLOCK (chặn hoàn toàn, log critical)
 * 4. Score 40-70: WARN (cảnh báo, cho phép nhưng log medium)
 * 5. Score < 40: PASS (cho phép, log low nếu có match)
 * 6. Gắn thông tin threat vào req.threatAssessment
 */
function detectPromptInjection(req, res, next) {
  const message = req.body.message || req.body.question || '';

  // ── Kiểm tra tin nhắn rỗng ──
  if (!message || message.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Tin nhắn không được để trống',
      code: 'PROMPT_EMPTY'
    });
  }

  // ── Kiểm tra độ dài tin nhắn ──
  if (message.length > MAX_MESSAGE_LENGTH) {
    // Log tin nhắn quá dài (có thể là nỗ lực injection phức tạp)
    req.threatAssessment = {
      status: 'BLOCKED',
      score: 60,
      reason: `Tin nhắn quá dài: ${message.length}/${MAX_MESSAGE_LENGTH} ký tự`,
      riskLevel: 'high',
      matches: [{ type: 'message_length', description: 'Message exceeds maximum length' }]
    };

    return res.status(400).json({
      success: false,
      error: `Tin nhắn quá dài. Tối đa ${MAX_MESSAGE_LENGTH} ký tự. Hiện tại: ${message.length} ký tự.`,
      code: 'PROMPT_TOO_LONG',
      securityStatus: 'BLOCKED',
      threatScore: 60
    });
  }

  // ── Tính điểm đe dọa ──
  const threat = calculateThreatScore(message);
  const riskLevel = getRiskLevel(threat.score);

  // ── BLOCK: Score > 70 - Chặn hoàn toàn ──
  if (threat.score > 70) {
    req.threatAssessment = {
      status: 'BLOCKED',
      score: threat.score,
      reason: `Phát hiện prompt injection: ${threat.matches.map(m => m.description).join('; ')}`,
      riskLevel: 'critical',
      matches: threat.matches,
      highestThreat: threat.highestThreat
    };

    // Log vào audit nếu có db
    _logThreat(req, message, threat, 'BLOCKED');

    // Cho phép admin kiểm thử AI hoạt động bình thường
    if (req.user && req.user.role === 'admin') {
      req.threatAssessment.status = 'WARNING'; // Chuyển từ BLOCKED thành WARNING để AI xử lý và UI hiển thị đồng hồ đo
      req.threatAssessment.reason = `Phát hiện prompt injection (Admin Testing): ${threat.matches.map(m => m.description).join('; ')}`;
      return next();
    }

    const db = req.app && req.app.locals && req.app.locals.db;
    if (db && req.user && req.user.role !== 'admin') {
      const userRecord = db.prepare('SELECT injection_warnings FROM users WHERE id = ?').get(req.user.id);
      const warnings = (userRecord ? userRecord.injection_warnings : 0) + 1;

      if (warnings > 3) {
        // Khóa tài khoản khi vi phạm quá 3 lần
        db.prepare('UPDATE users SET is_locked = 1 WHERE id = ?').run(req.user.id);
        
        // Ghi log sự kiện khóa tài khoản
        try {
          db.prepare(`
            INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip_address, risk_level)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            req.user.id,
            'USER_LOCKED',
            'user',
            req.user.id,
            JSON.stringify({ reason: 'Tài khoản bị khóa do vi phạm Prompt Injection liên tục 4 lần (SEC 6)', threatScore: threat.score }),
            req.ip || 'unknown',
            'critical'
          );
        } catch (e) {
          console.error('[PROMPT-GUARD] Lỗi ghi log khóa tài khoản:', e.message);
        }

        return res.status(403).json({
          success: false,
          error: 'Tài khoản của bạn đã bị khóa do vi phạm nghiêm trọng quy tắc an toàn (Prompt Injection liên tục). Vui lòng liên hệ Admin để mở khóa.',
          code: 'AUTH_USER_LOCKED',
          securityStatus: 'BLOCKED',
          threatScore: threat.score,
          detectedPatterns: threat.matches.map(m => m.type),
          message: 'Tài khoản đã bị khóa cấm mọi hoạt động. Vui lòng liên hệ quản trị viên (Admin) để mở lại tài khoản.'
        });
      } else {
        // Cảnh báo dưới 3 lần
        db.prepare('UPDATE users SET injection_warnings = ? WHERE id = ?').run(warnings, req.user.id);
        
        return res.status(403).json({
          success: false,
          error: `Phát hiện hành vi Prompt Injection (Cảnh báo: ${warnings}/3). Nếu tiếp tục vi phạm, tài khoản sẽ bị khóa!`,
          code: 'PROMPT_INJECTION_WARNING',
          securityStatus: 'BLOCKED',
          threatScore: threat.score,
          detectedPatterns: threat.matches.map(m => m.type),
          message: `Hệ thống đã phát hiện hành vi tấn công. Cảnh báo ${warnings}/3.`
        });
      }
    }

    return res.status(403).json({
      success: false,
      error: '⚠️ Phát hiện nội dung nguy hiểm. Yêu cầu đã bị chặn.',
      code: 'PROMPT_INJECTION_DETECTED',
      securityStatus: 'BLOCKED',
      threatScore: threat.score,
      detectedPatterns: threat.matches.map(m => m.type),
      message: 'Hệ thống đã phát hiện hành vi tấn công prompt injection. Hành vi này đã được ghi nhận.'
    });
  }

  // ── WARN: Score 40-70 - Cảnh báo nhưng cho phép ──
  if (threat.score >= 40) {
    req.threatAssessment = {
      status: 'WARNING',
      score: threat.score,
      reason: `Nội dung đáng ngờ: ${threat.matches.map(m => m.description).join('; ')}`,
      riskLevel: 'medium',
      matches: threat.matches,
      highestThreat: threat.highestThreat
    };

    // Log cảnh báo
    _logThreat(req, message, threat, 'WARNING');

    // Cho phép tiếp tục nhưng với cảnh báo
    return next();
  }

  // ── PASS: Score < 40 - An toàn ──
  req.threatAssessment = {
    status: 'SAFE',
    score: threat.score,
    reason: threat.matches.length > 0
      ? `Phát hiện ${threat.matches.length} pattern nhẹ nhưng không đáng lo ngại`
      : 'Không phát hiện mối đe dọa',
    riskLevel: 'low',
    matches: threat.matches,
    highestThreat: threat.highestThreat
  };

  // Reset số lần vi phạm liên tiếp nếu câu hỏi an toàn
  const db = req.app && req.app.locals && req.app.locals.db;
  if (db && req.user && req.user.role !== 'admin') {
    db.prepare('UPDATE users SET injection_warnings = 0 WHERE id = ?').run(req.user.id);
  }

  next();
}

/**
 * Ghi log mối đe dọa vào audit (nếu có db)
 * @param {Object} req - Express request
 * @param {string} message - Tin nhắn gốc
 * @param {Object} threat - Kết quả phân tích
 * @param {string} action - BLOCKED hoặc WARNING
 */
function _logThreat(req, message, threat, action) {
  try {
    const db = req.app && req.app.locals && req.app.locals.db;
    if (db) {
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip_address, risk_level)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.user ? req.user.id : 'anonymous',
        `PROMPT_INJECTION_${action}`,
        'ai_chat',
        req.body.courseId || 'unknown',
        JSON.stringify({
          message: message.substring(0, 200), // Cắt ngắn để lưu
          threatScore: threat.score,
          matches: threat.matches,
          highestThreat: threat.highestThreat
        }),
        req.ip || req.connection.remoteAddress || 'unknown',
        action === 'BLOCKED' ? 'critical' : 'medium'
      );
    }
  } catch (err) {
    console.error('[PROMPT-GUARD] Lỗi khi ghi audit log:', err.message);
  }
}

module.exports = {
  detectPromptInjection,
  calculateThreatScore,
  getRiskLevel,
  INJECTION_PATTERNS,
  MAX_MESSAGE_LENGTH
};
