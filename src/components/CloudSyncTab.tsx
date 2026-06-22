import { useState, useEffect } from 'react';
import { 
  Cloud, Laptop, Radio, Download, Key, RefreshCw, CheckCircle2, 
  Activity, Settings, Send, FileSpreadsheet, Layers, Info, Trash2, 
  Database, HelpCircle, ArrowRight, Play, Server, Clock, ShieldCheck
} from 'lucide-react';
import { 
  db, 
  listenToWarehousesCloud, 
  getWarehousesFromCloud, 
  listenToRemoteDispatches, 
  updateDispatchStatus, 
  deleteRemoteDispatch, 
  syncInventoryToCloud, 
  syncBomToCloud,
  getAllBomsFromCloud,
  Warehouse, 
  RemoteDispatch 
} from '../lib/firebase';
import { collection, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';

export function CloudSyncTab() {
  const [nodeMode, setNodeMode] = useState<'warehouse' | 'remote'>('warehouse');
  const [deviceId, setDeviceId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [remoteWarehouseId, setRemoteWarehouseId] = useState('');
  
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [activeDispatches, setActiveDispatches] = useState<RemoteDispatch[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  const [localBomCount, setLocalBomCount] = useState(0);
  const [cloudBomCodes, setCloudBomCodes] = useState<string[]>([]);
  const [isSyncingBom, setIsSyncingBom] = useState(false);

  // Generate or load device configuration
  useEffect(() => {
    let mode = localStorage.getItem('nodeMode') as 'warehouse' | 'remote';
    if (!mode) {
      mode = 'warehouse';
      localStorage.setItem('nodeMode', 'warehouse');
    }
    setNodeMode(mode);

    let devId = localStorage.getItem('deviceId');
    if (!devId) {
      devId = 'STATION-' + Math.floor(1000 + Math.random() * 9000);
      localStorage.setItem('deviceId', devId);
    }
    setDeviceId(devId);

    let devName = localStorage.getItem('deviceName');
    if (!devName) {
      devName = 'Máy Trạm Kho ' + devId.split('-')[1];
      localStorage.setItem('deviceName', devName);
    }
    setDeviceName(devName);

    const remWhId = localStorage.getItem('remoteWarehouseId') || '';
    setRemoteWarehouseId(remWhId);
  }, []);

  // Listen to connected warehouses on Firestore
  useEffect(() => {
    const unsubscribe = listenToWarehousesCloud((list) => {
      setWarehouses(list);
    });
    return () => unsubscribe();
  }, []);

  // Listen to active remote dispatches targeting this device
  useEffect(() => {
    if (nodeMode === 'warehouse' && deviceId) {
      const unsubscribe = listenToRemoteDispatches(deviceId, (dispatches) => {
        setActiveDispatches(dispatches);
      });
      return () => unsubscribe();
    } else if (nodeMode === 'remote') {
      const unsubscribe = listenToRemoteDispatches('', (dispatches) => {
        setActiveDispatches(dispatches);
      });
      return () => unsubscribe();
    }
  }, [nodeMode, deviceId]);

  // Load local & cloud BOM stats
  useEffect(() => {
    // Local count
    const updateLocalCount = () => {
      try {
        const localSaved = localStorage.getItem('bomData');
        if (localSaved) {
          setLocalBomCount(JSON.parse(localSaved).length);
        } else {
          setLocalBomCount(0);
        }
      } catch (e) {}
    };

    updateLocalCount();
    window.addEventListener('storage', updateLocalCount);

    // Cloud count
    const fetchCloudBoms = async () => {
      try {
        const colRef = collection(db, 'bom_definitions');
        const snapshot = await getDocs(colRef);
        const codes: string[] = [];
        snapshot.forEach(doc => {
          codes.push(doc.id);
        });
        setCloudBomCodes(codes);
      } catch (err) {
        console.error("CloudSyncTab: Error fetching cloud BOM list", err);
      }
    };

    fetchCloudBoms();

    return () => window.removeEventListener('storage', updateLocalCount);
  }, []);

  const handleDownloadBoms = async () => {
    setIsSyncingBom(true);
    setSyncStatusMsg("⬇️ Đang tải toàn bộ dữ liệu Định mức (BOM) từ Đám mây về máy này...");
    try {
      const cloudBoms = await getAllBomsFromCloud();
      if (cloudBoms && cloudBoms.length > 0) {
        localStorage.setItem('bomData', JSON.stringify(cloudBoms));
        setLocalBomCount(cloudBoms.length);
        
        // Notify other tabs
        window.dispatchEvent(new Event('storage'));
        document.dispatchEvent(new CustomEvent('CLOUD_CONFIG_UPDATED'));
        
        setSyncStatusMsg(`🟢 Đã đồng bộ thành công ${cloudBoms.length} dòng định mức (BOM) về máy này!`);
      } else {
        setSyncStatusMsg("⚠️ Đám mây hiện chưa có dữ liệu BOM nào.");
      }
      setTimeout(() => setSyncStatusMsg(null), 5000);
    } catch (err: any) {
      alert("Lỗi tải dữ liệu BOM: " + err.message);
    } finally {
      setIsSyncingBom(false);
    }
  };

  const handleUploadBoms = async () => {
    setIsSyncingBom(true);
    setSyncStatusMsg("⬆️ Đang tải dữ liệu Định mức (BOM) của máy này lên Đám mây...");
    try {
      const localSaved = localStorage.getItem('bomData');
      if (!localSaved) {
        throw new Error("Không tìm thấy dữ liệu BOM cục bộ để đồng bộ.");
      }
      const data = JSON.parse(localSaved);
      if (data.length === 0) {
        throw new Error("Dữ liệu BOM cục bộ trống.");
      }

      // Group by maHang
      const groups: Record<string, any[]> = {};
      data.forEach((row: any) => {
        if (!row.maHang) return;
        const key = row.maHang.trim();
        if (!groups[key]) groups[key] = [];
        groups[key].push(row);
      });

      const promises = Object.entries(groups).map(([maHang, rows]) => {
        return syncBomToCloud(maHang, rows);
      });
      await Promise.all(promises);

      // Refresh cloud list
      setCloudBomCodes(Object.keys(groups));
      
      // Notify other tabs
      document.dispatchEvent(new CustomEvent('CLOUD_CONFIG_UPDATED'));

      setSyncStatusMsg(`🟢 Đã đưa ${data.length} dòng BOM (${Object.keys(groups).length} mã hàng) lên Đám mây thành công!`);
      setTimeout(() => setSyncStatusMsg(null), 5000);
    } catch (err: any) {
      alert("Lỗi đồng bộ BOM lên Đám mây: " + err.message);
    } finally {
      setIsSyncingBom(false);
    }
  };

  const handleSaveConfigs = () => {
    localStorage.setItem('nodeMode', nodeMode);
    localStorage.setItem('deviceId', deviceId.trim().toUpperCase());
    localStorage.setItem('deviceName', deviceName.trim());
    localStorage.setItem('remoteWarehouseId', remoteWarehouseId);

    // Dispatch custom event to notify Planning and Inventory tabs to refresh config states
    document.dispatchEvent(new CustomEvent('CLOUD_CONFIG_UPDATED'));

    // Trigger an active test ping to Firestore if Warehouse mode
    if (nodeMode === 'warehouse') {
      let scrapedLocal: any[] = [];
      try {
        const saved = localStorage.getItem('scrapedInventoryData');
        if (saved) scrapedLocal = JSON.parse(saved);
      } catch(e){}

      setIsRefreshing(true);
      syncInventoryToCloud(deviceId.trim().toUpperCase(), deviceName.trim(), scrapedLocal)
        .then(() => {
          setSyncStatusMsg("🟢 Đã lưu cấu hình & Đồng bộ Trực tuyến thành công lên Đám mây!");
          setTimeout(() => setSyncStatusMsg(null), 5000);
        })
        .catch((err) => {
          alert("Lỗi khi kết nối Firestore: " + err.message);
        })
        .finally(() => setIsRefreshing(false));
    } else {
      setSyncStatusMsg("🔵 Đã chuyển sang vai trò Bộ Điều Khiển Từ Xa.");
      setTimeout(() => setSyncStatusMsg(null), 5000);
    }
  };

  const handleTestBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      console.warn("AudioContext block", e);
    }
  };

  const executeDispatchLocally = async (dispatch: RemoteDispatch) => {
    setSyncStatusMsg(`⚡ Đang chuẩn bị xuất dữ liệu lệnh: ${dispatch.maHang}...`);
    try {
      // Save full dispatch specifications to local/chrome storage
      const resultPayload = {
        dispatchData: dispatch.dispatchData || [],
        detailedNeedsData: dispatch.detailedNeedsData || {},
        khsxData: dispatch.khsxData || [],
        fifoSuggestions: dispatch.fifoSuggestions || [],
        dispatchInfo: dispatch.dispatchInfo || {}
      };

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(resultPayload, () => {
          updateDispatchStatus(dispatch.id, 'Completed')
            .then(() => {
              window.open('/lenhxuat.html', '_blank');
              setSyncStatusMsg(null);
            });
        });
      } else {
        localStorage.setItem('dispatchData', JSON.stringify(resultPayload.dispatchData));
        localStorage.setItem('detailedNeedsData', JSON.stringify(resultPayload.detailedNeedsData));
        localStorage.setItem('khsxData', JSON.stringify(resultPayload.khsxData));
        localStorage.setItem('fifoSuggestions', JSON.stringify(resultPayload.fifoSuggestions));
        localStorage.setItem('dispatchInfo', JSON.stringify(resultPayload.dispatchInfo));

        await updateDispatchStatus(dispatch.id, 'Completed');
        window.open('/lenhxuat.html', '_blank');
        setSyncStatusMsg(null);
      }
    } catch (err: any) {
      alert("Lỗi khi mở lệnh: " + err.message);
    }
  };

  const clearWarehouseNode = async (id: string) => {
    if (confirm(`Bạn có chắc chắn muốn xóa máy trạm "${id}" khỏi đám mây?`)) {
      try {
        await deleteDoc(doc(db, 'warehouses', id));
      } catch(e: any){
        alert("Lỗi: " + e.message);
      }
    }
  };

  const deleteDispatchLog = async (id: string) => {
    if (confirm("Xóa dòng lịch sử lệnh truyền tải này?")) {
      try {
        await deleteRemoteDispatch(id);
      } catch(e: any){
        alert("Lỗi: " + e.message);
      }
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Overview Card */}
      <div className="bg-slate-900 text-white rounded-xl shadow-lg p-6 border border-slate-800 relative overflow-hidden">
        <div className="absolute right-0 top-0 -mr-6 -mt-6 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute right-12 bottom-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl"></div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 z-10 relative">
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold uppercase tracking-wider">
              <Cloud className="w-3.5 h-3.5" /> Synchronized Cloud Portal
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Hệ thống Điều khiển & Đồng bộ Đám mây (Firebase Cloud)</h1>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              Giải pháp kết nối máy trạm kho vật tư (Warehouse Station) với thiết bị quản lý từ xa (Remote Controller) thông qua Google Firebase. 
              Cào tồn kho thời gian thực, đồng bộ BOM định mức và truyền lệnh xuất kho tức thì không độ trễ.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleTestBeep}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors"
              title="Kiểm tra âm thanh cảnh báo"
            >
              🔊 Test Sound Pinl
            </button>
          </div>
        </div>
      </div>

      {syncStatusMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800 font-medium shadow-sm animate-in zoom-in-95 leading-relaxed">
          🎉 {syncStatusMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* CONFIG COLUMN */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-5">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 pb-3 border-b border-slate-100">
              <Settings className="w-4 h-4 text-blue-500" />
              Thiết lập Vai trò Kết nối
            </h2>

            {/* Sub Mode Toggle */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Chọn chế độ hoạt động máy này:</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setNodeMode('warehouse')}
                  className={`flex flex-col items-center justify-center p-3.5 rounded-lg border text-center transition-all cursor-pointer ${
                    nodeMode === 'warehouse' 
                      ? 'border-blue-500 bg-blue-50/50 text-blue-700 font-bold' 
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Laptop className={`w-6 h-6 mb-1 ${nodeMode === 'warehouse' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className="text-xs">🖥️ Máy Trạm Kho</span>
                  <span className="text-[10px] text-slate-400 font-normal mt-0.5">Đặt tại kho chứa</span>
                </button>

                <button
                  type="button"
                  onClick={() => setNodeMode('remote')}
                  className={`flex flex-col items-center justify-center p-3.5 rounded-lg border text-center transition-all cursor-pointer ${
                    nodeMode === 'remote' 
                      ? 'border-indigo-500 bg-indigo-50/50 text-indigo-700 font-bold' 
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Radio className={`w-6 h-6 mb-1 ${nodeMode === 'remote' ? 'text-indigo-600 animate-pulse' : 'text-slate-400'}`} />
                  <span className="text-xs">📡 Bộ Điều Khiển</span>
                  <span className="text-[10px] text-slate-400 font-normal mt-0.5">Văn phòng / Quản lý</span>
                </button>
              </div>
            </div>

            {/* Warehouse Inputs */}
            {nodeMode === 'warehouse' ? (
              <div className="space-y-3 p-3 bg-blue-50/30 border border-blue-100 rounded-lg">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-blue-600 uppercase tracking-widest flex items-center justify-between">
                    <span>MÃ LIÊN KẾT MÁY TRẠM (Device ID):</span>
                    <span className="text-slate-400 font-mono">(Tự động phát sinh)</span>
                  </label>
                  <input
                    type="text"
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value.toUpperCase())}
                    className="w-full text-xs font-mono font-bold bg-white border border-slate-300 rounded px-2.5 py-1.5 focus:outline-blue-500"
                    placeholder="E.g., STATION-102"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">TÊN GỢI NHỚ MÁY TRẠM KHO:</label>
                  <input
                    type="text"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    className="w-full text-xs font-semibold bg-white border border-slate-300 rounded px-2.5 py-1.5 focus:outline-blue-500"
                    placeholder="E.g., Kho Phụ Liệu Tầng Trệt - Máy trạm số 1"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3 p-3 bg-indigo-50/30 border border-indigo-100 rounded-lg">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">
                    CHỌN MÁY TRẠM KHO ĐỂ ĐIỀU KHIỂN & THEO DÕI:
                  </label>
                  <select
                    value={remoteWarehouseId}
                    onChange={(e) => setRemoteWarehouseId(e.target.value)}
                    className="w-full text-xs font-semibold bg-white border border-slate-300 rounded px-2.5 py-1.5 focus:outline-indigo-500 cursor-pointer"
                  >
                    <option value="">-- Lựa chọn Máy Trạm Kho hoạt động --</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>
                        📍 {w.name} ({w.id}) - {w.status === 'Online' ? 'Active' : 'Offline'}
                      </option>
                    ))}
                  </select>
                  {warehouses.length === 0 && (
                    <p className="text-[10px] text-amber-600 italic font-medium mt-1">
                      ⚠️ Chưa có máy trạm kho nào kết nối Cloud. Hãy thiết đặt máy trạm và nhấn Đồng bộ trước.
                    </p>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={handleSaveConfigs}
              disabled={isRefreshing}
              className={`w-full py-2 ${
                nodeMode === 'remote' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-blue-600 hover:bg-blue-700'
              } text-white text-xs font-bold rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50`}
            >
              {isRefreshing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              Áp dụng & Lưu cấu hình
            </button>
          </div>

          {/* SYSTEM NETWORK LOGS */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
              <Activity className="w-4 h-4 text-emerald-500" />
              Bản đồ trạm kết nối đám mây
            </h2>
            
            {warehouses.length === 0 ? (
              <div className="py-4 text-center text-slate-400 text-xs">
                Chưa tìm thấy Máy Trạm Kho nào đăng ký trên Firestore.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto pr-1">
                {warehouses.map((w) => (
                  <div key={w.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div>
                      <p className="font-bold text-slate-700 flex items-center gap-1">
                        <Server className="w-3.5 h-3.5 text-slate-400" />
                        {w.name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">ID: {w.id} • Tồn: {w.scrapedInventoryData?.length || 0} dòng</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full ${
                        w.status === 'Online' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        Active
                      </span>
                      <button 
                        onClick={() => clearWarehouseNode(w.id)}
                        className="p-1 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-colors"
                        title="Hủy đăng ký trạm"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CLOUD BOM SYNC HUB */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
              <FileSpreadsheet className="w-4 h-4 text-indigo-500" />
              Đồng bộ Định mức (BOM DB)
            </h2>
            
            <div className="space-y-3.5 text-xs">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-150 space-y-2">
                <div className="flex justify-between items-center text-slate-600">
                  <span>BOM cục bộ máy này:</span>
                  <span className="font-bold text-slate-800 bg-white border border-slate-200 px-2 py-0.5 rounded font-mono">{localBomCount} dòng</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Số mã hàng trên Đám mây:</span>
                  <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded font-mono">{cloudBomCodes.length} mã</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadBoms}
                  disabled={isSyncingBom}
                  className="py-2.5 px-3 border border-indigo-300 text-indigo-700 hover:bg-indigo-50 font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                  title="Tải toàn bộ định mức từ đám mây về lưu ở máy này"
                >
                  <Download className="w-3.5 h-3.5" />
                  Tải BOM xuống
                </button>
                <button
                  type="button"
                  onClick={handleUploadBoms}
                  disabled={isSyncingBom || localBomCount === 0}
                  className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                  title="Đẩy dữ liệu định mức hiện tại của máy này lên đám mây"
                >
                  <Send className="w-3.5 h-3.5" />
                  Đẩy BOM lên
                </button>
              </div>

              {cloudBomCodes.length > 0 && (
                <div className="pt-2 text-slate-500">
                  <p className="font-bold text-[10px] text-slate-400 uppercase tracking-widest mb-1.5">Danh sách mã hàng đang lưu đám mây:</p>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-slate-50 rounded border border-slate-100">
                    {cloudBomCodes.map(code => (
                      <span key={code} className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono font-medium text-slate-700 shadow-sm">{code}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CLOUD QUEUE / DISPATCHES TRACKER */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Send className="w-4 h-4 text-indigo-500" />
                {nodeMode === 'warehouse' ? `Hàng chờ lệnh gửi đến Máy này (${deviceId})` : 'Toàn bộ Lệnh điều phối Cloud'}
              </h2>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">
                {activeDispatches.length} Lệnh
              </span>
            </div>

            {activeDispatches.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-2">
                <Clock className="w-8 h-8 text-slate-300" />
                <p className="font-medium text-slate-500">Chưa nhận được lệnh truyền tải nào.</p>
                <p className="text-[11px] text-slate-400/90 leading-relaxed max-w-sm">
                  {nodeMode === 'warehouse' 
                    ? 'Khi Quản lý từ xa tạo và truyền lệnh xuất, lệnh đó sẽ nhảy trực tiếp tại đây theo thời gian thực và kích hoạt âm thanh cảnh báo.'
                    : 'Hãy vào trang "Tính nhu cầu" để lên mẫu, gán Tổ & Đợt và truyền Lệnh xuất cho máy trạm kho.'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-3.5 max-h-[460px] overflow-y-auto pr-1">
                {activeDispatches.map((dispatch) => (
                  <div 
                    key={dispatch.id} 
                    className={`border rounded-lg p-4 transition-all relative ${
                      dispatch.status === 'Pending' 
                        ? 'border-indigo-200 bg-indigo-50/20 shadow-sm shadow-indigo-100' 
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800">
                            Mã Hàng: <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[11px] font-semibold">{dispatch.maHang}</span>
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                            dispatch.status === 'Pending' 
                              ? 'bg-rose-100 text-rose-700 border border-rose-200 animate-pulse' 
                              : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          }`}>
                            {dispatch.status === 'Pending' ? 'ƯU TIÊN - CHƯA IN' : 'ĐÃ ĐƯỢC IN'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          📡 Tạo bởi: <span className="font-semibold text-slate-600">{dispatch.createdBy}</span> • {new Date(dispatch.createdAt).toLocaleString('vi-VN')}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-2 font-medium">
                          Models: {dispatch.models?.join(', ')}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-1.5 shrink-0">
                        {nodeMode === 'warehouse' && dispatch.status === 'Pending' && (
                          <button
                            onClick={() => executeDispatchLocally(dispatch)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-1.5 px-3 rounded shadow flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            Mở & In Lệnh
                          </button>
                        )}
                        {dispatch.status === 'Completed' && (
                          <button
                            onClick={() => {
                              // We can still print completed dispatches
                              executeDispatchLocally(dispatch);
                            }}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-1.5 px-2.5 rounded border border-slate-200 cursor-pointer transition-colors"
                          >
                            In lại
                          </button>
                        )}
                        <button
                          onClick={() => deleteDispatchLog(dispatch.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                          title="Xóa log lệnh"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* INSTRUCTION MANUAL */}
          <div className="bg-slate-900 text-slate-300 rounded-xl shadow-sm border border-slate-800 p-5 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2 pb-2.5 border-b border-slate-800">
              <HelpCircle className="w-4 h-4 text-emerald-400" />
              Hướng dẫn liên kết Extension & Host GitHub riêng biệt
            </h2>

            <div className="space-y-3.5 text-xs text-slate-300 leading-relaxed">
              <div className="space-y-1">
                <p className="font-bold text-slate-100">1. Cách tải Extension vật tư và cài đặt cục bộ:</p>
                <p>
                  Nhấn vào nút Settings ở góc dưới trình duyệt hoặc xuất ZIP mã nguồn của dự án này. 
                  Mở trình duyệt Chrome của máy tính tại kho → truy cập <code className="bg-slate-800 text-emerald-400 px-1 rounded font-mono">chrome://extensions/</code> → Bật nút <span className="text-white font-semibold">"Developer mode"</span> (Góc trên bên phải) → Nhấn <span className="text-white font-semibold">"Load unpacked"</span> và chọn thư mục chứa tệp <code className="bg-slate-800 text-emerald-400 px-1 rounded font-mono">manifest.json</code> của dự án này.
                </p>
              </div>

              <div className="space-y-1">
                <p className="font-bold text-slate-100">2. Xuất bản lên GitHub Hosting cá nhân (Miễn phí):</p>
                <p>
                  Để tạo web app riêng hoạt động độc lập và hiển thị lệnh từ xa cho mọi người truy cập:
                </p>
                <ul className="list-decimal space-y-1.5 pl-4 text-slate-400">
                  <li>Tạo một kho lưu trữ (Repository) mới trên GitHub.</li>
                  <li>Sử dụng lệnh git hoặc công cụ mã của AI Studio để Export code sang GitHub.</li>
                  <li>Cài đặt dịch vụ deploy như <span className="text-white font-semibold">GitHub Pages</span> hoặc <span className="text-white font-semibold">Vercel / Netlify</span> trỏ trực tiếp vào repository mới để có link Web App cá nhân trực tuyến 24/7 tuyệt đẹp.</li>
                </ul>
              </div>

              <div className="space-y-1 pt-1 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 animate-pulse" />
                  Firebase DB: ai-studio-c65333fd-043d-4cce-b990-a985158ab910
                </span>
                <span>Version 4.10.9 (Cloud Activated)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
