# เผยแพร่รูปเต็มสัดส่วน ไฟล์ 100 MB และหัวใจหนึ่งครั้งต่อบัญชี

โค้ดเวอร์ชันนี้ผ่านการทดสอบ 110 รายการและ build แล้ว แต่ยังไม่ได้ส่งขึ้น GitHub
เนื่องจากระบบตรวจอนุมัติคำสั่งของผู้ช่วยติดข้อจำกัดโควต้า

เปิด PowerShell หรือ Terminal ใน VS Code แล้ววางคำสั่งชุดนี้ คำสั่งจะตรวจซ้ำก่อน
commit เฉพาะไฟล์ของงานนี้และส่งขึ้น `main` โดยไม่ใช้ force push

```powershell
Set-Location -LiteralPath 'C:\Users\ratch\Downloads\Nutrition value'
$ErrorActionPreference = 'Stop'

$communityBranch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $communityBranch -ne 'main') { throw 'ต้องอยู่ใน branch main ของโปรเจกต์นี้' }
$communityRemote = git remote get-url origin
if ($LASTEXITCODE -ne 0 -or $communityRemote -ne 'https://github.com/6814952003-web/nutrition_value.git') { throw 'GitHub repository ไม่ตรงกับเว็บนี้' }
$communityStagedBefore = git diff --cached --name-only
if ($LASTEXITCODE -ne 0 -or $communityStagedBefore) { throw 'กรุณาตรวจไฟล์ที่ stage อยู่ก่อนรันชุดคำสั่งนี้' }

npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'ทดสอบไม่ผ่าน จึงยังไม่ deploy' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build ไม่ผ่าน จึงยังไม่ deploy' }

$communityUpdateFiles = @(
  'ADMIN_GUIDE.md', 'DEPLOYMENT.md', 'README.md',
  'client/src/AdminPage.jsx', 'client/src/CommunityPage.jsx', 'client/src/upload.js',
  'client/test/site-ui.test.cjs', 'client/test/upload.test.cjs',
  'server/src/config/blob.js', 'server/src/controllers/post.controller.js',
  'server/src/models/post.model.js', 'server/test/blob-routes.test.js',
  'server/test/blob.test.js', 'server/test/moderation-routes.test.js',
  'server/test/post-like.test.js', 'shared/site-defaults.json'
)
git add -- $communityUpdateFiles
if ($LASTEXITCODE -ne 0) { throw 'Stage ไฟล์ไม่สำเร็จ' }
git diff --cached --stat
if ($LASTEXITCODE -ne 0) { throw 'ตรวจรายการไฟล์ไม่สำเร็จ' }
git commit -m 'Support 100 MB community media and one heart per account'
if ($LASTEXITCODE -ne 0) { throw 'Commit ไม่สำเร็จ จึงยังไม่ส่งโค้ด' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Push ไม่สำเร็จ กรุณาตรวจข้อความจาก Git; ไม่ต้อง force push' }
```

เมื่อ push สำเร็จ Vercel จะ deploy โปรเจกต์ `nutrition_value` อัตโนมัติ
รอ deployment ล่าสุดขึ้น **Ready / Current Production** แล้วเปิด
<https://nutritionvalue.vercel.app/#community> และกด **Ctrl + F5** หนึ่งครั้ง

เวอร์ชันใหม่จะแสดงคำแนะนำ **100 MB ต่อไฟล์** รูปและวิดีโอไม่ถูกตัดให้พอดีกรอบ
หัวใจจะเริ่มนับใหม่ตามบัญชีตามที่เลือกไว้ และบัญชีหนึ่งกดได้ครั้งเดียวต่อโพสต์
