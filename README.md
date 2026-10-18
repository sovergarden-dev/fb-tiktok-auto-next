# Auto Next – Reels, TikTok, Shorts, Instagram & X

Extension Chrome tự động chuyển sang video tiếp theo khi hết clip trên **Facebook Reels**, **Instagram Reels**, **TikTok**, **YouTube Shorts** và **X (Twitter) Videos**.

## Cách cài đặt

1. Tải thư mục `fb-tiktok-auto-next` về máy (hoặc giải nén file zip).
2. Mở Chrome, vào địa chỉ: `chrome://extensions`
3. Bật **Developer mode** (Chế độ nhà phát triển) ở góc trên bên phải.
4. Bấm **Load unpacked** (Tải tiện ích đã giải nén) và chọn thư mục `fb-tiktok-auto-next`.
5. Mở Facebook Reels, Instagram, TikTok, YouTube Shorts hoặc X — biểu tượng extension sẽ hiện badge **ON**.

## Tính năng nổi bật

- ✅ Tự chuyển video khi clip kết thúc (Facebook Reels, Instagram Reels, TikTok, YouTube Shorts, X Videos)
- ✅ Watchdog Timer cứu hộ chống kẹt video khi buffering quay vòng hoặc mạng nghẽn quá 10s
- ✅ Chuyển video mượt mà không khoảng chết (Seamless Pre-scroll -0.5s)
- ✅ Chặn cứng tài khoản Facebook (Hard Account Block) trực tiếp từ giao diện Reels
- ✅ Hệ sinh thái danh sách chặn tập trung: Xem, chọn checkbox bỏ chặn hàng loạt, xuất/nhập file JSON
- ✅ Đồng bộ danh sách chặn trực tuyến qua link từ xa (Remote Blocklist Subscription qua URL)
- ✅ Hoạt động cả khi tab ở nền / bạn chuyển sang cửa sổ khác (event-driven, không phụ thuộc timer bị throttle)
- ✅ Tự tắt chế độ lặp (loop) của video để bắt được sự kiện kết thúc
- ✅ Nhiều tầng dự phòng: bấm nút Next thật → phím mũi tên → cuộn trang → vuốt giả lập
- ✅ Tự xác nhận đã chuyển video, nếu chưa thì thử lại (tối đa 8 lần)
- ✅ Bật/tắt riêng cho từng nền tảng trong popup
- ✅ Hỗ trợ nhãn nút đa ngôn ngữ (Việt, Anh, Pháp, Tây Ban Nha, Đức, Nhật, Hàn)

## Lưu ý quan trọng về chạy nền

Chrome sẽ **tạm dừng video** trong cửa sổ bị thu nhỏ (minimize) hoàn toàn — đây là giới hạn của trình duyệt, không extension nào vượt qua được. Để extension chạy ổn khi bạn làm việc khác:

- **Đừng minimize** cửa sổ chứa video. Hãy để nó hé một phần trên màn hình (hoặc kéo sang màn hình phụ).
- Có thể dùng tính năng **Picture-in-Picture** hoặc chia đôi màn hình.
- Nếu video vẫn chạy (có tiếng), extension sẽ chuyển video bình thường dù tab không được focus.

## Nhật ký cập nhật (v3.18.0 — Nâng cấp Toàn diện Chặn Cứng Facebook & Quản lý Danh sách Chặn FB Native)

1. **Hộp thoại Lựa chọn Chặn Trực quan**: Khi bấm nút `🚫` trên Facebook Reels, tiện ích hiển thị hộp thoại xác nhận rõ ràng:
   - **Bấm [OK]**: Chạy Macro CHẶN CỨNG trên Facebook (tự động mở menu và chặn nick vĩnh viễn).
   - **Bấm [Hủy]**: CHẶN MỀM (chỉ tự động lướt qua clip trên tiện ích).
   - Loại bỏ hoàn toàn cơ chế giữ chuột 700ms 2 lần dễ gây nhầm lẫn.
2. **Hoàn thiện Macro Chặn Cứng Facebook**:
   - Tự động tìm nút `...` (3 chấm) trên cả Facebook Reels và Profile/Fanpage.
   - Click "Chặn" $\rightarrow$ Click "Xác nhận" (Hộp thoại 1).
   - **Tự động đóng Hộp thoại 2** ("Bạn đã chặn [Tên]") bằng cách bấm nút "Đóng" để dọn sạch màn hình, không bị kẹt video.
   - Tự động lướt sang clip kế tiếp sau khi hoàn tất.
3. **Tab Quản lý Chặn trên Facebook (Facebook Native Block Manager)**:
   - Bổ sung tab **"🔒 Chặn trên FB"** ngay trong bảng điều khiển HUD.
   - **Đồng bộ tự động**: Nút `🔄 Đồng bộ FB` tự động đọc danh sách các Trang và Trang cá nhân bạn đang chặn trên nick Facebook thực tế.
   - **Tìm kiếm tức thì**: Lọc theo tên người/trang đã chặn ngay lập tức.
   - **Bỏ chặn 1-Click**: Bấm nút `[Bỏ chặn]` cạnh từng tài khoản để tiện ích tự động gỡ chặn trên Facebook mà không cần vào mục Cài đặt FB.

## Nhật ký cập nhật (v3.17.0 — Watchdog Cứu hộ Kẹt Video, X/Twitter Feed, Chuyển Clip Êm & Đồng bộ Chặn Online)

1. **Watchdog Timer cứu hộ chống kẹt video (Freeze/Stalled Rescue)**: Tự động giám sát luồng phát. Nếu video đang mở nhưng `currentTime` bị đứng yên quá 10 giây (do mạng nghẽn, buffering quay vòng vô tận hoặc clip bị xóa), tiện ích tự động kích hoạt chuyển tiếp cứu hộ, loại bỏ hoàn toàn tình trạng kẹt video vĩnh viễn.
2. **Mở rộng hỗ trợ X (Twitter) Videos**: Bổ sung hỗ trợ đầy đủ cho mạng xã hội X tại `x.com/i/videos` và các bài đăng video đơn lẻ, tự động điều hướng sang clip tiếp theo mượt mà, tích hợp công tắc bật/tắt riêng trong Popup.
3. **Chuyển video êm ái không khoảng chết (Seamless Pre-scroll)**: Đặt mặc định `endOffset = -0.5s`, giúp clip kế tiếp trượt vào ngay khi clip cũ vừa dứt âm thanh cuối cùng, tạo cảm giác lướt liên tục như một dòng chảy duy nhất.
4. **Đồng bộ Danh sách Chặn Từ xa (Remote Blocklist Subscription)**:
   - Thêm nút `🔄` trong tab "Chặn" của bảng điều khiển HUD.
   - Cho phép người dùng liên kết URL chứa file JSON danh sách chặn (ví dụ raw link GitHub Gist, Cloudflare...).
   - Tự động nạp, gộp và chống trùng lặp định kỳ (24h) hoặc bấm đồng bộ tức thì chỉ với 1 click.

## Nhật ký cập nhật (v3.16.0 — Quản lý Danh sách Chặn, Bỏ chặn Hàng loạt & Xuất/Nhập JSON)

1. **Giao diện Quản lý Danh sách Chặn**: Tab "Chặn" trong bảng điều khiển hiển thị đầy đủ danh sách các tác giả và từ khóa tiêu đề đã chặn, hỗ trợ phân loại theo nền tảng (Facebook, Instagram, TikTok, YouTube).
2. **Bỏ chặn Hàng loạt (Bulk Unblock)**: Tích hợp ô Checkbox ở đầu mỗi dòng kèm ô "Chọn tất cả", hỗ trợ chọn nhiều mục để bỏ chặn 1 lượt nhanh chóng kèm hộp thoại xác nhận số lượng an toàn.
3. **Xuất & Nhập Danh sách Chặn (Export/Import Blocklist)**:
   - Nút `⭳` (Xuất): Tải về file `AutoNext_Blocklist_YYYY-MM-DD.json` chứa toàn bộ danh sách tác giả và từ khóa để sao lưu hoặc chia sẻ.
   - Nút `⭱` (Nhập): Nạp file JSON từ thiết bị hoặc tài khoản khác, tự động gộp (merge) và chống trùng lặp, giúp áp dụng chặn hàng loạt ngay lập tức.
4. **Mở nhanh Cài đặt Chặn Facebook**: Nút `🔗` trong footer giúp mở trực tiếp trang cài đặt chặn gốc của tài khoản Facebook (`facebook.com/settings?tab=blocking`) để đối chiếu và quản lý.

## Nhật ký cập nhật (v3.15.0 — Tính năng Chặn vĩnh viễn Trang trên Account Facebook)

1. **Chặn cứng tài khoản Facebook (Hard Account Block)**: Tự động hóa macro UI qua nút 3 chấm (`...`) của Facebook Reels: mở menu, chọn "Chặn" và bấm xác nhận hộp thoại của Facebook để trảm vĩnh viễn Trang khỏi feed/thuật toán phân phối trên mọi thiết bị.
2. **Cơ chế kích hoạt 2 tầng chống bấm nhầm an toàn**:
   - **Click thường**: Chặn mềm (Soft Block) — lưu vào blacklist tiện ích để tự động lướt qua khi gặp lại.
   - **Giữ chuột 0.7s (hoặc Chuột phải)**: Hiện cảnh báo an toàn. Giữ xác nhận 2 lần trong vòng 3.5 giây để chạy macro chặn vĩnh viễn trên Facebook.
3. **Tự động lướt tiếp sau khi chặn**: Khi chặn thành công, tiện ích hiển thị Toast thông báo và tự động chuyển sang clip tiếp theo mà không làm gián đoạn trải nghiệm xem.

## Nhật ký cập nhật (v3.14.0 — Mở rộng Instagram Reels & Tối ưu triệt để)

1. **Hỗ trợ đầy đủ Instagram Reels (`instagram.com/reels/*`)**: Tự động nhận diện video Reels/Post trên Instagram, hỗ trợ điều hướng phím mũi tên và nút Next chuyên biệt, tích hợp công tắc bật/tắt riêng trong Popup.
2. **Khắc phục cảnh báo rác Volume Sync**: Triệt tiêu cảnh báo liên tục "Không tìm thấy nút loa của Facebook" khỏi nhật ký hoạt động, giữ log sạch sẽ và tập trung vào các sự kiện điều hướng cốt lõi.
3. **Đồng bộ hóa 100% cấu hình toàn hệ thống**: Tất cả các tệp `manifest.json`, `background.js`, `content.js`, `features.js`, `popup.html`, `popup.js` đều được thống nhất toàn diện về quyền, cấu trúc cài đặt mặc định và nhận diện nền tảng.

## Nhật ký cập nhật (v3.13.0 — Khắc phục nghẽn chờ Facebook Reels & Đồng bộ cấu hình)

1. **Khắc phục chu kỳ nghẽn chờ trên Facebook Reels**: Gỡ bỏ thời gian chờ cứng 2200ms lặp đi lặp lại giữa các chiến lược điều hướng; chỉ kích hoạt cửa sổ chờ trượt dở (1000ms) khi phát hiện có chuyển động cuộn/trượt thực tế (`scrollInFlight`).
2. **Nâng cấp nhận diện nút điều hướng Facebook**: Mở rộng tập nhãn tìm kiếm nút Next (`next video`, `next reel`, `video tiếp theo`, `reel tiếp theo`, `thẻ sau`) và ưu tiên quét trong khối container gần video đang phát trước khi quét toàn trang.
3. **Bổ sung Telemetry chẩn đoán lỗi**: Khi chuyển clip thất bại, nhật ký ghi nhận chi tiết trạng thái đối sánh (`url:diff/same; el:diff/same; src:diff/same`) để xác định chính xác nguyên nhân gốc.
4. **Đồng bộ toàn diện cấu hình ngầm**: Cập nhật danh sách giá trị mặc định (`DEFAULTS`) trong `background.js` khớp hoàn toàn với `popup.js` (`liteMode`, `adSkip`, `introSkip`, `endOffset`, `bulkLimit`, `fileTemplate`).

## Nhật ký cập nhật (v3.12.1 — BẢN FINAL, sửa neo nút tròn)

1. **Nút tròn nằm đúng chỗ tay nắm ⠿**: khi thu gọn, nút tròn xuất hiện NGAY tại vị trí 6 dấu chấm (tay nắm kéo) của thanh điều khiển — không còn neo theo giữa thanh. Bung ra thì tay nắm trở lại đúng chỗ nút tròn. Điểm neo mới (tâm tay nắm/nút tròn) cũng được dùng khi lưu vị trí và khi xét xoay dọc sát mép.

## Nhật ký cập nhật (v3.12.0 — BẢN FINAL)

1. **Không auto-next khi xem livestream**: tự nhận diện video live (duration = Infinity hoặc duration lớn dần theo thời gian kiểu Facebook Live) → tạm ngưng mọi cơ chế tự chuyển (ended / near-end / loop-wrap) và không áp dụng lọc thời lượng. Bấm nút ▶ hoặc phím tắt chuyển clip vẫn hoạt động bình thường.
2. Đây là bản đóng gói final — giai đoạn tiếp theo là dùng thử thực tế và tinh chỉnh theo nhật ký hoạt động (nút "Sao chép" trong popup).

## Nhật ký cập nhật (v3.11.0) — 4 nâng cấp hoàn thiện

1. **Vị trí HUD riêng từng trang**: vị trí + hướng (ngang/dọc) của thanh điều khiển được ghi nhớ RIÊNG cho Facebook / TikTok / YouTube. Vị trí cũ (nếu có) được dùng làm mặc định lần đầu sau khi cập nhật.
2. **Nhóm danh sách tải theo tác giả**: tab "Danh sách tải" gộp clip theo tác giả, mỗi nhóm có ô tick riêng để chọn/bỏ chọn cả nhóm một lần.
3. **Giới hạn & tự dọn danh sách tải**: ô số mới trong popup (mặc định 100, cho phép 10–500). Danh sách đầy → tự bỏ link cũ nhất.
4. **Chế độ siêu nhẹ**: công tắc mới trong popup — ẩn HUD, tắt thu thập link/chuẩn hoá âm lượng/đồng bộ loa…, chỉ giữ lõi tự chuyển clip + Phát nền + phím tắt + auto-PiP. Dành cho máy yếu hoặc khi muốn tối giản.

## Nhật ký cập nhật (v3.10.0) — 5 nâng cấp hoàn thiện

1. **Chọn từng clip để tải**: tab "Danh sách tải" có ô tick cho mỗi clip; có tick → nút lớn đổi thành "Tải N đã chọn" và chỉ tải đúng những clip đó (kể cả clip đã tải trước đó). Clip đã tải được đánh dấu ✓ trong danh sách.
2. **Kiểm tra "sức khỏe" file sau tải**: file tải có kiểm chứng được mở thầm để đọc thời lượng thật; file cụt (kiểu xem được 5s rồi đứng) → cảnh báo ngay + gợi ý GHI lại clip; trong tải hàng loạt thì coi như lỗi để tự thử lại.
3. **Nút "Sao chép" nhật ký**: copy toàn bộ nhật ký + phiên bản + trang đang xem + trình duyệt vào clipboard để báo lỗi nhanh.
4. **Lọc nhật ký theo loại**: Tất cả / ⭳ Tải / ▶ Chuyển clip / ⚠️ Cảnh báo.
5. **HUD xoay dọc khi neo sát mép**: kéo thanh điều khiển sát mép trái/phải màn hình → tự xoay dọc để đỡ che video, panel mở sang bên cạnh; kéo ra giữa → tự trở lại nằm ngang.

## Nhật ký cập nhật (v3.9.0) — 6 nâng cấp hoàn thiện

1. **Tải hàng loạt thông minh** — "Tải tất cả" giờ chạy theo hàng đợi: từng file được tải có kiểm chứng toàn vẹn, lỗi tự thử lại tới 3 lượt, báo tiến độ "Đang tải 3/12…" và tổng kết ✅/⚠️ cuối phiên. Clip đã tải xong được ghi sổ (500 mục gần nhất) → không bao giờ tải trùng giữa các phiên.
2. **Kiểm chứng toàn vẹn cho cả TikTok** — đường tải "fetch + kiểm tra đủ dung lượng rồi mới lưu" (trước đây chỉ dùng cho Facebook) nay áp dụng cho TikTok; YouTube Shorts giữ đường chrome.downloads vì googlevideo chặn đọc chéo nguồn.
3. **Tên file tải theo mẫu** — ô "Mẫu tên file" trong popup, hỗ trợ {tacgia} {tieude} {ngay} {site} {id}; mặc định `{site} - {tacgia} - {tieude} - {ngay}`.
4. **Nhật ký hoạt động trong popup** — 50 sự kiện gần nhất (chuyển clip bằng cách nào, tải thành công/lỗi, cảnh báo…) kèm nút Xoá — không cần mở DevTools.
5. **Tối ưu CPU/pin** — gộp 2 vòng quét nền (500ms + 700ms) thành 1 nhịp 600ms; khi tab ẩn mà video không phát thì giãn xuống 2000ms và vòng chính 800ms nghỉ nhịp. Phát nền/PiP không bị ảnh hưởng.
6. **Tự chẩn đoán khi trang đổi giao diện** — tính năng nào hỏng 3 lần liên tiếp (chuyển clip, tải, đồng bộ nút loa FB) sẽ hiện cảnh báo ⚠️ rõ ràng thay vì hỏng trong im lặng, kèm ghi chú trong Nhật ký hoạt động.

## Nhật ký cập nhật (v3.8.1) — Đồng bộ vị trí nút tròn + đồng bộ mute với Facebook

- **Nút tròn thu gọn thẳng hàng với thanh bung ra**: HUD giờ neo theo **tâm** — thu gọn, mở tạm khi di chuột hay ghim mở đều giữ nguyên đúng một điểm, không còn bị lệch.
- **Nút âm lượng đồng bộ với nút loa của Facebook Reels**: khi tăng/giảm âm lượng, extension bấm chính nút loa của Facebook để trạng thái bên trong của trang được cập nhật → icon loa hiển thị đúng và **clip sau không bị mute lại**.
- Nếu bạn tự bấm nút loa của Facebook, extension tôn trọng lựa chọn đó và ghi nhớ cho các clip sau (không giành quyền).

## Nhật ký cập nhật (v3.8.0) — Tải Facebook trọn vẹn + nút âm lượng + giao diện chuẩn
- **Sửa triệt để lỗi file tải về chỉ xem được vài giây đầu (Facebook)**: không đưa thẳng link fbcdn cho trình tải nữa (CDN hay ngắt giữa chừng tạo file cụt). Giờ tải bằng fetch ngay trong trang, **kiểm chứng đủ 100% dung lượng** rồi mới lưu; link hỏng tự thử nguồn còn lại, bí quá tự chuyển sang ghi lại clip — luôn ra file xem trọn vẹn.
- **Nút âm lượng mới** hình tròn chia 2 nửa: trái − giảm, phải + tăng (bước 10%, có toast % hiện tại). Mức âm lượng được ghi nhớ và tự áp cho clip kế tiếp.
- **Icon nút vẽ lại toàn bộ bằng SVG**: căn giữa tuyệt đối trong hình tròn, nét đồng nhất, không còn lệch như glyph/emoji cũ.
- **Mặc định thanh điều khiển thu nhỏ thành nút tròn**: di chuột vào để mở tạm, bấm nút + để ghim mở luôn (lựa chọn được ghi nhớ).

## Nhật ký cập nhật (v3.7.1) — Giảm độ trễ chuyển clip (~10s → ~1s)

- **Ghi nhớ cách điều hướng đã ăn cho từng nền tảng**: trước đây mỗi lần hết clip extension đều thử lần lượt từng cách (phím → nút → lăn chuột…) và để an toàn phải chờ tới ~3,5s cho mỗi cách không ăn → cộng dồn thành ~10s (clip kịp phát lại). Giờ cách đã ăn gần nhất được ghi nhớ (cả sau khi đóng trình duyệt) và luôn được dùng đầu tiên — từ lần chuyển thứ 2 trở đi gần như tức thì.
- **Phát hiện "clip cũ đã phát lại từ đầu"**: nếu trong lúc chờ xác nhận mà clip cũ đã quay về đầu và đang chạy tiếp (cùng thẻ video, cùng nguồn) thì chắc chắn cách vừa thử không ăn → bỏ chờ, thử ngay cách kế tiếp. Các lớp khóa an toàn của v3.7.0 (chờ nốt khi đang chuyển dở, tự quay lại khi lỡ lướt quá đà) vẫn giữ nguyên — không đánh đổi lại lỗi nhảy 2 clip.

## Nhật ký cập nhật (v3.7.0) — Khóa cứng "mỗi lần chỉ 1 clip" trên Facebook Reels

- **Bịt đúng lỗ hổng của bản 3.6.0 trên Facebook**: lớp bảo vệ mới của 3.6.0 dựa vào vị trí cuộn để biết trang đang trượt dở — nhưng Facebook Reels chuyển clip bằng hiệu ứng THAY THẺ TẠI CHỖ (không cuộn) nên lớp này mù hoàn toàn trên Facebook → khi điều hướng về đích trễ, extension vẫn bắn thêm cách 2 → nhảy 2 clip. Giờ trên Facebook extension LUÔN kiên nhẫn chờ nốt (tới ~3,5s) trước khi thử cách tiếp theo.
- **Tự quay lại khi lỡ lướt quá đà (lưới an toàn cuối)**: nếu ngay sau 1 lần chuyển của extension mà clip đổi 2 lần sát nhau (không phải do bạn tay chạm/lăn chuột/bấm phím — có phân biệt thao tác thật), extension tự bấm quay lại đúng 1 clip và báo toast "↩ Lỡ lướt quá 1 clip — đã tự quay lại". Dù bất kỳ nguyên nhân gì gây nhảy đúp, bạn cũng không bao giờ bị mất clip kế tiếp nữa.
- **Clip vừa vào được bảo vệ ~0,9s đầu**: tín hiệu "gần hết clip"/"clip lặp vòng" bắn ra ngay khi vừa sang clip mới chắc chắn là tàn dư của clip trước trên thẻ video tái dùng → bỏ qua, không còn bị cuốn thành chuỗi lướt liên tiếp.
- **Chống ID clip "nhấp nháy" lúc chuyển cảnh** (2 video cùng phát, DOM đang thay thẻ): chỉ nhận clip mới khi ID đứng yên qua 2 nhịp quét liên tiếp — các bước vào-clip không còn chạy loạn lúc đang chuyển.
- Sau khi tự quay lại, extension giữ yên 2,5s (không chuyển tiếp ngay) để bạn xem tiếp clip bị lỡ lướt qua.

## Nhật ký cập nhật (v3.6.0) — Sửa triệt để lỗi nhảy liền 2 clip

- **Nhận biết trang đang trượt dở (nguyên nhân chính)**: khi điều hướng đầu tiên đã ăn nhưng trang trượt tới clip kế chậm hơn cửa sổ xác nhận (máy/mạng chậm), extension trước đây tưởng thất bại và bắn thêm lần điều hướng nữa → nhảy liền 2 clip. Giờ extension theo dõi vị trí cuộn của feed: nếu trang đang trượt dở thì kiên nhẫn chờ nốt (tới 2,2s) thay vì bắn tiếp.
- **Nới cửa sổ xác nhận 900ms → 1300ms** và **cooldown 1,4s → 1,6s** — hạ hẳn xác suất bắn đúp trên máy yếu.
- **Chặn sự kiện 'ended' lạc**: trang tái dùng thẻ video và đổi nguồn khi sang clip mới, lúc chuyển tiếp có thể bắn 'ended' dù clip mới đang phát → trước đây bị lướt oan. Giờ chỉ tin khi video đã kết thúc thật.
- **Hết tự lướt oan clip đang xem khi URL đổi lặt vặt**: Facebook hay thêm/bớt tham số vào URL giữa chừng; sau ~3s clip bị đánh dấu "đã xem" nên lần xử lý lại kế tiếp tưởng là clip mới-đã-xem và tự lướt qua chính clip đang xem. Giờ mỗi clip chỉ được xử lý đúng 1 lần theo ID.
- **Lướt "clip đã xem" có chủ đích và nhìn thấy được**: hiện toast "⏭ Clip đã xem — lướt qua" và đợi qua hẳn cooldown rồi mới lướt — không còn cảm giác "vừa vào clip đã bị quăng đi tiếp" không rõ lý do.
- **Bước vào-clip chạy đúng từng clip trên TikTok For You** (trang có lúc không đổi URL khi lướt): seen/marathon/chặn/quảng cáo giờ dò theo ID clip, có chốt chặn không xử lý trùng.

## Nhật ký cập nhật (v3.5.0) — Sửa triệt để Yêu thích

- **Fix ID clip trên TikTok trang For You (lỗi gốc)**: khi URL không chứa ID clip, ID trước đây rơi về địa chỉ trang — giống nhau cho mọi clip → bấm ⭐ clip sau lại "bỏ thích" clip trước, danh sách trống. Giờ extension tự dò ID thật trong khối chứa video đang phát (TikTok + Facebook); cũng giúp tính năng Bỏ qua clip đã xem chính xác hơn.
- **Fix dấu ★ đồng bộ "mồ côi"**: khi dấu ★ được đồng bộ qua tài khoản Chrome nhưng máy này chưa có chi tiết clip (nút ★ sáng mà danh sách rỗng), bấm ⭐ trước đây bị hiểu thành "bỏ thích" → clip không bao giờ vào danh sách. Giờ bấm ⭐ sẽ LƯU clip vào danh sách máy này.
- **Không còn "Đã lưu" giả**: nếu extension vừa được cập nhật mà trang chưa F5 (lệnh lưu bị Chrome chặn ngầm), giờ báo rõ "⚠️ hãy tải lại trang (F5)" thay vì hiện đã lưu nhưng mất d�� liệu.
- **Clip mới lưu luôn nhìn thấy được**: bỏ tự động bộ lọc thư mục/ô tìm kiếm đang dính khi bấm ⭐; toast hiện tổng số clip đã lưu; tab ⭐ Yêu thích hiện số lượng ngay trên nhãn.
- **Link mở lại clip chuẩn hơn**: clip lưu từ TikTok For You giờ lưu link `/video/ID` thật (thay vì link trang For You) → "Phát tất cả" và bấm mở từ danh sách đi đúng clip.
- Lưu ý: nút ▦ mở bảng với tab đầu là "Danh sách tải" (link tải thu thập được) — clip đã thích nằm ở tab "⭐ Yêu thích" bên cạnh.

## Nhật ký cập nhật (v3.4.0) — Tải clip thế hệ mới (kỹ thuật kiểu yt-dlp)

- **TikTok**: đọc thẳng JSON nội bộ của trang (khóa `downloadAddr`/`playAddr` — đúng cách yt-dlp làm) để lấy link MP4 đầy đủ CÓ tiếng, neo theo ID clip đang xem; chỉ khi không có mới dùng cách bắt URL mạng cũ.
- **YouTube Shorts**: đọc `ytInitialPlayerResponse` (cắt object bằng đếm ngoặc, đối chiếu đúng videoId đang xem để không dinh video cũ khi lướt SPA) → lấy bản MP4 tiến trình hình+tiếng chung một file. Trước đây YouTube hoàn toàn không tải được.
- **Tải dự phòng qua fetch trong trang**: nếu chrome.downloads bị CDN từ chối (link đòi cookie/ngữ cảnh thật), extension tự tải lại bằng fetch mang cookie của trang rồi lưu file.
- **Máy ghi dự phòng cuối cùng (mọi nền tảng, CÓ tiếng)**: khi mọi cách dò link thất bại, extension tự phát lại clip từ đầu và GHI trực tiếp luồng hình+tiếng thành file `.webm` (tự dừng khi clip hết; bấm ⭳ lần nữa để dừng & lưu sớm). Trong lúc ghi extension tạm không tự lướt. Không còn tình huống "Không lấy được nguồn video" bó tay.
- Lưu ý: yt-dlp là chương trình Python chạy trên máy tính, không thể nhúng vào extension — bản này áp dụng cùng kỹ thuật trích xuất của nó ngay trong trình duyệt. Với các trang ngoài 3 nền tảng hỗ trợ, khuyến nghị dùng yt-dlp trên PC.

## Nhật ký cập nhật (v3.3.0) — Phát nổi PiP thông minh

- **PiP sống xuyên suốt khi chuyển clip (mọi nền tảng)**: thay vì dán PiP vào một thẻ video (bị trang gỡ đi khi sang clip mới là PiP đóng), extension giờ mở **cửa sổ PiP dạng tài liệu** (Chrome 116+) chứa một video trung gian chiếu luồng hình của clip đang xem. Khi lướt sang clip mới (tự động hay tay), extension chỉ gắn lại luồng hình mới — cửa sổ không bao giờ tự đóng.
- **Chỉnh kích thước thoải mái**: cửa sổ mới kéo to/nhỏ tự do tới cỡ toàn màn hình (không còn giới hạn chật nh�� PiP thường).
- **Nhớ kích thước + vị trí**: kích thước bạn chỉnh được lưu và dùng lại cho lần mở sau; vị trí cửa sổ do Chrome tự ghi nhớ theo lần kéo gần nhất.
- **Thao tác trong cửa sổ**: bấm vào hình = dừng/phát; nháy đúp = chuyển clip kế. Tiếng vẫn phát từ trang chính nên không bị âm thanh kép.
- **Dự phòng cho Chrome cũ (<116)**: tự quay về PiP thường, kèm cơ chế tự mở lại PiP trên clip mới khi trang gỡ thẻ video (nếu Chrome chặn sẽ báo để bấm lại nút PiP).
- Auto-PiP khi rời tab không can thiệp khi cửa sổ phát nổi thông minh đang mở.

## Nhật ký cập nhật (v3.2.0) — Sửa triệt để lỗi chuyển clip + tùy chọn ± giây

- **Sửa lỗi nhảy liền 2 clip**: chuỗi chiến lược điều hướng (phím → nút → cuộn) giờ dùng chung MỘT mốc so sánh gốc: nếu điều hướng của bước trước "về đích" trễ (mạng chậm), extension nhận ra ngay và KHÔNG bắn thêm bước nào nữa. Thêm cửa sổ "chờ vớt" 700ms sau bước cuối.
- **Sửa lỗi chưa hết đã lướt** (3 nguyên nhân): (1) TikTok/Facebook tái dùng cùng thẻ video và chỉ đổi nguồn khi sang clip mới khiến bộ phát hiện loop-wrap hiểu nhầm là "clip vừa hết" — giờ so sánh cả nguồn video; (2) video preview/chạy nền nhỏ kết thúc cũng kéo trang sang clip khác — giờ chỉ clip đang xem mới được phép chuyển; (3) đang tạm dừng ở giây cuối để đọc chữ vẫn bị đẩy qua — giờ video tạm dừng giữa chừng không bao giờ tự lướt.
- **Tùy chọn ± giây chuyển clip** (popup): âm = chuyển sớm N giây trước khi clip hết (cũng là phương án dự phòng nếu máy bạn hay chuyển trễ); dương = đợi thêm N giây sau khi clip hết rồi mới chuyển. Bước 0.5 giây, từ -10 đến +10. Chuyển sớm được chặn trần ở 50% thời lượng để clip ngắn không b��� lướt oan; hẹn giờ chuyển trễ tự hủy khi bạn tự tay lướt sang clip khác.

## Nhật ký cập nhật (v3.1.0 — bản final) — Marathon & Chặn tác giả hỗ trợ Facebook Reels

- **🎯🚫 Nhận diện tác giả trên Facebook Reels**: Marathon tác giả và Chặn tác giả giờ hoạt động trên Facebook. Extension tìm link trang cá nhân/fanpage của tác giả trong khối reel đang phát (có phương án dự phòng đọc dữ liệu trang, neo theo id reel hiện tại). Tác giả được lưu theo username, hoặc id số với tài khoản không có username.
- **Rà soát toàn bộ để đóng bản final**: kiểm tra chéo tất cả nút HUD ↔ handler xử lý, cài đặt popup ↔ khóa storage ↔ mặc định trong content script, và cú pháp 4 file JS — không phát hiện lệch/lỗi nào khác.
- Lưu ý: chặn theo **từ khóa tiêu đề** vẫn hiệu quả nhất trên TikTok/YouTube Shorts vì Facebook Reels không đổi tiêu đề trang theo từng clip.

## Nhật ký cập nhật (v3.0.0) — Lặp vòng danh sách Yêu thích

- **🔁 Lặp vòng danh sách Yêu thích**: nút 🔁 mới cạnh "▶ Phát tất cả" trong tab ⭐. Bật lên thì khi phát hết danh sách sẽ tự quay lại clip đầu và chạy vô hạn — biến Yêu thích thành playlist phát liên tục. Hoạt động với cả chế độ phát lần lượt và 🔀 phát ngẫu nhiên, kể cả khi lọc theo thư mục. Danh sách chỉ có 1 clip thì tự phát lại clip đó. Trạng thái bật/tắt được ghi nhớ.

## Nhật ký cập nhật (v2.9.0) — Lướt quảng cáo + tua qua intro

- **📢 Tự lướt clip quảng cáo**: nhận diện nhãn "Được tài trợ" / "Sponsored" / "Quảng cáo" hiển thị quanh video đang phát (và khối quảng cáo riêng của YouTube Shorts) rồi tự chuyển clip, kèm toast "Clip được tài trợ — lướt qua". Chỉ so khớp đúng cả cụm chữ để không nhầm với caption/bình luận có chứa từ đó. Bật sẵn mặc định — tắt được trong popup.
- **⏩ Tua qua giây đầu mỗi clip**: đặt số giây trong popup (ví dụ 3) để mọi clip tự nhảy qua đoạn intro chào hỏi. Chỉ áp dụng 1 lần cho mỗi clip, và chỉ khi clip dài ít nhất gấp 3 lần s�� giây bỏ qua (không nuốt clip ngắn); bạn tự tua về đầu xem lại sẽ không bị tua tiếp. Mặc định 0 = tắt.

## Nhật ký cập nhật (v2.8.0) — Tạm ngưng khi đang gõ bình luận

- **⌨️ Tạm ngưng auto-next khi đang gõ**: khi bạn đang focus vào ô bình luận, tin nhắn hay ô tìm kiếm (kể cả ô contenteditable của Facebook/TikTok), extension sẽ giữ nguyên clip dù clip đã hết — không còn cảnh đang gõ dở thì bị nhảy sang clip khác. Gõ xong (rời ô nhập) là tự chuyển tiếp ngay. Có toast nhắc nhẹ "Đang gõ — sẽ chuyển clip khi bạn gõ xong". Áp dụng cả khi đang phát danh sách Yêu thích. Bấm ⏭ thủ công thì vẫn chuyển bình thường.

## Nhật ký cập nhật (v2.7.0) — Phím media & kéo-thả Yêu thích

- **Điều khiển bằng tai nghe / phím media**: bấm nút "bài kế tiếp" (⏭) trên tai nghe hoặc bàn phím media để chuyển clip, nút "bài trước" (⏮) để phát lại clip hiện tại t��� đầu. Hoạt động cả khi đang ở tab khác (kết hợp Phát nền rất tiện). Nút play/pause vẫn do trang xử lý như bình thường.
- **Kéo-thả sắp xếp Yêu thích**: trong tab ★, kéo một dòng rồi thả vào vị trí muốn đặt để đổi thứ tự. "▶ Phát tất cả" sẽ phát đúng theo thứ tự bạn đã sắp xếp (khi không bật 🔀 trộn).

## Nhật ký cập nhật (v2.6.0) — Sửa tải video + tính năng mới

- **⭳ Sửa tải video trên Facebook Reels (và TikTok khi đăng nhập).** Trước đây FB Reels phát bằng luồng blob/MSE nên bấm tải luôn thất bại. Nay extension tự dò link file MP4 thật: ưu tiên link tiến trình có tiếng trong dữ liệu trang (browser_native_hd_url/sd_url), dự phòng bắt URL fbcdn qua Performance API (bỏ bytestart/byteend — bản này có thể thiếu tiếng và sẽ có cảnh báo). TikTok dạng blob cũng được dò lại URL file đầy đủ trên tiktokcdn. Danh sách "Tải tất cả" giờ cũng gom được link trên FB/TikTok. YouTube Shorts dùng luồng mã hóa tách hình/tiếng nên chưa tải trực tiếp được (có thông báo rõ thay vì lỗi chung chung).
- **🔁 Lặp một đoạn A–B** — nút `AB` trên thanh điều khiển (hoặc Alt+Shift+A): bấm lần 1 đặt điểm A, lần 2 đặt điểm B và lặp đúng đoạn đó (xem lại pha hay, học động tác), lần 3 tắt. Khi đang lặp, auto-next tạm ngưng; đổi clip là tự xóa đoạn lặp.
- **📁 Thư mục cho Yêu thích** — nút 📁 trên từng clip để xếp vào thư mục (ví dụ "Nấu ăn", "Hài"); ô lọc thư mục ở đầu tab Yêu thích; "▶ Phát tất cả" và 🔀 phát ngẫu nhiên chỉ phát trong thư mục đang lọc. Thư mục được giữ nguyên khi xuất/nhập file JSON.

## Nhật ký cập nhật (v2.5.0) — Tính năng mới

- **🔀 Phát ngẫu nhiên Yêu thích:** nút 🔀 cạnh "▶ Phát tất cả" — trộn đều thứ tự rồi phát lần lượt toàn bộ clip yêu thích.
- **Chặn theo từ khóa tiêu đề:** trong tab "🚫 Chặn" nhập từ khóa (Enter hoặc nút Thêm) — clip có tiêu đề chứa từ khóa sẽ tự bị lướt qua. Hiệu quả nhất trên TikTok / YouTube Shorts (Facebook Reels không có tiêu đề riêng từng clip).
- **Tự lướt khi clip lỗi:** video báo lỗi/không tải được sẽ được chờ 2,5 giây cho trang tự thử lại, vẫn lỗi thì tự chuyển clip kế thay vì đứng im.
- **🔗 Copy link sạch:** nút 🔗 (Alt+Shift+C) sao chép URL clip hiện tại đã loại bỏ tham số theo dõi (query/hash).
- **☁️ Đồng bộ danh sách chặn:** tác giả bị chặn (tối đa 300) và từ khóa (tối đa 100) được đồng bộ qua tài khoản Chrome — máy nào đăng nhập cũng chặn giống nhau.

## Nhật ký cập nhật (v2.4.0) — Tính năng mới

- **Chặn tác giả (blacklist):** nút 🚫 trên thanh điều khiển (Alt+Shift+X) chặn tác giả của clip đang xem — gặp clip của họ sẽ tự lướt qua. Quản lý danh sách trong tab "🚫 Chặn" (bỏ chặn từng người hoặc tất cả). Lưu tối đa 500 tác giả, theo từng nền tảng.
- **Lọc theo thời lượng:** bật trong popup, đặt ngưỡng "bỏ clip ngắn hơn" / "bỏ clip dài hơn" (giây, 0 = tắt) — clip ngoài ngưỡng được tự lướt qua.
- **Đè gi�� để tua nhanh 2x:** đè giữ chuột/tay lên video ~0,35 giây để tạm tăng tốc 2x (như TikTok mobile), thả ra là về tốc độ cũ. Có thể tắt trong popup.
- **Ghi chú + tìm kiếm Yêu thích:** nút 📝 thêm/sửa ghi chú cho từng clip; ô tìm kiếm lọc nhanh theo tên hoặc ghi chú. Ghi chú được giữ khi xuất/nhập JSON.
- Sửa nhỏ: xoá clip khỏi Yêu thích trong panel giờ cũng gỡ ID khỏi đồng bộ Chrome (nút ★ hết sáng nhầm trên máy khác).

## Nhật ký cập nhật (v2.3.0) — Tính năng mới

- 📥 **Nhập file JSON yêu thích:** nút ⭱ trong tab Yêu thích — chọn file JSON đã xuất trước đó để khôi phục/gộp danh sách khi đổi máy (tự bỏ qua clip trùng).
- ▶️ **Phát tất cả clip yêu thích:** nút "▶ Phát tất cả" mở lần lượt từng clip trong danh sách; clip xem xong tự chuyển sang clip kế (kể cả khác nền tảng). Bấm lại để dừng; tự dừng nếu bạn tự rời khỏi clip đang phát hoặc khi hết danh sách.
- ☁️ **Đồng bộ dấu ★ qua tài khoản Chrome:** ID clip yêu thích (tối đa 400 gần nhất) được đồng bộ qua `storage.sync` — đăng nhập Chrome trên máy khác là thấy đúng trạng thái ★; chi tiết clip (tiêu đề, link) vẫn lưu cục bộ từng máy.
- 🐢 **Chống lướt nhầm khi mạng chậm:** phát hiện video đang buffering (`waiting`/`stalled`) và tạm hoãn "bỏ qua clip đã xem" / Marathon tối đa ~5,6 giây cho tới khi clip phát được.
- 🔘 **Thu nhỏ thanh điều khiển:** nút – gập HUD thành chấm tròn nhỏ; di chuột vào để mở tạm, bấm + để ghim lại. Trạng thái được ghi nhớ theo máy.

## Nhật ký cập nhật (v2.2.0) — Tính năng mới

- ⭐ **Clip yêu thích:** nút ☆ trên thanh điều khiển (hoặc Alt+Shift+F) lưu clip đang xem. Panel ▦ giờ có 2 tab **Danh sách tải / Yêu thích** — bấm tên clip để mở lại, có nút **Xuất JSON** toàn bộ danh sách. Lưu cục bộ trên máy, tối đa 1.000 clip.
- 🖼️ **Tự bật PiP khi rời tab:** chuyển sang tab khác là clip tự thu nhỏ thành cửa sổ n��i, quay lại tab thì tự tắt. Lưu ý: tùy phiên bản Chrome có thể cần cho phép trang trong Cài đặt trang web → "Tự động dùng hình trong hình" (Chrome có thể chặn nếu chưa có thao tác người dùng trên trang).
- 🎯 **Marathon tác giả:** nút 🎯 (hoặc Alt+Shift+M) khoá theo tác giả clip đang xem — clip của người khác sẽ bị lướt qua tự động; tự tắt sau 12 lần lướt liên tiếp không gặp lại. Hỗ trợ TikTok & YouTube Shorts (Facebook Reels chưa nhận diện được tác giả).
- 🔁 **Danh sách tải khử trùng theo ID clip:** cùng một clip không còn xuất hiện 2 lần khi link CDN (signed URL) thay đổi; luôn giữ link mới nhất nên giảm hẳn lỗi tải do link hết hạn.

## Nhật ký cập nhật (v2.1.0) — Tính năng mới

- 🆕 **Bỏ qua clip đã xem:** bật trong popup — extension ghi nhớ ID clip bạn đã xem (tính là "đã xem" sau khi ở lại clip ≥ 3 giây; lưu cục bộ trên máy, tối đa 5.000 clip gần nhất) và tự động lướt qua nếu gặp lại. Có nút **Xoá lịch sử đã xem** trong popup. Tạm ngưng khi đang bật chế độ Lặp clip.
- 🆕 **Chuẩn hoá âm lượng:** nén dải động (Web Audio DynamicsCompressor) giúp các clip quá to dịu lại — đỡ giật mình khi tự chuyển clip liên tục. Chỉ áp dụng cho video phát bằng luồng MSE/blob (đa số clip trên cả 3 nền tảng); video nguồn cross-origin trực tiếp được bỏ qua có chủ đích để không bị câm tiếng do giới hạn CORS. Bật/tắt trong popup, hiệu lực ngay lập tức.

## Nhật ký cập nhật (v2.0.2) — Audit toàn diện & vá lỗi

- 🔧 **Badge ON/OFF đúng trạng thái:** biểu tượng hiển thị OFF ngay khi tắt tiện ích trong popup (trước đây luôn hiện ON).
- 🔧 **Thống nhất cấu hình:** loại bỏ các tuỳ chọn "chết" (smartDelayMs, maxRetries…) và xung đột giá trị mặc định giữa service worker và content script; tự dọn key cũ khi nâng cấp.
- 🔧 **Popup báo đúng trạng thái:** chỉ khung chính trả lời truy vấn trạng thái (trước đây iframe quảng cáo có thể trả lời sai).
- 🌙 **Phát nền viết lại:** ghi đè `document.visibilityState` ở tầng trang (MAIN world qua chrome.scripting) — trang "tin" rằng vẫn hiển thị, trong khi logic nội bộ của extension không bị ảnh hưởng như cách nuốt sự kiện cũ.
- 🔐 **Giảm quyền:** bỏ quyền `tabs` (bớt cảnh báo khi cài), content script chỉ chạy ở khung chính (`all_frames: false`) — nhẹ hơn hẳn trên trang nhiều iframe.
- 🔐 **Chặn URL tải lạ:** service worker chỉ ch��p nhận lệnh tải HTTPS từ CDN của Facebook / TikTok / YouTube.
- ⌨️ **Không bắn phím vào ô nhập liệu:** nếu bạn đang gõ bình luận khi clip kết thúc, phím điều hướng sẽ nhắm vào video thay vì ô đang gõ.
- 🖱️ **Thêm fallback lăn chuột (wheel):** hoạt động thật trên desktop (fallback vuốt cảm ứng cũ gần như vô dụng vì desktop không có TouchEvent).
- 🧱 **Panel danh sách tải dựng bằng DOM API** (loại innerHTML với dữ liệu trang — triệt tiêu rủi ro XSS) và **vị trí thanh điều khiển lưu theo từng máy** (storage.local) thay vì đồng bộ giữa các máy có màn hình khác nhau.

## Nhật ký cập nhật (v2.0.1) — Audit & sửa lỗi

- 🔧 **Inject đầy đủ:** khi bật tiện ích lúc trang đang mở, cả `features.js` (nút VIP) được nạp ngay, không chỉ auto-next.
- 🔧 **Chống tải trùng:** thao tác từ popup chỉ xử lý ở khung chính (trước đây có thể gửi tới nhiều iframe).
- ⌨️ **Đổi phím tắt sang Alt+Shift** để tránh xung đột với phím tắt trình duyệt (ví dụ Alt+D mở thanh địa chỉ).
- 🔧 **Khôi phục vị trí thanh điều khiển** an toàn trong màn hình (không bị trôi ra ngoài).
- 🔧 **Log nền đúng trạng thái:** service worker đọc đúng tùy chọn gỡ lỗi.

## Nhật ký cập nhật (v2.0.0) — Bản VIP

Bổ sung loạt tính năng nâng cao (lấy cảm hứng từ OmniGet, TiktokPure Floating Video, Social Bulk Downloader) cho cả 3 nền tảng:

- 🎛️ **Thanh điều khiển nổi trên video** (kéo thả được, tự lưu vị trí): Clip tiếp theo, Tải video, Phát nổi (PiP), Lặp clip, Tốc độ phát, Danh sách tải.
- ��� **Tải video hiện tại** — với link trực tiếp sẽ tải qua trình quản lý t��i của Chrome (kèm cookie, không lỗi CORS). Video dạng luồng (blob/MSE) sẽ được tải qua bộ nhớ khi trình duyệt cho phép.
- 📦 **Tải hàng loạt** — hệ thống tự thu thập link video trực tiếp khi bạn lướt; mở panel "Danh sách tải" để tải từng cái hoặc **Tải tất cả**.
- 🪟 **Picture-in-Picture** — một chạm để tách video ra cửa sổ nổi, xem khi làm việc.
- ⚡ **Chỉnh tốc độ phát** — 0.5x → 2x, tự nhớ và áp dụng cho mọi clip.
- 🔁 **Lặp lại clip** — khi bật sẽ tạm dừng tự-chuyển để xem lại clip hiện tại.
- 🌙 **Phát nền** — chặn việc trang tự dừng video khi bạn đổi tab (tùy chọn, mặc định tắt).
- ⌨️ **Phím tắt (Alt+Shift):** `Alt+Shift+N` clip sau · `Alt+Shift+D` tải · `Alt+Shift+P` PiP · `Alt+Shift+L` lặp · `Alt+Shift+S` tốc độ · `Alt+Shift+B` danh sách tải · `Alt+Shift+H` ẩn/hiện thanh điều khiển.

> ⚠️ **Lưu ý về tải video:** Facebook Reels và YouTube Shorts thường phát bằng luồng phân mảnh (MSE) nên **không phải lúc nào cũng tải được trực tiếp** trong extension — đây là giới hạn kỹ thuật chung của mọi extension (các app như OmniGet phải dùng yt-dlp ở máy). TikTok tỉ lệ tải thành công cao hơn vì nhiều clip có link trực tiếp. Chỉ tải nội dung bạn có quyền và tuân thủ điều khoản của từng nền tảng.

## Nhật ký cập nhật (v1.2.0)

- ➕ **Thêm hỗ trợ YouTube Shorts:** tự chuy���n sang short kế tiếp khi hết clip (nhấn phím điều hướng, có nút Next và cuộn dự phòng).
- 🛠️ **Sửa l���i Facebook Reels lặp lại vài giây rồi mới chuyển:** Facebook liên tục bật lại chế độ lặp (loop) nên sự kiện kết thúc không kích hoạt. Nay extension tắt loop liên tục để bắt đúng thời điểm hết clip, đồng thời phát hiện "quay vòng" (clip vừa hết đã tua về đầu) để chuy��n ngay lập tức — không còn phát lại.

## Nhật ký cập nhật (v1.1.0)

- 🛠️ **Sửa lỗi Facebook Reels nhảy 2 clip:** trước đây mỗi lần hết clip, extension vừa bấm nút Next vừa nhấn phím mũi tên (và phím còn được gửi tới nhiều đích cùng lúc) nên Facebook nhận nhiều lệnh → nhảy qua clip thứ 2. Nay mỗi lần chỉ thực hiện **một** hành động, chờ xác nhận đã chuyển rồi mới thử cách khác → luôn sang **đúng clip liền kề**.
- 🛠️ **Sửa lỗi TikTok chuyển quá sớm:** trước đây chuyển khi còn ~0,35s. Nay ưu tiên sự kiện kết thúc thật (`ended`); ở chế độ hiển thị chỉ dùng ngưỡng cực nhỏ (~0,04s) nên clip **chạy hết hẳn** mới chuyển. (Tab ẩn vẫn có ngưỡng dự phòng nhỏ để chống throttle.)
- 🎨 **Icon mới:** tile bo góc gradient tím → hồng → cam sinh động, biểu tượng tua nhanh + vòng lặp; bản 16px được đơn giản hoá để luôn sắc nét trên thanh công cụ.

## Cấu trúc file

| File | Vai trò |
|---|---|
| `manifest.json` | Khai báo extension (Manifest V3) |
| `background.js` | Service worker: badge, inject lại script khi cần |
| `content.js` | Logic chính: theo dõi video, phát hiện kết thúc, chuyển tiếp |
| `popup.html` / `popup.js` | Giao diện bật/tắt |
| `icons/` | Biểu tượng |
