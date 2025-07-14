// setAdminClaim.js
const admin = require('firebase-admin');

// THAY THẾ ĐƯỜNG DẪN NÀY BẰNG ĐƯỜNG DẪN THỰC TẾ ĐẾN TỆP KHÓA JSON CỦA BẠN
// Đảm bảo tệp JSON này nằm trong cùng thư mục với script này (D:\Website Giao Hang\scripts)
const serviceAccount = require('./hieu-nguyen-cf05b-firebase-adminsdk-fbsvc-e478168adc.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// THAY THẾ UID NÀY BẰNG UID CỦA NGƯỜI DÙNG BẠN MUỐN CẤP QUYỀN ADMIN
// UID bạn đã cung cấp trước đó: bYTl74lzsffAJv2xID9QSds3eMa2
const uidToMakeAdmin = 'bYTl74lzsffAJv2xID9QSds3eMa2';

async function setAdminClaim() {
  try {
    // Gán custom claim 'admin: true' cho người dùng
    await admin.auth().setCustomUserClaims(uidToMakeAdmin, { admin: true });
    console.log(`Custom claim 'admin: true' đã được gán cho người dùng ${uidToMakeAdmin}`);

    // Tùy chọn: Kiểm tra lại custom claims của người dùng để xác nhận
    const userRecord = await admin.auth().getUser(uidToMakeAdmin);
    console.log('Custom claims của người dùng sau khi cập nhật:', userRecord.customClaims);

    console.log('Lưu ý: Người dùng cần đăng xuất và đăng nhập lại để các claims mới có hiệu lực trên token client-side của họ.');
  } catch (error) {
    console.error('Lỗi khi gán custom claim:', error);
  } finally {
    // Thoát script
    process.exit();
  }
}

// Chạy hàm
setAdminClaim();
