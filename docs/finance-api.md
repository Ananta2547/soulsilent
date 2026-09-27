# Finance Export API

API อ่านอย่างเดียวสำหรับดึงข้อมูลการเงินของเว็บไปใช้ในระบบบัญชี / วิเคราะห์ภายนอก
ไม่มีข้อมูลส่วนบุคคล (ชื่อ อีเมล เบอร์) ออกไปทางนี้ — ลูกค้าแต่ละคนแทนด้วยรหัสนามแฝงคงที่

```
GET https://<host>/api/export/finance?type=<type>&from=YYYY-MM-DD&to=YYYY-MM-DD&format=json|csv
Header: x-export-key: <FINANCE_EXPORT_KEY>
```

| host | ใช้กับ |
|---|---|
| `soulsilent-preview.soulsilent-official.workers.dev` | ข้อมูลทดสอบ (preview) |
| production hostname | ข้อมูลจริง — เปิดใช้เมื่อตั้ง secret บน production แล้ว |

ผิด key หรือไม่ส่ง key → `403 {"error":"Forbidden"}`
พารามิเตอร์ผิด → `400 {"error":"..."}`

## `type` ที่มี

### `bookings` — รายการจองทีละแถว (ค่าเริ่มต้น)

กรอง `from`/`to` ด้วยวันที่ **สร้างการจอง** (`created_at`, เวลา UTC)
แบ่งหน้าด้วย `limit` (ค่าเริ่มต้น 500 สูงสุด 2000) และ `cursor` — ถ้าผลลัพธ์มี `next_cursor` ไม่เป็น `null` ให้เรียกซ้ำโดยส่ง `cursor=<ค่านั้น>` จนกว่าจะเป็น `null`

```json
{
  "type": "bookings", "count": 500, "limit": 500, "next_cursor": "eyJ...",
  "rows": [{
    "booking_id": "…",
    "created_at": "2026-09-01 08:12:33",
    "confirmed_at": null,
    "customer": "3f9a1c…",
    "workshop_id": "…", "workshop_title": "…", "workshop_date": "2026-09-20",
    "workshop_category": "art", "master_id": "…", "master_kind": "round",
    "admission_type": "direct", "payment_type": "paid", "deposit_amount": 0,
    "teacher_ids": ["…"],
    "booking_kind": "group", "tier": "ซื้อ 3 คน", "seats": 3,
    "group_size": 3, "parent_booking_id": null,
    "status": "confirmed", "payment_status": "paid", "app_status": "applied",
    "cancel_reason": null,
    "channel": "beam_promptpay",
    "amount": 4500, "collected": true, "refunded": false, "net_amount": 4500,
    "transferred": false
  }]
}
```

| field | ความหมาย |
|---|---|
| `customer` | นามแฝงของผู้จอง (SHA-256) — คนเดิมได้รหัสเดิมเสมอ ใช้นับลูกค้าซ้ำได้ แต่ระบุตัวตนไม่ได้; `null` = ไม่มีบัญชี |
| `amount` | ยอดที่แถวนี้จ่าย (บาท) — กลุ่มจ่ายรวมทั้งกลุ่มที่แถวผู้จอง สมาชิกกลุ่มเป็น 0 |
| `seats` | ที่นั่งที่แถวนี้ถือ (กลุ่ม = `group_size`, เหมารอบ = ทั้งรอบ, สมาชิกกลุ่ม = 0) |
| `collected` | เงินเข้าจริงและยังอยู่กับเรา (จ่ายแล้ว/ยืนยันแล้ว, ไม่ยกเลิก, ไม่คืน) |
| `refunded` | คืนเงินแล้ว (ผ่าน Beam หรือแนบสลิปคืนเงิน) |
| `net_amount` | `amount` ถ้า `collected` ไม่งั้น 0 — **ใช้ตัวนี้รวมรายได้** |
| `channel` | `beam_promptpay` / `beam_card` / `stripe` (เก่า) / `free` / `invite` (บัตรเชิญที่นั่งฟรีจาก admin) / `none` (ยังไม่จ่าย) / `unknown` |
| `comp_kind` | บัตรเชิญ: `teacher` (Host ให้ฟรี) / `asl` (ASL จ่ายเต็มราคา) / `special` (ASL จ่ายราคาพิเศษ) — ที่นั่งปกติเป็น null |
| `asl_paid` | ยอดที่ ASL จ่ายให้ Host แทนผู้เข้าร่วมสำหรับที่นั่งบัตรเชิญ (บาท) — ไม่ใช่เงินที่ลูกค้าจ่าย จึงไม่อยู่ใน `net_amount` |
| `booking_kind` | `group` (ปกติ) / `private` (เหมารอบ) / `member` |
| `parent_booking_id` | ไม่ว่าง = แถวนี้เป็นสมาชิกกลุ่มของการจองนั้น |
| `payment_type` | `paid` / `deposit` (มัดจำ คืนวันงาน — ไม่ใช่รายได้) / `free` |
| `transferred` | ตั๋วถูกโอน/ให้เป็นของขวัญไปแล้ว (เงินยังนับที่ผู้ซื้อ) |
| `status` | `pending` / `confirmed` / `cancelled` |
| `payment_status` | `pending` / `paid` / `expired` / `refunded` |

### `workshops` — สรุปต่อรอบ

กรอง `from`/`to` ด้วย **วันจัดงาน** (`date`) ไม่แบ่งหน้า

| field | ความหมาย |
|---|---|
| `bookings` / `seats_sold` | จำนวนการจอง / ที่นั่ง ที่ `collected` |
| `gross` | เงินที่ผู้เข้าร่วมจ่ายจริงของรอบ (บาท) |
| `asl_paid` | ยอดที่ ASL ออกให้ Host สำหรับที่นั่งบัตรเชิญ (บาท) |
| `host_gross` | รายได้ของ Host ก่อนหักค่าธรรมเนียม = `gross + asl_paid` |
| `refunded` / `refunds` | ยอดคืน / จำนวนครั้งที่คืน |
| `cancelled` | จำนวนการจองที่ยกเลิก |
| `payout_deduction_type` / `_value` | วิธีหักจากผู้สอน `none` / `fixed` (บาท) / `percent` |
| `payout_deduction` | ส่วนที่เว็บหักไว้ (คำนวณแล้ว, ปัดเป็นบาท) |
| `payout_net` | ยอดที่ต้องจ่ายผู้สอน = `host_gross − payout_deduction` |
| `payout_status` / `payout_slip` | สถานะโอนให้ผู้สอน / มีสลิปแล้วหรือยัง |
| `teacher_ids` | id ผู้สอนทุกคนของรอบ |

### `summary` — รายเดือน

กรองด้วย `created_at` ของการจอง กลุ่มตามเดือน `YYYY-MM` (UTC)
ผลลัพธ์มี `totals` รวมทั้งช่วงด้วย

`month, bookings, seats, customers (ลูกค้าไม่ซ้ำ), gross, asl_paid, refunded, refunds, cancelled`

### `orphans` — เงินเข้าที่ไม่ตรงกับการจอง

เงินที่ลูกค้าโอนซ้ำ/โอนหลังหมดเวลา ต้องคืนเอง (`resolved=false` = ยังไม่ได้จัดการ)
`amount` แปลงเป็นบาทแล้ว

## ตัวอย่างการใช้

```bash
# รายได้รายเดือน ปี 2569 ทั้งปี
curl -H "x-export-key: $KEY" "https://<host>/api/export/finance?type=summary&from=2026-01-01&to=2026-12-31"

# ดาวน์โหลด CSV รอบทั้งหมดของเดือน ก.ย.
curl -H "x-export-key: $KEY" -o workshops.csv "https://<host>/api/export/finance?type=workshops&from=2026-09-01&to=2026-09-30&format=csv"
```

```python
import requests
rows, cursor = [], None
while True:
    r = requests.get("https://<host>/api/export/finance",
                     headers={"x-export-key": KEY},
                     params={"type": "bookings", "from": "2026-09-01", "cursor": cursor}).json()
    rows += r["rows"]
    cursor = r["next_cursor"]
    if not cursor: break
revenue = sum(x["net_amount"] for x in rows)
```

CSV: ช่อง array (`teacher_ids`) คั่นด้วย `|`; มี BOM เปิดใน Excel ได้ตรง

## ข้อควรรู้

- เวลา `created_at` เป็น UTC (ไทย +7) — ยอดข้ามวันช่วงเที่ยงคืนถึง 07:00 จะตกอยู่คนละวัน
- ไม่มี `updated_at` บนการจอง — การเปลี่ยนสถานะ (คืนเงิน/ยกเลิก) ภายหลังจะไม่ปรากฏถ้าดึงเฉพาะแถวใหม่; ควรดึงย้อนหลังทับช่วงที่ยังเปลี่ยนได้ (เช่น 60 วันล่าสุด) ทุกครั้งที่ sync
- ยอดใน `bookings.net_amount` รวมทั้งหมด = `workshops.gross` รวมทั้งหมด = `summary.totals.gross` (ถ้าช่วงเวลาครอบคลุมเท่ากัน)
- key อยู่ในมือใครก็ดึงข้อมูลการเงินทั้งหมดได้ — เก็บใน secret manager ของแอปฝั่งนั้น อย่าใส่ในโค้ดหรือแชท เปลี่ยน key ได้ทุกเมื่อด้วย `wrangler secret put FINANCE_EXPORT_KEY`
