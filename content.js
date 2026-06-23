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

    function getCellFullText(cell, isNumeric = false, headerName = "") {
        if (!cell || typeof cell.querySelector !== 'function' || typeof cell.getAttribute !== 'function') return "";

        // 1. Kiểm tra nếu có thẻ input, textarea, select
        const formEl = cell.querySelector("input, textarea, select");
        if (formEl) {
            const val = formEl.value;
            if (val && val.trim()) {
                return normalizeText(val);
            }
        }

        // ĐỐI VỚI CÁC CỘT SỐ LƯỢNG (SL NHẬP, SL XUẤT, TỒN), TUYỆT ĐỐI KHÔNG LẤY TỪ THUỘC TÍNH
        if (isNumeric) {
            return normalizeText(cell.textContent);
        }

        const rawText = normalizeText(cell.textContent);
        
        // CÁC THUỘC TÍNH CHỨA TEXT ĐẦY ĐỦ THƯỜNG ĐƯỢC DÙNG KHI CẮT CHỮ (TOOLTIP)
        const attributesToCheck = [
            "title", 
            "data-original-title", 
            "data-value", 
            "data-text", 
            "data-content"
        ];

        // Tìm xem có thuộc tính nào được đặt ở ô hay phần tử con không
        let attrText = "";
        for (const attr of attributesToCheck) {
            const val = cell.getAttribute(attr);
            if (val && val.trim()) {
                attrText = normalizeText(val);
                break;
            }
        }
        if (!attrText) {
            const children = cell.querySelectorAll("*");
            for (const child of children) {
                for (const attr of attributesToCheck) {
                    const val = child.getAttribute(attr);
                    if (val && val.trim()) {
                        attrText = normalizeText(val);
                        break;
                    }
                }
                if (attrText) break;
            }
        }

        // Ưu tiên thuộc tính tooltip/data (chứa dữ liệu gốc) hơn là textContent (có thể bị cắt, hoặc chứa ký hiệu lỗi )
        if (attrText && attrText !== "...") {
            const cleanRawText = rawText.replace(/[\.…]/g, "").trim();
            // Đảm bảo tooltip không phải là mấy câu chung chung
            if (attrText.toLowerCase() !== "xem chi tiết" && attrText.toLowerCase() !== "chi tiết") {
                 // Nếu có tooltip chứa dữ liệu nguyên thủy, chúng ta luôn dùng nó
                 return attrText;
            }
        }

        // Kiểm tra thông tin đầy đủ bị ẩn trong URL query parameters của các thẻ <a> (VD: ERP thường để name gốc trong param loaipl=...)
        const aTag = cell.querySelector("a[href]");
        if (aTag && headerName) {
            try {
                const tempUrl = new URL(aTag.href, window.location.href);
                let matchedParamText = null;

                // Basic mapping header -> param name
                const hdr = headerName.toUpperCase();
                let paramKeyToLookFor = "";

                if (hdr.includes("LOẠI")) paramKeyToLookFor = "loaipl";
                else if (hdr.includes("MÃ HÀNG")) paramKeyToLookFor = "mahang";
                else if (hdr === "MÃ P.O" || hdr === "PO") paramKeyToLookFor = "popl";
                else if (hdr === "MÀU SẮC" || hdr === "MÀU") paramKeyToLookFor = "maupl";
                else if (hdr.includes("SIZE")) paramKeyToLookFor = "sizepl"; // can also be thongso
                else if (hdr.includes("KHOANG") || hdr.includes("VỊ TRÍ")) paramKeyToLookFor = "vitrikhoang";
                else if (hdr.includes("MODEL")) paramKeyToLookFor = "model";
                else if (hdr.includes("ITEM")) paramKeyToLookFor = "itempl";

                if (paramKeyToLookFor && tempUrl.searchParams.has(paramKeyToLookFor)) {
                    const mappedVal = tempUrl.searchParams.get(paramKeyToLookFor);
                    if (mappedVal && mappedVal.trim()) {
                        matchedParamText = mappedVal.trim();
                    }
                } 
                
                // Fallback for thongso
                if (!matchedParamText && hdr.includes("SIZE") && tempUrl.searchParams.has("thongso")) {
                    const mappedVal = tempUrl.searchParams.get("thongso");
                    if (mappedVal && mappedVal.trim()) {
                        matchedParamText = mappedVal.trim();
                    }
                }

                if (matchedParamText) {
                    return normalizeText(matchedParamText);
                }

                // If explicit mapping failed, use the fallback logic:
                const cleanRawTextForParams = rawText.replace(/[\.…]/g, "").trim().toUpperCase();
                tempUrl.searchParams.forEach((val, key) => {
                    const decodedVal = val.trim();
                    const upperVal = decodedVal.toUpperCase();
                    // Kiểm tra param phải chứa text hiện tại nhưng đầy đủ dài hơn
                    if (cleanRawTextForParams.length >= 2 && upperVal.length > cleanRawTextForParams.length && upperVal.startsWith(cleanRawTextForParams)) {
                        matchedParamText = decodedVal;
                    }
                });
                
                if (matchedParamText) {
                    return normalizeText(matchedParamText);
                }
            } catch (err) {
                // Ignore URL parsing errors
            }
        }

        return rawText;
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
                        cellText = getCellFullText(cells[index], isNumeric, header);

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
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === "scrapeData") {
                try {
                    const newData = scrapeUniversalData();
                    if (!newData || newData.length === 0) {
                        sendResponse({ status: "success", data: [] });
                        return true;
                    }

                    if (chrome.storage && chrome.storage.local) {
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
                    } else {
                        sendResponse({ status: "success", data: [] });
                    }
                } catch (error) {
                    console.error("Lỗi khi cào dữ liệu:", error);
                    sendResponse({ status: "error", message: error.message });
                }
                return true;
            }
            return true; 
        });
    }
}
