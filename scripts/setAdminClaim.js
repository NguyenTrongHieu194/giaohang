// setAdminClaim.js
const admin = require('firebase-admin');

// THAY THẾ ĐƯỜNG DẪN NÀY BẰNG ĐƯỜNG DẪN THỰC TẾ ĐẾN TỆP KHÓA JSON CỦA BẠN
// Đảm bảo tệp JSON này nằm trong cùng thư mục với script này (D:\Website Giao Hang\scripts)
const serviceAccount = require('./hieu-nguyen-cf05b-firebase-adminsdk-fbsvc-6c0d7ff3d8.json'); // ĐÃ CẬP NHẬT TÊN FILE

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// =====================================================================
// CẤU HÌNH Ở ĐÂY TRƯỚC KHI CHẠY SCRIPT
// =====================================================================

// 1. THAY THẾ UID NÀY BẰNG UID CỦA NGƯỜI DÙNG BẠN MUỐN CẤP QUYỀN
const targetUid = 'sle8v3RjQKghyo4Tw0vfGe57MYA3'; // UID của shipper/tài xế

// 2. ĐỊNH NGHĨA CUSTOM CLAIMS BẠN MUỐN GÁN
// Chọn MỘT trong các cấu hình dưới đây và bỏ comment dòng đó.
// Đảm bảo chỉ có MỘT dòng được bỏ comment cho 'claimsToSet'.

// Để gán quyền ADMIN:
// const claimsToSet = { admin: true, role: 'admin' }; // Gán cả 'admin' và 'role' cho rõ ràng

// Để gán quyền SHIPPER:
const claimsToSet = { role: 'shipper' };

// Để gán quyền TÀI XẾ:
// const claimsToSet = { role: 'driver' };

// Để XÓA TẤT CẢ custom claims của người dùng (để trở lại là người dùng bình thường):
// const claimsToSet = {};


// =====================================================================
// KHÔNG CẦN CHỈNH SỬA PHẦN DƯỚI ĐÂY
// =====================================================================

async function setCustomClaims() {
  if (!targetUid) {
    console.error('Lỗi: Vui lòng cung cấp UID của người dùng bạn muốn gán quyền.');
    process.exit(1);
  }

  try {
    // Gán custom claims cho người dùng
    await admin.auth().setCustomUserClaims(targetUid, claimsToSet);
    console.log(`Custom claims đã được gán cho người dùng ${targetUid}:`);
    console.log(claimsToSet);

    // Tùy chọn: Kiểm tra lại custom claims của người dùng để xác nhận
    const userRecord = await admin.auth().getUser(targetUid);
    console.log('Custom claims của người dùng sau khi cập nhật:', userRecord.customClaims);

    console.log('Lưu ý: Người dùng cần đăng xuất và đăng nhập lại vào ứng dụng để các claims mới có hiệu lực trên token client-side của họ.');
  } catch (error) {
    console.error('Lỗi khi gán custom claims:', error);
  } finally {
    // Thoát script
    process.exit();
  }
}

// Chạy hàm
setCustomClaims();
