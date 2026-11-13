# นำ Bird Partner ขึ้นเซิร์ฟเวอร์จริง (Google Cloud)

แนะนำให้ใช้ **เครื่องเสมือน (Compute Engine VM) 1 เครื่อง** แทน Cloud Run เพราะเว็บเก็บข้อมูลในไฟล์ SQLite และไฟล์เอกสารบนดิสก์ ซึ่ง Cloud Run เก็บถาวรไม่ได้ (ข้อมูลหายเมื่อบริการรีสตาร์ต) ถ้าอนาคตผู้สมัครเยอะ ค่อยย้ายฐานข้อมูลไป Cloud SQL

> ผมเตรียมไฟล์ทั้งหมดไว้แล้ว แต่ **ยังไม่เคยสร้างอิมเมจ Docker หรือรันบนเครื่องจริง** (เครื่องที่พัฒนาไม่มี Docker) ครั้งแรกที่รันบน VM อาจต้องแก้เล็กน้อย

## สิ่งที่ต้องมีก่อน
- โปรเจกต์ Google Cloud ที่เปิดบิลแล้ว (แนะนำสร้างโปรเจกต์ใหม่สำหรับ Bird แยกจากโปรเจกต์อื่น)
- โดเมนหรือซับโดเมน เช่น `partner.birdexpress.co.th` และสิทธิ์แก้ DNS
- ค่า SMTP (ผู้ให้บริการส่งอีเมล) สำหรับรหัสยืนยันและอีเมลแจ้งผล
- `ANTHROPIC_API_KEY`, ไฟล์คีย์ Google Sheets (service account) และ `GOOGLE_SHEET_ID`

## 1) สร้างเครื่องและเปิดพอร์ต
```bash
gcloud config set project <PROJECT_ID>
gcloud compute instances create bird-partner \
  --zone=asia-southeast1-b --machine-type=e2-small \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=30GB --tags=http-server,https-server
gcloud compute firewall-rules create bird-allow-web --allow=tcp:80,tcp:443 --target-tags=http-server,https-server
gcloud compute addresses create bird-ip --region=asia-southeast1      # IP คงที่
```
ผูก IP คงที่กับเครื่อง แล้วตั้ง DNS ของโดเมน (A record) ให้ชี้มาที่ IP นั้น

## 2) ติดตั้ง Docker บนเครื่อง
```bash
gcloud compute ssh bird-partner --zone=asia-southeast1-b
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER && newgrp docker
```

## 3) ดึงโค้ดและตั้งค่า
```bash
git clone <ที่อยู่ repo ของคุณ> bird && cd bird
sudo mkdir -p /srv/bird-data /srv/bird-secrets && sudo chown 1000:1000 /srv/bird-data
# วางไฟล์คีย์ Google Sheets ที่ /srv/bird-secrets/sheets-key.json (อัปโหลดด้วย gcloud compute scp)
cp .env.example .env && nano .env
```
ค่าที่ต้องกรอกใน `.env` อย่างน้อย:
`NODE_ENV=production`, `APP_DOMAIN`, `APP_ORIGIN=https://<โดเมน>`, `DATA_KEY` (สร้างด้วย `openssl rand -base64 32` แล้ว **เก็บสำเนาไว้ที่ปลอดภัย** ถ้าทำหายจะถอดรหัสเลขบัตรเก่าไม่ได้), `ADMIN_EMAIL`, `ADMIN_PASSWORD` (ยาวอย่างน้อย 12 ตัว), `ANTHROPIC_API_KEY`, `SMTP_*`, `GOOGLE_SHEET_ID`, `GOOGLE_APPLICATION_CREDENTIALS=/secrets/sheets-key.json`

ใน production เว็บจะไม่ยอมเริ่มถ้าไม่มี `DATA_KEY` หรือรหัสผ่านเจ้าหน้าที่ และจะไม่แสดงรหัสยืนยันบนหน้าเว็บ

## 4) เปิดเว็บ
```bash
docker compose up -d --build
docker compose logs -f app      # ดูว่า AI / Sheets / E-mail ขึ้นสถานะถูกต้อง
```
เปิด `https://<โดเมน>` (ใบรับรอง HTTPS ใช้เวลาไม่กี่นาทีครั้งแรก)

## 5) สำรองข้อมูล
- เปิดสแนปช็อตดิสก์อัตโนมัติรายวัน:
  ```bash
  gcloud compute resource-policies create snapshot-schedule bird-daily --region=asia-southeast1 --max-retention-days=14 --daily-schedule --start-time=18:00
  gcloud compute disks add-resource-policies bird-partner --zone=asia-southeast1-b --resource-policies=bird-daily
  ```
- สำรองฐานข้อมูลกับไฟล์เอกสารด้วยสคริปต์ (ตั้ง cron รายวัน) แล้วคัดลอกขึ้น Cloud Storage:
  ```bash
  docker compose exec app node scripts/backup.mjs /data/backups
  gsutil -m rsync -r /srv/bird-data/backups gs://<bucket-ของคุณ>/bird-backups
  ```
- เก็บ `DATA_KEY` แยกไว้ต่างหาก (ไม่รวมในไฟล์สำรอง)

## อัปเดตเวอร์ชัน
```bash
cd bird && git pull && docker compose up -d --build
```

## เช็กลิสต์ก่อนเปิดให้พาร์ทเนอร์จริง
- [ ] สมัครทดสอบด้วยอีเมลจริง ได้รับรหัสยืนยันทางอีเมล (ไม่โผล่บนหน้าเว็บ)
- [ ] ข้อมูลขึ้น Google Sheets และเจ้าหน้าที่เข้า `/admin` ได้
- [ ] ลองกดอนุมัติ/ขอข้อมูลเพิ่ม แล้วอีเมลแจ้งผลถึงผู้สมัคร
- [ ] ลบใบสมัครและแถวทดสอบทั้งหมดออกจากฐานข้อมูลและชีต
- [ ] ทดสอบสำรองข้อมูลและกู้คืนหนึ่งครั้ง
- [ ] ฝ่ายกฎหมายตรวจข้อความ PDPA และรายการเอกสารบังคับ
