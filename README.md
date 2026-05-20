# 📚 BookStore — Hướng dẫn Deploy

Web app bán ebook hoàn chỉnh: **Frontend tĩnh** (Vercel/GitHub) + **Backend** (Google Apps Script) + **Database** (Google Sheets) + **Thanh toán** (SePay).

---

## 🗂 Cấu trúc file

```
bookstore/
├── index.html     ← Frontend (store + admin)
├── Code.gs        ← Google Apps Script backend
└── README.md      ← File này
```

---

## 🚀 Hướng dẫn Deploy từng bước

### Bước 1 — Tạo Google Sheet

1. Vào [sheets.google.com](https://sheets.google.com) → **Tạo bảng tính mới**
2. Đặt tên ví dụ: `BookStore DB`
3. Copy **Sheet ID** từ URL:
   ```
   https://docs.google.com/spreadsheets/d/[SHEET_ID_Ở_ĐÂY]/edit
   ```
4. Mở `Code.gs`, sửa dòng đầu:
   ```javascript
   const SHEET_ID = 'paste_sheet_id_vào_đây';
   ```

---

### Bước 2 — Tạo Google Apps Script Web App

1. Vào [script.google.com](https://script.google.com) → **Dự án mới**
2. Xoá code mặc định, **paste toàn bộ nội dung `Code.gs`** vào
3. Nhấn **Run → Chọn hàm `setupSheets`** để tạo header cho sheet
   - Lần đầu sẽ yêu cầu cấp quyền → Cho phép tất cả
4. Kiểm tra Google Sheet đã có 2 sheet: `BOOKS` và `ORDERS` với header
5. Deploy Apps Script:
   - Nhấn **Deploy → New deployment**
   - Chọn loại: **Web app**
   - Execute as: **Me** (tài khoản của bạn)
   - Who has access: **Anyone** ← quan trọng để webhook SePay gọi được
   - Nhấn **Deploy** → **Copy URL**
6. URL sẽ có dạng:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

> ⚠️ Mỗi lần sửa Code.gs phải **Deploy → Manage deployments → New version** mới có hiệu lực!

---

### Bước 3 — Cấu hình Frontend

Mở `index.html`, tìm block `CONFIG` (khoảng dòng 500) và sửa:

```javascript
const CONFIG = {
  // Paste URL Apps Script từ bước 2
  API_URL: 'https://script.google.com/macros/s/YOUR_ID/exec',

  // Thông tin ngân hàng nhận tiền
  BANK_CODE: 'MB',           // MB = MBBank, VCB = Vietcombank, TCB = Techcombank
  ACCOUNT_NUMBER: '0123456789',

  // Đổi mật khẩu admin
  ADMIN_PASSWORD: 'matkhau_cua_ban_2024',
};
```

**Danh sách mã ngân hàng phổ biến:**
| Tên ngân hàng | Mã |
|---|---|
| MBBank | MB |
| Vietcombank | VCB |
| Techcombank | TCB |
| BIDV | BIDV |
| Agribank | AGRIBANK |
| VPBank | VPB |
| ACB | ACB |
| TPBank | TPB |
| Sacombank | STB |

---

### Bước 4 — Push lên GitHub & Deploy Vercel

```bash
# Tạo repo GitHub mới, sau đó:
git init
git add index.html README.md
git commit -m "Initial commit"
git remote add origin https://github.com/username/bookstore.git
git push -u origin main
```

**Deploy lên Vercel:**
1. Vào [vercel.com](https://vercel.com) → **Add New Project**
2. Chọn repo GitHub vừa tạo
3. Framework: **Other** (không cần build)
4. Nhấn **Deploy**
5. Vercel tự detect `index.html` → site live ngay

URL của bạn sẽ là: `https://bookstore-xxx.vercel.app`

---

### Bước 5 — Cấu hình SePay Webhook

1. Đăng ký tài khoản tại [sepay.vn](https://sepay.vn)
2. Thêm tài khoản ngân hàng vào SePay
3. Vào **Cài đặt → Webhook**:
   - **Webhook URL**: Paste URL Apps Script từ bước 2
   - Thêm `?action=sepayWebhook` vào cuối nếu cần, nhưng thực ra body POST đã có action
   - Thực ra SePay gửi POST trực tiếp → Apps Script `doPost` xử lý
4. Test webhook bằng tính năng **Test** trong SePay dashboard

> 💡 **Lưu ý**: URL webhook phải là Apps Script URL, không phải Vercel URL, vì Vercel chỉ host file tĩnh.

---

### Bước 6 — Thêm sách vào store

**Cách 1 — Qua Admin Panel:**
1. Vào `https://your-site.vercel.app?view=admin`
2. Nhập mật khẩu đã cấu hình
3. Tab **Quản lý sách** → Điền form → Lưu

**Cách 2 — Trực tiếp trong Google Sheet:**
- Sheet `BOOKS` → thêm dòng mới với đầy đủ thông tin
- `status` = `active` để hiển thị, `hidden` để ẩn

---

## 🔧 Lưu ý kỹ thuật

### CORS với Apps Script
Apps Script Web App **không hỗ trợ CORS header** cho cross-origin requests một cách hoàn hảo. Có 2 cách xử lý:

**Option A (Đơn giản — dùng no-cors):**
```javascript
// Trong index.html, thêm mode: 'no-cors' cho POST
// Nhưng sẽ không đọc được response!
```

**Option B (Khuyến nghị — dùng JSONP hoặc redirect):**
Thêm vào Apps Script:
```javascript
// Thêm header vào buildResponse:
function buildResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
```
Apps Script tự xử lý CORS nếu deploy đúng cách (Anyone access).

**Option C (Proxy):** Dùng Cloudflare Worker làm proxy nếu gặp vấn đề CORS.

### Google Drive Link
Để chia sẻ file ebook:
1. Upload file lên Google Drive
2. Chuột phải → **Chia sẻ** → **Anyone with the link**
3. Copy link → Paste vào field `drive_link` khi thêm sách

### Bảo mật
- `drive_link` chỉ được trả về sau khi đơn có `status=paid`
- Admin password hardcode trong JS — phù hợp cho store nhỏ
- Không lưu thông tin thẻ tín dụng

---

## 📱 Đường dẫn

| Trang | URL |
|---|---|
| Cửa hàng | `https://your-site.vercel.app` hoặc `?view=store` |
| Admin | `https://your-site.vercel.app?view=admin` |
| Apps Script API | URL từ bước 2 |

---

## 🐛 Troubleshooting

**❌ "Không thể tải sách"**
- Kiểm tra `API_URL` trong `index.html` đúng chưa
- Đảm bảo Apps Script đã deploy với "Anyone" access
- Mở DevTools → Network → kiểm tra lỗi

**❌ Webhook SePay không hoạt động**
- Kiểm tra URL webhook đúng
- Vào Apps Script → Executions → xem log lỗi
- Đảm bảo hàm `doPost` không có lỗi syntax

**❌ Sau khi chuyển khoản, đơn vẫn pending**
- Kiểm tra nội dung chuyển khoản có đúng order_id không
- Vào Google Sheet ORDERS → xem dữ liệu trực tiếp
- Dùng nút "Đánh dấu đã TT" trong admin làm backup thủ công

**❌ Admin không vào được**
- Kiểm tra `ADMIN_PASSWORD` trong CONFIG
- Xoá cache browser, thử lại

---

## 💡 Nâng cấp đề xuất

- **Gửi email tự động**: Thêm `MailApp.sendEmail()` trong Apps Script sau khi thanh toán
- **Nhiều ngân hàng**: Tích hợp thêm bank code vào CONFIG
- **Google Analytics**: Thêm GA tracking cho store
- **Custom domain**: Vercel hỗ trợ custom domain miễn phí
- **SEO**: Thêm meta tags, Open Graph cho từng sách

---

*Made with ❤️ using Google Apps Script + Vercel*
