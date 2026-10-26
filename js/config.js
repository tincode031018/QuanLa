// ===== CẤU HÌNH =====
// Dán cấu hình Firebase của quán vào đây để chạy thật, đồng bộ mọi thiết bị.
//    (Firebase Console > Project settings > Your apps > Web app > SDK setup and configuration)
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBORdODLksaqh5GDH9AzVrIjIPgAFBPQQ8",
  authDomain: "quanla-632ba.firebaseapp.com",
  projectId: "quanla-632ba",
  storageBucket: "quanla-632ba.firebasestorage.app",
  messagingSenderId: "221681957531",
  appId: "1:221681957531:web:124c7be7d59fdbdffaa43e",
  measurementId: "G-2JLCY9DLBQ",
};

// 2 tài khoản đăng nhập (tạo trong Firebase > Authentication > Email/Password).
// Mật khẩu = mã PIN 6 số. Nhớ sửa email trong firestore.rules nếu đổi ở đây.
export const ACCOUNTS = {
  order: 'order@quanla.app',
  cashier: 'thungan@quanla.app',
};

export const SHOP_ID = 'quan-la';
export const FIREBASE_VERSION = '10.12.2';
export const APP_VERSION = '1.0.3';
