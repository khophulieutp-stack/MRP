import { useState, useMemo, useEffect } from 'react';
import { BomRow } from './BomManagement';
import { Calculator, Package, Layers, ChevronRight, Check, X, Cloud, CloudOff, RefreshCw, Send, Radio, Laptop, CheckCircle, Database, HelpCircle } from 'lucide-react';
import { db, listenToWarehousesCloud, getBomFromCloud, syncInventoryToCloud, sendRemoteDispatch, Warehouse } from '../lib/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

interface PlanningTabProps {
  bomData: BomRow[];
}

export function PlanningTab({ bomData }: PlanningTabProps) {
  const [selectedMaHang, setSelectedMaHang] = useState<string>('');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [sizeQuantities, setSizeQuantities] = useState<Record<string, number>>({});

  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const [nodeMode, setNodeMode] = useState<'warehouse' | 'remote'>('warehouse');
  const [deviceId, setDeviceId] = useState('');
  const [remoteWarehouseId, setRemoteWarehouseId] = useState('');
  const [activeBomData, setActiveBomData] = useState<BomRow[]>(bomData);
  const [cloudMaHangs, setCloudMaHangs] = useState<string[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [cloudSuccessMessage, setCloudSuccessMessage] = useState<string | null>(null);
  const [isScraping, setIsScraping] = useState(false);

  const [availableTeams, setAvailableTeams] = useState<{ id: string; name: string }[]>([]);
  const [availableBatches, setAvailableBatches] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [modelTeams, setModelTeams] = useState<Record<string, string>>({}); // model -> teamName
  const [modelBatches, setModelBatches] = useState<Record<string, string>>({}); // model -> batchName

  // Load available teams & batches
  useEffect(() => {
    const defaultTeams = [
      { id: 't1', name: 'Tổ 1' },
      { id: 't2', name: 'Tổ 2' },
      { id: 't3', name: 'Tổ 3' },
      { id: 't4', name: 'Tổ 4' }
    ];

    const defaultBatches = [
      { id: 'b1', name: 'Đợt 1', code: 'DOT-01' },
      { id: 'b2', name: 'Đợt 2', code: 'DOT-02' },
      { id: 'b3', name: 'Đợt 3', code: 'DOT-03' },
      { id: 'b4', name: 'Đợt 4', code: 'DOT-04' }
    ];

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['productionTeams', 'productionBatches'], (res) => {
        if (res.productionTeams) {
          setAvailableTeams(res.productionTeams);
        } else {
          setAvailableTeams(defaultTeams);
        }

        if (res.productionBatches) {
          setAvailableBatches(res.productionBatches);
        } else {
          setAvailableBatches(defaultBatches);
        }
      });
    } else {
      const localTeams = localStorage.getItem('productionTeams');
      const localBatches = localStorage.getItem('productionBatches');

      if (localTeams) {
        setAvailableTeams(JSON.parse(localTeams));
      } else {
        setAvailableTeams(defaultTeams);
      }

      if (localBatches) {
        setAvailableBatches(JSON.parse(localBatches));
      } else {
        setAvailableBatches(defaultBatches);
      }
    }
  }, []);

  useEffect(() => {
    // Tải dữ liệu tồn kho đã đồng bộ trước đó từ chrome storage hoặc localStorage
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['scrapedInventoryData'], (res) => {
        if (res.scrapedInventoryData) {
          setInventoryData(res.scrapedInventoryData);
        } else {
          scrapeInventory();
        }
      });

      const handleStorageChange = (changes: any, areaName: string) => {
        if (areaName === 'local' && changes.scrapedInventoryData) {
          setInventoryData(changes.scrapedInventoryData.newValue || []);
        }
      };
      chrome.storage.onChanged.addListener(handleStorageChange);
      
      const handleSync = () => scrapeInventory();
      document.addEventListener('SYNC_INVENTORY', handleSync);

      return () => {
        chrome.storage.onChanged.removeListener(handleStorageChange);
        document.removeEventListener('SYNC_INVENTORY', handleSync);
      };
    } else {
      const stored = localStorage.getItem('scrapedInventoryData');
      if (stored) {
        setInventoryData(JSON.parse(stored));
      } else {
        scrapeInventory();
      }

      const handleSync = () => scrapeInventory();
      document.addEventListener('SYNC_INVENTORY', handleSync);
      return () => document.removeEventListener('SYNC_INVENTORY', handleSync);
    }
  }, []);

  // Sync Cloud configurations and fetch Cloud lists
  useEffect(() => {
    const updateCloudStates = () => {
      const mode = localStorage.getItem('nodeMode') as 'warehouse' | 'remote' || 'warehouse';
      setNodeMode(mode);
      const devId = localStorage.getItem('deviceId') || '';
      setDeviceId(devId);
      const remId = localStorage.getItem('remoteWarehouseId') || '';
      setRemoteWarehouseId(remId);
    };

    updateCloudStates();
    window.addEventListener('storage', updateCloudStates);
    document.addEventListener('CLOUD_CONFIG_UPDATED', updateCloudStates);
    return () => {
      window.removeEventListener('storage', updateCloudStates);
      document.removeEventListener('CLOUD_CONFIG_UPDATED', updateCloudStates);
    };
  }, []);

  // Fetch available cloud BOM list & listen to warehouses
  useEffect(() => {
    const colRef = collection(db, 'bom_definitions');
    getDocs(colRef).then((snapshot) => {
      const list: string[] = [];
      snapshot.forEach(doc => {
        list.push(doc.id);
      });
      setCloudMaHangs(list);
    }).catch(err => {
      console.error("Error fetching cloud BOM list:", err);
    });

    if (nodeMode === 'remote') {
      const unsubscribe = listenToWarehousesCloud((list) => {
        setWarehouses(list);
      });
      return () => unsubscribe();
    }
  }, [nodeMode]);

  // Download remote warehouse inventory data when in Remote mode
  useEffect(() => {
    if (nodeMode === 'remote' && remoteWarehouseId) {
      setSyncingCloud(true);
      const docRef = doc(db, 'warehouses', remoteWarehouseId);
      getDoc(docRef).then((docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.scrapedInventoryData) {
            setInventoryData(data.scrapedInventoryData);
            console.log("Remote: Synced warehouse inventory loaded.");
          }
        }
        setSyncingCloud(false);
      }).catch(err => {
        console.error("Failed to load inventory remotely:", err);
        setSyncingCloud(false);
      });
    }
  }, [nodeMode, remoteWarehouseId]);

  // Sync activeBomData with incoming prop, and handle deep-fetching for selected MaHang on Cloud
  useEffect(() => {
    setActiveBomData(bomData);
  }, [bomData]);

  useEffect(() => {
    if (selectedMaHang) {
      const hasLocal = bomData.some(row => row.maHang === selectedMaHang);
      if (!hasLocal || nodeMode === 'remote') {
        getBomFromCloud(selectedMaHang).then((rows) => {
          if (rows && rows.length > 0) {
            console.log(`BOM downloaded from Cloud for: ${selectedMaHang} (${rows.length} rows)`);
            setActiveBomData(prev => {
              const filtered = prev.filter(r => r.maHang !== selectedMaHang);
              return [...filtered, ...rows];
            });
          }
        }).catch(err => console.error("Failed to download cloud BOM:", err));
      }
    }
  }, [selectedMaHang, bomData, nodeMode]);

  // Auto-sync inventory data in Warehouse mode to Firebase Firestore
  useEffect(() => {
    if (nodeMode === 'warehouse' && deviceId && inventoryData.length > 0) {
      const deviceName = localStorage.getItem('deviceName') || 'Máy Trạm Kho ' + deviceId.split('-')[1];
      const timeout = setTimeout(() => {
        syncInventoryToCloud(deviceId, deviceName, inventoryData)
          .then(() => console.log("Cloud: Synced local inventory to firestore."))
          .catch(err => console.error("Cloud: Failed to sync inventory:", err));
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [inventoryData, nodeMode, deviceId]);

  const maHangOptions = useMemo(() => {
    const localCodes = bomData.map(row => row.maHang).filter(Boolean);
    const set = new Set([...localCodes, ...cloudMaHangs]);
    return Array.from(set).filter(Boolean);
  }, [bomData, cloudMaHangs]);

  const scrapeInventory = async () => {
    setIsScraping(true);
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.scripting) {
        let tabId;
        if (chrome.storage && chrome.storage.local) {
          const res = await chrome.storage.local.get('targetTabId');
          if (res && res.targetTabId) {
            tabId = res.targetTabId;
          }
        }

        if (!tabId) {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          tabId = tab?.id;
        }

        if (tabId) {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
              const dataTable = document.querySelector("table");
              if (!dataTable) return [];

              function normalizeText(text: string | null | undefined) {
                  if (!text) return "";
                  return text.replace(/[\s\u00A0]+/g, ' ').trim();
              }

              function getCellFullText(cell: Element | null | undefined, isNumeric: boolean = false) {
                  if (!cell) return "";

                  // 1. Kiểm tra nếu có thẻ input, textarea, select (có thể hiển thị dạng form nhập liệu)
                  const formEl = cell.querySelector("input, textarea, select") as any;
                  if (formEl) {
                      const val = formEl.value;
                      if (val && val.trim()) {
                          return normalizeText(val);
                      }
                  }

                  // ĐỐI VỚI NUMERIC COLUMNS (SL), BỎ QUA ATTRIBUTE ĐỂ TRÁNH ICON SỬA
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
                          for (const [key, val] of (searchParams as any).entries()) {
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
                  for (let i = 0; i < children.length; i++) {
                      const child = children[i];
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

              let headers: string[] = [];
              let dataRows: Element[] = [];
              let headerRow;

              headerRow = dataTable.querySelector("tbody > tr:nth-child(2)");
              if (headerRow && headerRow.querySelectorAll("td").length > 5) {
                  headers = Array.from(headerRow.querySelectorAll("td") as any).map((cell: any) => cell.textContent?.trim().toUpperCase() || '');
                  dataRows = Array.from(dataTable.querySelectorAll("tbody > tr"));
                  dataRows = dataRows.slice(2);
              }
              else if (dataTable.querySelector("thead > tr:nth-child(2)")) {
                  headerRow = dataTable.querySelector("thead > tr:nth-child(2)");
                  if (headerRow) {
                    headers = Array.from(headerRow.querySelectorAll("th, td") as any).map((cell: any) => cell.textContent?.trim().toUpperCase() || '');
                  }
                  dataRows = Array.from(dataTable.querySelectorAll("tbody > tr"));
              }
              else {
                  headerRow = dataTable.querySelector("thead tr");
                  if (headerRow) {
                      headers = Array.from(headerRow.querySelectorAll("th, td") as any).map((cell: any) => cell.textContent?.trim().toUpperCase() || '');
                  }
                  dataRows = Array.from(dataTable.querySelectorAll("tbody > tr"));
              }

              if (headers.length === 0) return [];

              // Chuẩn hóa tiêu đề cột để tương ứng
              const normalizedHeaders = headers.map(h => {
                  const val = h.toUpperCase().trim();
                  if (val === 'THÔNG SỐ / SIZE' || val === 'THÔNG SỐ/SIZE' || val === 'SIZE' || val === 'TS / SIZE') {
                      return 'TS / SIZE';
                  }
                  if (val === 'ĐƠN VỊ' || val === 'ĐV' || val === 'ĐVT' || val === 'ĐƠN VỊ TÍNH') {
                      return 'ĐVT';
                  }
                  return val;
              });

              const scrapedData = dataRows.map(row => {
                  const rowData: Record<string, string> = {};
                  const cells = row.querySelectorAll("td");

                  if (cells.length > 0) {
                      normalizedHeaders.forEach((header, index) => {
                          if (header && cells[index]) {
                              const isNumeric = header === 'SL NHẬP' || header === 'SL XUẤT' || header === 'TỒN';
                              let cellText = getCellFullText(cells[index], isNumeric);

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

                      const slNhap = parseFloat(rowData['SL NHẬP'] || '0');
                      const slXuat = parseFloat(rowData['SL XUẤT'] || '0');
                      rowData['TỒN'] = String(slNhap - slXuat);

                      const isRowEmpty = Object.values(rowData).every(value => value === '' || value === '0');
                      if (isRowEmpty) return null;

                      // Do NOT filter ton <= 0 here because we need to aggregate them first

                      return rowData;
                  }
                  return null;
              }).filter(Boolean);

              const groupedMap: Record<string, any> = {};
              scrapedData.forEach((row: any) => {
                  const key = [
                      normalizeText(row['MÃ HÀNG'] || ''),
                      normalizeText(row['MODEL'] || ''),
                      normalizeText(row['LOẠI'] || ''),
                      normalizeText(row['TS / SIZE'] || row['THÔNG SỐ / SIZE'] || row['SIZE'] || ''),
                      normalizeText(row['MÀU'] || ''),
                      normalizeText(row['PO'] || ''),
                      normalizeText(row['KHOANG'] || '')
                  ].join('::');

                  if (!key || key === '::::::') return;

                  if (!groupedMap[key]) {
                      groupedMap[key] = {
                          ...row,
                          'SL NHẬP': parseFloat(row['SL NHẬP'] || '0'),
                          'SL XUẤT': parseFloat(row['SL XUẤT'] || '0')
                      };
                  } else {
                      groupedMap[key]['SL NHẬP'] += parseFloat(row['SL NHẬP'] || '0');
                      groupedMap[key]['SL XUẤT'] += parseFloat(row['SL XUẤT'] || '0');
                  }
              });

              return Object.values(groupedMap).map((row: any) => {
                  const nhap = row['SL NHẬP'];
                  const xuat = row['SL XUẤT'];
                  const ton = nhap - xuat;
                  return {
                      ...row,
                      'SL NHẬP': String(nhap),
                      'SL XUẤT': String(xuat),
                      'TỒN': String(ton)
                  };
              }).filter((row: any) => parseFloat(row['TỒN']) > 0);
            }
          });
          if (results && results[0] && results[0].result) {
            const dataResult = results[0].result;
            setInventoryData(dataResult);
            if (chrome.storage && chrome.storage.local) {
              chrome.storage.local.set({ 
                scrapedInventoryData: dataResult,
                lastSyncTime: new Date().toISOString()
              });
            } else {
              localStorage.setItem('scrapedInventoryData', JSON.stringify(dataResult));
            }
          }
        }
      } else {
        // Fallback for AI Studio Web Preview
        setTimeout(() => {
          const sampleData = [
            { 'KHOANG': 'A-02', 'KHÁCH': 'DCL', 'MÃ HÀNG': '341410-SS26', 'MODEL': '8787780', 'LOẠI': 'DÂY KÉO', 'TS / SIZE': '12CM', 'MÀU': '960', 'PO': 'PO-882218', 'SL NHẬP': '2000', 'SL XUẤT': '500', 'TỒN': '1500', 'ĐVT': 'Kg' },
            { 'KHOANG': 'A-03', 'KHÁCH': 'DCL', 'MÃ HÀNG': '341410-SS26', 'MODEL': '8787780', 'LOẠI': 'DÂY KÉO', 'TS / SIZE': '22CM', 'MÀU': 'V7834', 'PO': 'PO-882218', 'SL NHẬP': '1000', 'SL XUẤT': '150', 'TỒN': '850', 'ĐVT': 'Kg' },
            { 'KHOANG': 'B-12', 'KHÁCH': 'DCL', 'MÃ HÀNG': '341410-SS26', 'MODEL': '8408745', 'LOẠI': 'DÂY KÉO', 'TS / SIZE': '18CM', 'MÀU': 'VI385', 'PO': 'PO-882001', 'SL NHẬP': '320', 'SL XUẤT': '0', 'TỒN': '320', 'ĐVT': 'Kg' },
            { 'KHOANG': 'B-14', 'KHÁCH': 'DCL', 'MÃ HÀNG': '341410-SS26', 'MODEL': '8408745', 'LOẠI': 'DÂY KÉO PHẢI', 'TS / SIZE': '52.5CM', 'MÀU': '884', 'PO': 'PO-882190', 'SL NHẬP': '500', 'SL XUẤT': '100', 'TỒN': '400', 'ĐVT': 'Tấm' },
            { 'KHOANG': 'C-01', 'KHÁCH': 'DCL', 'MÃ HÀNG': '341410-SS26', 'MODEL': '8787779', 'LOẠI': 'DÂY KÉO SƯỜN ỐNG', 'TS / SIZE': '61 cm', 'MÀU': 'VI385', 'PO': 'PO-882250', 'SL NHẬP': '20', 'SL XUẤT': '0', 'TỒN': '20', 'ĐVT': 'Băng' }
          ];
          setInventoryData(sampleData);
          localStorage.setItem('scrapedInventoryData', JSON.stringify(sampleData));
          setIsScraping(false);
        }, 800);
      }
    } catch (error: any) {
      console.error(error);
      setIsScraping(false);
      alert("Lỗi kết nối trang kho: " + (error?.message || "Không thể lấy dữ liệu. Hãy đảm bảo bạn đã mở ứng dụng từ trang web Kho (ERP) và cấp quyền cho tab đó. Nếu là file://, hãy bật 'Allow access to file URLs' trong chrome://extensions/"));
    }
  };

  const availableModels = useMemo(() => {
    if (!selectedMaHang) return [];
    const models = activeBomData
      .filter(row => row.maHang === selectedMaHang)
      .map(row => row.moDel);
    return Array.from(new Set(models)).filter(Boolean).sort();
  }, [selectedMaHang, activeBomData]);

  const availableSizes = useMemo(() => {
    if (!selectedMaHang || selectedModels.length === 0) return [];
    
    const relevantRows = activeBomData.filter(
      row => row.maHang === selectedMaHang && selectedModels.includes(row.moDel)
    );

    const sizes = new Set<string>();
    relevantRows.forEach(row => {
      if (row.nhomSizeSP) {
        const parts = row.nhomSizeSP.split(/[\/,;]/);
        parts.forEach(p => {
          const cleaned = p.trim();
          if (cleaned) sizes.add(cleaned);
        });
      }
    });

    return Array.from(sizes).sort();
  }, [selectedMaHang, selectedModels, activeBomData]);

  const toggleModel = (model: string) => {
    setSelectedModels(prev => 
      prev.includes(model) 
        ? prev.filter(m => m !== model)
        : [...prev, model]
    );
  };

  const calculatedNeeds = useMemo(() => {
    const needs = new Map<string, { total: number, loai: string, sizeVT: string, mauVT: string }>();

    if (selectedModels.length > 0) {
      (Object.entries(sizeQuantities) as [string, number][]).forEach(([sizeSP, qty]) => {
        if (qty > 0) {
          const matchingRows = activeBomData.filter(row => 
            row.maHang === selectedMaHang &&
            selectedModels.includes(row.moDel) &&
            row.nhomSizeSP &&
            row.nhomSizeSP.split(/[\/,;]/).map(s => s.trim()).includes(sizeSP)
          );

          matchingRows.forEach(row => {
            const key = `${row.loai}___${row.sizeVT}___${row.mauVT}`;
            const required = qty * (row.dinhMuc || 0);

            if (needs.has(key)) {
              needs.get(key)!.total += required;
            } else {
              needs.set(key, {
                total: required,
                loai: row.loai,
                sizeVT: row.sizeVT,
                mauVT: row.mauVT
              });
            }
          });
        }
      });
    }

    return Array.from(needs.values()).sort((a, b) => a.loai.localeCompare(b.loai));
  }, [activeBomData, selectedMaHang, selectedModels, sizeQuantities]);

  const handleSizeChange = (size: string, val: string) => {
    const parsed = parseInt(val, 10);
    setSizeQuantities(prev => ({
      ...prev,
      [size]: isNaN(parsed) ? 0 : parsed
    }));
  };

  if (activeBomData.length === 0 && cloudMaHangs.length === 0 && bomData.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-white rounded-lg shadow-sm border border-slate-200 p-8">
        <Package className="w-12 h-12 mb-4 text-slate-300" />
        <p className="font-semibold text-slate-600">Master Data Trống</p>
        <p className="text-sm mt-1 text-slate-500">Vui lòng cập nhật Cơ sở dữ liệu BOM (hoặc kết nối Cloud) để sử dụng module Kế hoạch.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col xl:flex-row bg-slate-200 gap-px">
      
      {/* LEFT PANEL: Form Control */}
      <div className="w-full xl:w-[30%] shrink-0 bg-white flex flex-col h-full overflow-hidden">
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-sm text-slate-800 uppercase tracking-wide">Bộ Lọc Kế Hoạch</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* CLOUD CONNECT HEADER DROPDOWN (ONLY FOR REMOTE CONTROLLER MODE) */}
          {nodeMode === 'remote' && (
            <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-lg shadow-sm space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-800 uppercase tracking-wider">
                  <Radio className="w-4 h-4 text-indigo-600 animate-pulse" />
                  Kết nối Kho từ xa
                </span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-[10px] text-white font-bold tracking-widest uppercase">
                  Remote Controller
                </span>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Chọn máy trạm tại kho gốc:</label>
                <select
                  value={remoteWarehouseId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setRemoteWarehouseId(id);
                    localStorage.setItem('remoteWarehouseId', id);
                    // Dispatch event
                    document.dispatchEvent(new CustomEvent('CLOUD_CONFIG_UPDATED'));
                  }}
                  className="w-full border border-indigo-300 rounded-md py-1.5 px-2 text-xs font-semibold text-indigo-900 bg-white focus:outline-indigo-500 transition-all cursor-pointer"
                >
                  <option value="">-- Lựa chọn Máy Trạm --</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      📍 {w.name} ({w.id}) - {w.status === 'Online' ? 'Active' : 'Offline'}
                    </option>
                  ))}
                </select>
                {remoteWarehouseId && warehouses.find(w => w.id === remoteWarehouseId) && (
                  <p className="text-[10px] text-indigo-600 font-medium">
                    🟢 Máy Trạm đang kết nối. Đồng bộ kho hoàn tất.
                  </p>
                )}
                {warehouses.length === 0 && (
                  <p className="text-[10px] text-amber-600 font-semibold italic">
                    ⚠️ Chưa tìm thấy máy trạm kho hoạt động. Chờ đồng bộ...
                  </p>
                )}
              </div>
            </div>
          )}

          {/* CLOUD SUCCESS BANNER */}
          {cloudSuccessMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-medium leading-relaxed shadow-sm relative animate-in zoom-in-95 duration-200">
              <button onClick={() => setCloudSuccessMessage(null)} className="absolute top-1.5 right-1.5 text-emerald-400 hover:text-emerald-700 font-bold focus:outline-none">×</button>
              <p className="pr-4">🎉 {cloudSuccessMessage}</p>
            </div>
          )}

          {/* STEP 1 */}
          <div className="group">
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              <span className="w-4 h-4 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-[10px]">1</span>
              Mã Hàng (Style)
            </label>
            <div className="relative">
              <select 
                value={selectedMaHang}
                onChange={(e) => {
                  setSelectedMaHang(e.target.value);
                  setSelectedModels([]);
                  setSizeQuantities({});
                }}
                className="w-full border border-slate-300 rounded-md py-2 px-3 text-sm text-slate-700 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="">-- Lựa chọn --</option>
                {maHangOptions.map(ma => (
                  <option key={ma} value={ma}>{ma}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-400">
                <ChevronRight className="w-4 h-4 rotate-90" />
              </div>
            </div>
          </div>

          {/* STEP 2 */}
          {selectedMaHang && availableModels.length > 0 && (
            <div className="group animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                <span className="w-4 h-4 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-[10px]">2</span>
                Model P.O
              </label>
              
              <div className="relative mb-3">
                <select 
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val && !selectedModels.includes(val)) {
                      toggleModel(val);
                    }
                    e.target.value = "";
                  }}
                  className="w-full border border-slate-300 rounded-md py-2 px-3 text-sm text-slate-700 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="">-- Chọn Model P.O để hiển thị --</option>
                  {availableModels.filter(m => !selectedModels.includes(m)).map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-400">
                  <ChevronRight className="w-4 h-4 rotate-90" />
                </div>
              </div>

              {selectedModels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-3 bg-slate-50 border border-slate-200 rounded-md">
                  {selectedModels.map(model => (
                    <div
                      key={model}
                      className="px-3 py-1.5 text-[13px] rounded-md transition-all border bg-blue-50 border-blue-200 text-blue-700 shadow-xs font-medium flex items-center gap-2"
                    >
                      <span>{model}</span>
                      <button onClick={() => toggleModel(model)} className="text-blue-500 hover:text-blue-800 focus:outline-none p-0.5 rounded cursor-pointer">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 3 */}
          {selectedModels.length > 0 && (
            <div className="group animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                <span className="w-4 h-4 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-[10px]">3</span>
                Tổ Đợt
              </label>
              <div className="space-y-3 p-3 bg-indigo-50/20 border border-slate-200 rounded-lg">
                {selectedModels.map(model => (
                  <div key={model} className="p-2.5 bg-white border border-slate-200 rounded-lg shadow-xs flex flex-col gap-2">
                    <span className="text-xs font-bold text-slate-700 font-mono bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded mr-auto">
                      Model: {model}
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Tổ phụ trách</label>
                        <select
                          value={modelTeams[model] || ''}
                          onChange={(e) => setModelTeams(prev => ({ ...prev, [model]: e.target.value }))}
                          className="w-full text-xs font-semibold text-slate-750 p-1.5 border border-slate-200 rounded outline-none focus:border-indigo-500 cursor-pointer bg-slate-50"
                        >
                          <option value="">-- Chọn tổ --</option>
                          {availableTeams.map(t => (
                            <option key={t.id} value={t.name}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Đợt sản xuất</label>
                        <select
                          value={modelBatches[model] || ''}
                          onChange={(e) => setModelBatches(prev => ({ ...prev, [model]: e.target.value }))}
                          className="w-full text-xs font-semibold text-slate-750 p-1.5 border border-slate-200 rounded outline-none focus:border-indigo-500 cursor-pointer bg-slate-50"
                        >
                          <option value="">-- Chọn đợt --</option>
                          {availableBatches.map(b => (
                            <option key={b.id} value={b.name}>{b.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4 */}
          {selectedModels.length > 0 && availableSizes.length > 0 && (
            <div className="group animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                <span className="w-4 h-4 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-[10px]">4</span>
                Sản lượng SX (Từng Size)
              </label>

              <div className="relative mb-3">
                <select 
                  onChange={(e) => {
                    const size = e.target.value;
                    if (size && sizeQuantities[size] === undefined) {
                      setSizeQuantities(prev => ({...prev, [size]: 0}));
                    }
                    e.target.value = "";
                  }}
                  className="w-full border border-slate-300 rounded-md py-2 px-3 text-sm text-slate-700 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="">-- Chọn Size để hiển thị --</option>
                  {availableSizes.filter(s => sizeQuantities[s] === undefined).map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-400">
                  <ChevronRight className="w-4 h-4 rotate-90" />
                </div>
              </div>
              
              {Object.keys(sizeQuantities).length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {availableSizes.filter(s => sizeQuantities[s] !== undefined).map(size => (
                    <div key={size} className="flex items-center bg-white border border-slate-200 rounded-md overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all shadow-sm">
                      <span className="px-2 py-1.5 bg-slate-100 text-[11px] font-bold text-slate-600 border-r border-slate-200 min-w-[65px] text-center uppercase relative flex items-center justify-between">
                        <span className="truncate flex-1 text-left">{size}</span>
                        <button 
                          onClick={() => {
                            const newQ = {...sizeQuantities};
                            delete newQ[size];
                            setSizeQuantities(newQ);
                          }}
                          className="text-slate-400 hover:text-red-500 ml-1 cursor-pointer focus:outline-none"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                      <input 
                        type="number"
                        min="0"
                        placeholder="SL..."
                        value={sizeQuantities[size] || ''}
                        onChange={(e) => handleSizeChange(size, e.target.value)}
                        className="flex-1 w-full py-1.5 px-2 text-sm font-semibold text-slate-800 outline-none"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Action Bottom - Tổng hợp số lượng */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 shrink-0 flex items-center justify-between">
           <span className="text-sm font-semibold text-slate-600">Tổng sản lượng (KHSX):</span>
           <span className="text-lg font-bold text-blue-600">
             {(Object.values(sizeQuantities) as number[]).reduce((acc: number, curr: number) => acc + (curr || 0), 0).toLocaleString('en-US')}
           </span>
        </div>
      </div>

      {/* RIGHT PANEL: Result Tables (Needs & Inventory) */}
      <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
        
        {/* 1. Yêu cầu vật tư */}
        <div className="flex-1 flex flex-col min-h-[250px] overflow-hidden">
          <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <h3 className="font-semibold text-sm text-slate-800 uppercase tracking-wide">Nhu Cầu Phụ Liệu (Theo Định Mức)</h3>
            </div>
            
            <div className="flex items-center gap-3">
              {calculatedNeeds.length > 0 && (
                <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md">
                  Tổng mã: {calculatedNeeds.length}
                </span>
              )}

              {calculatedNeeds.length > 0 && (
                <button 
                  onClick={() => {
                    const dispatchData: any[] = [];
                    const fifoSuggestions: [string, any][] = [];
                    const inventoryItems = [...inventoryData.map(item => ({...item}))];
                
                    calculatedNeeds.forEach(need => {
                      let remainingNeed = need.total;
                      const needKey = `${need.loai.trim().toLowerCase()}___${need.sizeVT.trim().toLowerCase()}___${need.mauVT.trim().toLowerCase()}`;
                      
                      const matchingItems = inventoryItems.filter(item => {
                        const itemKey = `${(item['LOẠI'] || '').trim().toLowerCase()}___${(item['TS / SIZE'] || '').trim().toLowerCase()}___${(item['MÀU'] || '').trim().toLowerCase()}`;
                        return itemKey === needKey && parseFloat(item['TỒN'] || '0') > 0 && item['MÃ HÀNG'] === selectedMaHang;
                      });
                
                      const itemSuggestions = [];
                      for (const item of matchingItems) {
                        if (remainingNeed <= 0) break;
                        const ton = parseFloat(item['TỒN'] || '0');
                        const qty = Math.min(remainingNeed, ton);
                        if (qty > 0) {
                          const exportItem = { 
                            ...item, 
                            xuatQty: Math.ceil(qty),
                            ton: ton,
                            MODEL: item.MODEL || selectedModels[0] || '',
                          };
                          itemSuggestions.push({ uniqueId: JSON.stringify(item), suggestedQty: qty, availableQty: ton, po: item['PO'] });
                          dispatchData.push(exportItem);
                          item['TỒN'] = (ton - qty).toString();
                          remainingNeed -= qty;
                        }
                      }
                      
                      fifoSuggestions.push([needKey, {
                        needInfo: { loai: need.loai, sizeVT: need.sizeVT, mau: need.mauVT },
                        totalNeed: need.total,
                        remainingAfterSuggestion: remainingNeed,
                        suggestions: itemSuggestions
                      }]);
                    });
                
                    if (calculatedNeeds.length === 0) {
                        alert("Vui lòng nhập sản lượng SX (KHSX) trước khi tạo lệnh.");
                        return;
                    }
                
                    const khsxData = (Object.entries(sizeQuantities) as [string, number][])
                      .filter(([_, qty]) => qty > 0)
                      .map(([size, qty]) => ({ size, soLuong: qty }));
                
                    const dispatchInfo: Record<string, any> = {};
                    selectedModels.forEach(m => {
                        dispatchInfo[m] = { 
                          to: modelTeams[m] || (availableTeams[0]?.name || 'Tổ 1'), 
                          dot: modelBatches[m] || (availableBatches[0]?.name || 'Đợt 1') 
                        }; 
                    });
                
                    const detailedNeedsData = {
                        models: selectedModels,
                        needs: calculatedNeeds.map(n => ({...n, mau: n.mauVT})),
                        maHang: selectedMaHang
                    };

                    const historyItem = {
                        id: Date.now().toString(),
                        createdAt: new Date().toISOString(),
                        maHang: selectedMaHang,
                        models: selectedModels,
                        khsxData,
                        dispatchInfo,
                        dispatchData,
                        detailedNeedsData,
                        fifoSuggestions
                    };

                    try {
                        const existingHistory = JSON.parse(localStorage.getItem('exportHistory') || '[]');
                        localStorage.setItem('exportHistory', JSON.stringify([historyItem, ...existingHistory]));
                    } catch (e) {
                        console.error('Failed to save to history', e);
                    }
                
                    // If in Remote controller mode, push dispatch to Cloud (Firestore)
                    if (nodeMode === 'remote') {
                        if (!remoteWarehouseId) {
                            alert("Vui lòng chọn một Máy Trạm Kho tại cột Kết nối Kho từ xa ở bên trái.");
                            return;
                        }
                        
                        const cloudPayload = {
                            maHang: selectedMaHang,
                            models: selectedModels,
                            khsxData,
                            dispatchInfo,
                            dispatchData,
                            detailedNeedsData,
                            fifoSuggestions,
                            targetDeviceId: remoteWarehouseId,
                            createdBy: localStorage.getItem('deviceName') || 'Bộ điều khiển từ xa'
                        };
                        
                        setSyncingCloud(true);
                        sendRemoteDispatch(cloudPayload)
                            .then(() => {
                                setCloudSuccessMessage(`Đã truyền và gửi Lệnh Xuất thành công đến Máy Trạm Kho: "${warehouses.find(w => w.id === remoteWarehouseId)?.name || remoteWarehouseId}"!`);
                                setTimeout(() => setCloudSuccessMessage(null), 8500);
                            })
                            .catch(err => {
                                console.error("Lỗi khi gửi lệnh từ xa:", err);
                                alert("Gặp lỗi khi gửi lệnh cloud: " + err.message);
                            })
                            .finally(() => setSyncingCloud(false));
                    }

                    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                        chrome.storage.local.set({
                            dispatchData,
                            detailedNeedsData,
                            khsxData,
                            fifoSuggestions,
                            dispatchInfo
                        }, () => {
                             const url = chrome.runtime.getURL('lenhxuat.html');
                             chrome.tabs.create({ url });
                        });
                    } else {
                        try {
                            localStorage.setItem('dispatchData', JSON.stringify(dispatchData));
                            localStorage.setItem('detailedNeedsData', JSON.stringify(detailedNeedsData));
                            localStorage.setItem('khsxData', JSON.stringify(khsxData));
                            localStorage.setItem('fifoSuggestions', JSON.stringify(fifoSuggestions));
                            localStorage.setItem('dispatchInfo', JSON.stringify(dispatchInfo));
                            window.open('/lenhxuat.html', '_blank');
                        } catch (err) {
                            console.error("Lỗi khi lưu và mở trang:", err);
                        }
                    }
                  }}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold rounded-md shadow-sm transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  disabled={syncingCloud}
                >
                  {syncingCloud ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {nodeMode === 'remote' ? 'Gửi Lệnh Từ Xa' : 'Tạo Lệnh Xuất Kho'}
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-white">
            {calculatedNeeds.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mb-3">
                  <Calculator className="w-6 h-6 text-slate-300" />
                </div>
                <p className="text-sm">Chưa có kết quả. Vui lòng nhập thông tin bên trái.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-4 py-2.5 font-bold text-xs text-slate-600 uppercase tracking-wider border-b border-slate-200">#</th>
                    <th className="px-4 py-2.5 font-bold text-xs text-slate-600 uppercase tracking-wider border-b border-slate-200">Mã Phụ liệu</th>
                    <th className="px-4 py-2.5 font-bold text-xs text-slate-600 uppercase tracking-wider border-b border-slate-200">Đặc tính kỹ thuật (Size)</th>
                    <th className="px-4 py-2.5 font-bold text-xs text-slate-600 uppercase tracking-wider border-b border-slate-200">Màu sắc</th>
                    <th className="px-4 py-2.5 font-bold text-xs text-slate-600 uppercase tracking-wider border-b border-slate-200 text-right w-32">Nhu cầu (Qty)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {calculatedNeeds.map((need, i) => (
                    <tr key={i} className="hover:bg-blue-50/50 transition-colors group">
                      <td className="px-4 py-2 text-xs text-slate-400 font-mono">{String(i + 1).padStart(2, '0')}</td>
                      <td className="px-4 py-2 text-[13px] font-medium text-slate-800">{need.loai}</td>
                      <td className="px-4 py-2 text-[13px] text-slate-600">{need.sizeVT}</td>
                      <td className="px-4 py-2 text-[13px] text-slate-600"><span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-700">{need.mauVT}</span></td>
                      <td className="px-4 py-2 text-[13px] text-right">
                        <span className="font-bold text-rose-600 tabular-nums bg-rose-50 px-2 py-1 rounded">
                          {Math.ceil(need.total).toLocaleString('en-US')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
