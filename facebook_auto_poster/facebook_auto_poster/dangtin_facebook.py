import argparse
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import NoSuchElementException

# Thiết lập parser dòng lệnh
parser = argparse.ArgumentParser(description="Đăng bài Facebook tự động")
parser.add_argument("--noi-dung", required=True, help="Nội dung bài viết")
parser.add_argument("--vi-tri", choices=["trang-ca-nhan"], default="trang-ca-nhan", help="Nơi đăng bài")
args = parser.parse_args()

noi_dung = args.noi_dung
vi_tri = args.vi_tri

# Cấu hình trình duyệt không hiển thị (headless nếu muốn)
options = Options()
options.add_argument("--disable-notifications")
options.add_argument("--start-maximized")
# options.add_argument("--headless")  # Bỏ ghi chú nếu muốn chạy ẩn

# Khởi tạo trình duyệt Chrome
service = Service("chromedriver.exe")
driver = webdriver.Chrome(service=service, options=options)

try:
    # Mở Facebook
    driver.get("https://www.facebook.com/")
    print("🔐 Vui lòng đăng nhập Facebook rồi quay lại đây...")
    time.sleep(25)  # Đủ thời gian để đăng nhập bằng tay

    # Điều hướng đến vị trí cần đăng bài
    if vi_tri == "trang-ca-nhan":
        driver.get("https://www.facebook.com/me")
    else:
        raise Exception("Chỉ hỗ trợ đăng lên trang cá nhân.")

    time.sleep(10)  # Đợi trang cá nhân tải xong

    # Tìm ô đăng bài
    try:
        post_box = driver.find_element(By.CSS_SELECTOR, "div[role='textbox']")
        post_box.click()
        time.sleep(2)
        post_box.send_keys(noi_dung)
        time.sleep(2)

        # Tìm nút đăng
        buttons = driver.find_elements(By.XPATH, "//div[@aria-label='Đăng' or @aria-label='Post']")
        for btn in buttons:
            if btn.is_enabled():
                btn.click()
                break
        print("✅ Đã đăng bài thành công.")
    except NoSuchElementException:
        print("❌ Không tìm thấy ô nhập nội dung hoặc nút đăng.")

except Exception as e:
    print("❌ Lỗi khi đăng bài:", e)

finally:
    time.sleep(5)
    driver.quit()
