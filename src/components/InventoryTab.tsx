import { useState, useEffect, useMemo } from 'react';
import { Package, Search, RefreshCw, Calendar, Clock, Inbox, ChevronDown, CheckCircle, Database } from 'lucide-react';

interface InventoryItem {
  'MÃ HÀNG'?: string;
  'MODEL'?: string;
  'LOẠI'?: string;
  'TS / SIZE'?: string;
  'MÀU'?: string;
  'PO'?: string;
  'KHOANG'?: string;
  'TỒN'?: string;
  'SL NHẬP'?: string;
  'SL XUẤT'?: string;
  'ĐVT'?: string;
  [key: string]: any;
}

export function InventoryTab() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [lastSync, setLastSync] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMaHang, setFilterMaHang] = useState('ALL');
  const [filterType, setFilterLoai] = useState('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadSyncedData = () => {
    setIsRefreshing(true);
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['scrapedInventoryData', 'lastSyncTime'], (res) => {
          if (res.scrapedInventoryData) {
            setItems(res.scrapedInventoryData);
          } else {
            // Fallback to memory or empty
            setItems([]);
          }
          if (res.lastSyncTime) {
            setLastSync(res.lastSyncTime);
          }
          setIsRefreshing(false);
        });
      } else {
        // Fallback for Web preview env
        const stored = localStorage.getItem('scrapedInventoryData');
        if (stored) {
          setItems(JSON.parse(stored));
        } else {
          // Initialize mock fallback for trial/demo
          const mockData = [
            { 'MÃ HÀNG': '341410-SS26', 'MODEL': '8787780', 'LOẠI': 'DÂY KÉO', 'TS / SIZE': '12CM', 'MÀU': '960', 'PO': 'PO-882218', 'KHOANG': 'A-02', 'TỒN': '1500', 'ĐVT': 'Kg' },
            { 'MÃ HÀNG': '341410-SS26', 'MODEL': '8787780', 'LOẠI': 'DÂY KÉO', 'TS / SIZE': '22CM', 'MÀU': 'V7834', 'PO': 'PO-882218', 'KHOANG': 'A-03', 'TỒN': '850', 'ĐVT': 'Kg' },
            { 'MÃ HÀNG': '341410-SS26', 'MODEL': '8408745', 'LOẠI': 'DÂY KÉO', 'TS / SIZE': '18CM', 'MÀU': 'VI385', 'PO': 'PO-882001', 'KHOANG': 'B-12', 'TỒN': '320', 'ĐVT': 'Kg' },
            { 'MÃ HÀNG': '341410-SS26', 'MODEL': '8408745', 'LOẠI': 'DÂY KÉO PHẢI', 'TS / SIZE': '52.5CM', 'MÀU': '884', 'PO': 'PO-882190', 'KHOANG': 'B-14', 'TỒN': '400', 'ĐVT': 'Tấm' },
            { 'MÃ HÀNG': '341410-SS26', 'MODEL': '8787779', 'LOẠI': 'DÂY KÉO SƯỜN ỐNG', 'TS / SIZE': '61 cm', 'MÀU': 'VI385', 'PO': 'PO-882250', 'KHOANG': 'C-01', 'TỒN': '20', 'ĐVT': 'Băng' },
            { 'MÃ HÀNG': '341411-SS26', 'MODEL': '992019', 'LOẠI': 'CÚC KIM LOẠI', 'TS / SIZE': '15MM', 'MÀU': 'Niken', 'PO': 'PO-882330', 'KHOANG': 'D-05', 'TỒN': '5000', 'ĐVT': 'Viên' }
          ];
          setItems(mockData);
          localStorage.setItem('scrapedInventoryData', JSON.stringify(mockData));
        }
        setLastSync(new Date().toISOString());
        setIsRefreshing(false);
      }
    } catch (e) {
      console.error(e);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadSyncedData();

    // Lắng nghe sự kiện storage thay đổi từ content script hoặc background
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      const handleStorageChange = (changes: any, areaName: string) => {
        if (areaName === 'local' && (changes.scrapedInventoryData || changes.lastSyncTime)) {
          loadSyncedData();
        }
      };
      chrome.storage.onChanged.addListener(handleStorageChange);
      return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    }
  }, []);

  const uniqueMaHangs = useMemo(() => {
    const list = items.map(item => item['MÃ HÀNG'] || '').filter(Boolean);
    return ['ALL', ...Array.from(new Set(list))];
  }, [items]);

  const uniqueTypes = useMemo(() => {
    const list = items.map(item => item['LOẠI'] || '').filter(Boolean);
    return ['ALL', ...Array.from(new Set(list))];
  }, [items]);

  // Bộ lọc dữ liệu tồn kho dựa trên ô tìm kiếm và dropdowns
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const maHang = item['MÃ HÀNG'] || '';
      const model = item['MODEL'] || '';
      const loai = item['LOẠI'] || '';
      const size = item['TS / SIZE'] || '';
      const mau = item['MÀU'] || '';
      const po = item['PO'] || '';
      const khoang = item['KHOANG'] || '';

      const matchSearch = 
        maHang.toLowerCase().includes(searchTerm.toLowerCase()) ||
        model.toLowerCase().includes(searchTerm.toLowerCase()) ||
        loai.toLowerCase().includes(searchTerm.toLowerCase()) ||
        size.toLowerCase().includes(searchTerm.toLowerCase()) ||
        mau.toLowerCase().includes(searchTerm.toLowerCase()) ||
        po.toLowerCase().includes(searchTerm.toLowerCase()) ||
        khoang.toLowerCase().includes(searchTerm.toLowerCase());

      const matchMaHang = filterMaHang === 'ALL' || maHang === filterMaHang;
      const matchType = filterType === 'ALL' || loai === filterType;

      return matchSearch && matchMaHang && matchType;
    });
  }, [items, searchTerm, filterMaHang, filterType]);

  const stats = useMemo(() => {
    const totalQty = filteredItems.reduce((acc, curr) => acc + parseFloat(curr['TỒN'] || '0'), 0);
    const uniqueTypesCount = new Set(filteredItems.map(i => i['LOẠI'])).size;
    const itemsCount = filteredItems.length;
    return { totalQty, uniqueTypesCount, itemsCount };
  }, [filteredItems]);

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Banner / Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-center text-blue-600 shadow-xs shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              Tồn kho
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold items-center gap-1 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Đang tự động đồng bộ
              </span>
            </h2>
            <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
              Dữ liệu tồn kho thực tế được tự động đồng bộ từ hệ thống ERP tại <a href="https://khoerp-vn.web.app/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium">khoerp-vn.web.app</a> hoặc <span className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">172.20.0.5:8080</span>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-slate-400 font-medium">Đồng bộ mới nhất lúc</p>
            <p className="text-sm font-semibold text-slate-700 font-mono">
              {lastSync ? new Date(lastSync).toLocaleString('vi-VN') : '---'}
            </p>
          </div>
          <button 
            onClick={loadSyncedData} 
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-sm border border-slate-200 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Tải lại
          </button>
        </div>
      </div>



      {/* Main Table & Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col flex-1 min-h-[400px]">
        {/* Filters bar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Tìm kiếm theo mã hàng, loại vật tư, màu sắc, PO hoặc khoang..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium"
            />
          </div>

          <div className="flex gap-2">
            <div className="relative shrink-0">
              <select 
                value={filterMaHang}
                onChange={e => setFilterMaHang(e.target.value)}
                className="pl-3 pr-8 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:border-blue-500 appearance-none font-medium cursor-pointer"
              >
                <option value="ALL">Mã Hàng (Style): Tất cả</option>
                {uniqueMaHangs.filter(v => v !== 'ALL').map(mh => (
                  <option key={mh} value={mh}>{mh}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <div className="relative shrink-0">
              <select 
                value={filterType}
                onChange={e => setFilterLoai(e.target.value)}
                className="pl-3 pr-8 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:border-blue-500 appearance-none font-medium cursor-pointer"
              >
                <option value="ALL">Loại vật tư: Tất cả</option>
                {uniqueTypes.filter(v => v !== 'ALL').map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Inventory Table */}
        <div className="flex-1 overflow-auto">
          {filteredItems.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 p-8">
              <Inbox className="w-12 h-12 text-slate-300 mb-2" />
              <p className="text-sm font-medium">Không tìm thấy phụ liệu nào thỏa mãn điều kiện lọc.</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm text-slate-600 border-collapse">
              <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-xs sticky top-0 z-10 shadow-sm border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">STT</th>
                  <th className="px-4 py-3 whitespace-nowrap">Mã Hàng</th>
                  <th className="px-4 py-3 whitespace-nowrap">Model</th>
                  <th className="px-4 py-3 whitespace-nowrap">Loại vật tư</th>
                  <th className="px-4 py-3 whitespace-nowrap">Thông số (Size)</th>
                  <th className="px-4 py-3 whitespace-nowrap">Màu sắc</th>
                  <th className="px-4 py-3 whitespace-nowrap">Mã P.O</th>
                  <th className="px-4 py-3 whitespace-nowrap">Vị trí (Khoang)</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Số lượng tồn kho</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">ĐVT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item, idx) => {
                  const ton = parseFloat(item['TỒN'] || '0');
                  return (
                    <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{idx + 1}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{item['MÃ HÀNG'] || '---'}</td>
                      <td className="px-4 py-2.5">{item['MODEL'] || '---'}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{item['LOẠI'] || '---'}</td>
                      <td className="px-4 py-2.5 font-mono text-[13px]">{item['TS / SIZE'] || '---'}</td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[11px] font-medium border border-slate-200">
                          {item['MÀU'] || '---'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{item['PO'] || '---'}</td>
                      <td className="px-4 py-2.5 font-mono text-[13px]">
                        <span className="text-blue-700 font-semibold">{item['KHOANG'] || '---'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-emerald-600 font-mono">
                        {ton.toLocaleString('en-US')}
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs font-semibold text-slate-500 uppercase">
                        {item['ĐVT'] || item['ĐƠN VỊ'] || item['ĐV'] || 'Kg'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer info/legend */}
        <div className="bg-slate-50 p-3 px-6 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2">
          <div className="flex items-center gap-3">
            <span>Hiển thị: <strong>{filteredItems.length}</strong> / <strong>{items.length}</strong> dòng</span>
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
            <span>Tổng lượng: <strong className="text-emerald-600">{Math.round(stats.totalQty).toLocaleString()}</strong> đơn vị</span>
          </div>
          <div className="flex items-center gap-1 text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            <span>Màn hình hiển thị chính xác bảng dữ liệu từ trang quản lý ERP kho gốc.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
