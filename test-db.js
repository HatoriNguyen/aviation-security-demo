const { initDatabase } = require('./database/init');

async function test() {
  try {
    console.log('--- KHỞI TẠO DB ---');
    const db = await initDatabase();
    
    console.log('\n--- DANH SÁCH BẢNG ---');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log(tables);
    
    console.log('\n--- THÔNG TIN CỘT CỦA DOCUMENTS ---');
    const columns = db.prepare("PRAGMA table_info(documents)").all();
    console.log(columns.map(c => `${c.name} (${c.type})`));
    
    console.log('\n--- THỬ TRUY VẤN DOCUMENTS ---');
    const docs = db.prepare("SELECT * FROM documents").all();
    console.log(`Số lượng tài liệu: ${docs.length}`);
    if (docs.length > 0) {
      console.log('Tài liệu đầu tiên:', docs[0]);
    }
    
    console.log('\n--- THỬ TRUY VẤN COURSES ---');
    const courses = db.prepare("SELECT * FROM courses").all();
    console.log(`Số lượng môn học: ${courses.length}`);
    console.log(courses);
    
    db.close();
  } catch (err) {
    console.error('LỖI KIỂM THỬ:', err);
  }
}

test();
