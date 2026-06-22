/********************************************************************
 * ============== FILE CONTENT.JS (Phiên bản Tự động Đồng bộ) =========
 ********************************************************************/

if (typeof window.contentScriptLoaded_universal_v5 === 'undefined') {
    window.contentScriptLoaded_universal_v5 = true;
    
    console.log("SYS:INVENTORY - Content Script Automatic Sync initialized.");
    
    function normalizeText(text) {
        if (!text) return "";
        return text.replace(/[\s\u00A0]+/g, ' ').trim();
    }

    function getCellFullText(cell, isNumeric = false) {
        if (!cell) return "";

        // 1. Kiểm tra nếu có thẻ input, textarea, select (có thể hiển thị dạng form nhập liệu)
        const formEl = cell.querySelector("input, textarea, select");
        if (formEl) {
            const val = formEl.value;
            if (val && val.trim()) {
                return normalizeText(val);
            }
        }

        // ĐỐI VỚI CÁC CỘT SỐ LƯỢNG (SL NHẬP, SL XUẤT, TỒN), TUYỆT ĐỐI KHÔNG LẤY TỪ THUỘC TÍNH (VÌ ICON CÓ TITLE="Sửa PO" SẼ LÀM SAI SỐ)
        if (isNumeric) {
            return normalizeText(cell.textContent);
        }

        // 2. Tìm thẻ link 'a'. URL thường chứa tham số gốc không bị rút gọn.
        const link = cell.querySelector("a");
        if (link && link.href) {
            try {
                // Đảm bảo parse URL chính xác và thay thế tất cả &amp; bằng & trước khi phân tích
                let hrefAttr = link.getAttribute("href") || "";
                hrefAttr = hrefAttr.replace(/&amp;/gi, "&");
                
                let url;
                if (hrefAttr.startsWith("http://") || hrefAttr.startsWith("https://")) {
                    url = new URL(hrefAttr);
                } else {
                    url = new URL(hrefAttr, window.location.href || 'http://localhost');
                }

                // Kiểm tra các tham số truy vấn phổ biến hoặc bất kỳ tham số nào có giá trị dài/không bị cắt
                const searchParams = url.searchParams;
                // Danh sách tham số ưu tiên
                const priorityParams = ['loaipl', 'loai', 'name', 'ten', 'loai_pl', 'loai_phu_lieu', 'ma_phu_lieu', 'value'];
                for (const p of priorityParams) {
                    // Thử tìm theo tham số chuẩn, hoặc tham số có tiền tố "amp;" trong trường hợp encode bị lỗi
                    let val = searchParams.get(p);
                    if (!val) {
                        val = searchParams.get('amp;' + p);
                    }
                    if (val && val.trim()) {
                        return normalizeText(val);
                    }
                }

                // Nếu không có tham số ưu tiên, duyệt qua tất cả tham số để tìm giá trị dài nhất
                let longestParamVal = "";
                for (const [key, val] of searchParams.entries()) {
                    // Loại bỏ tiền tố "amp;" khỏi key trong quá trình so sánh nếu có
                    if (val && val.trim() && val.length > longestParamVal.length) {
                        longestParamVal = val;
                    }
                }
                if (longestParamVal && longestParamVal.length > 5) {
                    return normalizeText(longestParamVal);
                }
            } catch (e) {
                // Bỏ qua lỗi parse URL
            }
        }

        // 3. Kiểm tra các thuộc tính chứa text đầy đủ của cell hoặc các phần tử con
        // Các thuộc tính Tooltip hoặc Data thường chứa text nguyên bản
        const attributesToCheck = [
            "title", 
            "data-original-title", 
            "data-value", 
            "data-text", 
            "data-name", 
            "data-content", 
            "alt"
        ];

        // Kiểm tra trên bản thân cell
        for (const attr of attributesToCheck) {
            const val = cell.getAttribute(attr);
            if (val && val.trim()) {
                return normalizeText(val);
            }
        }

        // Kiểm tra trên các thẻ con (span, a, div, dfn, label...)
        const children = cell.querySelectorAll("*");
        for (const child of children) {
            for (const attr of attributesToCheck) {
                const val = child.getAttribute(attr);
                if (val && val.trim()) {
                    return normalizeText(val);
                }
            }
        }

        // 4. Fallback lấy textContent thông thường
        return normalizeText(cell.textContent);
    }

    // Hàm cào dữ liệu từ bảng
    function scrapeUniversalData() {
        const dataTable = document.querySelector("table");
        if (!dataTable) return [];

        let headers = [];
        let dataRows = [];
        let headerRow;

        // 1. Kiểm tra cấu trúc web kho công ty (tiêu đề ở tbody dòng 2)
        headerRow = dataTable.querySelector("tbody > tr:nth-child(2)");
        if (headerRow && headerRow.querySelectorAll("td").length > 5) {
            headers = Array.from(headerRow.querySelectorAll("td")).map(cell => normalizeText(cell.textContent).toUpperCase());
            dataRows = Array.from(dataTable.querySelectorAll("tbody > tr")).slice(2);
        }
        // 2. Kiểm tra cấu trúc Môi trường Test mới (tiêu đề ở dòng thứ 2 của thead)
        else if (dataTable.querySelector("thead > tr:nth-child(2)")) {
            headerRow = dataTable.querySelector("thead > tr:nth-child(2)");
            headers = Array.from(headerRow.querySelectorAll("th, td")).map(cell => normalizeText(cell.textContent).toUpperCase());
            dataRows = Array.from(dataTable.querySelectorAll("tbody > tr"));
        }
        // 3. Cấu trúc bảng tiêu chuẩn (tiêu đề ở dòng 1 của thead)
        else {
            headerRow = dataTable.querySelector("thead tr");
            if (headerRow) {
                headers = Array.from(headerRow.querySelectorAll("th, td")).map(cell => normalizeText(cell.textContent).toUpperCase());
            }
            dataRows = Array.from(dataTable.querySelectorAll("tbody > tr"));
        }

        if (headers.length === 0) return [];

        // Chuẩn hóa tiêu đề cột để tương thích hoàn toàn giữa ERP và Frontend
        const normalizedHeaders = headers.map(header => {
            const h = header.trim().toUpperCase();
            if (h === 'THÔNG SỐ / SIZE' || h === 'THÔNG SỐ/SIZE' || h === 'SIZE' || h === 'TS / SIZE') {
                return 'TS / SIZE';
            }
            if (h === 'ĐƠN VỊ' || h === 'ĐV' || h === 'ĐVT' || h === 'ĐƠN VỊ TÍNH') {
                return 'ĐVT';
            }
            return h;
        });

        const rawScrapedList = dataRows.map(row => {
            const rowData = {};
            const cells = row.querySelectorAll("td");

            if (cells.length > 0) {
                normalizedHeaders.forEach((header, index) => {
                    if (header && cells[index]) {
                        const originalHeader = headers[index] ? normalizeText(headers[index]).toUpperCase() : '';

                        let cellText;
                        const isNumeric = header === 'SL NHẬP' || header === 'SL XUẤT' || header === 'TỒN';
                        cellText = getCellFullText(cells[index], isNumeric);

                        // Định dạng số cho SL NHẬP, SL XUẤT, TỒN, còn lại chuyển in hoa chuyên nghiệp
                        if (isNumeric) {
                            const cleanedText = cellText.replace(/,/g, ''); 
                            const numberMatch = cleanedText.match(/[\d.]+/);
                            cellText = numberMatch ? numberMatch[0] : '0';
                        } else {
                            cellText = cellText.toUpperCase();
                        }

                        rowData[header] = cellText;
                    }
                });

                // Loại bỏ dòng TỒN tổng cộng hoặc dòng tổng, dòng trống
                const isTotalRow = Object.values(rowData).some(val => 
                    typeof val === 'string' && (
                        val.includes("TỔNG CỘNG") || 
                        val.includes("CỘNG") || 
                        val.includes("TOTAL")
                    )
                );
                if (isTotalRow) return null;

                // TỒN tạm thời cho hàng đơn lẻ
                const slNhap = parseFloat(rowData['SL NHẬP'] || '0');
                const slXuat = parseFloat(rowData['SL XUẤT'] || '0');
                rowData['TỒN'] = String(slNhap - slXuat);

                const isRowEmpty = Object.values(rowData).every(value => value === '' || value === '0');
                if (isRowEmpty) return null;

                return rowData;
            }
            return null;
        }).filter(item => item !== null);

        // TIẾN HÀNH GỘP (AGGREGATE) CÁC DÒNG TRÙNG LẶP PO, MÃ HÀNG, MODEL, LOẠI, THÔNG SỐ, MÀU, KHOANG CÙNG LÚC
        const groupedMap = {};
        rawScrapedList.forEach(row => {
            const key = getRowKey(row);
            if (!key) return;

            if (!groupedMap[key]) {
                groupedMap[key] = {
                    ...row,
                    'SL NHẬP': parseFloat(row['SL NHẬP'] || '0'),
                    'SL XUẤT': parseFloat(row['SL XUẤT'] || '0')
                };
            } else {
                groupedMap[key]['SL NHẬP'] += parseFloat(row['SL NHẬP'] || '0');
                groupedMap[key]['SL XUẤT'] += parseFloat(row['SL XUẤT'] || '0');
                
                // Gộp thông tin ghi chú nếu có
                if (row['GHI CHÚ'] && row['GHI CHÚ'] !== '---' && row['GHI CHÚ'] !== '0') {
                    if (!groupedMap[key]['GHI CHÚ'] || groupedMap[key]['GHI CHÚ'] === '---' || groupedMap[key]['GHI CHÚ'] === '0') {
                        groupedMap[key]['GHI CHÚ'] = row['GHI CHÚ'];
                    } else if (groupedMap[key]['GHI CHÚ'].indexOf(row['GHI CHÚ']) === -1) {
                        groupedMap[key]['GHI CHÚ'] += ', ' + row['GHI CHÚ'];
                    }
                }
            }
        });

        // Tạo ra mảng dữ liệu cuối cùng sau khi gộp và tính toán lại tồn thực tế (chỉ giữ lại những mặt hàng có tồn thực tế > 0)
        const aggregatedScrapedData = Object.values(groupedMap).map(groupedRow => {
            const nhap = groupedRow['SL NHẬP'];
            const xuat = groupedRow['SL XUẤT'];
            const ton = nhap - xuat;

            return {
                ...groupedRow,
                'SL NHẬP': String(nhap),
                'SL XUẤT': String(xuat),
                'TỒN': String(ton)
            };
        });

        return aggregatedScrapedData;
    }

    function getRowKey(row) {
        return [
            normalizeText(row['MÃ HÀNG']),
            normalizeText(row['MODEL']),
            normalizeText(row['LOẠI']),
            normalizeText(row['TS / SIZE'] || row['THÔNG SỐ / SIZE'] || row['SIZE']),
            normalizeText(row['MÀU']),
            normalizeText(row['PO']),
            normalizeText(row['KHOANG'])
        ].join('::').trim().toUpperCase();
    }

    // Hàm đồng nhất ghép nối & gộp thông minh giữa kho đã lưu và dữ liệu mới cào
    function mergeAndAggregateLists(existingList, newList) {
        const mergedMap = {};

        // 1. Thêm existingList vào map để giữ lại các sản phẩm cào từ trước
        existingList.forEach(item => {
            const key = getRowKey(item);
            if (!key) return;
            mergedMap[key] = {
                ...item,
                'SL NHẬP': parseFloat(item['SL NHẬP'] || '0'),
                'SL XUẤT': parseFloat(item['SL XUẤT'] || '0')
            };
        });

        // 2. Thêm newList vào map (ghi đè SL NHẬP / SL XUẤT của những mặt hàng đang xem trên màn hình)
        // Vì list mới cào là dữ liệu mới nhất, chính xác nhất về các giao dịch của mặt hàng đó
        newList.forEach(item => {
            const key = getRowKey(item);
            if (!key) return;
            mergedMap[key] = {
                ...item,
                'SL NHẬP': parseFloat(item['SL NHẬP'] || '0'),
                'SL XUẤT': parseFloat(item['SL XUẤT'] || '0')
            };
        });

        // 3. Tính toán lại TỒN thực tế = SL NHẬP - SL XUẤT cho tất cả, chỉ giữ lại những dòng có tồn > 0
        return Object.values(mergedMap).map(groupedRow => {
            const nhap = groupedRow['SL NHẬP'];
            const xuat = groupedRow['SL XUẤT'];
            const ton = nhap - xuat;
            return {
                ...groupedRow,
                'SL NHẬP': String(nhap),
                'SL XUẤT': String(xuat),
                'TỒN': String(ton)
            };
        }).filter(row => parseFloat(row['TỒN']) > 0);
    }

    // Chạy đồng bộ tự động và lưu vào chrome.storage.local (với tính năng ghép/cập nhật thông minh)
    function autoSync() {
        const newData = scrapeUniversalData();
        if (!newData || newData.length === 0) return;

        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['scrapedInventoryData'], (result) => {
                const existingData = result.scrapedInventoryData || [];
                const mergedList = mergeAndAggregateLists(existingData, newData);

                // So sánh xem có sự thay đổi thực tế nào so với cũ không
                const hasChanges = JSON.stringify(existingData) !== JSON.stringify(mergedList);

                if (hasChanges) {
                    chrome.storage.local.set({ 
                        scrapedInventoryData: mergedList,
                        lastSyncTime: new Date().toISOString()
                    }, () => {
                        console.log(`SYS:INVENTORY - Cập nhật đồng bộ thông minh. Tổng dòng: ${mergedList.length}.`);
                    });
                }
            });
        }
    }

    // Thực hiện đồng bộ ngay khi load trang
    setTimeout(autoSync, 1000);

    // Lắng nghe thay đổi nội dung trang để tự động đồng bộ lại nếu bảng thay đổi (ví dụ: filter, chuyển trang)
    let throttleTimeout;
    const observer = new MutationObserver(() => {
        if (throttleTimeout) clearTimeout(throttleTimeout);
        throttleTimeout = setTimeout(() => {
            autoSync();
        }, 1500);
    });

    const targetNode = document.querySelector("table") || document.body;
    if (targetNode) {
        observer.observe(targetNode, { childList: true, subtree: true });
    }

    // Vẫn lắng nghe message thủ công từ extension đề phòng
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "scrapeData") {
            try {
                const newData = scrapeUniversalData();
                if (!newData || newData.length === 0) {
                    sendResponse({ status: "success", data: [] });
                    return true;
                }

                chrome.storage.local.get(['scrapedInventoryData'], (result) => {
                    const existingData = result.scrapedInventoryData || [];
                    const mergedList = mergeAndAggregateLists(existingData, newData);
                    
                    const hasChanges = JSON.stringify(existingData) !== JSON.stringify(mergedList);

                    if (hasChanges) {
                        chrome.storage.local.set({ 
                            scrapedInventoryData: mergedList,
                            lastSyncTime: new Date().toISOString()
                        }, () => {
                            sendResponse({ status: "success", data: mergedList });
                        });
                    } else {
                        sendResponse({ status: "success", data: existingData });
                    }
                });
            } catch (error) {
                console.error("Lỗi khi cào dữ liệu:", error);
                sendResponse({ status: "error", message: error.message });
            }
            return true;
        }
        return true; 
    });
}
