import { useState, useEffect } from 'react';
import { History, FileText, ChevronRight, Calendar, User, Eye, Trash2 } from 'lucide-react';
import { getAllDispatchesFromCloud, deleteRemoteDispatch, RemoteDispatch, db } from '../lib/firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';

export function HistoryTab() {
  const [historyRecords, setHistoryRecords] = useState<RemoteDispatch[]>([]);

  useEffect(() => {
    // Listen to real-time updates from Firebase
    const q = query(collection(db, 'dispatches'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: RemoteDispatch[] = [];
      snapshot.forEach(doc => {
        list.push(doc.data() as RemoteDispatch);
      });
      // Sort descending by createdAt
      list.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      // We only want to show Dispatches that are Completed or all of them? 
      // The user wants history, so let's show all
      setHistoryRecords(list);
    }, (error) => {
      console.error("Error fetching history from cloud:", error);
    });

    return () => unsubscribe();
  }, []);

  const handleDelete = async (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa lịch sử lệnh Cloud này?')) {
      try {
        await deleteRemoteDispatch(id);
      } catch (err) {
        console.error("Error deleting dispatch:", err);
      }
    }
  };

  const handleOpen = (record: RemoteDispatch) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.runtime && chrome.tabs) {
      chrome.storage.local.set({
        dispatchData: record.dispatchData,
        detailedNeedsData: record.detailedNeedsData,
        khsxData: record.khsxData,
        fifoSuggestions: record.fifoSuggestions,
        dispatchInfo: record.dispatchInfo
      }, () => {
         const url = chrome.runtime.getURL('lenhxuat.html');
         chrome.tabs.create({ url });
      });
    } else {
      try {
        localStorage.setItem('dispatchData', JSON.stringify(record.dispatchData));
        localStorage.setItem('detailedNeedsData', JSON.stringify(record.detailedNeedsData));
        localStorage.setItem('khsxData', JSON.stringify(record.khsxData));
        localStorage.setItem('fifoSuggestions', JSON.stringify(record.fifoSuggestions));
        localStorage.setItem('dispatchInfo', JSON.stringify(record.dispatchInfo));
        window.open('/lenhxuat.html', '_blank');
      } catch (err) {
        console.error("Lỗi khi mở lệnh xuất:", err);
        alert("Đã xảy ra lỗi khi mở lệnh xuất!");
      }
    }
  };

  if (historyRecords.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 h-full flex flex-col items-center justify-center text-slate-400">
        <History className="w-12 h-12 text-slate-200 mb-4" />
        <p className="font-medium text-slate-600">Lịch sử xuất kho trống</p>
        <p className="text-sm mt-1">Chưa có lệnh truyền tải Cloud nào được tạo.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <div className="p-4 lg:p-6 pb-2 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Lịch sử Lệnh Xuất Kho (Cloud)</h2>
              <p className="text-sm text-slate-500 mt-0.5">Danh sách các lệnh xuất kho đã được tạo và lưu trữ trên Firebase.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 lg:p-6 pt-0">
        <div className="grid gap-4">
          {historyRecords.map((record) => (
            <div key={record.id} className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col sm:flex-row gap-4 justify-between transition-shadow hover:shadow-md">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-5 h-5 text-indigo-500" />
                  <h3 className="font-bold text-lg text-slate-800">{record.maHang}</h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    record.status === 'Pending' ? 'bg-amber-100 text-amber-700' : 
                    record.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {record.status}
                  </span>
                </div>
                
                <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span>{new Date(record.createdAt).toLocaleString('vi-VN')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User className="w-4 h-4 text-slate-400" />
                    <span>Models: {record.models?.join(', ') || '---'}</span>
                  </div>
                </div>
                
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(record.dispatchInfo || {}).map(([model, info]: [string, any]) => (
                    <span key={model} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700">
                      {info.to || '?'} • {info.dot || '?'}
                    </span>
                  ))}
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                    Sản lượng SX: {record.khsxData?.map((k: any) => parseFloat(k.soLuong || '0')).reduce((a: number, b: number) => a + b, 0) || 0}
                  </span>
                </div>
              </div>

              <div className="flex sm:flex-col items-center gap-2 sm:items-end justify-center shrink-0">
                 <button
                    onClick={() => handleOpen(record)}
                    className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors flex-1 sm:flex-none h-[40px] whitespace-nowrap"
                 >
                    <Eye className="w-4 h-4" />
                    <span>Xem lại lệnh</span>
                 </button>
                 <button
                    onClick={() => handleDelete(record.id)}
                    className="p-2 text-rose-500 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors flex items-center justify-center h-[40px] w-[40px]"
                 >
                    <Trash2 className="w-4 h-4" />
                 </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
