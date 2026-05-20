// ================================================================
//  BOOKSTORE — Google Apps Script Backend
//  Tác giả: BookStore
//  Hướng dẫn: Sửa SHEET_ID bên dưới, sau đó Deploy → Web App
// ================================================================

// === CẤU HÌNH — SỬA GIÁ TRỊ NÀY ===
const SHEET_ID = '13SeJBzB7vS_msF5PrHrLbSEweJTzmUJAW-qCNnLjQaAD'; // Paste Sheet ID vào đây
// Lấy Sheet ID từ URL: https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit

// Tên 2 sheet (giữ nguyên hoặc đổi nếu muốn)
const SHEET_BOOKS  = 'BOOKS';
const SHEET_ORDERS = 'ORDERS';

// ================================================================
//  ENTRY POINT — xử lý GET và POST request
// ================================================================

/**
 * Xử lý GET request: ?action=getBooks, checkOrder, getStats, getOrders, getAllBooks
 */
function doGet(e) {
  const action = e.parameter.action;
  let result;

  try {
    if      (action === 'getBooks')    result = getBooks();
    else if (action === 'getAllBooks') result = getAllBooks();
    else if (action === 'checkOrder')  result = checkOrder(e.parameter.order_id);
    else if (action === 'getStats')    result = getStats();
    else if (action === 'getOrders')   result = getOrders(e.parameter.status, e.parameter.date);
    else                               result = { error: 'Unknown action: ' + action };
  } catch (err) {
    result = { error: err.toString() };
  }

  return buildResponse(result);
}

/**
 * Xử lý POST request: createOrder, updateOrder, createBook, updateBook,
 *                     updateBookStatus, sepayWebhook
 */
function doPost(e) {
  let body, result;

  try {
    body = JSON.parse(e.postData.contents);
    const action = body.action;

    if      (action === 'createOrder')      result = createOrder(body);
    else if (action === 'updateOrder')      result = updateOrder(body);
    else if (action === 'createBook')       result = createBook(body);
    else if (action === 'updateBook')       result = updateBook(body);
    else if (action === 'updateBookStatus') result = updateBookStatus(body);
    else if (action === 'sepayWebhook')     result = sepayWebhook(body);
    else                                    result = { error: 'Unknown action: ' + action };
  } catch (err) {
    result = { error: err.toString() };
  }

  return buildResponse(result);
}

// Tạo response JSON với CORS header
function buildResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
    // Lưu ý: Apps Script Web App không cần CORS header khi dùng
    // no-cors mode, hoặc bạn dùng proxy nếu cần full CORS
}

// ================================================================
//  HELPER: LẤY SHEET
// ================================================================
function getSheet(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Sheet không tồn tại: ' + name);
  return sheet;
}

/**
 * Chuyển dữ liệu sheet thành mảng object theo header hàng 1
 */
function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

// Sinh order_id ngẫu nhiên dạng BK + timestamp + random
function generateOrderId() {
  return 'BK' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase();
}

// Format ngày giờ Việt Nam
function nowVN() {
  return new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

// ================================================================
//  BOOKS ENDPOINTS
// ================================================================

/**
 * getBooks — trả danh sách sách status=active (dùng cho store)
 */
function getBooks() {
  const sheet = getSheet(SHEET_BOOKS);
  const books = sheetToObjects(sheet).filter(b => b.status === 'active');
  // Không trả drive_link để bảo mật — chỉ trả sau khi thanh toán
  return {
    books: books.map(b => ({
      id: b.id,
      title: b.title,
      cover_url: b.cover_url,
      description: b.description,
      preview_content: b.preview_content,
      original_price: Number(b.original_price),
      sale_price: Number(b.sale_price),
    }))
  };
}

/**
 * getAllBooks — trả tất cả sách kể cả hidden (dùng cho admin)
 */
function getAllBooks() {
  const sheet = getSheet(SHEET_BOOKS);
  const books = sheetToObjects(sheet);
  return { books };
}

/**
 * createBook — thêm sách mới
 */
function createBook(body) {
  const sheet = getSheet(SHEET_BOOKS);
  const id = Date.now(); // dùng timestamp làm ID
  sheet.appendRow([
    id,
    body.title,
    body.cover_url || '',
    body.description || '',
    body.preview_content || '',
    body.drive_link,
    Number(body.original_price) || Number(body.sale_price),
    Number(body.sale_price),
    'active',       // status mặc định là active
    nowVN()         // created_at
  ]);
  return { success: true, id };
}

/**
 * updateBook — sửa thông tin sách
 */
function updateBook(body) {
  const sheet = getSheet(SHEET_BOOKS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0]; // ['id','title','cover_url',...]
  const idCol = headers.indexOf('id');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(body.id)) {
      const row = i + 1; // +1 vì getValues() 0-indexed nhưng Sheet 1-indexed
      // Cập nhật từng ô theo tên cột
      const updates = {
        title: body.title,
        cover_url: body.cover_url || '',
        description: body.description || '',
        preview_content: body.preview_content || '',
        drive_link: body.drive_link,
        original_price: Number(body.original_price),
        sale_price: Number(body.sale_price),
      };
      Object.entries(updates).forEach(([col, val]) => {
        const colIdx = headers.indexOf(col);
        if (colIdx >= 0) sheet.getRange(row, colIdx + 1).setValue(val);
      });
      return { success: true };
    }
  }
  return { error: 'Không tìm thấy sách ID: ' + body.id };
}

/**
 * updateBookStatus — ẩn/hiện sách
 */
function updateBookStatus(body) {
  const sheet = getSheet(SHEET_BOOKS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');
  const statusCol = headers.indexOf('status');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(body.id)) {
      sheet.getRange(i + 1, statusCol + 1).setValue(body.status);
      return { success: true };
    }
  }
  return { error: 'Không tìm thấy sách' };
}

// ================================================================
//  ORDERS ENDPOINTS
// ================================================================

/**
 * createOrder — tạo đơn hàng mới, trả về order_id
 */
function createOrder(body) {
  // Kiểm tra sách tồn tại
  const booksSheet = getSheet(SHEET_BOOKS);
  const books = sheetToObjects(booksSheet);
  const book = books.find(b => String(b.id) === String(body.book_id) && b.status === 'active');
  if (!book) return { error: 'Sách không tồn tại hoặc đã bị ẩn' };

  const orderId = generateOrderId();
  const ordersSheet = getSheet(SHEET_ORDERS);
  ordersSheet.appendRow([
    orderId,            // order_id
    body.name,          // buyer_name
    body.email,         // buyer_email
    body.book_id,       // book_id
    Number(book.sale_price), // amount
    orderId,            // transfer_code (dùng luôn order_id làm nội dung CK)
    'pending',          // status
    nowVN(),            // created_at
    '',                 // paid_at (để trống)
  ]);

  return {
    success: true,
    order_id: orderId,
    amount: Number(book.sale_price),
    book_title: book.title,
  };
}

/**
 * checkOrder — kiểm tra trạng thái đơn (polling từ frontend)
 * Trả về drive_link NẾU status=paid
 */
function checkOrder(orderId) {
  if (!orderId) return { error: 'order_id is required' };

  const ordersSheet = getSheet(SHEET_ORDERS);
  const orders = sheetToObjects(ordersSheet);
  const order = orders.find(o => o.order_id === orderId);
  if (!order) return { error: 'Không tìm thấy đơn hàng' };

  if (order.status === 'paid') {
    // Lấy drive_link từ bảng BOOKS
    const booksSheet = getSheet(SHEET_BOOKS);
    const books = sheetToObjects(booksSheet);
    const book = books.find(b => String(b.id) === String(order.book_id));
    return {
      status: 'paid',
      drive_link: book ? book.drive_link : '',
      book_title: book ? book.title : '',
    };
  }

  return { status: order.status };
}

/**
 * updateOrder — cập nhật trạng thái đơn (admin hoặc webhook)
 */
function updateOrder(body) {
  const sheet = getSheet(SHEET_ORDERS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const orderIdCol = headers.indexOf('order_id');
  const statusCol  = headers.indexOf('status');
  const paidAtCol  = headers.indexOf('paid_at');

  for (let i = 1; i < data.length; i++) {
    if (data[i][orderIdCol] === body.order_id) {
      sheet.getRange(i + 1, statusCol + 1).setValue(body.status);
      if (body.status === 'paid') {
        sheet.getRange(i + 1, paidAtCol + 1).setValue(nowVN());
      }
      return { success: true };
    }
  }
  return { error: 'Không tìm thấy đơn: ' + body.order_id };
}

/**
 * getOrders — trả danh sách đơn cho admin
 * Có thể filter theo status và date
 */
function getOrders(statusFilter, dateFilter) {
  const ordersSheet = getSheet(SHEET_ORDERS);
  const booksSheet  = getSheet(SHEET_BOOKS);
  let orders = sheetToObjects(ordersSheet);
  const books = sheetToObjects(booksSheet);

  // Gắn thêm tên sách vào mỗi đơn
  orders = orders.map(o => {
    const book = books.find(b => String(b.id) === String(o.book_id));
    return { ...o, book_title: book ? book.title : o.book_id };
  });

  // Filter status
  if (statusFilter) {
    orders = orders.filter(o => o.status === statusFilter);
  }

  // Filter theo ngày (created_at chứa chuỗi ngày VN)
  if (dateFilter) {
    // dateFilter dạng YYYY-MM-DD, so sánh với chuỗi ngày
    orders = orders.filter(o => {
      const d = new Date(o.created_at);
      const ymd = d.toISOString().slice(0,10);
      return ymd === dateFilter;
    });
  }

  // Sắp xếp mới nhất lên trước
  orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return { orders };
}

// ================================================================
//  STATS ENDPOINT (Dashboard)
// ================================================================

/**
 * getStats — trả thống kê cho dashboard admin
 */
function getStats() {
  const ordersSheet = getSheet(SHEET_ORDERS);
  const orders = sheetToObjects(ordersSheet);

  // Ngày hôm nay theo múi giờ VN
  const todayStr = new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  let today_revenue = 0, today_paid = 0, today_pending = 0;
  let total_revenue = 0, total_paid = 0, total_pending = 0;

  orders.forEach(o => {
    const amount = Number(o.amount) || 0;
    const orderDate = new Date(o.created_at).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const isToday = (orderDate === todayStr);

    if (o.status === 'paid') {
      total_revenue += amount;
      total_paid++;
      if (isToday) { today_revenue += amount; today_paid++; }
    } else {
      total_pending++;
      if (isToday) today_pending++;
    }
  });

  // Dữ liệu biểu đồ 7 ngày gần nhất
  const chart = getLast7DaysRevenue(orders);

  return { today_revenue, today_paid, today_pending, total_revenue, total_paid, total_pending, chart };
}

/**
 * Tính doanh thu 7 ngày gần nhất cho Chart.js
 */
function getLast7DaysRevenue(orders) {
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const label = `${d.getDate()}/${d.getMonth()+1}`;
    const revenue = orders
      .filter(o => o.status === 'paid' && new Date(o.created_at).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) === dateStr)
      .reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
    result.push({ date: label, revenue });
  }
  return result;
}

// ================================================================
//  SEPAY WEBHOOK
// ================================================================

/**
 * sepayWebhook — nhận callback từ SePay khi có giao dịch mới
 *
 * SePay POST body ví dụ:
 * {
 *   "id": 12345,
 *   "gateway": "MB",
 *   "transactionDate": "2024-01-15 10:30:00",
 *   "accountNumber": "1234567890",
 *   "subAccount": null,
 *   "code": null,
 *   "content": "BK1A2B3C4D chuyen tien",  ← chứa order_id
 *   "transferType": "in",
 *   "transferAmount": 99000,
 *   "accumulated": 99000,
 *   "referenceCode": "FT24015XXXXX",
 *   "description": "...",
 *   "toAccountNumber": "...",
 *   "toAccountName": "NGUYEN VAN A"
 * }
 */
function sepayWebhook(body) {
  // Chỉ xử lý giao dịch tiền vào (transferType = 'in')
  if (body.transferType !== 'in') {
    return { success: true, message: 'Ignored non-credit transaction' };
  }

  const content = String(body.content || body.description || '').toUpperCase();
  const amount  = Number(body.transferAmount) || 0;

  // Tìm order_id trong nội dung chuyển khoản
  // Order ID format: BK + alphanumeric (ví dụ: BKLP8QABC)
  const match = content.match(/BK[A-Z0-9]{6,15}/);
  if (!match) {
    logWebhook('NO_ORDER_ID', body);
    return { success: true, message: 'No order_id found in content' };
  }

  const orderId = match[0];

  // Tìm đơn hàng trong sheet
  const ordersSheet = getSheet(SHEET_ORDERS);
  const data = sheet_getDataRaw(ordersSheet);
  const headers = data[0];
  const orderIdCol = headers.indexOf('order_id');
  const statusCol  = headers.indexOf('status');
  const amountCol  = headers.indexOf('amount');
  const paidAtCol  = headers.indexOf('paid_at');

  for (let i = 1; i < data.length; i++) {
    if (data[i][orderIdCol] === orderId) {
      if (data[i][statusCol] === 'paid') {
        return { success: true, message: 'Order already paid' };
      }

      const expectedAmount = Number(data[i][amountCol]) || 0;

      // Kiểm tra số tiền (có thể bỏ qua nếu muốn linh hoạt)
      if (amount < expectedAmount) {
        logWebhook('AMOUNT_MISMATCH', { orderId, expected: expectedAmount, received: amount });
        return { success: false, message: 'Amount mismatch' };
      }

      // Cập nhật trạng thái paid
      ordersSheet.getRange(i + 1, statusCol + 1).setValue('paid');
      ordersSheet.getRange(i + 1, paidAtCol + 1).setValue(nowVN());

      logWebhook('SUCCESS', { orderId, amount });
      return { success: true, message: 'Order marked as paid', order_id: orderId };
    }
  }

  logWebhook('ORDER_NOT_FOUND', { orderId, content });
  return { success: false, message: 'Order not found: ' + orderId };
}

// Helper tách biệt để dùng trong webhook (tránh gọi lại sheetToObjects gây conflict)
function sheet_getDataRaw(sheet) {
  return sheet.getDataRange().getValues();
}

// Ghi log webhook vào console (xem trong Apps Script Executions)
function logWebhook(type, data) {
  console.log('[SePay Webhook] ' + type + ':', JSON.stringify(data));
}

// ================================================================
//  KHỞI TẠO SHEET (chạy một lần để tạo header)
// ================================================================

/**
 * Chạy hàm này MỘT LẦN để tạo header cho sheet BOOKS và ORDERS.
 * Vào Apps Script → Run → setupSheets
 */
function setupSheets() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  // Tạo sheet BOOKS nếu chưa có
  let booksSheet = ss.getSheetByName(SHEET_BOOKS);
  if (!booksSheet) {
    booksSheet = ss.insertSheet(SHEET_BOOKS);
  }
  // Ghi header nếu chưa có
  if (booksSheet.getLastRow() === 0) {
    booksSheet.appendRow([
      'id', 'title', 'cover_url', 'description', 'preview_content',
      'drive_link', 'original_price', 'sale_price', 'status', 'created_at'
    ]);
    // Thêm sách mẫu
    booksSheet.appendRow([
      Date.now(),
      'Ebook Mẫu - Lập Trình JavaScript',
      'https://via.placeholder.com/300x400/1a1612/d4a853?text=JS+Book',
      'Sách lập trình JavaScript từ cơ bản đến nâng cao',
      'Chương 1: Giới thiệu JavaScript\n\nJavaScript là ngôn ngữ lập trình...',
      'https://drive.google.com/file/d/EXAMPLE_FILE_ID/view',
      150000, 99000, 'active', nowVN()
    ]);
  }

  // Tạo sheet ORDERS nếu chưa có
  let ordersSheet = ss.getSheetByName(SHEET_ORDERS);
  if (!ordersSheet) {
    ordersSheet = ss.insertSheet(SHEET_ORDERS);
  }
  if (ordersSheet.getLastRow() === 0) {
    ordersSheet.appendRow([
      'order_id', 'buyer_name', 'buyer_email', 'book_id',
      'amount', 'transfer_code', 'status', 'created_at', 'paid_at'
    ]);
  }

  Logger.log('✅ Setup hoàn tất! Sheets đã được tạo với header.');
}
