// ===================================================================
// FILE LENHXUAT.JS - (CẬP NHẬT ĐỂ HIỂN THỊ TỔ/ĐỢT MỚI)
// ===================================================================

let currentDispatchData = [];
let currentDetailedNeedsData = {};
let currentKhsxData = [];
let currentFifoSuggestions = new Map();
let currentDispatchInfo = {};
let currentNeedsTotalMap = new Map();

document.addEventListener('DOMContentLoaded', () => {
    initializePage();
});

function initializePage() {
    document.getElementById('creation-date').textContent = new Date().toLocaleDateString('vi-VN');
    const printButton = document.getElementById('print-button');
    if (printButton) {
        printButton.addEventListener('click', () => window.print());
    }

    setTimeout(() => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['dispatchData', 'detailedNeedsData', 'khsxData', 'fifoSuggestions', 'dispatchInfo'], (result) => {
                if (chrome.runtime.lastError) {
                    console.error("Lỗi khi đọc dữ liệu:", chrome.runtime.lastError);
                    document.body.innerHTML = "<h1>Đã có lỗi xảy ra khi tải dữ liệu.</h1>";
                    return;
                }

                currentDispatchData = result.dispatchData || [];
                currentDetailedNeedsData = result.detailedNeedsData || {};
                currentKhsxData = result.khsxData || [];
                const fifoSuggestionsArray = result.fifoSuggestions || [];
                currentFifoSuggestions = new Map(fifoSuggestionsArray);
                currentDispatchInfo = result.dispatchInfo || {};

                currentNeedsTotalMap = new Map();
                if (currentDetailedNeedsData && currentDetailedNeedsData.needs) {
                    currentDetailedNeedsData.needs.forEach(need => {
                        const key = `${String(need.loai || '').trim().toLowerCase()}___${String(need.sizeVT || '').trim().toLowerCase()}___${String(need.mau || '').trim().toLowerCase()}`;
                        currentNeedsTotalMap.set(key, (currentNeedsTotalMap.get(key) || 0) + need.total);
                    });
                }

                renderHeaderSection(currentDetailedNeedsData, currentDispatchInfo);
                renderKhsxDetails(currentKhsxData, currentDispatchInfo, currentDetailedNeedsData);
                renderDispatchTable(currentDispatchData, currentNeedsTotalMap);
                renderShortageTable(currentFifoSuggestions, currentDetailedNeedsData);
                
                // Dọn dẹp storage sau khi đã lấy
                chrome.storage.local.remove(['dispatchData', 'detailedNeedsData', 'khsxData', 'fifoSuggestions', 'dispatchInfo']);
            });
        } else {
            // Web browser local storage fallback
            try {
                currentDispatchData = JSON.parse(localStorage.getItem('dispatchData') || '[]');
                currentDetailedNeedsData = JSON.parse(localStorage.getItem('detailedNeedsData') || '{}');
                currentKhsxData = JSON.parse(localStorage.getItem('khsxData') || '[]');
                const fifoSuggestionsArray = JSON.parse(localStorage.getItem('fifoSuggestions') || '[]');
                currentFifoSuggestions = new Map(fifoSuggestionsArray);
                currentDispatchInfo = JSON.parse(localStorage.getItem('dispatchInfo') || '{}');

                currentNeedsTotalMap = new Map();
                if (currentDetailedNeedsData && currentDetailedNeedsData.needs) {
                    currentDetailedNeedsData.needs.forEach(need => {
                        const key = `${String(need.loai || '').trim().toLowerCase()}___${String(need.sizeVT || '').trim().toLowerCase()}___${String(need.mau || '').trim().toLowerCase()}`;
                        currentNeedsTotalMap.set(key, (currentNeedsTotalMap.get(key) || 0) + need.total);
                    });
                }

                renderHeaderSection(currentDetailedNeedsData, currentDispatchInfo);
                renderKhsxDetails(currentKhsxData, currentDispatchInfo, currentDetailedNeedsData);
                renderDispatchTable(currentDispatchData, currentNeedsTotalMap);
                renderShortageTable(currentFifoSuggestions, currentDetailedNeedsData);
            } catch (err) {
                console.error("Lỗi khi tải dữ liệu từ localStorage:", err);
            }
        }
    }, 100);
}

function renderHeaderSection(detailedNeedsData, dispatchInfo) {
    const headerArea = document.getElementById('company-info-area');
    if (!headerArea) return;

    const maHang = detailedNeedsData?.maHang || '---';
    const models = detailedNeedsData?.models || [];
    
    let infoLines = '';
    if (models.length > 0) {
        infoLines = models.map(model => {
            const info = dispatchInfo[model] || { to: '?', dot: '?' };
            return `
                <div class="header-plan-detail">
                    <span class="detail-item"><strong>Model:</strong> <span class="highlight-code">${escapeHtml(model)}</span></span>
                    <span class="detail-divider">|</span>
                    <span class="detail-item"><strong>Tổ:</strong> <span class="highlight-code">${escapeHtml(info.to)}</span></span>
                    <span class="detail-divider">|</span>
                    <span class="detail-item"><strong>Đợt:</strong> <span class="highlight-code">${escapeHtml(info.dot)}</span></span>
                </div>
            `;
        }).join('');
    } else {
        infoLines = '<div class="header-plan-detail">Chưa gán thông tin sản xuất</div>';
    }

    headerArea.innerHTML = `
        <h1 class="brand-title">DCL</h1>
        <div class="brand-sub">
            <p class="header-mahang"><strong>Mã hàng:</strong> <span class="highlight-code">${escapeHtml(maHang)}</span></p>
            ${infoLines}
        </div>
    `;
}

function renderKhsxDetails(khsxData, dispatchInfo, detailedNeedsData) {
    const container = document.getElementById('khsx-details-container');
    if (!container) return;
    
    // Sắp xếp KHSX
    khsxData.sort((a, b) => String(a.size).localeCompare(String(b.size), undefined, { numeric: true }));
    const colspan = khsxData.length > 0 ? khsxData.length : 1;

    // Tạo HTML cho phần KHSX (Size / Số lượng)
    let khsxBodyHtml = '';
    if (khsxData.length > 0) {
        khsxBodyHtml = `
            <thead>
                <tr>
                    ${khsxData.map(item => `<th>${escapeHtml(item.size)}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                <tr>
                    ${khsxData.map(item => `<td><strong>${escapeHtml(item.soLuong)}</strong></td>`).join('')}
                </tr>
            </tbody>
        `;
    } else {
        khsxBodyHtml = '<tbody><tr><td align="center">Không có KHSX.</td></tr></tbody>';
    }

    const html = `
    <table class="details-table khsx-summary">
        <thead>
            <tr>
                <th colspan="${colspan}">
                    <div class="khsx-header">
                        <span class="khsx-title">Kế Hoạch Sản Xuất:</span>
                    </div>
                </th>
            </tr>
        </thead>
        <tbody>
            <tr>
                ${khsxBodyHtml ? `<td colspan="${colspan}" align="center">
                    <table class="inner-khsx-table">
                        ${khsxBodyHtml}
                    </table>
                </td>` : '<td align="center">Không có KHSX</td>'}
            </tr>
        </tbody>
    </table>
    `;
    
    container.innerHTML = html;
}

function renderDispatchTable(data, needsMap) {
    const tableBody = document.getElementById('dispatch-table-body');
    if (!tableBody || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Không có phụ liệu nào được chọn để xuất.</td></tr>';
        return;
    }
    
    let html = '';
    let previousGroup = null;
    
    data.forEach(item => {
        const needKey = `${String(item['LOẠI'] || '').trim().toLowerCase()}___${String(item['TS / SIZE'] || '').trim().toLowerCase()}___${String(item['MÀU'] || '').trim().toLowerCase()}`;
        const totalNeed = needsMap.get(needKey) || 0;
        
        const currentGroup = needKey;
        const isFirstInGroup = currentGroup !== previousGroup;
        previousGroup = currentGroup;
        
        const rowClass = isFirstInGroup ? 'group-start' : '';
        
        html += `<tr class="${rowClass}">
                <td class="align-left">${escapeHtml(item['MÃ HÀNG'])}</td>
                <td>${escapeHtml(item['MODEL'])}</td>
                <td class="align-left">${escapeHtml(item['LOẠI'])}</td>
                <td>${escapeHtml(item['TS / SIZE'])}</td>
                <td>${escapeHtml(item['MÀU'])}</td>
                <td>${escapeHtml(item['PO'])}</td>
                <td>${escapeHtml(item['KHOANG'])}</td>
                <td>${Number(item.ton).toFixed(0)}</td>
                <td><strong>${isFirstInGroup ? totalNeed.toFixed(0) : '—'}</strong></td>
                <td><strong>${item.xuatQty}</strong></td>
            </tr>`;
    });
    tableBody.innerHTML = html;
}

function renderShortageTable(fifoSuggestions, detailedNeedsData) {
    const container = document.getElementById('shortage-section-container');
    if (!container || fifoSuggestions.size === 0) return;

    const shortageList = [];
    for (const [key, group] of fifoSuggestions.entries()) {
        if (group.remainingAfterSuggestion > 0.1) {
            shortageList.push(group);
        }
    }

    if (shortageList.length === 0) {
        container.innerHTML = `<h3>✅ TÌNH TRẠNG PHỤ LIỆU</h3> <p style="text-align: center;">🎉 Đủ phụ liệu cho kế hoạch sản xuất!</p>`;
        return;
    }

    shortageList.sort((a, b) => b.remainingAfterSuggestion - a.remainingAfterSuggestion);

    const tableRowsHtml = shortageList.map(item => {
        const totalAvailable = item.totalNeed - item.remainingAfterSuggestion;
        const isTotalShortage = totalAvailable < 0.1;
        const rowClass = isTotalShortage ? 'critical-shortage' : 'partial-shortage';
        const statusIcon = isTotalShortage ? '🚫' : '⚠️';

        const relevantModels = new Set();
        if (detailedNeedsData && detailedNeedsData.needs) {
            detailedNeedsData.needs.forEach(need => {
                const needKey = `${String(need.loai || '').trim().toLowerCase()}___${String(need.sizeVT || '').trim().toLowerCase()}___${String(need.mau || '').trim().toLowerCase()}`;
                const itemKey = `${String(item.needInfo.loai || '').trim().toLowerCase()}___${String(item.needInfo.sizeVT || '').trim().toLowerCase()}___${String(item.needInfo.mau || '').trim().toLowerCase()}`;
                if (needKey === itemKey) {
                    relevantModels.add(need.model);
                }
            });
        }
        const modelsString = Array.from(relevantModels).join(', ');

        return `
            <tr class="${rowClass}">
                <td>${escapeHtml(detailedNeedsData.maHang)}</td>
                <td><strong>${escapeHtml(modelsString)}</strong></td> 
                <td class="align-left">${escapeHtml(item.needInfo.loai)}</td>
                <td>${escapeHtml(item.needInfo.sizeVT)}</td>
                <td>${escapeHtml(item.needInfo.mau)}</td>
                <td>${item.totalNeed.toFixed(0)}</td>
                <td>${totalAvailable.toFixed(0)}</td>
                <td><strong>${item.remainingAfterSuggestion.toFixed(0)}</strong></td>
                <td>${statusIcon} ${isTotalShortage ? 'Thiếu hoàn toàn' : 'Thiếu một phần'}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <h3>⚠️ DANH SÁCH PHỤ LIỆU THIẾU HỤT</h3>
        <div class="table-wrapper">
         
            <table class="data-table shortage-table">
                <thead>
                    <tr>
                        <th>Mã Hàng</th>
                        <th>Model</th> 
                        <th>Loại PL</th>
                        <th>Size VT</th>
                        <th>Màu</th>
                        <th>SL Cần</th>
                        <th>SL Có</th>
                        <th>SL Thiếu</th>
                        <th>Trạng Thái</th>
                    </tr>
                </thead>
                <tbody>${tableRowsHtml}</tbody>
            </table>
        </div>
    `;
}

function escapeHtml(text) {
    if (text === null || typeof text === 'undefined') return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function exportToExcel() {
    const maHang = currentDetailedNeedsData?.maHang || '---';
    const models = currentDetailedNeedsData?.models || [];
    let modelDispatchStr = '';
    if (models.length > 0) {
        modelDispatchStr = models.map(m => {
            const info = currentDispatchInfo[m] || { to: '?', dot: '?' };
            return `Model: ${m} (Tổ: ${info.to} | Đợt: ${info.dot})`;
        }).join(', ');
    } else {
        modelDispatchStr = 'Chưa gán thông tin sản xuất';
    }

    const creationDate = document.getElementById('creation-date')?.textContent || new Date().toLocaleDateString('vi-VN');
    const dispatchCode = document.getElementById('dispatch-code')?.textContent || 'LXK-' + new Date().toISOString().slice(0,10);

    let html = `
    <html xmlns:o="urn:schemas-microsoft-excel:office:excel" xmlns:x="urn:schemas-microsoft-excel:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
    <meta charset="utf-8">
    <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Lệnh Xuất Kho</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
    <style>
      table { border-collapse: collapse; margin-bottom: 20px; }
      td, th { border: 1px solid #cbd5e1; padding: 6px 10px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 10pt; }
      .header-title { font-size: 16pt; font-weight: bold; text-align: center; color: #1e293b; background-color: #f1f5f9; }
      .section-title { font-size: 12pt; font-weight: bold; color: #4f46e5; border-bottom: 2px solid #4f46e5; background-color: #e0e7ff; padding: 4px; }
      .meta-label { font-weight: bold; color: #475569; background-color: #f8fafc; }
      .table-header { font-weight: bold; background-color: #f1f5f9; color: #1e293b; text-align: center; }
      .critical-shortage { background-color: #fee2e2; color: #9f1239; }
      .partial-shortage { background-color: #fef3c7; color: #92400e; }
      .bold-value { font-weight: bold; }
      .text-center { text-align: center; }
      .text-left { text-align: left; }
      .text-right { text-align: right; }
    </style>
    </head>
    <body>
      <table>
        <tr>
          <td colspan="10" class="header-title" style="height:40px; font-size:16pt;">LỆNH XUẤT KHO PHỤ LIỆU</td>
        </tr>
        <tr>
          <td colspan="2" class="meta-label">Nhà máy / Đơn vị:</td>
          <td colspan="3">DCL - Kho Phụ Liệu</td>
          <td colspan="2" class="meta-label">Ngày lập:</td>
          <td colspan="3">${creationDate}</td>
        </tr>
        <tr>
          <td colspan="2" class="meta-label">Mã hàng:</td>
          <td colspan="8" class="bold-value">${maHang}</td>
        </tr>
        <tr>
          <td colspan="2" class="meta-label">Thông tin Tổ & Đợt:</td>
          <td colspan="8">${modelDispatchStr}</td>
        </tr>
      </table>

      <!-- Kế hoạch sản xuất -->
      <table>
        <tr>
          <td colspan="10" class="section-title">KẾ HOẠCH SẢN XUẤT (KHSX ĐÃ CHỌN)</td>
        </tr>
    `;

    if (currentKhsxData && currentKhsxData.length > 0) {
        html += `<tr>`;
        currentKhsxData.forEach(item => {
            html += `<td class="meta-label text-center">Size ${item.size}</td>`;
        });
        html += `</tr><tr>`;
        currentKhsxData.forEach(item => {
            html += `<td class="text-center bold-value" style="font-size:11pt; color:#4f46e5;">${item.soLuong}</td>`;
        });
        html += `</tr>`;
    } else {
        html += `<tr><td colspan="10">Không có dữ liệu kế hoạch sản xuất</td></tr>`;
    }

    html += `
      </table>

      <!-- Danh sách xuất kho -->
      <table>
        <tr>
          <td colspan="10" class="section-title">DANH SÁCH PHỤ LIỆU XUẤT KHO CHI TIẾT</td>
        </tr>
        <tr class="table-header" style="height:30px;">
          <td>Mã Hàng</td>
          <td>Model</td>
          <td>Loại PL</td>
          <td>Size VT</td>
          <td>Màu</td>
          <td>PO</td>
          <td>Khoang</td>
          <td>Tồn Kho</td>
          <td>Tổng SL Cần</td>
          <td>SL Cấp Phát Xuất</td>
        </tr>
    `;

    if (currentDispatchData && currentDispatchData.length > 0) {
        let previousGroup = null;
        currentDispatchData.forEach(item => {
            const needKey = `${String(item['LOẠI'] || '').trim().toLowerCase()}___${String(item['TS / SIZE'] || '').trim().toLowerCase()}___${String(item['MÀU'] || '').trim().toLowerCase()}`;
            const totalNeed = currentNeedsTotalMap.get(needKey) || 0;
            const isFirstInGroup = needKey !== previousGroup;
            previousGroup = needKey;

            html += `
            <tr>
              <td>${item['MÃ HÀNG'] || ''}</td>
              <td class="text-center">${item['MODEL'] || ''}</td>
              <td>${item['LOẠI'] || ''}</td>
              <td class="text-center bold-value">${item['TS / SIZE'] || ''}</td>
              <td class="text-center">${item['MÀU'] || ''}</td>
              <td class="text-center">${item['PO'] || ''}</td>
              <td class="text-center bold-value">${item['KHOANG'] || ''}</td>
              <td class="text-right">${Number(item.ton || 0).toFixed(0)}</td>
              <td class="text-right bold-value">${isFirstInGroup ? totalNeed.toFixed(0) : '—'}</td>
              <td class="text-right bold-value" style="color:#047857; font-size:11pt;">${item.xuatQty || 0}</td>
            </tr>
            `;
        });
    } else {
        html += `<tr><td colspan="10" class="text-center">Không có dữ liệu cấp phát xuất kho</td></tr>`;
    }

    html += `</table>`;

    // Shortage block
    const shortageList = [];
    if (currentFifoSuggestions && currentFifoSuggestions.size > 0) {
        for (const [key, group] of currentFifoSuggestions.entries()) {
            if (group.remainingAfterSuggestion > 0.1) {
                shortageList.push(group);
            }
        }
    }

    if (shortageList.length > 0) {
        shortageList.sort((a, b) => b.remainingAfterSuggestion - a.remainingAfterSuggestion);
        html += `
          <table>
            <tr>
              <td colspan="9" class="section-title" style="background-color: #fecdd3; color: #9f1239; border-bottom: 2px solid #fecdd3;">⚠️ DANH SÁCH PHỤ LIỆU THIẾU HỤT</td>
            </tr>
            <tr class="table-header" style="background-color: #ffe4e6; height:30px;">
              <td>Mã Hàng</td>
              <td>Model</td>
              <td>Loại PL</td>
              <td>Size VT</td>
              <td>Màu</td>
              <td>SL Cần</td>
              <td>SL Có Sẵn</td>
              <td>SL Thiếu Hụt</td>
              <td>Trạng Thái</td>
            </tr>
        `;

        shortageList.forEach(item => {
            const totalAvailable = item.totalNeed - item.remainingAfterSuggestion;
            const isTotalShortage = totalAvailable < 0.1;
            const rowClass = isTotalShortage ? 'critical-shortage' : 'partial-shortage';
            const statusStr = isTotalShortage ? 'Thiếu hoàn toàn' : 'Thiếu một phần';

            const relevantModels = new Set();
            if (currentDetailedNeedsData && currentDetailedNeedsData.needs) {
                currentDetailedNeedsData.needs.forEach(need => {
                    const needKey = `${String(need.loai || '').trim().toLowerCase()}___${String(need.sizeVT || '').trim().toLowerCase()}___${String(need.mau || '').trim().toLowerCase()}`;
                    const itemKey = `${String(item.needInfo.loai || '').trim().toLowerCase()}___${String(item.needInfo.sizeVT || '').trim().toLowerCase()}___${String(item.needInfo.mau || '').trim().toLowerCase()}`;
                    if (needKey === itemKey) {
                        relevantModels.add(need.model);
                    }
                });
            }
            const modelsString = Array.from(relevantModels).join(', ');

            html += `
            <tr class="${rowClass}">
              <td>${maHang}</td>
              <td class="bold-value">${modelsString}</td>
              <td>${item.needInfo.loai}</td>
              <td class="text-center bold-value">${item.needInfo.sizeVT}</td>
              <td>${item.needInfo.mau}</td>
              <td class="text-right">${item.totalNeed.toFixed(0)}</td>
              <td class="text-right">${totalAvailable.toFixed(0)}</td>
              <td class="text-right bold-value" style="color:#b91c1c;">${item.remainingAfterSuggestion.toFixed(0)}</td>
              <td class="text-center bold-value">${statusStr}</td>
            </tr>
            `;
        });
        html += `</table>`;
    }

    // Signatures area
    html += `
      <br>
      <table style="border: none; margin-top: 30px;">
        <tr style="border: none;">
          <td colspan="3" style="border: none; text-align: center; font-weight: bold; font-size: 11pt; height:120px; vertical-align:top;">NGƯỜI LẬP PHIẾU<br><span style="font-weight:normal; font-size:9pt; color:#64748b;">(Ký & ghi rõ họ tên)</span></td>
          <td colspan="4" style="border: none; text-align: center; font-weight: bold; font-size: 11pt; height:120px; vertical-align:top;">THỦ KHO PHỤ LIỆU<br><span style="font-weight:normal; font-size:9pt; color:#64748b;">(Ký & ghi rõ họ tên)</span></td>
          <td colspan="3" style="border: none; text-align: center; font-weight: bold; font-size: 11pt; height:120px; vertical-align:top;">NGƯỜI NHẬN HÀNG<br><span style="font-weight:normal; font-size:9pt; color:#64748b;">(Ký & ghi rõ họ tên)</span></td>
        </tr>
      </table>
    </body>
    </html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `Lenh_Xuat_Kho_Phu_Lieu_${maHang}_${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
}

// Expose them to window scope so they can be called from inline onclick events in html
window.exportToExcel = exportToExcel;
