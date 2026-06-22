/**
 * ============================================
 * DATABASE INITIALIZATION - Aviation Academy
 * ============================================
 * Khởi tạo cơ sở dữ liệu SQLite với sql.js (pure JS)
 * Wrapper tương thích API better-sqlite3
 * Tạo bảng, seed dữ liệu mẫu cho demo
 */

const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// Đường dẫn tới file database
const DB_PATH = path.join(__dirname, 'aviation.db');

/**
 * Wrapper class để sql.js có API giống better-sqlite3
 * better-sqlite3: db.prepare(sql).run/get/all(...params)
 * sql.js: db.run(sql, params), db.exec(sql)
 */
class DatabaseWrapper {
  constructor(sqlJsDb, dbPath) {
    this._db = sqlJsDb;
    this._dbPath = dbPath;
    this._saveInterval = null;
    // Auto-save mỗi 5 giây nếu có thay đổi
    this._dirty = false;
    this._saveInterval = setInterval(() => {
      if (this._dirty) {
        this._saveToDisk();
        this._dirty = false;
      }
    }, 5000);
  }

  _saveToDisk() {
    try {
      const data = this._db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this._dbPath, buffer);
    } catch (err) {
      console.error('[DB] Lỗi lưu database:', err.message);
    }
  }

  /**
   * Giả lập db.pragma() - sql.js dùng db.run() cho PRAGMA
   */
  pragma(statement) {
    try {
      const result = this._db.exec(`PRAGMA ${statement}`);
      if (result.length > 0 && result[0].values.length > 0) {
        return result[0].values[0][0];
      }
      return undefined;
    } catch (e) {
      // Ignore pragma errors
    }
  }

  /**
   * Giả lập db.exec(sql) - chạy SQL không trả kết quả
   */
  exec(sql) {
    this._db.run(sql);
    this._dirty = true;
  }

  /**
   * Giả lập db.prepare(sql) - trả về statement object
   * với các methods: run(), get(), all()
   */
  prepare(sql) {
    const db = this._db;
    const wrapper = this;

    return {
      /**
       * run(...params) - chạy INSERT/UPDATE/DELETE
       * Trả về {changes, lastInsertRowid}
       */
      run(...params) {
        try {
          db.run(sql, params);
          wrapper._dirty = true;
          // Lấy changes và lastInsertRowid
          const changesResult = db.exec('SELECT changes() as changes, last_insert_rowid() as lastId');
          return {
            changes: changesResult[0]?.values[0]?.[0] || 0,
            lastInsertRowid: changesResult[0]?.values[0]?.[1] || 0
          };
        } catch (err) {
          throw err;
        }
      },

      /**
       * get(...params) - lấy 1 row
       * Trả về object hoặc undefined
       */
      get(...params) {
        try {
          const stmt = db.prepare(sql);
          stmt.bind(params);
          if (stmt.step()) {
            const columns = stmt.getColumnNames();
            const values = stmt.get();
            stmt.free();
            const row = {};
            columns.forEach((col, i) => {
              row[col] = values[i];
            });
            return row;
          }
          stmt.free();
          return undefined;
        } catch (err) {
          throw err;
        }
      },

      /**
       * all(...params) - lấy tất cả rows
       * Trả về array of objects
       */
      all(...params) {
        try {
          const stmt = db.prepare(sql);
          stmt.bind(params);
          const rows = [];
          while (stmt.step()) {
            const columns = stmt.getColumnNames();
            const values = stmt.get();
            const row = {};
            columns.forEach((col, i) => {
              row[col] = values[i];
            });
            rows.push(row);
          }
          stmt.free();
          return rows;
        } catch (err) {
          throw err;
        }
      }
    };
  }

  /**
   * Giả lập db.transaction(fn) - wrapper cho transaction
   */
  transaction(fn) {
    const db = this._db;
    const wrapper = this;
    return function (...args) {
      db.run('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        db.run('COMMIT');
        wrapper._dirty = true;
        return result;
      } catch (err) {
        db.run('ROLLBACK');
        throw err;
      }
    };
  }

  /**
   * Đóng database và lưu lần cuối
   */
  close() {
    if (this._saveInterval) {
      clearInterval(this._saveInterval);
    }
    this._saveToDisk();
    this._db.close();
    console.log('[DB] ✅ Database đã đóng và lưu.');
  }
}

/**
 * Tạo tất cả các bảng cần thiết
 * @param {DatabaseWrapper} db - Instance wrapper
 */
function createTables(db) {
  // Bật foreign keys
  db.pragma('foreign_keys = ON');

  // ── Bảng người dùng ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'teacher', 'student')),
      is_locked INTEGER DEFAULT 0,
      injection_warnings INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Bảng khóa học ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      description TEXT
    )
  `);

  // ── Bảng đăng ký khóa học ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS enrollments (
      user_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      PRIMARY KEY (user_id, course_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    )
  `);

  // ── Bảng tài liệu (SEC 2 - Quản lý file an toàn) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_hash TEXT NOT NULL,
      course_id TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      version INTEGER DEFAULT 1,
      scan_status TEXT DEFAULT 'clean',
      scan_detections INTEGER DEFAULT 0,
      scan_total INTEGER DEFAULT 19,
      scan_details TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ── Bảng nhật ký kiểm toán (Audit Trail) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details TEXT,
      ip_address TEXT,
      risk_level TEXT CHECK(risk_level IN ('low', 'medium', 'high', 'critical')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Bảng lịch sử chat AI (SEC 6 - Prompt Injection Detection) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      is_suspicious BOOLEAN DEFAULT 0,
      threat_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    )
  `);

  // ── Bảng bài tập ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      course_id TEXT NOT NULL,
      teacher_id TEXT NOT NULL,
      due_date DATETIME NOT NULL,
      max_score INTEGER DEFAULT 10,
      assignment_type TEXT DEFAULT 'homework' CHECK(assignment_type IN ('homework', 'test', 'project')),
      auto_grade BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ── Bảng bài nộp ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      content TEXT,
      file_name TEXT,
      file_path TEXT,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'submitted' CHECK(status IN ('submitted', 'graded', 'late', 'returned')),
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ── Bảng điểm số ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS grades (
      id TEXT PRIMARY KEY,
      submission_id TEXT,
      student_id TEXT NOT NULL,
      assignment_id TEXT NOT NULL,
      score REAL NOT NULL,
      max_score INTEGER NOT NULL,
      feedback TEXT,
      graded_by TEXT NOT NULL,
      graded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE SET NULL,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
      FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ── Index cho tìm kiếm nhanh ──
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_risk ON audit_logs(risk_level)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_history(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_suspicious ON chat_history(is_suspicious)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_course ON documents(course_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_active ON documents(is_active)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_grades_assignment ON grades(assignment_id)`);

  console.log('[DB] ✅ Tất cả bảng đã được tạo thành công.');
}

/**
 * Seed dữ liệu mẫu vào database
 * @param {DatabaseWrapper} db - Instance wrapper
 */
function seedData(db) {
  // Kiểm tra nếu đã có dữ liệu thì bỏ qua
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count > 0) {
    console.log('[DB] ℹ️  Dữ liệu đã tồn tại, bỏ qua seeding.');
    return;
  }

  console.log('[DB] 🌱 Đang seed dữ liệu mẫu...');

  // ── Băm mật khẩu (10 rounds bcrypt) ──
  const adminHash = bcrypt.hashSync('admin123', 10);
  const teacherHash = bcrypt.hashSync('teacher123', 10);
  const studentHash = bcrypt.hashSync('student123', 10);

  // ── Thêm người dùng ──
  const insertUser = db.prepare(`
    INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)
  `);

  const users = [
    ['user-admin', 'admin', adminHash, 'Quản trị viên hệ thống', 'admin'],
    ['user-teacher1', 'teacher1', teacherHash, 'Nguyễn Văn Toán', 'teacher'],
    ['user-teacher2', 'teacher2', teacherHash, 'Trần Thị Vật Lý', 'teacher'],
    ['user-student1', 'student1', studentHash, 'Lê Minh Hùng', 'student'],
    ['user-student2', 'student2', studentHash, 'Phạm Thị Mai', 'student'],
  ];

  const insertUserMany = db.transaction((items) => {
    for (const item of items) {
      insertUser.run(...item);
    }
  });
  insertUserMany(users);

  // ── Thêm khóa học ──
  const insertCourse = db.prepare(`
    INSERT INTO courses (id, name, code, description) VALUES (?, ?, ?, ?)
  `);

  const courses = [
    ['course-toan', 'Toán cao cấp', 'MATH101', 'Giải tích, đại số tuyến tính, xác suất thống kê ứng dụng trong hàng không'],
    ['course-vatly', 'Vật lý đại cương', 'PHYS101', 'Cơ học, nhiệt động lực học, sóng và quang học cho ngành hàng không'],
    ['course-dien', 'Điện tử hàng không', 'ELEC201', 'Mạch điện tử, hệ thống điện tử trên máy bay, avionics cơ bản'],
  ];

  const insertCourseMany = db.transaction((items) => {
    for (const item of items) {
      insertCourse.run(...item);
    }
  });
  insertCourseMany(courses);

  // ── Đăng ký khóa học ──
  const insertEnrollment = db.prepare(`
    INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)
  `);

  const enrollments = [
    // Sinh viên 1 học Toán và Vật lý
    ['user-student1', 'course-toan'],
    ['user-student1', 'course-vatly'],
    // Sinh viên 2 chỉ học Toán
    ['user-student2', 'course-toan'],
    // Giáo viên 1 dạy Toán
    ['user-teacher1', 'course-toan'],
    // Giáo viên 2 dạy Vật lý
    ['user-teacher2', 'course-vatly'],
  ];

  const insertEnrollmentMany = db.transaction((items) => {
    for (const item of items) {
      insertEnrollment.run(...item);
    }
  });
  insertEnrollmentMany(enrollments);

  // ── Tạo tài liệu mẫu (không có file thật, chỉ metadata) ──
  const mockScanDetails = JSON.stringify({
    "Kaspersky": { "status": "clean", "result": "Undetected" },
    "Bitdefender": { "status": "clean", "result": "Undetected" },
    "Microsoft": { "status": "clean", "result": "Undetected" },
    "Symantec": { "status": "clean", "result": "Undetected" },
    "Sophos": { "status": "clean", "result": "Undetected" },
    "Avast": { "status": "clean", "result": "Undetected" },
    "ESET-NOD32": { "status": "clean", "result": "Undetected" },
    "CrowdStrike": { "status": "clean", "result": "Undetected" },
    "TrendMicro": { "status": "clean", "result": "Undetected" },
    "McAfee": { "status": "clean", "result": "Undetected" },
    "Fortinet": { "status": "clean", "result": "Undetected" },
    "ClamAV": { "status": "clean", "result": "Undetected" },
    "Malwarebytes": { "status": "clean", "result": "Undetected" },
    "PaloAlto": { "status": "clean", "result": "Undetected" },
    "F-Secure": { "status": "clean", "result": "Undetected" },
    "AhnLab-V3": { "status": "clean", "result": "Undetected" },
    "VIPRE": { "status": "clean", "result": "Undetected" },
    "Webroot": { "status": "clean", "result": "Undetected" },
    "SentinelOne": { "status": "clean", "result": "Undetected" }
  });

  const insertDocument = db.prepare(`
    INSERT INTO documents (id, original_name, stored_name, mime_type, file_size, file_hash, course_id, uploaded_by, is_active, version, scan_status, scan_detections, scan_total, scan_details) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'clean', 0, 19, ?)
  `);

  const documents = [
    [
      'doc-toan-01', 'giai-tich-chuong1.pdf', 'a1b2c3d4-giai-tich-chuong1.pdf',
      'application/pdf', 2048576, 'sha256_hash_sample_toan01',
      'course-toan', 'user-teacher1', 1, 1, mockScanDetails
    ],
    [
      'doc-toan-02', 'dai-so-tuyen-tinh.pdf', 'e5f6g7h8-dai-so-tuyen-tinh.pdf',
      'application/pdf', 3145728, 'sha256_hash_sample_toan02',
      'course-toan', 'user-teacher1', 1, 1, mockScanDetails
    ],
    [
      'doc-toan-03', 'bai-tap-giai-tich.docx', 'i9j0k1l2-bai-tap-giai-tich.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      1048576, 'sha256_hash_sample_toan03',
      'course-toan', 'user-teacher1', 1, 2, mockScanDetails
    ],
    [
      'doc-vatly-01', 'co-hoc-newton.pdf', 'm3n4o5p6-co-hoc-newton.pdf',
      'application/pdf', 4194304, 'sha256_hash_sample_vatly01',
      'course-vatly', 'user-teacher2', 1, 1, mockScanDetails
    ],
    [
      'doc-vatly-02', 'nhiet-dong-luc-hoc.pdf', 'q7r8s9t0-nhiet-dong-luc-hoc.pdf',
      'application/pdf', 2621440, 'sha256_hash_sample_vatly02',
      'course-vatly', 'user-teacher2', 0, 1, mockScanDetails
    ],
    [
      'doc-dien-01', 'mach-dien-co-ban.pptx', 'u1v2w3x4-mach-dien-co-ban.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      5242880, 'sha256_hash_sample_dien01',
      'course-dien', 'user-admin', 1, 1, mockScanDetails
    ],
  ];

  const insertDocMany = db.transaction((items) => {
    for (const item of items) {
      insertDocument.run(...item);
    }
  });
  insertDocMany(documents);

  // ── Thêm bài tập mẫu ──
  const insertAssignment = db.prepare(`INSERT INTO assignments (id, title, description, course_id, teacher_id, due_date, max_score, assignment_type, auto_grade) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const assignments = [
    ['assign-toan-01', 'Bài tập Giải tích Chương 1', 'Giải các bài tập về giới hạn và đạo hàm từ trang 45-50', 'course-toan', 'user-teacher1', '2026-06-20 23:59:00', 10, 'homework', 0],
    ['assign-toan-02', 'Kiểm tra giữa kỳ Đại số', 'Kiểm tra 45 phút: Ma trận, định thức, hệ phương trình', 'course-toan', 'user-teacher1', '2026-06-25 10:00:00', 100, 'test', 1],
    ['assign-vatly-01', 'Bài tập Cơ học Newton', 'Giải 10 bài tập về 3 định luật Newton ứng dụng trong hàng không', 'course-vatly', 'user-teacher2', '2026-06-22 23:59:00', 10, 'homework', 0],
    ['assign-vatly-02', 'Đồ án Nhiệt động lực học', 'Phân tích chu trình Carnot trong động cơ phản lực', 'course-vatly', 'user-teacher2', '2026-07-01 23:59:00', 20, 'project', 0],
  ];
  const insertAssignmentMany = db.transaction((items) => { for (const item of items) { insertAssignment.run(...item); } });
  insertAssignmentMany(assignments);

  // ── Thêm bài nộp mẫu ──
  const insertSubmission = db.prepare(`INSERT INTO submissions (id, assignment_id, student_id, content, file_name, submitted_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const submissions = [
    ['sub-01', 'assign-toan-01', 'user-student1', 'Bài 1: lim(x->0) sin(x)/x = 1 (dùng quy tắc L\'Hopital)\nBài 2: f\'(x) = 3x^2 + 2x...', null, '2026-06-18 20:30:00', 'graded'],
    ['sub-02', 'assign-vatly-01', 'user-student1', null, 'bai-tap-newton.pdf', '2026-06-21 15:00:00', 'submitted'],
  ];
  const insertSubmissionMany = db.transaction((items) => { for (const item of items) { insertSubmission.run(...item); } });
  insertSubmissionMany(submissions);

  // ── Thêm điểm mẫu ──
  const insertGrade = db.prepare(`INSERT INTO grades (id, submission_id, student_id, assignment_id, score, max_score, feedback, graded_by, graded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const grades = [
    ['grade-01', 'sub-01', 'user-student1', 'assign-toan-01', 8.5, 10, 'Bài làm tốt, trình bày rõ ràng. Bài 5 cần bổ sung thêm bước chứng minh.', 'user-teacher1', '2026-06-19 10:00:00'],
  ];
  const insertGradeMany = db.transaction((items) => { for (const item of items) { insertGrade.run(...item); } });
  insertGradeMany(grades);

  // ── Log khởi tạo vào audit ──
  db.prepare(`
    INSERT INTO audit_logs (user_id, action, target_type, details, ip_address, risk_level)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('system', 'DATABASE_INITIALIZED', 'system', 'Database seeded with initial data', '127.0.0.1', 'low');

  console.log('[DB] ✅ Seed dữ liệu hoàn tất:');
  console.log('     - 5 người dùng (1 admin, 2 teacher, 2 student)');
  console.log('     - 3 khóa học');
  console.log('     - 5 đăng ký');
  console.log('     - 6 tài liệu mẫu');
  console.log('     - 4 bài tập');
  console.log('     - 2 bài nộp');
  console.log('     - 1 điểm số');
}

/**
 * Khởi tạo database: tạo bảng + seed dữ liệu
 * @returns {Promise<DatabaseWrapper>} Instance database đã sẵn sàng sử dụng
 */
async function initDatabase() {
  // Xóa DB cũ nếu cần re-seed (comment out sau khi dev xong)
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('[DB] 🗑️ Đã xóa database cũ để re-seed');
  }

  // Đảm bảo thư mục database tồn tại
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Khởi tạo sql.js
  const SQL = await initSqlJs();

  // Mở database từ file nếu có, hoặc tạo mới
  let db;
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('[DB] 📂 Đã mở database từ file:', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('[DB] 🆕 Tạo database mới');
  }

  // Tạo wrapper
  const wrapper = new DatabaseWrapper(db, DB_PATH);

  // Tạo bảng
  createTables(wrapper);

  // Seed dữ liệu nếu chưa có
  seedData(wrapper);

  // Lưu ngay sau seed
  wrapper._saveToDisk();

  console.log('[DB] 🚀 Database sẵn sàng tại:', DB_PATH);
  return wrapper;
}

module.exports = { initDatabase };
