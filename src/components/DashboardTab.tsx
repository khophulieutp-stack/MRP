import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Activity, LayoutDashboard, Calendar, Users, TrendingUp, RefreshCw } from 'lucide-react';
import { getAllDispatchesFromCloud } from '../lib/firebase';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export function DashboardTab() {
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = () => {
    try {
      const records = JSON.parse(localStorage.getItem('exportHistory') || '[]');
      setHistoryRecords(Array.isArray(records) ? records : []);
    } catch (e) {
      console.error('Failed to load history', e);
      setHistoryRecords([]);
    }
  };

  const showNotification = (text: string, type: 'success' | 'error' | 'info') => {
    setNotification({ text, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const handleRefreshFromCloud = async () => {
    setIsRefreshing(true);
    try {
      const cloudRecords = await getAllDispatchesFromCloud();
      if (cloudRecords && cloudRecords.length > 0) {
        // Merge with local records: update local records or overwrite them
        // For dashboard, we might want to just overwrite to display all cloud items
        // Wait, HistoryTab reads from localStorage. Let's update localStorage 'exportHistory'
        // so it syncs up nicely if cloud possesses new records.
        // Easiest is to overwrite to keep things clean.
        localStorage.setItem('exportHistory', JSON.stringify(cloudRecords));
        setHistoryRecords(cloudRecords);
        showNotification("Đồng bộ thành công dữ liệu từ Đám mây!", "success");
      } else {
        showNotification("Không tìm thấy dữ liệu xuất kho nào trên Đám mây.", "info");
      }
    } catch (err: any) {
      console.error(err);
      showNotification("Lỗi khi tải dữ liệu từ Đám mây: " + err.message, "error");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Process data for charts
  const { byDateData, byToData, totalDispatches, totalItems } = useMemo(() => {
    const dailyCounts: Record<string, number> = {};
    const toCounts: Record<string, number> = {};
    let dispatches = 0;
    let itemsProduced = 0;

    (Array.isArray(historyRecords) ? historyRecords : []).forEach(record => {
      dispatches++;
      // Sum up khsxData if available
      if (record.khsxData && Array.isArray(record.khsxData)) {
         itemsProduced += record.khsxData.reduce((acc: number, curr: any) => acc + (Number(curr.soLuong) || 0), 0);
      }

      // Process by Date based on createdAt
      const dateStr = new Date(record.createdAt).toLocaleDateString('vi-VN');
      dailyCounts[dateStr] = (dailyCounts[dateStr] || 0) + 1;

      // Process by "Tổ"
      if (record.dispatchInfo) {
        Object.values(record.dispatchInfo).forEach((info: any) => {
          if (info.to) {
            const toStr = info.to;
            toCounts[toStr] = (toCounts[toStr] || 0) + 1;
          }
        });
      }
    });

    const byDateArray = Object.entries(dailyCounts).map(([date, count]) => ({
      date,
      count
    })).sort((a, b) => {
      // Basic string sort is okay if dates are DD/MM/YYYY but better to parse if needed.
      // Assuming straightforward order is mostly insertion order for now.
      const [d1, m1, y1] = a.date.split('/');
      const [d2, m2, y2] = b.date.split('/');
      if (!y1 || !y2) return 0;
      return new Date(Number(y1), Number(m1)-1, Number(d1)).getTime() - new Date(Number(y2), Number(m2)-1, Number(d2)).getTime();
    });

    const byToArray = Object.entries(toCounts).map(([to, count]) => ({
      name: to,
      value: count
    })).sort((a, b) => b.value - a.value);

    return {
      byDateData: byDateArray,
      byToData: byToArray,
      totalDispatches: dispatches,
      totalItems: itemsProduced
    };
  }, [historyRecords]);

  if (historyRecords.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 h-full flex flex-col items-center justify-center text-slate-400">
        <Activity className="w-12 h-12 text-slate-200 mb-4" />
        <p className="font-medium text-slate-600">Chưa có dữ liệu thống kê</p>
        <p className="text-sm mt-1 mb-4">Cần ít nhất một lệnh xuất kho để hiển thị biểu đồ.</p>
        {notification && (
          <div className={`mb-6 px-4 py-3 rounded-lg border text-sm font-medium text-center ${
            notification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
            notification.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
            'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            {notification.text}
          </div>
        )}
        <button
          onClick={handleRefreshFromCloud}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-3 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-bold transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Đang tải...' : 'Làm mới từ Đám mây'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-auto">
      <div className="p-4 lg:p-6 pb-2 shrink-0">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Thống Kê Tổng Quan</h2>
              <p className="text-sm text-slate-500 mt-0.5">Biểu đồ phân tích lịch sử xuất kho.</p>
            </div>
          </div>
          <button
            onClick={handleRefreshFromCloud}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-500' : 'text-slate-500'}`} />
            {isRefreshing ? 'Đang làm mới...' : 'Làm mới dữ liệu Cloud'}
          </button>
        </div>

        {notification && (
          <div className={`mb-4 px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
            notification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
            notification.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
            'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            {notification.text}
          </div>
        )}
      </div>

      <div className="p-4 lg:p-6 pt-0 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Tổng số lệnh xuất</p>
              <p className="text-2xl font-bold text-slate-800">{totalDispatches}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Tổng sản lượng</p>
              <p className="text-2xl font-bold text-slate-800">{totalItems}</p>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Lệnh theo ngày (Bar Chart) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-6 text-slate-800">
              <Calendar className="w-5 h-5 text-indigo-500" />
              <h3 className="font-bold">Số Lệnh Xuất Kho Theo Ngày</h3>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDateData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dx={-10} allowDecimals={false} />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="count" name="Số lệnh xuất" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Lệnh theo Tổ (Pie Chart / Bar Chart) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-6 text-slate-800">
              <Users className="w-5 h-5 text-emerald-500" />
              <h3 className="font-bold">Phân Bổ Lệnh Theo Tổ Sản Xuất</h3>
            </div>
            <div className="h-[300px] w-full">
              {byToData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byToData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                    >
                      {byToData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => [`${value} lệnh`, 'Số lượng']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  Không có thông tin tổ sản xuất.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
