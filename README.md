# 🌿 Quán Lá – Webapp quản lý quán ăn

Gọn nhẹ (HTML + CSS + JavaScript thuần, **không framework, không cần build**), Mobile-first, chạy trên điện thoại / tablet / máy tính.
Có 2 vai trò **Order** và **Thu Ngân**. Gửi phiếu bếp và hóa đơn lên **nhóm Zalo**, in bằng **máy in nhiệt 80mm**.

- Dung lượng code app: ~200 KB, khoảng 55 KB khi nén gzip, thư viện Firebase chỉ tải khi bật chế độ thật
- Không ảnh nặng: icon SVG nội tuyến, âm báo tạo bằng Web Audio (không có file mp3)
- Cài được như app (PWA), mở lại tức thì nhờ cache

---

## 1. Chạy thử ngay (Chế độ DEMO)

App yêu cầu cấu hình Firebase trong `js/config.js`; nếu chưa có cấu hình, app dừng và báo thiếu thiết lập thay vì tạo dữ liệu demo.

```bash
cd quan-la
python3 -m http.server 8080      # hoặc: npx serve .
# mở http://localhost:8080
```

| Vai trò | Mã PIN demo |
|---|---|
| Order | `111111` |
| Thu Ngân | `999999` |

> Mẹo: mở 2 tab. Tab 1 đăng nhập Order và gọi món, tab 2 đăng nhập Thu Ngân để xem đơn tới ngay (có chuông báo).
> Lưu ý: 2 tab dùng chung phiên đăng nhập. Muốn thử 2 vai trò cùng lúc, hãy dùng thêm một cửa sổ ẩn danh, hoặc dùng Firebase.

---

## 2. Cấu trúc thư mục

```
quan-la/
├── index.html            Khung app (SPA)
├── manifest.json, sw.js  PWA: cài lên màn hình chính + cache offline
├── css/
│   ├── base.css          Biến màu, reset, chế độ tối, mẫu in 80mm
│   ├── layout.css        Thanh trên, menu dưới (mobile), menu trái (desktop)
│   ├── components.css    Nút, chip, modal/bottom-sheet, toast, công tắc…
│   └── pages.css         Đăng nhập, sơ đồ bàn, gọi món, thanh toán, quản trị
├── js/
│   ├── config.js         ⚙️ Cấu hình Firebase + email 2 tài khoản
│   ├── app.js            Khởi động + điều hướng + phân quyền trang
│   ├── db.js             Lớp dữ liệu (Demo localStorage | Firebase Firestore)
│   ├── store.js          Trạng thái chung + đồng bộ realtime + thực đơn khởi tạo
│   ├── auth.js           Đăng nhập PIN, chọn tên, tự khóa
│   ├── actions.js        Nghiệp vụ: mở bàn, gửi món, chuyển/gộp bàn, hủy món, thanh toán
│   ├── bill.js           Tính tiền, mẫu phiếu bếp/hóa đơn (chữ, bản in, ảnh), VietQR
│   ├── zalo.js           Gửi Zalo tự động (Worker) + chia sẻ 1 chạm
│   ├── notify.js         Chuông, rung, thông báo cho thu ngân
│   ├── ui.js, utils.js   Icon, modal, toast, định dạng tiền/giờ
│   └── pages/            login, tables, order, orders, cashier, history, reports, admin, soldout
├── worker/zalo-worker.js Cloudflare Worker trung gian gửi Zalo Bot
├── firestore.rules       Luật bảo mật phân quyền Order / Thu Ngân
└── firebase.json         Cấu hình deploy Firebase Hosting
```

---

## 3. Chạy thật trên nhiều thiết bị (Firebase – miễn phí)

1. Vào **https://console.firebase.google.com**, chọn **Add project** và đặt tên, ví dụ `quan-la`.
2. **Build → Authentication → Get started → Email/Password → Enable**.
   Ở tab **Users → Add user**, tạo 2 tài khoản:
   | Email | Mật khẩu (= mã PIN 6 số) |
   |---|---|
   | `order@quanla.app` | ví dụ `246810` |
   | `thungan@quanla.app` | ví dụ `135790` |
3. **Build → Firestore Database → Create database**. Chọn vùng `asia-southeast1` (Singapore) và chế độ **Production**.
4. Mở tab **Rules**, dán nội dung file `firestore.rules`, rồi bấm **Publish**.
5. **Project settings → Your apps → Web (</>)**, đăng ký app rồi copy đoạn `firebaseConfig`
   và dán vào `js/config.js`:
   ```js
   export const FIREBASE_CONFIG = { apiKey: "...", authDomain: "...", projectId: "...", ... };
   ```
6. Đưa app lên mạng (chọn 1 cách):
   - **Firebase Hosting**: `npm i -g firebase-tools` → `firebase login` → `firebase init hosting` (chọn thư mục hiện tại, không ghi đè index.html) → `firebase deploy`
   - **Cloudflare Pages / Netlify / GitHub Pages**: kéo thả cả thư mục `quan-la` lên.
7. **Thu Ngân phải đăng nhập lần đầu** để app tự tạo dữ liệu ban đầu (10 bàn và thực đơn Quán Lá). Sau đó Order mới đăng nhập được.

> Mất mạng: Order vẫn gọi món được, có biểu tượng "Offline". App tự đồng bộ khi có mạng lại.
> Đăng nhập lần đầu thì cần có Internet.

---

## 4. Gửi lên nhóm Zalo

### Cách B – Chia sẻ 1 chạm (luôn dùng được, không cần cài gì)
Khi Order gửi bếp hoặc Thu Ngân thanh toán, app hiện bảng gửi:
- **Điện thoại**: bấm **Chia sẻ Zalo**, chọn Zalo, chọn nhóm rồi Gửi. Có thể gửi **dạng ảnh**.
- **Máy tính**: bấm **Sao chép** rồi dán (Ctrl+V) vào Zalo PC.

### Cách A – Gửi TỰ ĐỘNG qua Zalo Bot
> ⚠️ Theo tài liệu Zalo, tính năng **Bot trong nhóm vẫn đang Beta**. Nếu gửi lỗi, app tự chuyển sang Cách B.

1. **Tạo bot**: trong Zalo, tìm OA **"Zalo Bot Manager"**, chọn *Tạo bot* (tên bắt đầu bằng "Bot", ví dụ *Bot Quán Lá*). Bạn sẽ nhận **Bot Token** qua tin nhắn.
2. **Tạo Worker**: vào https://dash.cloudflare.com, chọn **Workers & Pages → Create → Worker**. Dán nội dung `worker/zalo-worker.js` rồi bấm **Deploy**.
3. Mở **Settings → Variables and Secrets** của Worker và thêm:
   | Tên | Giá trị |
   |---|---|
   | `BOT_TOKEN` | Token bot |
   | `APP_KEY` | Mật khẩu tự đặt (ví dụ chuỗi 20 ký tự ngẫu nhiên) |
   | `WEBHOOK_SECRET` | Chuỗi ngẫu nhiên khác |
   | `ALLOW_ORIGIN` | Địa chỉ app, ví dụ `https://quan-la.web.app` |
4. Mở trình duyệt vào `https://<worker>.workers.dev/setup?key=<APP_KEY>` một lần để đăng ký webhook.
5. **Thêm bot vào nhóm**: Mini App *Zalo Bot Creator*, chọn bot, chọn *Mời Bot vào nhóm*, gửi link vào nhóm. Trưởng nhóm bấm link rồi Xác nhận.
6. Trong nhóm, gõ **@Bot Quán Lá /id**. Bot sẽ trả lời **ID nhóm**.
7. Vào app, chọn **Quản lý → Cài đặt → Gửi nhóm Zalo**, bật *Gửi TỰ ĐỘNG*, rồi nhập địa chỉ Worker, App Key, ID nhóm Bếp (và ID nhóm Hóa đơn nếu khác). Bấm **Gửi tin thử** rồi **Lưu cài đặt**.

Nội dung được gửi:
- 🔥 **Phiếu bếp**: mỗi lần Order bấm *Gửi bếp* (bếp xem trên Zalo và làm theo)
- ❌ **Hủy món / hủy bàn**: báo bếp khi Thu Ngân hủy
- 🧾 **Hóa đơn**: khi Thu Ngân hoàn tất thanh toán
- 📊 **Báo cáo**: bấm *Gửi Zalo* ở trang Báo cáo (ví dụ cuối ngày)

---

## 5. Máy in nhiệt 80mm

1. Cài driver máy in, rồi trong cài đặt máy in chọn khổ giấy **80mm (72mm vùng in)**.
2. Lần in đầu trong Chrome: **Khổ giấy 80mm**, **Lề: Không (None)**, **bỏ chọn Đầu trang/Chân trang**. Chrome sẽ nhớ cho lần sau.
3. **In tự động không hỏi** (máy thu ngân): tạo shortcut Chrome có thêm cờ
   ```
   chrome.exe --kiosk-printing https://quan-la.web.app
   ```
   rồi bật *Tự in hóa đơn* trong Cài đặt.
4. Hóa đơn có **mã QR VietQR** đúng số tiền để khách quét (bật/tắt trong Cài đặt).

---

## 6. Cài lên điện thoại như app
- **Android (Chrome)**: menu ⋮ → *Thêm vào màn hình chính*
- **iPhone (Safari)**: nút Chia sẻ → *Thêm vào MH chính*

---

## 7. Quy trình sử dụng

```
ORDER  : Chọn bàn → chạm món (+ ghi chú) → GỬI BẾP ──► phiếu bếp lên nhóm Zalo
                                    │                  └► máy Thu Ngân kêu chuông
         Khách gọi thêm → GỬI BẾP (lần 2, 3…)
         Khách xin tính tiền → TÍNH TIỀN ──► bàn chuyển màu cam, báo Thu Ngân
THU NGÂN: Mở bill → giảm giá / phụ thu → Tiền mặt (tự tính tiền thối) | Chuyển khoản (QR) | Kết hợp
         → HOÀN TẤT ──► lưu lịch sử + báo cáo, gửi hóa đơn lên Zalo, in hóa đơn, bàn trống lại
```

| Chức năng | Order | Thu Ngân |
|---|:-:|:-:|
| Sơ đồ bàn, gọi món, ghi chú, chuyển bàn | ✅ | ✅ |
| Sửa/xóa món **chưa gửi** | ✅ | ✅ |
| Hủy món **đã gửi** (bắt buộc lý do) | ❌ | ✅ |
| Yêu cầu tính tiền, báo hết món | ✅ | ✅ |
| Giảm giá, phụ thu, thu tiền, in, gửi hóa đơn | ❌ | ✅ |
| Gộp bàn, hủy bill | ❌ | ✅ |
| Lịch sử, báo cáo, xuất Excel (CSV) | ❌ | ✅ |
| Quản lý thực đơn, bàn (thêm/bớt), nhân viên, cài đặt | ❌ | ✅ |

---

## 8. Ghi chú
- Dữ liệu mẫu có **10 bàn** chia 2 khu vực. Thêm/bớt bàn ở **Quản lý → Bàn & khu vực** (có nút *+ Nhiều bàn*).
- Đổi mã PIN: chế độ demo đổi trong app. Với Firebase, Thu Ngân tự đổi PIN của mình trong app; PIN Order đổi trong Firebase Console.
- Bộ nhớ demo nằm trong trình duyệt. Nhớ dùng **Sao lưu** thường xuyên, hoặc chuyển sang Firebase để dùng lâu dài.
