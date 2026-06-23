/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LayoutDashboard, History, FileSpreadsheet, Settings, Bell, Search, UserCircle, Menu, Package2, Layers, Users, Cloud, RefreshCw, XCircle, BarChart3 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { BomManagement, BomRow } from './components/BomManagement';
import { PlanningTab } from './components/PlanningTab';
import { InventoryTab } from './components/InventoryTab';
import { TeamsTab } from './components/TeamsTab';
import { HistoryTab } from './components/HistoryTab';
import { CloudSyncTab } from './components/CloudSyncTab';
import { DashboardTab } from './components/DashboardTab';
import { listenToRemoteDispatches, updateDispatchStatus, RemoteDispatch, syncBomToCloud, getAllBomsFromCloud } from './lib/firebase';

export default function App() {
  const [activeTab, setActiveTab] = useState('planning');
  const [bomData, setBomData] = useState<BomRow[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [incomingDispatch, setIncomingDispatch] = useState<RemoteDispatch | null>(null);

  // Play double beep sound when remote dispatches are received
  const playIncomingBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playBeep = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.12, ctx.currentTime + start);
        osc.start(ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration - 0.05);
        osc.stop(ctx.currentTime + start + duration);
      };
      playBeep(880, 0, 0.2);
      playBeep(880, 0.25, 0.2);
    } catch (e) {
      console.warn("AudioContext block", e);
    }
  };

  // Load from local storage and cloud database on init
  useEffect(() => {
    const loadBoms = async () => {
      let localData: BomRow[] = [];
      try {
        const saved = localStorage.getItem('bomData');
        if (saved) {
          localData = JSON.parse(saved);
          setBomData(localData);
        }
      } catch (e) {
        console.error('Failed to load BOM from storage', e);
      }

      try {
        console.log("Cloud Agent: Fetching all BOM definitions from Firestore...");
        const cloudBoms = await getAllBomsFromCloud();
        if (cloudBoms && cloudBoms.length > 0) {
          // Group local and cloud BOMs and map by maHang
          const localGroups: Record<string, BomRow[]> = {};
          localData.forEach(row => {
            if (!row.maHang) return;
            const m = row.maHang.trim();
            if (!localGroups[m]) localGroups[m] = [];
            localGroups[m].push(row);
          });
          
          const cloudGroups: Record<string, BomRow[]> = {};
          cloudBoms.forEach(row => {
            if (!row.maHang) return;
            const m = row.maHang.trim();
            if (!cloudGroups[m]) cloudGroups[m] = [];
            cloudGroups[m].push(row);
          });
          
          // Combine: prefers cloud, falls back to local
          const finalBoms: BomRow[] = [];
          const allKeys = new Set([...Object.keys(localGroups), ...Object.keys(cloudGroups)]);
          allKeys.forEach(m => {
            if (cloudGroups[m]) {
              finalBoms.push(...cloudGroups[m]);
            } else if (localGroups[m]) {
              finalBoms.push(...localGroups[m]);
            }
          });
          
          setBomData(finalBoms);
          localStorage.setItem('bomData', JSON.stringify(finalBoms));
          console.log(`Cloud Agent: Loaded and merged BOM database. Total ${finalBoms.length} rows.`);
        }
      } catch (err) {
        console.error("Cloud Agent: Failed to fetch BOMs from cloud:", err);
      }
    };
    
    loadBoms();
    
    // Also listen to system updates to reload BOMs in the background
    const handleSyncReset = () => {
      loadBoms();
    };
    document.addEventListener('CLOUD_CONFIG_UPDATED', handleSyncReset);
    return () => document.removeEventListener('CLOUD_CONFIG_UPDATED', handleSyncReset);
  }, []);

  // Listen to remote dispatches in background (Warehouse Agent role)
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const setupListener = () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = undefined;
      }

      const mode = localStorage.getItem('nodeMode') || 'warehouse';
      const devId = localStorage.getItem('deviceId') || '';

      if (mode === 'warehouse' && devId) {
        console.log(`Cloud Agent: Listening to incoming dispatches for device "${devId}"`);
        unsubscribe = listenToRemoteDispatches(devId, (dispatches) => {
          const pending = dispatches.filter(d => d.status === 'Pending');
          if (pending.length > 0) {
            const newest = pending[0];
            setIncomingDispatch(newest);
            playIncomingBeep();
          }
        });
      }
    };

    setupListener();

    // Recheck on credential/node settings changes
    document.addEventListener('CLOUD_CONFIG_UPDATED', setupListener);
    return () => {
      if (unsubscribe) unsubscribe();
      document.removeEventListener('CLOUD_CONFIG_UPDATED', setupListener);
    };
  }, []);

  const handleAcceptIncomingDispatch = async () => {
    if (!incomingDispatch) return;
    try {
      const resultPayload = {
        dispatchData: incomingDispatch.dispatchData || [],
        detailedNeedsData: incomingDispatch.detailedNeedsData || {},
        khsxData: incomingDispatch.khsxData || [],
        fifoSuggestions: incomingDispatch.fifoSuggestions || [],
        dispatchInfo: incomingDispatch.dispatchInfo || {}
      };

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(resultPayload, async () => {
          await updateDispatchStatus(incomingDispatch.id, 'Completed');
          setIncomingDispatch(null);
          window.open('/lenhxuat.html', '_blank');
        });
      } else {
        localStorage.setItem('dispatchData', JSON.stringify(resultPayload.dispatchData));
        localStorage.setItem('detailedNeedsData', JSON.stringify(resultPayload.detailedNeedsData));
        localStorage.setItem('khsxData', JSON.stringify(resultPayload.khsxData));
        localStorage.setItem('fifoSuggestions', JSON.stringify(resultPayload.fifoSuggestions));
        localStorage.setItem('dispatchInfo', JSON.stringify(resultPayload.dispatchInfo));

        await updateDispatchStatus(incomingDispatch.id, 'Completed');
        setIncomingDispatch(null);
        window.open('/lenhxuat.html', '_blank');
      }
    } catch (err: any) {
      alert("Lỗi tải lệnh xuất: " + err.message);
    }
  };

  const handleSaveBom = async (data: BomRow[]) => {
    setBomData(data);
    localStorage.setItem('bomData', JSON.stringify(data));

    try {
      console.log("Cloud Agent: Syncing saved local BOM to the Cloud...");
      // Group by maHang
      const groups: Record<string, BomRow[]> = {};
      data.forEach(row => {
        if (!row.maHang) return;
        const key = row.maHang.trim();
        if (!groups[key]) groups[key] = [];
        groups[key].push(row);
      });

      const promises = Object.entries(groups).map(([maHang, rows]) => {
        return syncBomToCloud(maHang, rows);
      });
      await Promise.all(promises);
      
      // Notify other tabs
      document.dispatchEvent(new CustomEvent('CLOUD_CONFIG_UPDATED'));
      console.log("Cloud Agent: Successfully synchronized raw BOM data to Cloud database.");
    } catch (err: any) {
      console.error("Cloud Agent: Failed to sync BOM data to Google Firestore:", err);
      throw err;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside 
        className={`${
          isSidebarOpen ? 'w-64' : 'w-20'
        } bg-slate-900 border-r border-slate-800 flex flex-col items-stretch transition-all duration-300 ease-in-out z-20`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800 shrink-0">
          {isSidebarOpen && (
            <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap text-white">
              <Package2 className="w-6 h-6 text-blue-400 shrink-0" />
              <div>
                <h1 className="text-sm font-bold tracking-wider leading-tight">SYS:INVENTORY</h1>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest leading-tight">Material Requisition</p>
              </div>
            </div>
          )}
          {!isSidebarOpen && (
            <Package2 className="w-6 h-6 text-blue-400 mx-auto shrink-0" />
          )}
        </div>

        <div className="py-4">
          <p className={`px-4 text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 ${!isSidebarOpen && 'text-center'}`}>
            {isSidebarOpen ? 'Main Menu' : 'Menu'}
          </p>
          <nav className="flex flex-col gap-1 px-2">
            <button
              onClick={() => setActiveTab('planning')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'planning'
                  ? 'bg-blue-600/10 text-blue-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              } ${!isSidebarOpen && 'justify-center'}`}
              title="Tính nhu cầu"
            >
              <LayoutDashboard className="w-5 h-5 shrink-0" />
              {isSidebarOpen && <span className="truncate">Tính nhu cầu</span>}
              {activeTab === 'planning' && isSidebarOpen && (
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-auto"></div>
              )}
            </button>

            <button
              onClick={() => setActiveTab('inventory')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'inventory'
                  ? 'bg-emerald-600/10 text-emerald-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              } ${!isSidebarOpen && 'justify-center'}`}
              title="Tồn kho thực tế"
            >
              <Layers className="w-5 h-5 shrink-0 text-emerald-500" />
              {isSidebarOpen && <span className="truncate">Tồn kho thực tế</span>}
              {activeTab === 'inventory' && isSidebarOpen && (
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-auto"></div>
              )}
            </button>
            
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'history'
                  ? 'bg-blue-600/10 text-blue-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              } ${!isSidebarOpen && 'justify-center'}`}
              title="Lịch sử"
            >
              <History className="w-5 h-5 shrink-0" />
              {isSidebarOpen && <span className="truncate">Lịch sử xuất kho</span>}
              {activeTab === 'history' && isSidebarOpen && (
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-auto"></div>
              )}
            </button>

            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-600/10 text-indigo-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              } ${!isSidebarOpen && 'justify-center'}`}
              title="Dashboard"
            >
              <BarChart3 className="w-5 h-5 shrink-0" />
              {isSidebarOpen && <span className="truncate">Thống kê (Báo cáo)</span>}
              {activeTab === 'dashboard' && isSidebarOpen && (
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 ml-auto"></div>
              )}
            </button>

            {isAdmin && (
              <button
                onClick={() => setActiveTab('bom')}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'bom'
                    ? 'bg-blue-600/10 text-blue-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                } ${!isSidebarOpen && 'justify-center'}`}
                title="Quản lý BOM"
              >
                <FileSpreadsheet className="w-5 h-5 shrink-0" />
                {isSidebarOpen && <span className="truncate">Quản lý BOM (Định mức)</span>}
                {activeTab === 'bom' && isSidebarOpen && (
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-auto"></div>
                )}
              </button>
            )}

            <button
               onClick={() => setActiveTab('teams')}
               className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                 activeTab === 'teams'
                   ? 'bg-indigo-600/10 text-indigo-400'
                   : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
               } ${!isSidebarOpen && 'justify-center'}`}
               title="Tổ & Đợt sản xuất"
             >
               <Users className="w-5 h-5 shrink-0 text-indigo-400" />
               {isSidebarOpen && <span className="truncate">Tổ & Đợt sản xuất</span>}
               {activeTab === 'teams' && isSidebarOpen && (
                 <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 ml-auto"></div>
               )}
             </button>

            {isAdmin && (
              <button
                onClick={() => setActiveTab('cloud')}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'cloud'
                    ? 'bg-blue-600/10 text-blue-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                } ${!isSidebarOpen && 'justify-center'}`}
                title="Đồng bộ Đám mây"
              >
                <Cloud className="w-5 h-5 shrink-0 text-blue-400" />
                {isSidebarOpen && <span className="truncate">Đồng bộ Đám mây</span>}
                {activeTab === 'cloud' && isSidebarOpen && (
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-auto"></div>
                )}
              </button>
            )}

             <div className="h-px bg-slate-800 my-2"></div>

             <button
               onClick={() => document.dispatchEvent(new CustomEvent('SYNC_INVENTORY', {}))}
               className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors text-slate-400 hover:bg-slate-800 hover:text-slate-200 ${!isSidebarOpen && 'justify-center'}`}
               title="Đồng bộ Dữ liệu Kho"
             >
               <Layers className="w-5 h-5 shrink-0" />
               {isSidebarOpen && <span className="truncate">Đồng bộ Kho (ERP)</span>}
             </button>
           </nav>
         </div>

        <div className="mt-auto p-4 border-t border-slate-800">
          <button 
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors ${!isSidebarOpen && 'justify-center'}`}
            title="Cài đặt"
          >
            <Settings className="w-5 h-5 shrink-0" />
            {isSidebarOpen && <span>Cài đặt hệ thống</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center text-sm font-semibold text-slate-700">
              {activeTab === 'planning' && <span>Tính nhu cầu phụ liệu (MRP)</span>}
              {activeTab === 'inventory' && <span>Tồn kho thực tế (ERP)</span>}
              {activeTab === 'teams' && <span>Cấu hình Tổ & Đợt sản xuất</span>}
              {activeTab === 'history' && <span>Lịch sử tra cứu</span>}
              {activeTab === 'bom' && <span>Cơ sở dữ liệu Định mức (BOM)</span>}
              {activeTab === 'cloud' && <span>Đồng bộ máy trạm</span>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'inventory' && (
              <div className="flex items-center gap-2 pl-3 pr-1 py-1">
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] text-slate-400 font-medium leading-[1.1]">Đồng bộ mới nhất</p>
                  <p className="text-[11px] font-semibold text-slate-600 font-mono" id="inventory-sync-time">
                    ---
                  </p>
                </div>
                <button 
                  onClick={() => document.dispatchEvent(new CustomEvent('REQUEST_INVENTORY_RELOAD'))}
                  className="flex items-center justify-center gap-1.5 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium rounded text-xs border border-indigo-100 transition-all cursor-pointer"
                  title="Tải lại tồn kho"
                >
                  <RefreshCw className="w-3.5 h-3.5" id="inventory-reload-icon" />
                  <span className="hidden leading-none sm:inline">Tải lại</span>
                </button>
              </div>
            )}
            
            <div className="w-px h-5 bg-slate-200 mx-1 hidden sm:block"></div>

            <button 
              onClick={() => {
                if (isAdmin) {
                  setIsAdmin(false);
                  if (activeTab === 'bom' || activeTab === 'cloud') {
                    setActiveTab('planning');
                  }
                } else {
                  const p = window.prompt("Nhập mật khẩu (admin123):");
                  if (p === "admin123") setIsAdmin(true);
                  else if (p !== null) alert("Sai mật khẩu!");
                }
              }}
              className={`flex items-center gap-2 pl-2 rounded-lg p-1 transition-colors ${isAdmin ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'hover:bg-slate-50 border border-transparent'}`}
              title={isAdmin ? "Đang ở quyền Admin" : "Nhấp để đăng nhập Admin"}
            >
              <UserCircle className={`w-7 h-7 ${isAdmin ? 'text-amber-600' : 'text-slate-400'}`} />
              <div className="hidden sm:block text-left pr-2">
                <p className={`text-xs font-semibold leading-tight ${isAdmin ? 'text-amber-700' : 'text-slate-700'}`}>{isAdmin ? 'Admin' : 'Nhân viên kho'}</p>
              </div>
            </button>
          </div>
        </header>

        {/* Content Wrapper */}
        <div className="flex-1 overflow-auto bg-slate-50/50">
          {activeTab === 'planning' && (
            <div className="h-full p-0"><PlanningTab bomData={bomData} /></div>
          )}
          {activeTab === 'inventory' && (
            <div className="h-full p-4 lg:p-6"><InventoryTab /></div>
          )}
          {activeTab === 'history' && (
             <div className="h-full">
                <HistoryTab />
             </div>
          )}
          {activeTab === 'dashboard' && (
             <div className="h-full">
                <DashboardTab />
             </div>
          )}
          {activeTab === 'bom' && (
             <div className="h-full p-4 lg:p-6">
                <BomManagement bomData={bomData} onSaveBom={handleSaveBom} isAdmin={isAdmin} />
             </div>
          )}
          {activeTab === 'teams' && (
             <div className="h-full p-4 lg:p-6">
                <TeamsTab />
             </div>
          )}
          {activeTab === 'cloud' && isAdmin && (
             <div className="h-full p-4 lg:p-6">
                <CloudSyncTab />
             </div>
          )}
        </div>
      </main>

      {/* Real-time Incoming Dispatch Modal Alert */}
      {incomingDispatch && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in transition-all">
          <div className="bg-white rounded-xl shadow-2xl border border-indigo-100 max-w-sm w-full overflow-hidden animate-in zoom-in-95">
            <div className="bg-indigo-600 p-4 text-white flex items-center gap-3">
              <div className="p-2 bg-indigo-500/20 rounded-full animate-bounce">
                <Bell className="w-6 h-6 text-indigo-100" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-sm tracking-wide">LỆNH XUẤT KHO MỚI!</h3>
                <p className="text-[10px] text-indigo-200/90 font-medium font-mono">Tải tức thời qua Đám Mây</p>
              </div>
              <button 
                onClick={() => setIncomingDispatch(null)}
                className="p-1 rounded-full text-indigo-200 hover:bg-indigo-700 hover:text-white transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-4 text-xs text-slate-600">
              <div className="space-y-2.5 p-3.5 bg-indigo-50/40 border border-indigo-100 rounded-lg">
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-500">Mã Hàng:</span>
                  <span className="font-bold text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-100 text-[11px] font-mono">{incomingDispatch.maHang}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-500">Planners:</span>
                  <span className="font-bold text-slate-700">{incomingDispatch.createdBy}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-500">Giờ nhận:</span>
                  <span className="font-mono text-slate-500">{new Date(incomingDispatch.createdAt).toLocaleTimeString('vi-VN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-500">Mẫu mã:</span>
                  <span className="font-semibold text-slate-700 truncate max-w-[180px]">{incomingDispatch.models?.join(', ')}</span>
                </div>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setIncomingDispatch(null)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Bỏ qua
                </button>
                <button
                  type="button"
                  onClick={handleAcceptIncomingDispatch}
                  className="flex-[2] py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  Mở & In Lệnh Xuất
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
