# 📋 BÁO CÁO CẤU TRÚC – WEBAPP QUẢN LÝ QUÁN ĂN

> Phiên bản: v0.1 (bản nháp để duyệt) · Ngày: 21/10/2026
> Trạng thái: **CHƯA CODE** – chờ anh/chị duyệt cấu trúc và trả lời mục 13

---

## 1. Tóm tắt & 3 lưu ý kỹ thuật quan trọng

| # | Vấn đề | Giải thích | Đề xuất |
|---|--------|-----------|---------|
| 1 | **Chỉ HTML + CSS là chưa đủ** | HTML/CSS chỉ làm giao diện. Muốn bấm nút, tính tiền, lưu dữ liệu thì cần **JavaScript**. | Dùng **JavaScript thuần (Vanilla JS)** – không framework → vẫn cực nhẹ. |
| 2 | **Nhiều máy phải thấy cùng dữ liệu** | Order gọi món trên điện thoại A, Thu ngân phải thấy ngay trên máy B → cần **máy chủ/cơ sở dữ liệu online** đồng bộ thời gian thực. | Dùng dịch vụ miễn phí (**Firebase** – xem mục 3). Không cần tự thuê server. |
| 3 | **Gửi bill qua nhóm Zalo** | Zalo hiện có **Zalo Bot Platform**: thêm bot vào nhóm và gửi tin vào nhóm bằng `chat.id`. Token bot phải giấu ở máy chủ, không được để trong trang web. | 2 cách: **(A) Tự động** qua Zalo Bot + 1 hàm trung gian nhỏ; **(B) Thủ công 1 chạm** bằng nút "Chia sẻ" của điện thoại. Làm cả hai, A bị lỗi thì dùng B. |

---

## 2. Kiến trúc tổng thể

```
┌──────────────────┐      ┌──────────────────┐
│ ĐIỆN THOẠI ORDER │      │ ĐIỆN THOẠI ORDER │   (nhiều người, chung 1 tài khoản)
│   (PWA - Web)    │      │   (PWA - Web)    │
└────────┬─────────┘      └────────┬─────────┘
         │  gọi món / gửi bếp      │
         ▼                         ▼
   ┌───────────────────────────────────────┐
   │  FIREBASE FIRESTORE (CSDL thời gian thực) │
   │  - Thực đơn  - Bàn  - Bill  - Báo cáo  │
   │  - Chạy được khi mất mạng ngắn (offline)│
   └───────────────┬───────────────────────┘
                   │ đồng bộ tức thì (< 1 giây)
                   ▼
         ┌──────────────────┐
         │ MÁY THU NGÂN      │  (Tablet / Laptop / PC)
         │ Xem bill tạm tính │
         │ Giảm giá, thu tiền│
         │ QR chuyển khoản   │
         └────────┬─────────┘
                  │ Chốt bill
        ┌─────────┴──────────────┐
        ▼                        ▼
 (A) Hàm trung gian         (B) Nút "Chia sẻ"
 Cloudflare Worker          của điện thoại
 (giữ token Zalo Bot)       → chọn nhóm Zalo
        │                        │
        ▼                        ▼
   ┌──────────────────────────────────┐
   │       NHÓM ZALO CỦA QUÁN          │
   └──────────────────────────────────┘
```

---

## 3. Công nghệ sử dụng (ưu tiên gọn nhẹ)

| Lớp | Công nghệ | Lý do |
|-----|-----------|-------|
| Giao diện | **HTML5 + CSS3 thuần** (CSS Variables, Grid, Flexbox) | Không cần Bootstrap/Tailwind → nhẹ |
| Xử lý | **Vanilla JavaScript (ES Modules)** | Không React/Vue → không cần build, máy yếu chạy mượt |
| Cài như app | **PWA** (manifest + service worker) | Thêm ra màn hình chính, mở như app, tải nhanh, chạy offline |
| Dữ liệu | **Firebase Firestore** (gói miễn phí) | Đồng bộ thời gian thực + có offline + đăng nhập sẵn |
| Gửi Zalo tự động | **Cloudflare Worker** (miễn phí 100.000 lượt/ngày) | Giấu token Zalo Bot, gọi API gửi tin vào nhóm |
| QR chuyển khoản | **VietQR** (ảnh QR tạo theo số tiền) | Khách quét là ra đúng số tiền + nội dung |
| Hosting | **Firebase Hosting / Cloudflare Pages / GitHub Pages** | Miễn phí, có HTTPS (bắt buộc cho PWA) |

### Phương án dữ liệu khác (để anh/chị so sánh)

| Phương án | Ưu | Nhược | Phù hợp |
|-----------|----|-------|---------|
| ⭐ **Firebase** (đề xuất) | Realtime, offline, miễn phí, ổn định | Phụ thuộc Google | Hầu hết quán |
| Supabase | Realtime, có SQL, có hàm server sẵn | Dự án miễn phí bị tạm dừng nếu 7 ngày không dùng | Quán muốn dữ liệu kiểu SQL |
| Google Sheets + Apps Script | Chủ quán xem dữ liệu bằng Excel quen thuộc | Chậm (1–3 giây/lần), không realtime thật | Quán rất nhỏ, ít bàn |
| Máy chủ nội bộ (Node + SQLite) | Không cần Internet, chỉ cần Wi-Fi quán | Phải có 1 máy luôn bật, khó truy cập từ xa | Quán hay mất mạng |

### Ngân sách hiệu năng (cam kết "không nặng máy")
- Tổng code của app (HTML + CSS + JS): **< 150 KB** (chưa tính thư viện Firebase ~100 KB, tải 1 lần rồi lưu cache)
- Mở lần đầu: **< 2 giây** trên 4G · mở lần sau: **< 0,5 giây** (nhờ cache)
- Không dùng ảnh nặng: icon bằng SVG nội tuyến, ảnh món (nếu có) nén WebP < 30 KB
- Không hiệu ứng nặng; chỉ dùng chuyển động CSS nhẹ (transform/opacity)
- Chạy tốt trên điện thoại Android tầm thấp (RAM 2–3 GB)

---

## 4. Phân quyền

### 4.1 Cách đăng nhập
| Vai trò | Đăng nhập | Ghi chú |
|---------|-----------|---------|
| **Order** | 1 tài khoản chung, nhập **mã PIN quán** (4–6 số) → chọn **tên nhân viên** từ danh sách (không cần mật khẩu riêng) | Nhiều người dùng chung, nhưng vẫn biết ai gọi món nào |
| **Thu Ngân** | Tài khoản riêng + mật khẩu/PIN riêng | Có quyền cao nhất (kiêm quản lý) |

### 4.2 Bảng quyền hạn

| Chức năng | Order | Thu Ngân |
|-----------|:-----:|:--------:|
| Xem sơ đồ bàn | ✅ | ✅ |
| Mở bàn, gọi món, thêm món | ✅ | ✅ |
| Ghi chú món (ít cay, không hành…) | ✅ | ✅ |
| Sửa/xóa món **chưa gửi** | ✅ | ✅ |
| Xóa/giảm món **đã gửi** | ❌ | ✅ (bắt buộc ghi lý do) |
| Yêu cầu tính tiền | ✅ | ✅ |
| Chuyển bàn / gộp bàn / tách bill | ✅ chuyển bàn | ✅ tất cả |
| Xem giá & tổng tiền tạm tính | ✅ | ✅ |
| Giảm giá, phụ thu, VAT | ❌ | ✅ |
| Thu tiền, chốt bill, in bill | ❌ | ✅ |
| Gửi bill lên nhóm Zalo | ❌ | ✅ |
| Quản lý thực đơn, giá, hết món | ❌ (chỉ bật "hết món") | ✅ |
| Quản lý bàn, khu vực | ❌ | ✅ |
| Quản lý nhân viên & mã PIN | ❌ | ✅ |
| Xem báo cáo doanh thu | ❌ | ✅ |
| Cài đặt (tên quán, QR ngân hàng, Zalo) | ❌ | ✅ |

---

## 5. Quy trình hoạt động

### 5.1 Luồng chính

```
 KHÁCH VÀO
    │
    ▼
[ORDER] Chọn bàn trống ──► Bàn chuyển "CÓ KHÁCH" (tự động, mọi máy thấy ngay)
    │
    ▼
[ORDER] Chọn món (+/-), ghi chú ──► Bấm "GỬI"
    │                                     │
    │                                     ▼
    │                     Bill tạm tính tự tạo/cập nhật
    │                     ──► Máy Thu Ngân: báo chuông + rung + làm nổi món mới
    ▼
[ORDER] Khách gọi thêm ──► Thêm món ──► "GỬI" (tạo "đợt gọi" mới, cộng dồn vào bill)
    │
    ▼
[ORDER] Khách xin tính tiền ──► Bấm "TÍNH TIỀN"
    │                           Bàn chuyển "CHỜ THANH TOÁN" (màu cam, nhấp nháy ở máy Thu Ngân)
    ▼
[THU NGÂN] Mở bill ──► Kiểm tra / giảm giá / phụ thu
    │
    ▼
[THU NGÂN] Chọn hình thức: Tiền mặt (tự tính tiền thối) | Chuyển khoản (hiện QR) | Kết hợp
    │
    ▼
[THU NGÂN] Bấm "HOÀN TẤT"
    ├──► Bill lưu vào lịch sử + cộng vào báo cáo (tự động)
    ├──► Gửi bill lên nhóm Zalo (tự động hoặc 1 chạm)
    ├──► (Tùy chọn) In bill
    └──► Bàn trở về "TRỐNG" (tự động)
```

### 5.2 Trạng thái Bàn
```
 TRỐNG (xám) ──mở bàn──► CÓ KHÁCH (xanh) ──tính tiền──► CHỜ THANH TOÁN (cam) ──hoàn tất──► TRỐNG
```

### 5.3 Trạng thái Bill
```
 ĐANG PHỤC VỤ ──► CHỜ THANH TOÁN ──► ĐÃ THANH TOÁN
        │                 │
        └──────► ĐÃ HỦY ◄─┘   (chỉ Thu Ngân, bắt buộc lý do)
```

### 5.4 Xử lý nhiều người Order cùng lúc
- Mỗi món được lưu thành **1 dòng riêng** → 2 người cùng thêm món vào 1 bàn **không bị ghi đè**.
- Bàn đang có người khác thao tác sẽ hiện dấu "👤 Lan đang gọi món" để tránh trùng.
- Mất mạng: món vẫn lưu trên máy, **tự gửi lại** khi có mạng (có biểu tượng ⏳ "chờ đồng bộ").

---

## 6. Danh sách màn hình

### 6.1 Chung
| Mã | Màn hình | Mô tả |
|----|----------|-------|
| S01 | Đăng nhập | Chọn vai trò → nhập PIN → (Order) chọn tên |

### 6.2 Vai trò ORDER (tối ưu cho điện thoại, 1 tay)
| Mã | Màn hình | Mô tả |
|----|----------|-------|
| O01 | **Sơ đồ bàn** | Lưới bàn theo khu vực (Tầng 1, Sân vườn…), màu theo trạng thái, hiện tổng tiền & thời gian ngồi |
| O02 | **Gọi món** | Tab danh mục + ô tìm kiếm nhanh + lưới món; bấm là thêm, giữ lâu để ghi chú |
| O03 | **Giỏ món / Bill bàn** | Món chưa gửi (sửa được) + món đã gửi (khóa); nút GỬI, TÍNH TIỀN, CHUYỂN BÀN |

### 6.3 Vai trò THU NGÂN (tối ưu tablet/desktop, vẫn dùng được trên điện thoại)
| Mã | Màn hình | Mô tả |
|----|----------|-------|
| C01 | **Bảng điều khiển** | Bên trái: sơ đồ bàn · Bên phải: hàng đợi bill "Chờ thanh toán" · Trên: doanh thu hôm nay |
| C02 | **Chi tiết & thanh toán bill** | Danh sách món, giảm giá (% hoặc số tiền), phụ thu, VAT, khách đưa → tiền thối, QR |
| C03 | **Lịch sử bill** | Lọc theo ngày, bàn, trạng thái; xem lại / gửi lại Zalo / in lại |
| C04 | **Báo cáo** | Doanh thu theo ngày/tuần/tháng, món bán chạy, tiền mặt vs chuyển khoản, theo nhân viên |
| C05 | **Quản lý thực đơn** | Danh mục, món, giá, ảnh, bật/tắt "hết món" |
| C06 | **Quản lý bàn & khu vực** | Thêm/sửa/xóa bàn, sắp xếp |
| C07 | **Nhân viên** | Danh sách tên Order, đổi PIN Order, đổi PIN Thu Ngân |
| C08 | **Cài đặt** | Tên quán, địa chỉ, SĐT, ngân hàng (VietQR), VAT mặc định, kết nối Zalo Bot, mẫu bill |

### 6.4 Phác thảo giao diện (Mobile-first)

**O01 – Sơ đồ bàn (điện thoại)**
```
┌─────────────────────────────┐
│ 🍜 Quán Ngon    👤 Lan   ⋮  │
├─────────────────────────────┤
│ [Tất cả][Tầng 1][Sân vườn]  │
├─────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐     │
│ │ B01 │ │ B02 │ │ B03 │     │
│ │Trống│ │🟢45'│ │🟠TT │     │
│ │     │ │320k │ │580k │     │
│ └─────┘ └─────┘ └─────┘     │
│ ┌─────┐ ┌─────┐ ┌─────┐     │
│ │ B04 │ │ B05 │ │ B06 │     │
│ └─────┘ └─────┘ └─────┘     │
├─────────────────────────────┤
│  🪑 Bàn   │  📋 Đơn   │ ⚙️  │   ← thanh điều hướng dưới (dễ bấm 1 tay)
└─────────────────────────────┘
```

**O02 – Gọi món (điện thoại)**
```
┌─────────────────────────────┐
│ ← Bàn 02          🔍        │
├─────────────────────────────┤
│ [Món chính][Lẩu][Nước][...] │
├─────────────────────────────┤
│ Phở bò          55.000  [+] │
│ Bún chả         50.000 [-]2[+]│
│ Cơm tấm         45.000  [+] │
│ Trà đá  (HẾT)    5.000  ✕   │
├─────────────────────────────┤
│ 🛒 3 món · 150.000đ  [GỬI ▶]│   ← thanh cố định dưới cùng
└─────────────────────────────┘
```

**C01 – Thu Ngân (tablet/desktop – 2 cột)**
```
┌──────────────────────────────────────────────────────┐
│ 🍜 Quán Ngon │ Hôm nay: 5.240.000đ · 38 bill │ 🔔3 │ ⚙️ │
├────────────────────────────┬─────────────────────────┤
│  SƠ ĐỒ BÀN                 │  CHỜ THANH TOÁN (2)     │
│ ┌───┐┌───┐┌───┐┌───┐┌───┐  │ ┌─────────────────────┐ │
│ │B01││B02││B03││B04││B05│  │ │ 🟠 Bàn 03 · 580.000 │ │
│ └───┘└───┘└───┘└───┘└───┘  │ └─────────────────────┘ │
│ ┌───┐┌───┐┌───┐┌───┐┌───┐  │ ┌─────────────────────┐ │
│ │B06││B07││B08││B09││B10│  │ │ 🟠 Bàn 07 · 215.000 │ │
│ └───┘└───┘└───┘└───┘└───┘  │ └─────────────────────┘ │
│                            │  ĐANG PHỤC VỤ (5) ...   │
└────────────────────────────┴─────────────────────────┘
```

---

## 7. Mô hình dữ liệu (Firestore)

```
shops/{shopId}
 ├─ settings            : tên quán, địa chỉ, SĐT, VAT%, ngân hàng (mã NH, STK, tên TK),
 │                        zaloEnabled, mẫu bill, PIN đã mã hóa
 ├─ staff/{id}          : name, role ("order" | "cashier"), active
 ├─ areas/{id}          : name, order
 ├─ tables/{id}         : name, areaId, status ("empty"|"serving"|"waiting_pay"),
 │                        currentBillId, openedAt, lockedBy
 ├─ categories/{id}     : name, order, icon
 ├─ menuItems/{id}      : name, categoryId, price, image, available, order
 ├─ bills/{id}          : code (HD-20261021-001), tableId, tableName, status,
 │   │                    openedAt, closedAt, subtotal, discount, surcharge, vat, total,
 │   │                    payMethod ("cash"|"transfer"|"mixed"), cashReceived, change,
 │   │                    createdBy, closedBy, cancelReason, zaloSent (true/false)
 │   └─ items/{id}      : menuItemId, name, price (chụp giá lúc gọi), qty, note,
 │                        round (đợt gọi 1,2,3…), addedBy, addedAt, voided, voidReason
 └─ dailyStats/{yyyy-mm-dd} : revenue, billCount, cash, transfer, topItems{...}
                              (tự cộng dồn khi chốt bill → báo cáo mở tức thì)
```

> **Lưu ý:** giá món được "chụp" vào bill lúc gọi → đổi giá thực đơn không làm sai bill cũ.

---

## 8. Tự động hóa

| # | Tự động | Mô tả |
|---|---------|-------|
| 1 | Trạng thái bàn | Tự đổi màu: mở bàn → có khách → chờ thanh toán → trống |
| 2 | Tính tiền | Tự tính tạm tính, giảm giá, phụ thu, VAT, tổng, tiền thối |
| 3 | Thông báo | Máy Thu Ngân **kêu chuông + rung** khi có món mới / bàn yêu cầu tính tiền |
| 4 | Mã bill | Tự đánh số `HD-YYYYMMDD-001`, reset mỗi ngày |
| 5 | QR chuyển khoản | Tự tạo QR VietQR **đúng số tiền + nội dung "Ban 03 HD-xxx"** |
| 6 | Gửi Zalo | Chốt bill → **tự gửi** lên nhóm Zalo (bật/tắt trong Cài đặt) |
| 7 | Báo cáo | Tự cộng doanh thu theo ngày; **tự gửi báo cáo cuối ngày** lên Zalo (tùy chọn, ví dụ 23:00) |
| 8 | Hết món | Thu Ngân/Order bật "hết món" → mọi máy Order ẩn/khóa món đó ngay |
| 9 | Đồng bộ offline | Mất mạng vẫn gọi món, có mạng lại tự đẩy lên |
| 10 | Thời gian ngồi | Tự đếm phút từ lúc mở bàn, bàn ngồi lâu đổi màu nhắc |
| 11 | Đăng xuất | Tự khóa màn hình Thu Ngân sau X phút không dùng (bảo mật) |
| 12 | Gợi ý món | Món hay gọi được đưa lên đầu danh sách |

---

## 9. Tích hợp Zalo

### Cách A – Tự động (Zalo Bot Platform)
1. Chủ quán tạo bot trong Mini App **Zalo Bot Creator** → lấy **Bot Token**.
2. Thêm bot vào nhóm Zalo của quán (trưởng nhóm xác nhận).
3. Trong nhóm, nhắc tên bot (@bot) → hệ thống ghi nhận **ID nhóm** (`chat.id`).
4. Dán Token vào Cài đặt → Token được lưu ở **Cloudflare Worker** (không lộ ra ngoài trang web).
5. Mỗi lần chốt bill → app gọi Worker → Worker gửi tin vào nhóm.

*Giới hạn: mỗi tin tối đa 2.000 ký tự (bill dài sẽ tự tách thành nhiều tin).*

### Cách B – Thủ công 1 chạm (luôn có, không cần cài đặt)
- Nút **"📤 Chia sẻ Zalo"** → mở bảng chia sẻ của điện thoại → chọn Zalo → chọn nhóm → Gửi.
- Trên máy tính: nút **"📋 Sao chép bill"** → dán vào Zalo PC.
- Có thể chia sẻ dạng **chữ** hoặc **ảnh bill** (tạo ảnh ngay trên máy).

### Mẫu tin nhắn bill
```
🧾 QUÁN NGON – HÓA ĐƠN
Mã: HD-20261021-015 | Bàn 03
Giờ vào 18:42 – Giờ ra 19:55
──────────────────
2 x Phở bò ........ 110.000
1 x Bún chả ........ 50.000
3 x Trà đá ......... 15.000
──────────────────
Tạm tính:        175.000
Giảm giá (10%):  -17.500
TỔNG CỘNG:       157.500đ
💳 Chuyển khoản | TN: Hoa | Order: Lan, Tuấn
```

---

## 10. Cấu trúc thư mục dự án

```
quan-an-app/
├── index.html              # Khung app duy nhất (SPA) – đăng nhập + điều hướng
├── manifest.json           # Cấu hình PWA (tên, icon, màu)
├── sw.js                   # Service worker: cache để mở nhanh & offline
│
├── css/
│   ├── base.css            # Reset, biến màu (CSS variables), chữ
│   ├── layout.css          # Lưới responsive, header, thanh điều hướng
│   ├── components.css      # Nút, thẻ bàn, thẻ món, modal, toast, badge
│   └── pages.css           # Style riêng từng màn hình
│
├── js/
│   ├── app.js              # Khởi động, router (#/ban, #/goi-mon, #/thu-ngan…)
│   ├── config.js           # Cấu hình Firebase
│   ├── db.js               # Hàm đọc/ghi Firestore + lắng nghe realtime
│   ├── auth.js             # Đăng nhập PIN, phân quyền, tự khóa
│   ├── store.js            # Trạng thái dùng chung (bàn, thực đơn, bill)
│   ├── utils.js            # Định dạng tiền VNĐ, ngày giờ, tạo mã bill
│   ├── bill.js             # Tính tiền, tạo nội dung bill, ảnh bill
│   ├── zalo.js             # Gửi Zalo (Cách A) + chia sẻ (Cách B)
│   ├── notify.js           # Chuông, rung, toast
│   └── pages/
│       ├── login.js
│       ├── tables.js       # O01 / C01
│       ├── order.js        # O02 / O03
│       ├── cashier.js      # C01 / C02
│       ├── history.js      # C03
│       ├── reports.js      # C04
│       └── admin.js        # C05–C08
│
├── assets/
│   ├── icons/              # Icon app (192, 512 px) + SVG
│   └── sounds/ding.mp3     # Âm báo (< 10 KB)
│
├── worker/
│   └── zalo-worker.js      # Cloudflare Worker – trung gian gửi Zalo Bot
│
├── firestore.rules         # Luật bảo mật: Order không được sửa giá / chốt bill
└── README.md               # Hướng dẫn cài đặt & triển khai
```

---

## 11. Thiết kế giao diện (Design System)

### Responsive – Mobile First
| Thiết bị | Độ rộng | Bố cục |
|----------|---------|--------|
| 📱 Điện thoại | < 600px | 1 cột, thanh điều hướng **dưới**, nút lớn ≥ 48px, lưới bàn 3 cột |
| 📲 Tablet | 600–1023px | 2 cột (bàn + bill), lưới bàn 4–5 cột, thanh điều hướng bên trái dạng icon |
| 💻 Desktop | ≥ 1024px | Thanh bên trái đầy đủ + nội dung 2–3 cột, có phím tắt |

### Màu sắc (đề xuất – có thể đổi)
| Vai trò | Màu | Dùng cho |
|---------|-----|----------|
| Chính | `#E85D04` cam ấm | Nút chính, nhấn mạnh (gợi cảm giác đồ ăn) |
| Nền | `#F8F9FA` / `#FFFFFF` | Nền sáng, sạch |
| Chữ | `#1F2937` | Dễ đọc |
| Bàn trống | `#E5E7EB` xám | |
| Có khách | `#10B981` xanh lá | |
| Chờ thanh toán | `#F59E0B` cam vàng (nhấp nháy nhẹ) | |
| Lỗi / Hủy | `#EF4444` đỏ | |

- **Phông chữ:** dùng phông hệ thống (`system-ui`) → không tải thêm, hiển thị tiếng Việt chuẩn.
- **Chế độ tối (Dark mode):** tự theo cài đặt máy (tùy chọn).
- **Nguyên tắc:** tối đa 2 chạm cho thao tác thường dùng; số tiền to, rõ; nút nguy hiểm (hủy, xóa) luôn hỏi xác nhận.

---

## 12. Lộ trình triển khai đề xuất

| Giai đoạn | Nội dung | Kết quả |
|-----------|----------|---------|
| **GĐ 1 – Khung & giao diện** | Design system, layout responsive, các màn hình với dữ liệu mẫu (chạy offline, chưa có server) | Xem & bấm thử toàn bộ giao diện trên điện thoại/tablet/PC |
| **GĐ 2 – Luồng Order → Thu Ngân** | Kết nối Firebase, đăng nhập PIN, sơ đồ bàn realtime, gọi món, bill tạm tính, thanh toán, QR | Dùng được thật trong quán |
| **GĐ 3 – Zalo & In** | Chia sẻ Zalo (B), Zalo Bot tự động (A), in bill máy in nhiệt khổ 58/80mm | Bill tự lên nhóm Zalo |
| **GĐ 4 – Quản lý & Báo cáo** | Thực đơn, bàn, nhân viên, lịch sử, báo cáo, gửi báo cáo cuối ngày | Hoàn chỉnh |
| **GĐ 5 – Hoàn thiện** | PWA, offline, bảo mật (firestore.rules), tối ưu tốc độ, hướng dẫn sử dụng | Bàn giao |

---

## 13. ❓ Câu hỏi cần anh/chị xác nhận trước khi code

1. **Đồng ý dùng thêm JavaScript + Firebase** (miễn phí) để nhiều máy đồng bộ? Hay muốn phương án khác ở mục 3?
2. **Gửi Zalo:** muốn **tự động** (Cách A – cần tạo Zalo Bot, ~10 phút cài đặt) hay chỉ cần **1 chạm chia sẻ** (Cách B)? Hay làm cả hai?
3. **Bếp:** có cần màn hình/phiếu cho **bếp** không (Order gửi → bếp thấy món cần làm)? Hiện tại theo yêu cầu thì chỉ gửi cho Thu Ngân.
4. **In bill:** quán có **máy in nhiệt** không? (khổ 58mm hay 80mm)
5. **Quy mô:** khoảng **bao nhiêu bàn**, bao nhiêu món, mấy khu vực?
6. **Thanh toán:** có cần **VAT**, **phụ thu** (lễ, Tết), **giảm giá** không? Có dùng **QR chuyển khoản** không?
7. **Một quán hay nhiều chi nhánh?** (cấu trúc dữ liệu đã chừa sẵn `shopId` để mở rộng)
8. **Tên quán + màu thương hiệu/logo** (nếu có) để đưa vào giao diện.

---
*Sau khi anh/chị duyệt, em sẽ bắt đầu từ **Giai đoạn 1** (giao diện chạy thử với dữ liệu mẫu) để anh/chị xem trước trên điện thoại.*
