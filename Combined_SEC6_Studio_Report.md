# BÁO CÁO TỔNG HỢP: NGHIÊN CỨU & BẢO MẬT AN TOÀN AI (SEC 6)
## Đồ án môn học: Hệ thống AI Chatbot và Công cụ kiểm thử Prompt Injection Studio
### 🏫 Học viện Hàng không Việt Nam (VAA)

---

## GIỚI THIỆU CHUNG
Báo cáo này tổng hợp kết quả nghiên cứu, triển khai kỹ thuật bảo mật và kiểm thử xâm nhập đối với các mô hình ngôn ngữ lớn (LLM) theo tiêu chuẩn **SEC 6 (AI Chat Security & Prompt Injection)**. 

Báo cáo bao gồm hai phần chính:
1.  **Phòng thủ:** Triển khai cơ chế bảo mật chống Prompt Injection, SQL Injection và XSS cho hệ thống **AI Chatbot trợ lý học tập** của Học viện Hàng không Việt Nam.
2.  **Tấn công (Red Teaming):** Sử dụng công cụ tự dựng **Prompt Injection Studio** để mô phỏng, thử nghiệm bắn phá các Payload và đánh giá độ bền của các lớp phòng thủ.

---

## PHẦN I: HỆ THỐNG AI CHATBOT VÀ GIẢI PHÁP PHÒNG THỦ (SEC 6)

### 1. Mô tả lỗ hổng Prompt Injection
Prompt Injection xảy ra khi kẻ tấn công đưa các câu lệnh độc hại vào đầu vào của người dùng nhằm ghi đè các chỉ thị ban đầu của hệ thống AI, khiến AI thực hiện các hành vi sai lệch như tiết lộ thông tin cấu hình nhạy cảm (API Key, System Prompt), giả lập vai trò (Jailbreak) hoặc chèn mã độc.

### 2. Kiến trúc phòng thủ nhiều lớp
Hệ thống AI Chatbot áp dụng cơ chế phòng thủ 3 lớp để đảm bảo an toàn tuyệt đối:
*   **Lớp 1 - Middleware `prompt-guard.js` (Lọc đầu vào):** Sử dụng hơn 30 bộ lọc Regex để nhận diện mẫu độc hại. Hệ thống tính điểm đe dọa (Score 0-100) và tự động khóa vĩnh viễn tài khoản người dùng nếu điểm số vượt quá `70` (Zero-Tolerance).
*   **Lớp 2 - Service `ai-service.js` (Ràng buộc hành vi & Làm sạch đầu ra):** Thiết lập System Prompt cứng nghiêm ngặt từ chối mọi yêu cầu đổi luật. Hàm `sanitizeOutput` tự động lọc bỏ các thông tin nhạy cảm trước khi hiển thị (như IP, đường dẫn hệ thống, khóa bí mật).
*   **Lớp 3 - Nhật ký kiểm toán (Audit Trail):** Lưu giữ chi tiết toàn bộ lịch sử vi phạm để phục vụ truy vết.

### 3. Kịch bản kiểm thử thực tế trên giao diện

#### Kịch bản 1: Trang đăng nhập hệ thống
Giao diện đăng nhập bảo mật phân quyền (RBAC) dành cho Sinh viên, Giáo viên và Quản trị viên.
![Trang đăng nhập](file:///C:/Users/khoan/.gemini/antigravity/brain/08158fd7-4ae6-4e2e-84be-f775101898b7/01_login_page.png)

#### Kịch bản 2: Giao diện Chat AI (SEC 6)
Giao diện trò chuyện học thuật tích hợp thanh đo mức độ đe dọa (Threat Level Meter) bên tay phải.
![Giao diện AI Chat](file:///C:/Users/khoan/.gemini/antigravity/brain/08158fd7-4ae6-4e2e-84be-f775101898b7/02_ai_chat_interface.png)

#### Kịch bản 3: Câu hỏi học thuật hợp lệ
Sinh viên hỏi kiến thức về đạo hàm lượng giác. Hệ thống đánh giá là an toàn ("SAFE") và định tuyến NLP chính xác để AI trả lời đúng trọng tâm kèm nguồn trích dẫn.
![Câu hỏi hợp lệ](file:///C:/Users/khoan/.gemini/antigravity/brain/08158fd7-4ae6-4e2e-84be-f775101898b7/03_valid_question.png)

#### Kịch bản 4: Tấn công Prompt Injection bị chặn cứng
Người dùng gửi payload yêu cầu bỏ qua hướng dẫn cũ để lấy API key. Hệ thống tính điểm đe dọa cao, chặn truy cập (403 Forbidden) và cảnh báo khóa tài khoản.
![Prompt Injection bị chặn](file:///C:/Users/khoan/.gemini/antigravity/brain/08158fd7-4ae6-4e2e-84be-f775101898b7/04_prompt_injection.png)

#### Kịch bản 5: Tấn công SQL Injection qua Prompt bị ngăn chặn
Mã độc SQLi gửi qua chatbox bị phát hiện và ngăn chặn để bảo vệ cơ sở dữ liệu SQLite.
![SQL Injection bị chặn](file:///C:/Users/khoan/.gemini/antigravity/brain/08158fd7-4ae6-4e2e-84be-f775101898b7/05_sql_injection.png)

#### Kịch bản 6: Tấn công XSS bị ngăn chặn
Mã kịch bản độc hại `<script>` bị bộ lọc bóc tách và chặn đứng trước khi render lên UI.
![XSS bị chặn](file:///C:/Users/khoan/.gemini/antigravity/brain/08158fd7-4ae6-4e2e-84be-f775101898b7/06_xss_attack.png)

#### Kịch bản 7: Trang quản trị Audit Log
Lịch sử hành vi xâm nhập mức độ Critical được lưu lại chi tiết kèm IP để quản trị viên theo dõi.
![Audit Log của Admin](file:///C:/Users/khoan/.gemini/antigravity/brain/08158fd7-4ae6-4e2e-84be-f775101898b7/07_audit_log.png)

---

## PHẦN II: CÔNG CỤ ĐÁNH GIÁ TẤN CÔNG - PROMPT INJECTION STUDIO (RED TEAMING)

### 1. Mô tả công cụ
Để đánh giá độ bền vững của các hệ thống AI trước các đòn tấn công tinh vi, nhóm nghiên cứu đã xây dựng **Prompt Injection Studio** - Một xưởng thử nghiệm Red Teaming cục bộ (chạy trên cổng `5001`). Công cụ này nã trực tiếp các payloads cấu trúc đặc biệt vào API thực tế (DeepSeek API) để kiểm tra phản hồi.

### 2. Các tính năng và giao diện chính

#### Giao diện tổng quan công cụ
Giao diện Cyberpunk/Terminal của Prompt Injection Studio hiển thị kho đạn dược payload (Arsenal) và trình theo dõi phản hồi trực quan.
![Giao diện chính Prompt Injection Studio](file:///C:/Users/khoan/.gemini/antigravity/brain/08158fd7-4ae6-4e2e-84be-f775101898b7/01_home_page.png)

#### Tính năng Bật/Tắt Sandwich Defense
Công cụ mô phỏng cơ chế phòng vệ Sandbox RAG (Sandwich Defense - Kẹp thẻ XML cô lập input). Chuyên gia bảo mật có thể tắt bộ lọc này để bắn phá AI bằng RAW Payloads nhằm tìm ra điểm yếu logic của mô hình lớn.
![Bắn phá Payload thành công](file:///C:/Users/khoan/.gemini/antigravity/brain/08158fd7-4ae6-4e2e-84be-f775101898b7/02_payload_fired.png)

#### Stealth Payload Generator (Tấn công tàng hình bằng Steganography)
Tính năng chuyển đổi chỉ thị độc hại thành các ký tự Unicode Tag vô hình (U+E0000) rồi nhét ẩn dưới một câu hỏi ngây thơ. Giao diện dưới đây ghi nhận kết quả thử nghiệm:
![Mô phỏng Stealth Payload](file:///C:/Users/khoan/.gemini/antigravity/brain/08158fd7-4ae6-4e2e-84be-f775101898b7/03_stealth_payload_fired.png)

---

## KẾT LUẬN
Đồ án đã chứng minh việc bảo mật hệ thống AI (SEC 6) không chỉ dựa vào bộ lọc thô sơ của nhà cung cấp LLM, mà bắt buộc phải kết hợp lập trình kiểm soát chặt chẽ ở lớp Gateway trung gian. Việc sử dụng song song giải pháp phòng thủ AI Chatbot và công cụ kiểm thử Prompt Injection Studio giúp sinh viên hiểu sâu sắc quy trình Red Teaming và xây dựng ứng dụng AI an toàn trong thực tế hàng không.
