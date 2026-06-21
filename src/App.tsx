/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LayoutDashboard, History, FileSpreadsheet, Settings, Bell, Search, UserCircle, Menu, Package2, Layers, Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import { BomManagement, BomRow } from './components/BomManagement';
import { PlanningTab } from './components/PlanningTab';
import { InventoryTab } from './components/InventoryTab';
import { TeamsTab } from './components/TeamsTab';
import { HistoryTab } from './components/HistoryTab';

export default function App() {
  const [activeTab, setActiveTab] = useState('planning');
  const [bomData, setBomData] = useState<BomRow[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Load from locale storage on init
  useEffect(() => {
    try {
      const saved = localStorage.getItem('bomData');
      if (saved) {
        setBomData(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load BOM from storage', e);
    }
  }, []);

  const handleSaveBom = (data: BomRow[]) => {
    setBomData(data);
    localStorage.setItem('bomData', JSON.stringify(data));
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
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 shrink-0 z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center text-sm font-medium text-slate-600 px-2 py-1 bg-slate-100 rounded-md">
              <span className="text-slate-400 mr-2">/</span>
              {activeTab === 'planning' && <span>Tính nhu cầu phụ liệu (MRP)</span>}
              {activeTab === 'inventory' && <span>Tồn kho thực tế (ERP)</span>}
              {activeTab === 'teams' && <span>Cấu hình Tổ & Đợt sản xuất</span>}
              {activeTab === 'history' && <span>Lịch sử tra cứu</span>}
              {activeTab === 'bom' && <span>Cơ sở dữ liệu Định mức (BOM)</span>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Tìm kiếm mã hàng..." 
                className="pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-sm outline-none focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all w-64"
              />
            </div>
            <div className="w-px h-6 bg-slate-200 mx-2 hidden sm:block"></div>
            <button className="p-1.5 rounded-full text-slate-500 hover:bg-slate-100 transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
            </button>
            <button 
              onClick={() => {
                if (isAdmin) {
                  setIsAdmin(false);
                  if (activeTab === 'bom') {
                    setActiveTab('planning');
                  }
                } else {
                  const p = window.prompt("Nhập mật khẩu (admin123):");
                  if (p === "admin123") setIsAdmin(true);
                  else if (p !== null) alert("Sai mật khẩu!");
                }
              }}
              className={`flex items-center gap-2 pl-2 rounded-lg p-1 transition-colors ${isAdmin ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'hover:bg-slate-50'}`}
              title={isAdmin ? "Đang ở quyền Admin" : "Nhấp để đăng nhập Admin"}
            >
              <UserCircle className={`w-8 h-8 ${isAdmin ? 'text-amber-600' : 'text-slate-400'}`} />
              <div className="hidden sm:block text-left">
                <p className={`text-xs font-semibold leading-tight ${isAdmin ? 'text-amber-700' : 'text-slate-700'}`}>{isAdmin ? 'Admin User' : 'Nhân viên kho'}</p>
                <p className={`text-[10px] leading-tight ${isAdmin ? 'text-amber-600/80' : 'text-slate-500'}`}>{isAdmin ? 'Quản trị viên' : 'Warehouse Dept'}</p>
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
        </div>
      </main>
    </div>
  );
}
