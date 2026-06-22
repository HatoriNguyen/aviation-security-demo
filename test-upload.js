const fs = require('fs');
const jwt = require('jsonwebtoken');

const token = jwt.sign(
  { id: 'user-admin', username: 'admin', role: 'admin' },
  'aviation-academy-secret-key-2024-sec2-sec6',
  { expiresIn: '24h' }
);

async function testUpload() {
  const fileContent = Buffer.from('test docx content');
  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  let body = '';
  body += '--' + boundary + '\r\n';
  body += 'Content-Disposition: form-data; name="file"; filename="test.docx"\r\n';
  body += 'Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n';
  body += fileContent.toString('binary') + '\r\n';
  body += '--' + boundary + '\r\n';
  body += 'Content-Disposition: form-data; name="courseId"\r\n\r\n';
  body += 'course-toan\r\n';
  body += '--' + boundary + '--\r\n';

  try {
    const response = await fetch('http://localhost:3000/api/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'multipart/form-data; boundary=' + boundary
      },
      body: Buffer.from(body, 'binary')
    });
    
    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Body:', text);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testUpload();
