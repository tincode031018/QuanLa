# 🌿 Quán Lá – Webapp quản lý quán ăn

Ứng dụng web viết bằng HTML, CSS và JavaScript ES modules, không dùng framework và không cần bước build. Dữ liệu nhiều thiết bị đồng bộ qua Firebase Authentication và Cloud Firestore. Ứng dụng có hai vai trò **Order** và **Thu ngân**, cùng các luồng gọi món, thanh toán, báo bếp, Zalo và in hóa đơn.

> **Tài liệu theo hiện trạng mã nguồn.** Ứng dụng hiện yêu cầu Firebase; chế độ database demo localStorage đã bị gỡ. Không sử dụng PIN demo `111111` / `999999`.

---

## 1. Chạy ứng dụng

Có thể phục vụ thư mục bằng một static web server:

```powershell
python -m http.server 8080 --bind 127.0.0.1
```

Sau đó mở `http://127.0.0.1:8080`. Trên Windows có thể chạy `Chay_Quan_La.bat`.

Local server chỉ phục vụ file giao diện, **không thay thế Firebase**. Cần có Internet, Firebase Web App hợp lệ trong `js/config.js`, bật Email/Password Authentication, tài khoản nhân viên và Firestore Rules. Nếu thiếu cấu hình hoặc Firebase chưa sẵn sàng, đăng nhập và đồng bộ dữ liệu sẽ không hoạt động.

Mã PIN là mật khẩu của tài khoản Firebase, không phải PIN dùng chung để chạy demo. Order đăng nhập bằng `order@quanla.app`, Thu ngân bằng `thungan@quanla.app`; tài khoản phải được tạo trong Firebase Authentication trước khi sử dụng.

Ở màn hình nhập PIN, có thể bật **Giữ đăng nhập trên thiết bị này** để Firebase duy trì phiên sau khi đóng/mở lại app. Tùy chọn này không lưu PIN; nếu tắt, phiên chỉ tồn tại trong tab hiện tại. Trên thiết bị dùng chung nên tắt tùy chọn và luôn đăng xuất sau khi dùng.

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
│   ├── db.js             Firebase Authentication + Firestore
│   ├── store.js          Trạng thái chung + đồng bộ realtime + thực đơn khởi tạo
│   ├── auth.js           Đăng nhập Firebase, phiên đăng nhập, tự khóa
│   ├── actions.js        Nghiệp vụ: mở bàn, gửi món, chuyển/gộp bàn, hủy món, thanh toán
│   ├── bill.js           Tính tiền, mẫu phiếu bếp/hóa đơn (chữ, bản in, ảnh), VietQR
│   ├── zalo.js           Gửi Zalo tự động (Worker) + chia sẻ 1 chạm
│   ├── notify.js         Chuông, rung, thông báo cho thu ngân
│   ├── ui.js, utils.js   Icon, modal, toast, định dạng tiền/giờ
│   └── pages/            login, tables, order, orders, cashier, history, reports, admin, soldout, printer, inventory
├── worker/zalo-worker.js Cloudflare Worker trung gian gửi Zalo Bot
├── firestore.rules       Luật bảo mật phân quyền Order / Thu Ngân
└── firebase.json         Cấu hình deploy Firebase Hosting
```

---

## 3. Firebase và triển khai

Ứng dụng kết nối tới Firebase theo cấu hình trong `js/config.js`. Nếu đổi Firebase project, cập nhật `FIREBASE_CONFIG`, tạo hai tài khoản Authentication tương ứng với `ACCOUNTS`, rồi triển khai `firestore.rules` từ repository. Không thay đổi email trong `config.js` mà quên cập nhật `firestore.rules`.

Thu ngân cần đăng nhập Firebase thành công để khởi tạo/cập nhật dữ liệu ban đầu. Sau đó Order có thể đăng nhập bằng tài khoản của mình. Đăng nhập ban đầu cần Internet; Firestore có thể lưu thay đổi offline và đồng bộ lại khi mạng phục hồi, nhưng không nên xem offline là đã xác nhận thao tác thành công ở máy chủ.

Có thể chạy bằng static hosting hoặc Firebase Hosting. Repository đã có `firebase.json`; nếu triển khai bằng Firebase CLI, liên kết đúng Firebase project trước khi chạy `firebase deploy`. Hosting phải phục vụ nguyên cấu trúc thư mục để các đường dẫn tương đối trong app tiếp tục hoạt động.

---

## 4. Zalo Bot: hiện trạng và điểm cần kiểm tra

Ứng dụng gửi yêu cầu tự động theo luồng **app → Cloudflare Worker → Zalo Bot API → nhóm**. Worker giữ Bot Token trong Cloudflare KV; app không lưu token trong Firestore hoặc localStorage.

### Nội dung nào được gửi và khi nào

| Nội dung | Thời điểm gửi trong app | Nhóm đích |
|---|---|---|
| Phiếu bếp | Order bấm **Gửi bếp** | ID nhóm Bếp |
| Báo hủy món | Order/Thu ngân hủy món đã gửi | ID nhóm Bếp |
| Hóa đơn hoàn chỉnh | Thu ngân bấm **Hoàn tất thanh toán** | ID nhóm Hóa đơn; nếu để trống thì dùng nhóm Bếp |
| Báo cáo | Người dùng bấm gửi Zalo ở trang Báo cáo | Dùng cấu hình nhóm hóa đơn/nhóm bếp |

**Lưu ý về vướng mắc hiện tại:** mã nguồn chỉ gửi **phiếu bếp** khi Order nhận/gửi đơn. Hóa đơn (`billText`) chỉ được gửi tự động sau khi Thu ngân hoàn tất thanh toán. Vì vậy, yêu cầu bot tự gửi **hóa đơn đầy đủ ngay khi đơn vừa được nhận** hiện chưa được thực hiện trong mã. Đây là trạng thái cần xử lý; cấu hình Worker đúng không làm hóa đơn tự phát sinh ở thời điểm nhận đơn.

### Cấu hình tự động

Trong **Quản lý → Cài đặt → Gửi nhóm Zalo**:

1. Bật **Gửi phiếu bếp**, **Gửi hóa đơn** tương ứng và **Gửi TỰ ĐỘNG qua Zalo Bot**.
2. Tạo một KV namespace trong Cloudflare, rồi gắn vào Worker với tên binding `ZALO_CONFIG`; deploy mã mới từ `worker/zalo-worker.js`.
3. Trong Worker, cấu hình `ADMIN_KEY` (Secret), `APP_KEY` (Secret), `WEBHOOK_SECRET` (Secret) và `ALLOW_ORIGIN` (origin chính xác của website). `APP_KEY` phải trùng giá trị nhập trong app.
4. Nhập Worker URL, App Key, ID nhóm Bếp và (nếu khác) ID nhóm Hóa đơn. Dán Bot Token và `ADMIN_KEY`, bấm **Lưu Bot Token vào Worker**. Token được gửi qua HTTPS và lưu trong KV; app không ghi Bot Token hoặc `ADMIN_KEY` vào Firestore/localStorage.
5. Bấm **Lưu cài đặt** để lưu Worker URL, App Key, ID nhóm và các tùy chọn gửi. Nút **Gửi tin thử** kiểm tra nhóm Bếp; nó không kiểm tra ID nhóm Hóa đơn.
6. Sau khi hoàn tất thanh toán thử, kiểm tra nhóm Hóa đơn để đối soát.

Worker trong `worker/zalo-worker.js` dùng các bindings/secrets:

| Tên | Mục đích |
|---|---|
| `ZALO_CONFIG` | KV namespace lưu Bot Token; bắt buộc để cấu hình token từ giao diện |
| `ADMIN_KEY` | Secret quản trị, dùng riêng cho `POST /configure` |
| `APP_KEY` | Khóa app, phải trùng với cài đặt trong app (Secret) |
| `WEBHOOK_SECRET` | Mã xác thực webhook (Secret) |
| `ALLOW_ORIGIN` | Origin chính xác của website app |
| `BOT_TOKEN` | Secret tùy chọn, chỉ dùng dự phòng cho cấu hình cũ nếu KV chưa có token |

Worker cung cấp `GET /` để kiểm tra dịch vụ, `POST /configure` để lưu token (header `X-Admin-Key`), `POST /send`, `GET /setup?key=...` để đăng ký webhook và `POST /webhook` để bot trả lời lệnh lấy ID nhóm. Không tạo endpoint đọc lại token. Bot phải được thêm vào đúng group và được phép nhắn trong group.

### Khi bot không gửi được hóa đơn tự động

1. Xác nhận thời điểm thao tác: hóa đơn chỉ gửi sau **Hoàn tất thanh toán**, không gửi ngay khi Order bấm **Gửi bếp**.
2. Xác nhận đã bật **Gửi hóa đơn** và **Gửi TỰ ĐỘNG**, Worker URL/App Key chính xác, Worker đã deploy phiên bản mới.
3. Kiểm tra ID nhóm Hóa đơn; nếu bỏ trống, app dùng ID nhóm Bếp. Tin thử trong trang cài đặt chỉ nhắm tới nhóm Bếp.
4. Sau thanh toán, xem thông báo trong app và Network/Console của trình duyệt; kiểm tra log/response từ Worker, đặc biệt lỗi xác thực (`401`), lỗi Worker/Zalo API (`5xx`) hoặc lỗi mạng.
5. Nếu tự động thất bại, app có thể hiện bảng chia sẻ thủ công. Việc này là phương án dự phòng, không chứng minh gửi tự động đã thành công.

Hiện chưa có log/response thực tế của lần gửi bị lỗi trong tài liệu này, nên chưa kết luận nguyên nhân cụ thể của sự cố group Zalo.

### Chia sẻ thủ công

Khi luồng tự động không dùng được, trên điện thoại có thể chọn chia sẻ Zalo; trên máy tính có thể sao chép nội dung rồi dán vào Zalo. Đây là thao tác thủ công, không phải bot tự gửi.

---

## 5. Máy in nhiệt 80mm

1. Cài driver máy in, rồi trong cài đặt máy in chọn khổ giấy **80mm (72mm vùng in)**.
2. Lần in đầu trong Chrome: **Khổ giấy 80mm**, **Lề: Không (None)**, **bỏ chọn Đầu trang/Chân trang**. Chrome sẽ nhớ cho lần sau.
3. **In tự động không hỏi** (máy thu ngân): tạo shortcut Chrome có thêm cờ
   ```
   chrome.exe --kiosk-printing https://quan-la.web.app
   ```
   rồi bật *Tự in hóa đơn* trong Cài đặt.
4. Hóa đơn có **mã QR VietQR** đúng số tiền để khách quét (bật/tắt trong **Máy in**). Tại **Máy in → Nội dung hóa đơn**, bật/tắt **Hiện dòng tạm tính trên bill in** để điều khiển dòng này trên bản in; mặc định là hiện.

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
         Xem đơn đang phục vụ → mở chi tiết đơn → hủy món đã gửi (nhập lý do; app báo bếp)
         Khách xin tính tiền → TÍNH TIỀN ──► bàn chuyển màu cam, báo Thu Ngân
THU NGÂN: Mở bill → giảm giá / phụ thu → Tiền mặt (tự tính tiền thối) | Chuyển khoản (QR) | Kết hợp
         → HOÀN TẤT ──► lưu lịch sử + báo cáo, gửi hóa đơn lên Zalo, in hóa đơn, bàn trống lại
```

| Chức năng | Order | Thu Ngân |
|---|:-:|:-:|
| Sơ đồ bàn, gọi món, ghi chú, chuyển bàn | ✅ | ✅ |
| Sửa/xóa món **chưa gửi** | ✅ | ✅ |
| Xem đơn đang phục vụ, hủy món **đã gửi** (bắt buộc lý do) | ✅ | ✅ |
| Yêu cầu tính tiền, báo hết món | ✅ | ✅ |
| Giảm giá, phụ thu, thu tiền, in, gửi hóa đơn | ❌ | ✅ |
| Gộp bàn, hủy bill | ❌ | ✅ |
| Lịch sử, báo cáo, xuất Excel (CSV) | ❌ | ✅ |
| Quản lý thực đơn, bàn (thêm/bớt), nhân viên, cài đặt | ❌ | ✅ |

---

## 8. Sao lưu và ghi chú
- Dữ liệu ứng dụng lưu trong Firestore. Các nút **Sao lưu/Khôi phục** chỉ xuất hiện ở chế độ local cũ; chúng không sao lưu hay khôi phục Firestore. Hãy dùng công cụ sao lưu Firebase/Firestore phù hợp để bảo vệ dữ liệu thật.
- Thu ngân có thể đổi PIN của tài khoản đang đăng nhập trong app. PIN Order cần đổi trong Firebase Console (Authentication).
- `BAO_CAO_CAU_TRUC.md` là tài liệu thiết kế ban đầu; nếu nội dung khác README hoặc mã nguồn hiện tại, ưu tiên mã nguồn và README này.
