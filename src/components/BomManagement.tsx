import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Trash2, Save, AlertTriangle, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';

export interface BomRow {
  maHang: string;
  moDel: string;
  loai: string;
  mauVT: string;
  sizeVT: string;
  nhomSizeSP: string;
  dinhMuc: number;
}

interface BomManagementProps {
  bomData: BomRow[];
  onSaveBom: (data: BomRow[]) => void | Promise<void>;
  isAdmin?: boolean;
}

export function BomManagement({ bomData, onSaveBom, isAdmin = false }: BomManagementProps) {
  const [localBomData, setLocalBomData] = useState<BomRow[]>(bomData);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet) as Record<string, any>[];

      const parsedRows: BomRow[] = json.map(row => {
        const lowercasedRow: Record<string, any> = {};
        for (const key in row) {
          if (Object.prototype.hasOwnProperty.call(row, key)) {
            lowercasedRow[key.trim().toLowerCase()] = row[key];
          }
        }
        return {
          maHang: lowercasedRow['mahang']?.toString() || '',
          moDel: lowercasedRow['model']?.toString() || '',
          loai: lowercasedRow['loai']?.toString() || '',
          mauVT: lowercasedRow['mauvt']?.toString() || '',
          sizeVT: lowercasedRow['sizevt']?.toString() || '',
          nhomSizeSP: (lowercasedRow['nhomsizesp'] || lowercasedRow['nhom_sizesp'] || lowercasedRow['nhomsize'])?.toString() || '',
          dinhMuc: Number(lowercasedRow['dinhmuc']) || 0,
        };
      }).filter(r => r.maHang);

      setLocalBomData(parsedRows);
    } catch (error) {
      console.error('Error reading file:', error);
      alert('Đã xảy ra lỗi khi đọc file. Vui lòng kiểm tra lại định dạng file.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSaveData = async () => {
    setIsSaving(true);
    try {
      await onSaveBom(localBomData);
      alert('Đã lưu dữ liệu BOM cục bộ và đồng bộ lên Đám mây (Firestore) thành công!');
    } catch (err: any) {
      console.error(err);
      alert('Đã xảy ra lỗi khi đồng bộ BOM lên Đám mây: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmClear = () => {
    setLocalBomData([]);
    onSaveBom([]);
    setShowClearConfirm(false);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
      {/* Header & Controls */}
      <div className="p-6 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            Dữ liệu Định mức (BOM)
          </h3>
          {!isAdmin && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 rounded-md border border-amber-200 mt-2 sm:mt-0">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-[11px] font-medium text-amber-700">Chỉ Admin mới có quyền cập nhật BOM</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
            disabled={!isAdmin || isSaving}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isSaving || !isAdmin}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="w-4 h-4" />
            {isUploading ? 'Đang đọc...' : 'Tải lên File'}
          </button>
          
          <button
            disabled={localBomData.length === 0 || !isAdmin || isSaving}
            onClick={handleSaveData}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Đồng bộ Cloud...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Lưu BOM
              </>
            )}
          </button>

          <button
            onClick={() => setShowClearConfirm(true)}
            disabled={localBomData.length === 0 || !isAdmin || isSaving}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors shadow-sm font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            Xóa
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 overflow-auto bg-white p-6">
        {localBomData.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 p-10 text-center">
            <div className="bg-white p-4 rounded-full shadow-sm mb-4 border border-slate-100">
              <FileSpreadsheet className="w-8 h-8 text-blue-500" />
            </div>
            <p className="font-medium text-slate-600 mb-1">Chưa có dữ liệu BOM</p>
            <p className="text-sm">Vui lòng tải lên file Excel hoặc CSV để xem trước định mức</p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-xs sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-4 py-3 border-b border-slate-200 whitespace-nowrap">STT</th>
                    <th className="px-4 py-3 border-b border-slate-200 whitespace-nowrap">Mã Hàng</th>
                    <th className="px-4 py-3 border-b border-slate-200 whitespace-nowrap">Model</th>
                    <th className="px-4 py-3 border-b border-slate-200 whitespace-nowrap">Loại</th>
                    <th className="px-4 py-3 border-b border-slate-200 whitespace-nowrap">Màu VT</th>
                    <th className="px-4 py-3 border-b border-slate-200 whitespace-nowrap">Size VT</th>
                    <th className="px-4 py-3 border-b border-slate-200 whitespace-nowrap">Nhóm Size SP</th>
                    <th className="px-4 py-3 border-b border-slate-200 whitespace-nowrap text-right">Định Mức</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {localBomData.map((row, index) => (
                    <tr key={index} className="hover:bg-blue-50/50 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{index + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{row.maHang}</td>
                      <td className="px-4 py-2.5">{row.moDel}</td>
                      <td className="px-4 py-2.5">{row.loai}</td>
                      <td className="px-4 py-2.5">{row.mauVT}</td>
                      <td className="px-4 py-2.5">{row.sizeVT}</td>
                      <td className="px-4 py-2.5">{row.nhomSizeSP}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-blue-600">{row.dinhMuc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      {localBomData.length > 0 && (
        <div className="bg-slate-50 p-3 px-6 border-t border-slate-200 text-sm text-slate-600 flex justify-between items-center">
          <span>Tổng số dòng: <strong>{localBomData.length}</strong></span>
          <span className="text-emerald-600 font-medium flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Dữ liệu đã tải
          </span>
        </div>
      )}

      {/* Confirmation Modal */}
      {showClearConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in duration-200">
            <div className="p-6">
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Xác nhận xóa dữ liệu</h3>
                  <p className="text-slate-600 mt-2 text-sm leading-relaxed">
                    Bạn có chắc chắn muốn xóa toàn bộ dữ liệu định mức hiện tại không? Hành động này không thể hoàn tác.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
               >
                 Hủy bỏ
               </button>
               <button
                 onClick={confirmClear}
                 className="px-4 py-2 font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
               >
                 Xóa dữ liệu
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
