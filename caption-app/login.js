document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const errorMsg = document.getElementById('errorMsg');

  // ĐỊNH NGHĨA TÀI KHOẢN VÀ MẬT KHẨU TẠI ĐÂY
  const VALID_USERS = {
    'quynguyenaqua': 'quy2026!@'
  };

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value;

    if (VALID_USERS[user] && VALID_USERS[user] === pass) {
      // Đăng nhập thành công, lưu trạng thái
      sessionStorage.setItem('isAuthenticated', 'true');
      sessionStorage.setItem('currentUser', user);
      
      // Chuyển hướng sang trang chính
      window.location.href = 'index.html';
    } else {
      // Đăng nhập thất bại
      errorMsg.style.display = 'block';
      setTimeout(() => {
        errorMsg.style.display = 'none';
      }, 3000);
    }
  });
});
