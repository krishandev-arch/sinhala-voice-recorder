import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLocation } from 'wouter';
import {
  Mic, Square, Play, Trash2, Check, SkipForward, ChevronLeft,
  ChevronRight, Info, ArrowLeft, AudioWaveform,
} from 'lucide-react';
import { toast } from 'sonner';

const MAX_RECORDING_TIME = 10; // seconds

export default function RecorderPage() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [notes, setNotes] = useState('phoneme-targeted');

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [waveformData, setWaveformData] = useState<number[]>(new Array(50).fill(0));
  const [audioLevel, setAudioLevel] = useState<number[]>(new Array(30).fill(0));
  const [recordingStatus, setRecordingStatus] = useState<'ready' | 'recording' | 'recorded'>('ready');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Data
  const { data: phonemes = [], isLoading } = trpc.phoneme.list.useQuery({});
  const { data: userRecordings = [], refetch: refetchRecordings } = trpc.recording.getUserRecordings.useQuery(undefined, { enabled: isAuthenticated });
  const { data: stats } = trpc.phoneme.getStats.useQuery();

  const createRecordingMutation = trpc.recording.create.useMutation({ onSuccess: () => refetchRecordings() });
  const updateStatusMutation = trpc.recording.updateStatus.useMutation({ onSuccess: () => refetchRecordings() });

  const totalPhonemes = phonemes.length || 250;
  const recordedCount = (stats?.recordingStats?.recorded || 0) + (stats?.recordingStats?.approved || 0);

  const currentPhoneme = phonemes[currentIndex];
  const audioFileName = currentPhoneme
    ? `PHO_${currentPhoneme.phonemeId.replace('PHO-', '').padStart(4, '0')}.wav`
    : '';

  const recordingMap = useMemo(() => {
    const map: Record<number, { status: string; id: number }> = {};
    userRecordings.forEach((rec) => {
      if (rec.phonemeId) map[rec.phonemeId] = { status: rec.status || 'Pending', id: rec.id };
    });
    return map;
  }, [userRecordings]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Reset state when navigating
  useEffect(() => {
    resetRecording();
    setNotes('phoneme-targeted');
  }, [currentIndex]);

  const resetRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioElementRef.current) { audioElementRef.current.pause(); audioElementRef.current = null; }
    setIsRecording(false);
    setAudioBlob(null);
    setIsPlaying(false);
    setRecordingTime(0);
    setWaveformData(new Array(50).fill(0));
    setAudioLevel(new Array(30).fill(0));
    setRecordingStatus('ready');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 48000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setRecordingStatus('recorded');
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      setRecordingStatus('recording');

      // Visualization loop
      const updateVisualization = () => {
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqData);

        // Waveform bars
        const bars = [];
        const step = Math.floor(freqData.length / 50);
        for (let i = 0; i < 50; i++) {
          bars.push(freqData[i * step] || 0);
        }
        setWaveformData(bars);

        // Audio level bars
        const levels = [];
        for (let i = 0; i < 30; i++) {
          levels.push(freqData[i * 2] || 0);
        }
        setAudioLevel(levels);

        animationFrameRef.current = requestAnimationFrame(updateVisualization);
      };
      updateVisualization();

      // Timer with auto-stop
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((t) => {
          if (t >= MAX_RECORDING_TIME - 1) {
            stopRecording();
            return MAX_RECORDING_TIME;
          }
          return t + 1;
        });
      }, 1000);
    } catch (error) {
      toast.error('Failed to access microphone. Please allow microphone permissions.');
      console.error(error);
    }
  };

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  const playRecording = () => {
    if (audioBlob && !isPlaying) {
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audioElementRef.current = audio;
      audio.onended = () => setIsPlaying(false);
      audio.play();
      setIsPlaying(true);
    }
  };

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Actions
  const saveAndNext = async () => {
    if (!audioBlob || !currentPhoneme) return;
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, `${currentPhoneme.phonemeId}-${Date.now()}.webm`);
      const uploadResponse = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!uploadResponse.ok) throw new Error('Upload failed');
      const { fileKey } = await uploadResponse.json();

      await createRecordingMutation.mutateAsync({
        phonemeId: currentPhoneme.id,
        fileKey,
        duration: recordingTime,
        sampleRate: 48000,
      });

      toast.success('Recording saved!');
      goNext();
    } catch (error) {
      toast.error('Failed to save recording');
      console.error(error);
    }
  };

  const handlePass = async () => {
    if (!currentPhoneme) return;
    try {
      const existing = recordingMap[currentPhoneme.id];
      if (existing) {
        await updateStatusMutation.mutateAsync({ recordingId: existing.id, status: 'Passed', reviewNotes: notes || 'Skipped' });
      } else {
        await createRecordingMutation.mutateAsync({ phonemeId: currentPhoneme.id, status: 'Passed' });
      }
      toast.success('Phoneme skipped');
      goNext();
    } catch { toast.error('Failed to skip'); }
  };

  const handleDelete = async () => {
    if (!currentPhoneme) return;
    try {
      const existing = recordingMap[currentPhoneme.id];
      if (existing) {
        await updateStatusMutation.mutateAsync({ recordingId: existing.id, status: 'Deleted', clearFileKey: true });
      }
      toast.success('Recording deleted');
      goNext();
    } catch { toast.error('Failed to delete'); }
  };

  const goNext = () => {
    resetRecording();
    if (currentIndex < phonemes.length - 1) setCurrentIndex(currentIndex + 1);
  };
  const goPrev = () => {
    resetRecording();
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center"><h1 className="text-2xl font-bold mb-4">Please log in to start recording</h1></div>
      </div>
    );
  }

  if (isLoading || !currentPhoneme) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-4">
            <button onClick={() => setLocation('/')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-sm">
              <AudioWaveform className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Phoneme Dataset Recorder</h1>
              <p className="text-sm text-gray-500">Record, Review and Manage Phoneme Targeted Sentences</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
            <AudioWaveform className="w-4 h-4 text-indigo-500" />
            <div>
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Session Progress</div>
              <div className="text-sm font-bold text-gray-800">{recordedCount} / {totalPhonemes}</div>
            </div>
            <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500" style={{ width: `${(recordedCount / totalPhonemes) * 100}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Summary Bar ── */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-6">
          <div className="flex items-center gap-2"><span className="text-xs text-gray-500 font-medium">ID</span><span className="text-sm font-bold text-gray-800">{currentPhoneme.phonemeId}</span></div>
          <div className="flex items-center gap-2"><span className="text-xs text-gray-500 font-medium">Target Phoneme</span><span className="text-xl font-bold text-indigo-700">{currentPhoneme.targetPhoneme}</span></div>
          <div className="flex items-center gap-2"><span className="text-xs text-gray-500 font-medium">Script</span><span className="text-sm text-gray-700">{currentPhoneme.script}</span></div>
          <div className="flex items-center gap-2"><span className="text-xs text-gray-500 font-medium">Audio File Name</span><span className="text-sm font-mono text-gray-600">{audioFileName}</span></div>
          <div className="flex items-center gap-2"><span className="text-xs text-gray-500 font-medium">Notes</span><span className="text-sm text-gray-600">{notes}</span></div>
          <div className="ml-auto bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-bold">
            {currentIndex + 1} / {totalPhonemes}
            <span className="text-[10px] font-medium text-indigo-500 block">Current Record</span>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 px-6 py-6">
        <div className="max-w-6xl mx-auto grid grid-cols-2 gap-6">
          {/* ── Left Panel: Script & Phoneme ── */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            {/* Script */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-indigo-600">Script</span>
                <span className="text-xs text-gray-400">(Sentence to record)</span>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
                <p className="text-2xl font-medium text-gray-900 text-center leading-relaxed">
                  {currentPhoneme.script}
                </p>
              </div>
            </div>

            {/* Target Phoneme */}
            <div className="mb-6">
              <span className="text-sm font-semibold text-indigo-600 block mb-3">Target Phoneme</span>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-4xl font-bold text-gray-900 text-center">
                  {currentPhoneme.targetPhoneme}
                </p>
              </div>
            </div>

            {/* Notes */}
            <div>
              <span className="text-sm font-semibold text-indigo-600 block mb-2">Notes <span className="text-gray-400 font-normal">(Optional)</span></span>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this recording..."
                className="bg-gray-50 border-gray-200 rounded-xl text-sm resize-none h-16"
              />
            </div>
          </div>

          {/* ── Right Panel: Recording ── */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <span className="text-sm font-bold text-gray-800">Record Audio</span>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${
                  recordingStatus === 'recording' ? 'bg-red-500 animate-pulse' :
                  recordingStatus === 'recorded' ? 'bg-blue-500' : 'bg-emerald-500'
                }`} />
                <span className={`text-xs font-medium ${
                  recordingStatus === 'recording' ? 'text-red-600' :
                  recordingStatus === 'recorded' ? 'text-blue-600' : 'text-emerald-600'
                }`}>
                  {recordingStatus === 'recording' ? 'Recording...' :
                   recordingStatus === 'recorded' ? 'Recording complete' : 'Ready to record'}
                </span>
              </div>
            </div>

            {/* Microphone Button */}
            <div className="flex flex-col items-center mb-6">
              <button
                onClick={isRecording ? stopRecording : audioBlob ? playRecording : startRecording}
                className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
                  isRecording
                    ? 'bg-red-500 hover:bg-red-600 shadow-red-200 animate-pulse'
                    : audioBlob
                    ? 'bg-blue-500 hover:bg-blue-600 shadow-blue-200'
                    : 'bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-indigo-200'
                }`}
              >
                {isRecording ? (
                  <Square className="w-8 h-8 text-white" />
                ) : audioBlob ? (
                  <Play className="w-8 h-8 text-white ml-1" />
                ) : (
                  <Mic className="w-10 h-10 text-white" />
                )}
              </button>

              {/* Timer */}
              <div className="mt-4 text-center">
                <span className="text-2xl font-mono font-bold text-gray-800">
                  {formatTime(recordingTime)}
                </span>
                <span className="text-gray-400 text-lg"> / {formatTime(MAX_RECORDING_TIME)}</span>
              </div>

              {audioBlob && (
                <div className="mt-2 flex items-center gap-3">
                  <button onClick={playRecording} disabled={isPlaying}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <Play className="w-3 h-3" /> {isPlaying ? 'Playing...' : 'Play'}
                  </button>
                  <button onClick={resetRecording}
                    className="text-xs text-gray-500 hover:underline flex items-center gap-1">
                    <Mic className="w-3 h-3" /> Re-record
                  </button>
                </div>
              )}
            </div>

            {/* Waveform */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4">
              <div className="flex items-end justify-center gap-[2px] h-12">
                {waveformData.map((val, i) => (
                  <div
                    key={i}
                    className={`w-[3px] rounded-full transition-all duration-75 ${
                      isRecording ? 'bg-indigo-500' : val > 0 ? 'bg-gray-400' : 'bg-gray-200'
                    }`}
                    style={{ height: `${Math.max(3, (val / 255) * 48)}px` }}
                  />
                ))}
              </div>
            </div>

            {/* Audio Level */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Audio Level</span>
              <div className="flex items-center gap-[2px] flex-1">
                {audioLevel.map((val, i) => {
                  const h = Math.max(4, (val / 255) * 20);
                  const color = val > 200 ? 'bg-red-500' : val > 100 ? 'bg-yellow-500' : 'bg-emerald-500';
                  return (
                    <div key={i} className={`w-[4px] rounded-sm transition-all duration-75 ${isRecording ? color : 'bg-gray-200'}`}
                      style={{ height: `${h}px` }} />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Action Buttons ── */}
      <div className="px-6 pb-4">
        <div className="max-w-6xl mx-auto grid grid-cols-3 gap-4">
          <button
            onClick={handleDelete}
            className="flex items-center gap-4 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl px-5 py-4 transition-colors group"
          >
            <input type="radio" name="action" className="w-4 h-4 accent-red-500" />
            <div className="w-10 h-10 bg-red-100 group-hover:bg-red-200 rounded-lg flex items-center justify-center transition-colors">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div className="text-left">
              <div className="text-sm font-bold text-red-700">DELETE</div>
              <div className="text-xs text-red-500">Delete this record and move to next</div>
            </div>
          </button>

          <button
            onClick={handlePass}
            className="flex items-center gap-4 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl px-5 py-4 transition-colors group"
          >
            <input type="radio" name="action" className="w-4 h-4 accent-amber-500" />
            <div className="w-10 h-10 bg-amber-100 group-hover:bg-amber-200 rounded-lg flex items-center justify-center transition-colors">
              <SkipForward className="w-5 h-5 text-amber-600" />
            </div>
            <div className="text-left">
              <div className="text-sm font-bold text-amber-700">PASS</div>
              <div className="text-xs text-amber-500">Skip this record and move to next</div>
            </div>
          </button>

          <button
            onClick={saveAndNext}
            disabled={!audioBlob}
            className={`flex items-center gap-4 rounded-xl px-5 py-4 transition-colors group ${
              audioBlob
                ? 'bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                : 'bg-gray-50 border border-gray-200 opacity-60 cursor-not-allowed'
            }`}
          >
            <input type="radio" name="action" className="w-4 h-4 accent-emerald-500" />
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              audioBlob ? 'bg-emerald-100 group-hover:bg-emerald-200' : 'bg-gray-100'
            }`}>
              <Check className={`w-5 h-5 ${audioBlob ? 'text-emerald-600' : 'text-gray-400'}`} />
            </div>
            <div className="text-left">
              <div className={`text-sm font-bold ${audioBlob ? 'text-emerald-700' : 'text-gray-400'}`}>RECORD</div>
              <div className={`text-xs ${audioBlob ? 'text-emerald-500' : 'text-gray-400'}`}>Save this recording and move to next</div>
            </div>
          </button>
        </div>
      </div>

      {/* ── Navigation & Tips ── */}
      <div className="bg-white border-t border-gray-200 px-6 py-3 flex-shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous ({currentIndex > 0 ? phonemes[currentIndex - 1]?.phonemeId : '—'})
          </button>

          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Info className="w-3.5 h-3.5 text-blue-500" />
            <span>Tip: Speak clearly and naturally. Ensure the target phoneme is pronounced clearly.</span>
          </div>

          <button
            onClick={goNext}
            disabled={currentIndex >= phonemes.length - 1}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next ({currentIndex < phonemes.length - 1 ? phonemes[currentIndex + 1]?.phonemeId : '—'})
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
