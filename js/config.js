// ===== CẤU HÌNH =====
// Dán cấu hình Firebase của quán vào đây để chạy thật, đồng bộ mọi thiết bị.
//    (Firebase Console > Project settings > Your apps > Web app > SDK setup and configuration)
export const FIREBASE_CONFIG = null; // Bắt buộc thay bằng cấu hình Firebase trước khi chạy.
/* Ví dụ:
export const FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "quan-la.firebaseapp.com",
  projectId: "quan-la",
  storageBucket: "quan-la.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
*/

// 2 tài khoản đăng nhập (tạo trong Firebase > Authentication > Email/Password).
// Mật khẩu = mã PIN 6 số. Nhớ sửa email trong firestore.rules nếu đổi ở đây.
export const ACCOUNTS = {
  order: 'order@quanla.app',
  cashier: 'thungan@quanla.app',
};

export const SHOP_ID = 'quan-la';
export const FIREBASE_VERSION = '10.12.2';
export const APP_VERSION = '1.0.0';
