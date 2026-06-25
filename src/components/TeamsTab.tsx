import React, { useState, useEffect, useMemo } from 'react';
import { Users, Plus, Trash2, Edit2, Check, X, Layers, Briefcase, Calendar, Info, Search } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

interface ProductionTeam {
  id: string;
  name: string;
  leader: string;
  membersCount: number;
  notes: string;
}

interface ProductionBatch {
  id: string;
  name: string;
  code: string;
  notes: string;
}

export function TeamsTab() {
  const [teams, setTeams] = useState<ProductionTeam[]>([]);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);

  // States for adding/editing team
  const [isAddingTeam, setIsAddingTeam] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [teamLeader, setTeamLeader] = useState('');
  const [teamMembersCount, setTeamMembersCount] = useState<number>(10);
  const [teamNotes, setTeamNotes] = useState('');

  // States for adding/editing batch
  const [isAddingBatch, setIsAddingBatch] = useState(false);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [batchName, setBatchName] = useState('');
  const [batchCode, setBatchCode] = useState('');
  const [batchNotes, setBatchNotes] = useState('');

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');

  // default initial values logic
  const defaultTeams: ProductionTeam[] = [
    { id: 't1', name: 'Tổ 1', leader: 'Nguyễn Văn Hùng', membersCount: 15, notes: 'Chuyên may chính' },
    { id: 't2', name: 'Tổ 2', leader: 'Trần Thị Mai', membersCount: 12, notes: 'Chuyên sườn ống' },
    { id: 't3', name: 'Tổ 3', leader: 'Phạm Đức Toàn', membersCount: 18, notes: 'Chuyên hoàn thiện' },
    { id: 't4', name: 'Tổ 4', leader: 'Lê Hoàng Minh', membersCount: 14, notes: 'Chuyên chuẩn bị' }
  ];

  const defaultBatches: ProductionBatch[] = [
    { id: 'b1', name: 'Đợt 1', code: 'DOT-01', notes: 'Sản xuất buổi sáng' },
    { id: 'b2', name: 'Đợt 2', code: 'DOT-02', notes: 'Sản xuất buổi chiều' },
    { id: 'b3', name: 'Đợt 3', code: 'DOT-03', notes: 'Tăng ca buổi tối' },
    { id: 'b4', name: 'Đợt 4', code: 'DOT-04', notes: 'Kế hoạch khẩn cấp' }
  ];

  // Load initial data from Firebase real-time
  useEffect(() => {
    const docRef = doc(db, 'warehouses', 'global_teams_config');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.productionTeams) setTeams(data.productionTeams);
        else setTeams(defaultTeams);
        
        if (data.productionBatches) setBatches(data.productionBatches);
        else setBatches(defaultBatches);
      } else {
        // Init if not exist
        setDoc(docRef, {
            productionTeams: defaultTeams,
            productionBatches: defaultBatches
        }, { merge: true });
        setTeams(defaultTeams);
        setBatches(defaultBatches);
      }
    }, (error) => {
      console.error("Error fetching teams from cloud:", error);
    });

    return () => unsubscribe();
  }, []);

  // Save helper to Firebase
  const saveTeamsAndBatches = async (updatedTeams: ProductionTeam[], updatedBatches: ProductionBatch[]) => {
    try {
        const docRef = doc(db, 'warehouses', 'global_teams_config');
        await setDoc(docRef, {
            productionTeams: updatedTeams,
            productionBatches: updatedBatches
        }, { merge: true });
    } catch (e) {
        console.error("SYS:INVENTORY - Error saving Teams config to Firebase", e);
    }
  };

  // Add or Edit team
  const handleSaveTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;

    let updatedTeams: ProductionTeam[];
    if (editingTeamId) {
      updatedTeams = teams.map(t => t.id === editingTeamId ? {
        ...t,
        name: teamName.trim(),
        leader: teamLeader.trim() || 'Chưa xác định',
        membersCount: teamMembersCount,
        notes: teamNotes.trim()
      } : t);
    } else {
      const newTeam: ProductionTeam = {
        id: 'team_' + Date.now(),
        name: teamName.trim(),
        leader: teamLeader.trim() || 'Chưa xác định',
        membersCount: teamMembersCount,
        notes: teamNotes.trim()
      };
      updatedTeams = [...teams, newTeam];
    }

    // Local optimistic update
    setTeams(updatedTeams);
    saveTeamsAndBatches(updatedTeams, batches);
    resetTeamForm();
  };

  const handleEditTeam = (team: ProductionTeam) => {
    setEditingTeamId(team.id);
    setTeamName(team.name);
    setTeamLeader(team.leader);
    setTeamMembersCount(team.membersCount);
    setTeamNotes(team.notes);
    setIsAddingTeam(true);
  };

  const handleDeleteTeam = (id: string) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa tổ sản xuất này không?")) {
      const updatedTeams = teams.filter(t => t.id !== id);
      setTeams(updatedTeams); // Optimistic update
      saveTeamsAndBatches(updatedTeams, batches);
    }
  };

  const resetTeamForm = () => {
    setIsAddingTeam(false);
    setEditingTeamId(null);
    setTeamName('');
    setTeamLeader('');
    setTeamMembersCount(10);
    setTeamNotes('');
  };

  // Add or Edit batch
  const handleSaveBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchName.trim()) return;

    let updatedBatches: ProductionBatch[];
    if (editingBatchId) {
      updatedBatches = batches.map(b => b.id === editingBatchId ? {
        ...b,
        name: batchName.trim(),
        code: batchCode.trim() || 'BAT-' + Date.now().toString().slice(-4),
        notes: batchNotes.trim()
      } : b);
    } else {
      const newBatch: ProductionBatch = {
        id: 'batch_' + Date.now(),
        name: batchName.trim(),
        code: batchCode.trim() || 'BAT-' + Date.now().toString().slice(-4),
        notes: batchNotes.trim()
      };
      updatedBatches = [...batches, newBatch];
    }

    setBatches(updatedBatches); // Optimistic update
    saveTeamsAndBatches(teams, updatedBatches);
    resetBatchForm();
  };

  const handleEditBatch = (batch: ProductionBatch) => {
    setEditingBatchId(batch.id);
    setBatchName(batch.name);
    setBatchCode(batch.code);
    setBatchNotes(batch.notes);
    setIsAddingBatch(true);
  };

  const handleDeleteBatch = (id: string) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa đợt sản xuất này không?")) {
      const updatedBatches = batches.filter(b => b.id !== id);
      setBatches(updatedBatches);
      saveTeamsAndBatches(teams, updatedBatches);
    }
  };

  const resetBatchForm = () => {
    setIsAddingBatch(false);
    setEditingBatchId(null);
    setBatchName('');
    setBatchCode('');
    setBatchNotes('');
  };

  // Filtered lists
  const filteredTeams = useMemo(() => {
    return teams.filter(t => 
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      t.leader.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.notes.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [teams, searchTerm]);

  const filteredBatches = useMemo(() => {
    return batches.filter(b => 
      b.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      b.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.notes.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [batches, searchTerm]);

  return (
    <div className="flex flex-col gap-6 h-full pb-8">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-center text-indigo-600 shadow-xs shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Tổ & Đợt Sản xuất</h2>
          </div>
        </div>
        
        {/* Simple global search bar inside header */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text"
            placeholder="Tìm tổ, trưởng tổ, đợt..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 outline-none focus:bg-white focus:border-blue-500 transition-all font-medium"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Manage PRODUCTION TEAMS (Tổ) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <Users className="w-5 h-5 text-indigo-500" />
              <span>Danh Sách Tổ Sản Xuất ({filteredTeams.length})</span>
            </div>
            
            {!isAddingTeam && (
              <button 
                onClick={() => { resetTeamForm(); setIsAddingTeam(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm Kế Hoạch Tổ mới
              </button>
            )}
          </div>

          <div className="p-5">
            {/* Adding/Editing form */}
            {isAddingTeam && (
              <form onSubmit={handleSaveTeam} className="mb-6 p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between mb-4 border-b border-indigo-100/50 pb-2">
                  <h4 className="text-sm font-bold text-indigo-900 flex items-center gap-1.5">
                    <Briefcase className="w-4 h-4" />
                    {editingTeamId ? 'Cập Nhật Tổ Sản Xuất' : 'Thêm Tổ Sản Xuất'}
                  </h4>
                  <button type="button" onClick={resetTeamForm} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tên Tổ <span className="text-red-500">*</span></label>
                    <input 
                      type="text" 
                      required
                      placeholder="VD: Tổ 5, Tổ Thêu, Tổ May chính..."
                      value={teamName}
                      onChange={e => setTeamName(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white outline-none focus:border-indigo-500 text-slate-800 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Họ tên</label>
                    <input 
                      type="text"
                      placeholder="Nhập họ tên..."
                      value={teamLeader}
                      onChange={e => setTeamLeader(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white outline-none focus:border-indigo-500 text-slate-800"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end mt-4 pt-3 border-t border-indigo-100/30">
                  <button 
                    type="button" 
                    onClick={resetTeamForm} 
                    className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                  <button 
                    type="submit" 
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Lưu cấu hình
                  </button>
                </div>
              </form>
            )}

            {/* Teams List */}
            {filteredTeams.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Users className="w-12 h-12 text-slate-200 mx-auto mb-2" />
                <p className="text-sm">Không tìm thấy tổ sản xuất nào thích hợp.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-xs text-slate-500 uppercase border-b border-slate-200">Tên Tổ</th>
                      <th className="px-4 py-3 font-semibold text-xs text-slate-500 uppercase border-b border-slate-200">Họ tên</th>
                      <th className="px-4 py-3 font-semibold text-xs text-slate-500 uppercase border-b border-slate-200 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTeams.map((team) => (
                      <tr key={team.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-bold text-slate-800 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100">
                            {team.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-700">{team.leader || '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button 
                              onClick={() => handleEditTeam(team)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 hover:text-blue-700 rounded-md border border-slate-100 hover:border-blue-200 transition-all cursor-pointer"
                              title="Chỉnh sửa Tổ"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteTeam(team.id)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-md border border-slate-100 hover:border-rose-200 transition-all cursor-pointer"
                              title="Xóa Tổ"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Manage PRODUCTION BATCHES (Đợt) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <Layers className="w-5 h-5 text-indigo-500" />
              <span>Danh Sách Đợt ({filteredBatches.length})</span>
            </div>
            
            {!isAddingBatch && (
              <button 
                onClick={() => { resetBatchForm(); setIsAddingBatch(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm Đợt
              </button>
            )}
          </div>

          <div className="p-5">
            {/* Adding/Editing Batch Form */}
            {isAddingBatch && (
              <form onSubmit={handleSaveBatch} className="mb-6 p-4 bg-violet-50/50 border border-violet-100 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between mb-3 border-b border-violet-100/50 pb-2">
                  <h4 className="text-sm font-bold text-violet-900 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    {editingBatchId ? 'Cập Nhật Đợt Sản Xuất' : 'Thêm Đợt Sản Xuất'}
                  </h4>
                  <button type="button" onClick={resetBatchForm} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tên Đợt <span className="text-red-500">*</span></label>
                    <input 
                      type="text" 
                      required
                      placeholder="VD: Đợt 1, Đợt Sáng, Đợt Đêm..."
                      value={batchName}
                      onChange={e => setBatchName(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white outline-none focus:border-violet-500 text-slate-800 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Ký Hiệu / Mã Đợt</label>
                    <input 
                      type="text"
                      placeholder="Để trống tự động sinh (VD: DOT-1)"
                      value={batchCode}
                      onChange={e => setBatchCode(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white outline-none focus:border-violet-500 text-slate-800 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Ghi chú Đợt</label>
                    <input 
                      type="text"
                      placeholder="Khoảng thời gian hoặc ghi chú..."
                      value={batchNotes}
                      onChange={e => setBatchNotes(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white outline-none focus:border-violet-500 text-slate-800"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end mt-4 pt-3 border-t border-violet-100/30">
                  <button 
                    type="button" 
                    onClick={resetBatchForm} 
                    className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                  <button 
                    type="submit" 
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Lưu cấu hình
                  </button>
                </div>
              </form>
            )}

            {/* Batches Table List */}
            {filteredBatches.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Layers className="w-12 h-12 text-slate-200 mx-auto mb-2" />
                <p className="text-sm">Không tìm thấy đợt sản xuất nào thích hợp.</p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Mã Đợt</th>
                      <th className="p-3">Tên Đợt</th>
                      <th className="p-3">Chi chú</th>
                      <th className="p-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBatches.map(batch => (
                      <tr key={batch.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 font-mono text-indigo-600 font-semibold">{batch.code}</td>
                        <td className="p-3 font-bold text-slate-800">{batch.name}</td>
                        <td className="p-3 text-slate-500 max-w-[120px] truncate">{batch.notes || '---'}</td>
                        <td className="p-3 text-right space-x-1 whitespace-nowrap">
                          <button 
                            onClick={() => handleEditBatch(batch)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            title="Sửa Đợt"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button 
                            onClick={() => handleDeleteBatch(batch.id)}
                            className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                            title="Xóa Đợt"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
