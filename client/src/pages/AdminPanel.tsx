import { useState, useMemo } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLocation } from 'wouter';
import {
  Loader2, Play, Check, SkipForward, Trash2, MessageSquare,
  ArrowLeft, Shield, BarChart3, Users, AudioWaveform, Pause,
  X, Filter, Download,
} from 'lucide-react';
import { toast } from 'sonner';

export default function AdminPanel() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedRecordingId, setSelectedRecordingId] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'Approved' | 'Passed' | 'Deleted'>('Approved');
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isPlayingId, setIsPlayingId] = useState<number | null>(null);

  const { data: stats } = trpc.recording.getPendingForReview.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === 'admin',
  });
  const { data: phonemes = [] } = trpc.phoneme.list.useQuery({});

  // Fetch recordings for all phonemes
  const { data: allRecordings = [], refetch: refetchRecordings } = trpc.recording.getUserRecordings.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const updateStatusMutation = trpc.recording.updateStatus.useMutation({
    onSuccess: () => {
      toast.success('Status updated');
      setIsReviewDialogOpen(false);
      setReviewNotes('');
      refetchRecordings();
    },
    onError: () => toast.error('Failed to update status'),
  });

  const bulkUpdateMutation = trpc.recording.bulkUpdateStatus.useMutation({
    onSuccess: () => { toast.success('Bulk update complete'); refetchRecordings(); },
    onError: () => toast.error('Bulk update failed'),
  });

  const filteredRecordings = useMemo(() => {
    if (filterStatus === 'all') return allRecordings;
    return allRecordings.filter((r) => r.status === filterStatus);
  }, [allRecordings, filterStatus]);

  const handleStatusUpdate = async () => {
    if (!selectedRecordingId) return;
    await updateStatusMutation.mutateAsync({
      recordingId: selectedRecordingId,
      status: selectedStatus,
      reviewNotes: reviewNotes || undefined,
      clearFileKey: selectedStatus === 'Deleted',
    });
  };

  const quickApprove = async (id: number) => {
    await updateStatusMutation.mutateAsync({ recordingId: id, status: 'Approved' });
  };

  const quickReject = async (id: number) => {
    await updateStatusMutation.mutateAsync({ recordingId: id, status: 'Deleted', clearFileKey: true });
  };

  if (!isAuthenticated || user?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center bg-white p-8 rounded-2xl shadow-sm border border-gray-200 max-w-sm">
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Access Denied</h1>
          <p className="text-gray-500 text-sm mb-6">Admin privileges required to access this page.</p>
          <Button variant="outline" onClick={() => setLocation('/')}>Go to Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setLocation('/')} className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-sm">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Admin Review Panel</h1>
              <p className="text-sm text-gray-500">Review, approve, and manage recordings</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" /> Export Dataset
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="px-6 py-6">
        <div className="max-w-7xl mx-auto grid grid-cols-5 gap-4">
          {[
            { label: 'Total', value: stats?.total || 0, color: 'text-gray-800', bg: 'bg-gray-100', icon: <BarChart3 className="w-5 h-5 text-gray-500" /> },
            { label: 'Recorded', value: stats?.recorded || 0, color: 'text-emerald-700', bg: 'bg-emerald-50', icon: <AudioWaveform className="w-5 h-5 text-emerald-500" /> },
            { label: 'Pending Review', value: stats?.pending || 0, color: 'text-amber-700', bg: 'bg-amber-50', icon: <MessageSquare className="w-5 h-5 text-amber-500" /> },
            { label: 'Approved', value: stats?.approved || 0, color: 'text-blue-700', bg: 'bg-blue-50', icon: <Check className="w-5 h-5 text-blue-500" /> },
            { label: 'Deleted', value: stats?.deleted || 0, color: 'text-red-700', bg: 'bg-red-50', icon: <Trash2 className="w-5 h-5 text-red-400" /> },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-xl p-5 border border-gray-100`}>
              <div className="flex items-center justify-between mb-2">{s.icon}<span className="text-xs text-gray-500">{s.label}</span></div>
              <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="px-6 pb-4">
        <div className="max-w-7xl mx-auto flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-xs text-gray-500 font-medium mr-2">Filter:</span>
          {['all', 'Recorded', 'Approved', 'Passed', 'Pending', 'Deleted'].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterStatus === s ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="px-6 pb-6 flex-1">
        <div className="max-w-7xl mx-auto bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Phoneme ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Phoneme</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Script</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Notes</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecordings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">
                    No recordings found for this filter.
                  </td>
                </tr>
              ) : (
                filteredRecordings.map((recording) => {
                  const phoneme = phonemes.find((p) => p.id === recording.phonemeId);
                  const statusColors: Record<string, string> = {
                    Pending: 'bg-gray-100 text-gray-600',
                    Recorded: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
                    Approved: 'bg-blue-50 text-blue-700 border border-blue-200',
                    Passed: 'bg-orange-50 text-orange-600 border border-orange-200',
                    Deleted: 'bg-red-50 text-red-600 border border-red-200',
                  };
                  return (
                    <tr key={recording.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-xs font-mono text-gray-600">{phoneme?.phonemeId || '—'}</td>
                      <td className="px-4 py-3 text-base font-semibold">{phoneme?.targetPhoneme || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate">{phoneme?.script || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${statusColors[recording.status || 'Pending']}`}>
                          {recording.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {recording.duration ? `${parseFloat(recording.duration.toString()).toFixed(1)}s` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[150px] truncate">{recording.reviewNotes || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {recording.fileKey && (
                            <button className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors" title="Play">
                              <Play className="w-3.5 h-3.5 text-blue-600" />
                            </button>
                          )}
                          <button onClick={() => quickApprove(recording.id)} className="p-1.5 hover:bg-emerald-50 rounded-lg transition-colors" title="Approve">
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          </button>
                          <button onClick={() => quickReject(recording.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </button>
                          <button onClick={() => { setSelectedRecordingId(recording.id); setIsReviewDialogOpen(true); }}
                            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="Review">
                            <MessageSquare className="w-3.5 h-3.5 text-gray-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Dialog */}
      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden border-0 shadow-2xl">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <DialogTitle className="text-base font-bold">Review Recording</DialogTitle>
            <button onClick={() => setIsReviewDialogOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-2">Decision</label>
              <div className="flex gap-2">
                {([['Approved', 'bg-emerald-500', 'Approve'], ['Passed', 'bg-amber-400', 'Pass'], ['Deleted', 'bg-red-500', 'Delete']] as const).map(([val, bg, label]) => (
                  <button
                    key={val}
                    onClick={() => setSelectedStatus(val as any)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                      selectedStatus === val ? `${bg} text-white shadow-sm` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-2">Review Notes</label>
              <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add feedback..." className="h-20 text-sm rounded-xl bg-gray-50 border-gray-200" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsReviewDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleStatusUpdate} disabled={updateStatusMutation.isPending}
                className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
                {updateStatusMutation.isPending ? 'Saving...' : 'Submit Review'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
