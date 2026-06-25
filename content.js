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

                const cleanRawTextForParams = rawText.replace(/[\.…\ufffd]/g, "").trim().toUpperCase();

                if (paramKeyToLookFor && tempUrl.searchParams.has(paramKeyToLookFor)) {
                    const mappedVal = tempUrl.searchParams.get(paramKeyToLookFor);
                    if (mappedVal && mappedVal.trim()) {
                        const upperMappedVal = mappedVal.trim().toUpperCase();
                        // Only use mappedVal if it provides more complete information 
                        // (starts with the cleaned raw text) OR if rawText is extremely short/empty
                        if (cleanRawTextForParams.length < 2 || upperMappedVal.startsWith(cleanRawTextForParams)) {
                            matchedParamText = mappedVal.trim();
                        }
                    }
                } 
                
                // Fallback for thongso
                if (!matchedParamText && hdr.includes("SIZE") && tempUrl.searchParams.has("thongso")) {
                    const mappedVal = tempUrl.searchParams.get("thongso");
                    if (mappedVal && mappedVal.trim()) {
                        const upperMappedVal = mappedVal.trim().toUpperCase();
                        if (cleanRawTextForParams.length < 2 || upperMappedVal.startsWith(cleanRawTextForParams)) {
                            matchedParamText = mappedVal.trim();
                        }
                    }
                }

                if (matchedParamText) {
                    return normalizeText(matchedParamText);
                }

                // If explicit mapping failed, use the fallback logic:
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
                // Trích xuất các tham số từ các link <a> trong toàn bộ dòng (VD: edit links như change.php có chứa các thông số gốc của cơ sở dữ liệu)
                const rowParams = {};
                const allLinksInRow = row.querySelectorAll("a[href]");
                allLinksInRow.forEach(link => {
                    try {
                        const href = link.getAttribute("href") || "";
                        if (href) {
                            const cleanHref = href.replace(/&amp;/gi, "&");
                            let urlObj;
                            if (cleanHref.startsWith("http://") || cleanHref.startsWith("https://")) {
                                urlObj = new URL(cleanHref);
                            } else {
                                urlObj = new URL(cleanHref, window.location.href);
                            }
                            urlObj.searchParams.forEach((val, key) => {
                                const cleanKey = key.toLowerCase().replace(/^amp;/, "");
                                if (val && val.trim()) {
                                    rowParams[cleanKey] = val.trim();
                                }
                            });
                        }
                    } catch (err) {
                        // Bỏ qua lỗi parse URL
                    }
                });

                normalizedHeaders.forEach((header, index) => {
                    if (header && cells[index]) {
                        const originalHeader = headers[index] ? normalizeText(headers[index]).toUpperCase() : '';

                        let cellText;
                        const isNumeric = header === 'SL NHẬP' || header === 'SL XUẤT' || header === 'TỒN';

                        // Ưu tiên lấy từ các tham số trong link của dòng để lấy dữ liệu gốc sạch
                        let paramVal = null;
                        if (!isNumeric) {
                            const hdr = header.toUpperCase();
                            if (hdr.includes("LOẠI")) {
                                paramVal = rowParams["loaipl"] || rowParams["loai_pl"] || rowParams["loai"];
                            } else if (hdr.includes("MÃ HÀNG")) {
                                paramVal = rowParams["mahang"] || rowParams["ma_hang"];
                            } else if (hdr === "MÃ P.O" || hdr === "PO") {
                                paramVal = rowParams["popl"] || rowParams["po"];
                            } else if (hdr === "MÀU SẮC" || hdr === "MÀU") {
                                paramVal = rowParams["maupl"] || rowParams["mau"];
                            } else if (hdr.includes("SIZE")) {
                                paramVal = rowParams["sizepl"] || rowParams["size"] || rowParams["thongso"];
                            } else if (hdr.includes("KHOANG") || hdr.includes("VỊ TRÍ")) {
                                paramVal = rowParams["vitrikhoang"] || rowParams["khoang"];
                            } else if (hdr.includes("MODEL")) {
                                paramVal = rowParams["model"];
                            } else if (hdr.includes("ITEM")) {
                                paramVal = rowParams["itempl"] || rowParams["item"];
                            }
                        }

                        if (paramVal && paramVal.trim() && !paramVal.includes("")) {
                            cellText = paramVal.trim();
                        } else {
                            cellText = getCellFullText(cells[index], isNumeric, header);
                        }

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
        // Bước 1: Gộp newList (dữ liệu mới cào) lại với nhau
        const newListMap = {};
        
        const createFullKey = (item) => {
            return [
                item['MÃ HÀNG'],
                item['MODEL'],
                item['LOẠI'],
                item['TS / SIZE'] || item['THÔNG SỐ / SIZE'] || item['SIZE'],
                item['MÀU'],
                item['PO'],
                item['KHOANG']
            ].map(v => (v || '').toString().trim().toUpperCase()).join('::');
        };

        const createBaseKey = (item) => {
            return [
                item['MÃ HÀNG'],
                item['MODEL'],
                item['TS / SIZE'] || item['THÔNG SỐ / SIZE'] || item['SIZE'],
                item['MÀU'],
                item['PO']
            ].map(v => (v || '').toString().trim().toUpperCase()).join('::');
        };

        newList.forEach(item => {
            const key = createFullKey(item);
            if (!newListMap[key]) {
                newListMap[key] = { ...item };
            } else {
                newListMap[key]['SL NHẬP'] = (parseFloat(newListMap[key]['SL NHẬP'] || '0') + parseFloat(item['SL NHẬP'] || '0')).toString();
                newListMap[key]['SL XUẤT'] = (parseFloat(newListMap[key]['SL XUẤT'] || '0') + parseFloat(item['SL XUẤT'] || '0')).toString();
            }
        });

        const list2Aggregated = Object.values(newListMap);

        // Bước 2: Xử lý existingList (dữ liệu cũ)
        const mergedMap = {};

        existingList.forEach(oldItem => {
            const oldFullKey = createFullKey(oldItem);
            const oldBaseKey = createBaseKey(oldItem);
            const oldNhap = parseFloat(oldItem['SL NHẬP'] || '0');
            const oldKhoang = (oldItem['KHOANG'] || '').toString().trim().toUpperCase();
            
            let superseded = false;

            for (const newItem of list2Aggregated) {
                const newFullKey = createFullKey(newItem);
                const newBaseKey = createBaseKey(newItem);
                const newNhap = parseFloat(newItem['SL NHẬP'] || '0');
                const newKhoang = (newItem['KHOANG'] || '').toString().trim().toUpperCase();
                
                if (oldFullKey === newFullKey) {
                    superseded = true;
                    break;
                }
                
                if (oldBaseKey === newBaseKey) {
                    // Nếu trùng baseKey (PO, Model, Size, Màu, Mã hàng) và có cùng số lượng NHẬP
                    // Điều này cho thấy đây là cùng một mặt hàng nhưng đã đổi KHOANG hoặc LOẠI trên hệ thống ERP
                    if (oldNhap === newNhap && oldNhap > 0) {
                        superseded = true;
                        break;
                    }
                    
                    // Nếu cùng khoang, nhưng tên LOẠI bị thiếu/cụt (ví dụ: DÂY KÉO SƯ vs DÂY KÉO SƯỜN ỐNG)
                    if (oldKhoang === newKhoang) {
                        const oldLoai = (oldItem['LOẠI'] || '').toString().replace(/[\ufffd]/g, '').toUpperCase();
                        const newLoai = (newItem['LOẠI'] || '').toString().replace(/[\ufffd]/g, '').toUpperCase();
                        
                        if (oldLoai.includes(newLoai) || newLoai.includes(oldLoai)) {
                            superseded = true;
                            break;
                        }
                    }
                }
            }

            if (!superseded) {
                mergedMap[oldFullKey] = { ...oldItem };
            }
        });

        // Bước 3: Đưa dữ liệu mới vào
        list2Aggregated.forEach(newItem => {
            const newFullKey = createFullKey(newItem);
            mergedMap[newFullKey] = { ...newItem };
        });

        // Bước 4: Tính toán lại TỒN thực tế = SL NHẬP - SL XUẤT, chỉ giữ lại tồn > 0
        return Object.values(mergedMap).map(groupedRow => {
            const nhap = parseFloat(groupedRow['SL NHẬP'] || '0');
            const xuat = parseFloat(groupedRow['SL XUẤT'] || '0');
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
    async function updateFirebaseREST(data) {
        try {
            const projectId = "gen-lang-client-0889659541";
            const databaseId = "ai-studio-c65333fd-043d-4cce-b990-a985158ab910";
            
            // Get deviceId from local storage or set a default one
            let deviceId = localStorage.getItem('deviceId');
            if (!deviceId) {
                deviceId = 'STATION-AUTO';
                localStorage.setItem('deviceId', deviceId);
            }
            
            let deviceName = localStorage.getItem('deviceName') || 'Máy Trạm Tự Động';

            const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/warehouses/${deviceId}?updateMask.fieldPaths=id&updateMask.fieldPaths=name&updateMask.fieldPaths=lastSyncTime&updateMask.fieldPaths=status&updateMask.fieldPaths=scrapedInventoryData`;

            // Transform data arrays to Firestore REST API format
            const valuesArray = data.map(item => {
                const mapValueFields = {};
                for (const key in item) {
                    mapValueFields[key] = { stringValue: String(item[key]) };
                }
                return { mapValue: { fields: mapValueFields } };
            });

            const payload = {
                fields: {
                    id: { stringValue: deviceId },
                    name: { stringValue: deviceName },
                    lastSyncTime: { stringValue: new Date().toISOString() },
                    status: { stringValue: "Online" },
                    scrapedInventoryData: {
                        arrayValue: {
                            values: valuesArray
                        }
                    }
                }
            };

            await fetch(url, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            console.log("SYS:INVENTORY - Data synced to Firebase successfully");
        } catch (e) {
            console.error("SYS:INVENTORY - Firebase sync failed", e);
        }
    }

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
                        updateFirebaseREST(mergedList);
                    });
                } else {
                    // Cập nhật Firebase ngay cả khi không có thay đổi local để đánh dấu "Online"
                    updateFirebaseREST(mergedList);
                }
            });
        } else {
             // Non-extension fallback
             const existingDataStr = localStorage.getItem('scrapedInventoryData');
             const existingData = existingDataStr ? JSON.parse(existingDataStr) : [];
             const mergedList = mergeAndAggregateLists(existingData, newData);
             localStorage.setItem('scrapedInventoryData', JSON.stringify(mergedList));
             updateFirebaseREST(mergedList);
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
