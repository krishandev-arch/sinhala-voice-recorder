import { useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { getLoginUrl } from '@/const';
import { useLocation } from 'wouter';
import {
  Mic, Trash2, Check, SkipForward, Users, Star,
  Share2, CloudUpload, Undo2, Redo2, Printer, Bold, Italic,
  Strikethrough, AlignLeft, Type, Paintbrush, Table2, ChevronDown,
  Filter, Grid3X3, BarChart3, Info, ExternalLink,
} from 'lucide-react';
import RecordingModal from '@/components/RecordingModal';
import { toast } from 'sonner';

export default function Home() {
  const { user, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [showRecordingModal, setShowRecordingModal] = useState(false);
  const [selectedPhonemeId, setSelectedPhonemeId] = useState<number | null>(null);

  const { data: phonemes = [], isLoading } = trpc.phoneme.list.useQuery({});
  const { data: userRecordings = [], refetch: refetchRecordings } = trpc.recording.getUserRecordings.useQuery(undefined, { enabled: isAuthenticated });
  const { data: stats } = trpc.phoneme.getStats.useQuery();

  const recordingMap = useMemo(() => {
    const map: Record<number, { status: string; fileKey?: string | null; notes?: string | null; id: number }> = {};
    userRecordings.forEach((rec) => {
      if (rec.phonemeId) {
        map[rec.phonemeId] = { status: rec.status || 'Pending', fileKey: rec.fileKey, notes: rec.reviewNotes, id: rec.id };
      }
    });
    return map;
  }, [userRecordings]);

  const totalPhonemes = phonemes.length || 250;
  const recordedCount = (stats?.recordingStats?.recorded || 0) + (stats?.recordingStats?.approved || 0);
  const progressPercent = totalPhonemes > 0 ? Math.round((recordedCount / totalPhonemes) * 100) : 0;

  const handleRecord = useCallback((phonemeId: number) => {
    setSelectedPhonemeId(phonemeId);
    setShowRecordingModal(true);
  }, []);

  const handleRecordingComplete = useCallback(() => {
    setShowRecordingModal(false);
    setSelectedPhonemeId(null);
    refetchRecordings();
  }, [refetchRecordings]);

  const createRecordingMutation = trpc.recording.create.useMutation({ onSuccess: () => refetchRecordings() });
  const updateStatusMutation = trpc.recording.updateStatus.useMutation({ onSuccess: () => refetchRecordings() });

  const handlePass = async (phonemeId: number) => {
    try {
      const existing = recordingMap[phonemeId];
      if (existing) {
        await updateStatusMutation.mutateAsync({ recordingId: existing.id, status: 'Passed', reviewNotes: 'Skipped' });
      } else {
        await createRecordingMutation.mutateAsync({ phonemeId, status: 'Passed' });
      }
      toast.success('Phoneme skipped');
    } catch { toast.error('Failed to skip'); }
  };

  const handleDelete = async (phonemeId: number) => {
    try {
      const existing = recordingMap[phonemeId];
      if (existing) {
        await updateStatusMutation.mutateAsync({ recordingId: existing.id, status: 'Deleted', clearFileKey: true });
        toast.success('Recording deleted');
      }
    } catch { toast.error('Failed to delete'); }
  };

  const handleApprove = async (phonemeId: number) => {
    try {
      const existing = recordingMap[phonemeId];
      if (existing) {
        await updateStatusMutation.mutateAsync({ recordingId: existing.id, status: 'Approved' });
        toast.success('Recording approved');
      }
    } catch { toast.error('Failed to approve'); }
  };

  const getStatusBadge = (status: string) => {
    const cfg: Record<string, string> = {
      Pending: 'bg-gray-100 text-gray-500',
      Recorded: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      Approved: 'bg-blue-50 text-blue-700 border border-blue-200',
      Passed: 'bg-orange-50 text-orange-600 border border-orange-200',
      Deleted: 'bg-red-50 text-red-600 border border-red-200',
    };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${cfg[status] || cfg.Pending}`}>{status}</span>;
  };

  // ── Login Screen ──
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center max-w-lg px-6">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-indigo-200">
            <Mic className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-3 tracking-tight">Sinhala Voice Recorder</h1>
          <p className="text-gray-500 mb-2 text-lg">Phoneme Voice Dataset Recorder</p>
          <p className="text-gray-400 mb-10 text-sm max-w-md mx-auto leading-relaxed">
            Contribute to building Sri Lanka's largest Sinhala voice dataset. Record phoneme-targeted sentences and help train advanced speech models.
          </p>
          <Button size="lg" onClick={() => (window.location.href = getLoginUrl())}
            className="gap-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-8 py-6 text-base rounded-xl shadow-lg shadow-indigo-200 transition-all hover:shadow-xl hover:shadow-indigo-300">
            <Users className="w-5 h-5" /> Sign In to Start Recording
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col text-gray-800">
      {/* ── Title Bar ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-sm">
            <Grid3X3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">Phoneme Voice Dataset Recorder</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Star className="w-3.5 h-3.5 text-gray-400 hover:text-yellow-500 cursor-pointer" />
              <CloudUpload className="w-3.5 h-3.5 text-gray-400" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <div className="text-right">
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Progress</div>
              <div className="text-sm font-bold">{recordedCount} / {totalPhonemes} ({progressPercent}%)</div>
            </div>
            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-700" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLocation('/recorder')} className="gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50 text-xs">
            <Mic className="w-3.5 h-3.5" /> Focused Recorder
          </Button>
          {user?.role === 'admin' && (
            <Button variant="outline" size="sm" onClick={() => setLocation('/admin')} className="gap-1.5 text-xs">
              <BarChart3 className="w-3.5 h-3.5" /> Admin
            </Button>
          )}
          <Button size="sm" className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white gap-1.5 rounded-lg text-xs shadow-sm">
            <Share2 className="w-3.5 h-3.5" /> Share
          </Button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold cursor-pointer" title="Logout" onClick={() => logout()}>
            {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      {/* ── Menu Bar ── */}
      <div className="flex items-center gap-0.5 px-3 py-0.5 border-b border-gray-100">
        {['File', 'Edit', 'View', 'Data', 'Tools', 'Extensions', 'Help'].map((m) => (
          <button key={m} className="px-2.5 py-1 text-[13px] text-gray-600 hover:bg-gray-100 rounded">{m}</button>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-200 bg-gray-50/50">
        <button className="p-1.5 hover:bg-gray-200 rounded"><Undo2 className="w-4 h-4 text-gray-500" /></button>
        <button className="p-1.5 hover:bg-gray-200 rounded"><Redo2 className="w-4 h-4 text-gray-500" /></button>
        <button className="p-1.5 hover:bg-gray-200 rounded"><Printer className="w-4 h-4 text-gray-500" /></button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <span className="text-xs text-gray-500 px-1">100%</span>
        <ChevronDown className="w-3 h-3 text-gray-400" />
        <div className="w-px h-5 bg-gray-300 mx-1" />
        {['$', '%', '.0', '.00', '123'].map((t) => (
          <span key={t} className="text-xs text-gray-600 bg-white border border-gray-200 rounded px-2 py-0.5">{t}</span>
        ))}
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <div className="flex items-center bg-white border border-gray-200 rounded px-2 py-0.5 gap-1">
          <span className="text-xs text-gray-600">Roboto</span><ChevronDown className="w-3 h-3 text-gray-400" />
        </div>
        <div className="flex items-center bg-white border border-gray-200 rounded px-1.5 py-0.5 gap-0.5">
          <span className="text-xs text-gray-600 w-5 text-center">10</span>
          <div className="flex flex-col"><ChevronDown className="w-2.5 h-2.5 text-gray-400 rotate-180" /><ChevronDown className="w-2.5 h-2.5 text-gray-400" /></div>
        </div>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button className="p-1.5 hover:bg-gray-200 rounded"><Bold className="w-4 h-4 text-gray-500" /></button>
        <button className="p-1.5 hover:bg-gray-200 rounded"><Italic className="w-4 h-4 text-gray-500" /></button>
        <button className="p-1.5 hover:bg-gray-200 rounded"><Strikethrough className="w-4 h-4 text-gray-500" /></button>
        <button className="p-1.5 hover:bg-gray-200 rounded"><Type className="w-4 h-4 text-gray-500" /></button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button className="p-1.5 hover:bg-gray-200 rounded"><Paintbrush className="w-4 h-4 text-gray-500" /></button>
        <button className="p-1.5 hover:bg-gray-200 rounded"><AlignLeft className="w-4 h-4 text-gray-500" /></button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button className="p-1.5 hover:bg-gray-200 rounded"><Table2 className="w-4 h-4 text-gray-500" /></button>
        <button className="p-1.5 hover:bg-gray-200 rounded"><Filter className="w-4 h-4 text-gray-500" /></button>
      </div>

      {/* ── Column Letters ── */}
      <div className="flex border-b border-gray-200 bg-gray-50/80 text-[11px] text-gray-500 font-medium select-none flex-shrink-0">
        <div className="w-8 flex-shrink-0 border-r border-gray-200" />
        {[
          { label: 'A', w: 'w-[100px]' }, { label: 'B', w: 'w-[130px]' },
          { label: 'C', w: 'w-[260px]' }, { label: 'D', w: 'w-[130px]' },
          { label: 'E', w: 'flex-1 min-w-[330px]' }, { label: 'F', w: 'w-[90px]' },
          { label: 'G', w: 'w-[110px]' }, { label: 'H', w: 'w-[170px]' },
        ].map((c) => (
          <div key={c.label} className={`${c.w} flex-shrink-0 px-2 py-1 border-r border-gray-200 text-center`}>{c.label}</div>
        ))}
      </div>

      {/* ── Table Header ── */}
      <div className="flex border-b-2 border-gray-300 bg-gray-50 text-xs font-bold text-gray-700 select-none flex-shrink-0">
        <div className="w-8 flex-shrink-0 border-r border-gray-200 bg-gray-100/50 flex items-center justify-center text-[10px] text-gray-400">1</div>
        {[
          { label: 'ID', w: 'w-[100px]' }, { label: 'Target Phoneme', w: 'w-[130px]' },
          { label: 'Script', w: 'w-[260px]' }, { label: 'Audio File Name', w: 'w-[130px]' },
          { label: 'Action', w: 'flex-1 min-w-[330px]', center: true },
          { label: 'Status', w: 'w-[90px]' }, { label: 'Audio Link', w: 'w-[110px]' },
          { label: 'Notes', w: 'w-[170px]' },
        ].map((h) => (
          <div key={h.label} className={`${h.w} flex-shrink-0 px-3 py-2 border-r border-gray-200 flex items-center gap-1 ${h.center ? 'justify-center' : ''}`}>
            {h.label} {h.label !== 'Action' && <Filter className="w-3 h-3 text-gray-400" />}
          </div>
        ))}
      </div>

      {/* ── Rows ── */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-gray-400">
              <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading phonemes...</span>
            </div>
          </div>
        ) : phonemes.map((phoneme, idx) => {
          const rec = recordingMap[phoneme.id];
          const status = rec?.status || 'Pending';
          const audioFileName = `PHO_${phoneme.phonemeId.replace('PHO-', '').padStart(4, '0')}.wav`;
          return (
            <div key={phoneme.id} className="flex border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
              <div className="w-8 flex-shrink-0 border-r border-gray-200 bg-gray-50/50 flex items-center justify-center text-[10px] text-gray-400">{idx + 2}</div>
              <div className="w-[100px] flex-shrink-0 px-3 py-2.5 border-r border-gray-100 text-xs font-mono text-gray-600">{phoneme.phonemeId}</div>
              <div className="w-[130px] flex-shrink-0 px-3 py-2.5 border-r border-gray-100 text-lg font-semibold">{phoneme.targetPhoneme}</div>
              <div className="w-[260px] flex-shrink-0 px-3 py-2.5 border-r border-gray-100 text-sm">{phoneme.script}</div>
              <div className="w-[130px] flex-shrink-0 px-3 py-2.5 border-r border-gray-100 text-xs text-gray-500 font-mono">{audioFileName}</div>
              <div className="flex-1 min-w-[330px] flex-shrink-0 px-2 py-1.5 border-r border-gray-100 flex items-center gap-1.5">
                <button onClick={() => handleRecord(phoneme.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-semibold rounded shadow-sm transition-colors">
                  <Mic className="w-3 h-3" /> Record
                </button>
                <button onClick={() => handlePass(phoneme.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-400 hover:bg-amber-500 text-white text-[11px] font-semibold rounded shadow-sm transition-colors">
                  <SkipForward className="w-3 h-3" /> Pass
                </button>
                <button onClick={() => handleDelete(phoneme.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[11px] font-semibold rounded shadow-sm transition-colors">
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
                <button onClick={() => handleApprove(phoneme.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-[11px] font-semibold rounded shadow-sm transition-colors">
                  <Check className="w-3 h-3" /> Approved
                </button>
              </div>
              <div className="w-[90px] flex-shrink-0 px-2 py-2.5 border-r border-gray-100 flex items-center">{getStatusBadge(status)}</div>
              <div className="w-[110px] flex-shrink-0 px-3 py-2.5 border-r border-gray-100 text-xs">
                {rec?.fileKey && status !== 'Deleted' ? (
                  <a href={`/manus-storage/${rec.fileKey}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                    Open <ExternalLink className="w-3 h-3" />
                  </a>
                ) : <span className="text-gray-300">–</span>}
              </div>
              <div className="w-[170px] flex-shrink-0 px-3 py-2.5 text-xs text-gray-500">{phoneme.category}</div>
            </div>
          );
        })}
      </div>

      {/* ── Bottom Panels ── */}
      <div className="border-t border-gray-200 bg-white flex-shrink-0">
        <div className="grid grid-cols-3 gap-0 divide-x divide-gray-200">
          {/* How it works */}
          <div className="p-4">
            <h4 className="text-sm font-bold mb-3 flex items-center gap-2"><Info className="w-4 h-4 text-indigo-500" /> How it works</h4>
            <div className="space-y-2.5 text-xs text-gray-600">
              {[
                { icon: <Mic className="w-3 h-3 text-emerald-600" />, bg: 'bg-emerald-100', title: 'Record', titleColor: 'text-emerald-700', desc: 'Click the Record button to open the recorder and capture audio.' },
                { icon: <SkipForward className="w-3 h-3 text-amber-600" />, bg: 'bg-amber-100', title: 'Pass', titleColor: 'text-amber-600', desc: 'Skip this item if the recording is not clear or not possible.' },
                { icon: <Trash2 className="w-3 h-3 text-red-500" />, bg: 'bg-red-100', title: 'Delete', titleColor: 'text-red-600', desc: 'Remove this item if it is incorrect or unusable.' },
                { icon: <Check className="w-3 h-3 text-teal-600" />, bg: 'bg-teal-100', title: 'Approved', titleColor: 'text-teal-700', desc: 'Mark as final and approved after reviewing the recording.' },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-2">
                  <div className={`w-5 h-5 rounded-full ${item.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>{item.icon}</div>
                  <div><span className={`font-semibold ${item.titleColor}`}>{item.title}</span><p className="text-gray-500 mt-0.5">{item.desc}</p></div>
                </div>
              ))}
            </div>
          </div>

          {/* Center placeholder */}
          <div className="p-4 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <Mic className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">Select a phoneme to start recording</p>
            </div>
          </div>

          {/* Status Meanings */}
          <div className="p-4">
            <h4 className="text-sm font-bold mb-3">Status Meanings</h4>
            <div className="space-y-2 text-xs">
              {[
                { icon: <Check className="w-3 h-3 text-emerald-600" />, bg: 'bg-emerald-100', title: 'Recorded', titleColor: 'text-emerald-700', desc: 'Audio recorded and saved.' },
                { icon: <Check className="w-3 h-3 text-blue-600" />, bg: 'bg-blue-100', title: 'Approved', titleColor: 'text-blue-700', desc: 'Audio reviewed and approved.' },
                { icon: <SkipForward className="w-3 h-3 text-orange-500" />, bg: 'bg-orange-100', title: 'Passed', titleColor: 'text-orange-600', desc: 'Skipped this item.' },
                { icon: <Trash2 className="w-3 h-3 text-red-500" />, bg: 'bg-red-100', title: 'Deleted', titleColor: 'text-red-600', desc: 'Removed / not usable.' },
                { icon: <div className="w-2 h-2 rounded-full border border-gray-400" />, bg: 'bg-gray-100', title: 'Pending', titleColor: 'text-gray-600', desc: 'Not yet processed.' },
              ].map((s) => (
                <div key={s.title} className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded ${s.bg} flex items-center justify-center`}>{s.icon}</div>
                  <div><span className={`font-semibold ${s.titleColor}`}>{s.title}</span><span className="text-gray-500 ml-1.5">{s.desc}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tips Bar ── */}
      <div className="flex items-center gap-6 px-4 py-2 bg-gray-50 border-t border-gray-200 text-[11px] text-gray-500 flex-shrink-0">
        <span className="flex items-center gap-1 font-semibold text-red-500"><Info className="w-3 h-3" /> Tips:</span>
        <span>• Speak clearly</span><span>• Use a good quality microphone</span><span>• Avoid noise</span><span>• Re-record if not satisfied</span>
      </div>

      {/* ── Recording Modal ── */}
      {selectedPhonemeId && (
        <RecordingModal phonemeId={selectedPhonemeId} isOpen={showRecordingModal}
          onClose={() => { setShowRecordingModal(false); setSelectedPhonemeId(null); }}
          onRecordingComplete={handleRecordingComplete} />
      )}
    </div>
  );
}
