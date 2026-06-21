/********************************************************************
 * ============== FILE CONTENT.JS (Phiên bản Tự động Đồng bộ) =========
 ********************************************************************/

if (typeof window.contentScriptLoaded_universal_v5 === 'undefined') {
    window.contentScriptLoaded_universal_v5 = true;
    
    console.log("SYS:INVENTORY - Content Script Automatic Sync initialized.");

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
            headers = Array.from(headerRow.querySelectorAll("td")).map(cell => cell.textContent.trim().toUpperCase());
            dataRows = Array.from(dataTable.querySelectorAll("tbody > tr")).slice(2);
        }
        // 2. Kiểm tra cấu trúc Môi trường Test mới (tiêu đề ở dòng thứ 2 của thead)
        else if (dataTable.querySelector("thead > tr:nth-child(2)")) {
            headerRow = dataTable.querySelector("thead > tr:nth-child(2)");
            headers = Array.from(headerRow.querySelectorAll("th, td")).map(cell => cell.textContent.trim().toUpperCase());
            dataRows = Array.from(dataTable.querySelectorAll("tbody > tr"));
        }
        // 3. Cấu trúc bảng tiêu chuẩn (tiêu đề ở dòng 1 của thead)
        else {
            headerRow = dataTable.querySelector("thead tr");
            if (headerRow) {
                headers = Array.from(headerRow.querySelectorAll("th, td")).map(cell => cell.textContent.trim().toUpperCase());
            }
            dataRows = Array.from(dataTable.querySelectorAll("tbody > tr"));
        }

        if (headers.length === 0) return [];

        const scrapedData = dataRows.map(row => {
            const rowData = {};
            const cells = row.querySelectorAll("td");

            if (cells.length > 0) {
                headers.forEach((header, index) => {
                    if (header && cells[index]) {
                        let cellText = "";

                        // Xử lý cột 'LOẠI' đặc biệt
                        if (header === 'LOẠI') {
                            const link = cells[index].querySelector("a");
                            if (link && link.href) {
                                try {
                                    const url = new URL(link.href, window.location.href);
                                    const loaipl = url.searchParams.get('loaipl');
                                    if (loaipl) {
                                        cellText = loaipl.trim();
                                    } else {
                                        cellText = cells[index].textContent.trim();
                                    }
                                } catch (e) {
                                    cellText = cells[index].textContent.trim();
                                }
                            } else {
                                cellText = cells[index].textContent.trim();
                            }
                        } 
                        else {
                            cellText = cells[index].textContent.trim();
                        }

                        // Định dạng số cho SL NHẬP, SL XUẤT, TỒN
                        if (header === 'SL NHẬP' || header === 'SL XUẤT' || header === 'TỒN') {
                            const cleanedText = cellText.replace(/,/g, ''); 
                            const numberMatch = cleanedText.match(/[\d.]+/);
                            cellText = numberMatch ? numberMatch[0] : '0';
                        }

                        rowData[header] = cellText;
                    }
                });

                // Fallback nếu không có TỒN
                if (!rowData['TỒN']) {
                    rowData['TỒN'] = rowData['SL NHẬP'] || '0';
                }

                const isRowEmpty = Object.values(rowData).every(value => value === '' || value === '0');
                if (isRowEmpty) return null;

                return rowData;
            }
            return null;
        }).filter(item => item !== null);

        return scrapedData;
    }

    // Chạy đồng bộ tự động và lưu vào chrome.storage.local
    function autoSync() {
        const data = scrapeUniversalData();
        if (data && data.length > 0) {
            chrome.storage.local.set({ 
                scrapedInventoryData: data,
                lastSyncTime: new Date().toISOString()
            }, () => {
                console.log(`SYS:INVENTORY - Tự động đồng bộ được ${data.length} dòng dữ liệu.`);
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
                const data = scrapeUniversalData();
                chrome.storage.local.set({ 
                    scrapedInventoryData: data,
                    lastSyncTime: new Date().toISOString()
                });
                sendResponse({ status: "success", data: data });
            } catch (error) {
                console.error("Lỗi khi cào dữ liệu:", error);
                sendResponse({ status: "error", message: error.message });
            }
        }
        return true; 
    });
}
