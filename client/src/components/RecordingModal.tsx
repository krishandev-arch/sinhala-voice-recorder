import { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mic, Square, Play, Trash2, Save, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { convertRecordedBlobToWav } from '@/lib/audio';
import { toast } from 'sonner';

interface RecordingModalProps {
  phonemeId: number;
  isOpen: boolean;
  onClose: () => void;
  onRecordingComplete: () => void;
}

const MAX_RECORDING_TIME = 10;

export default function RecordingModal({ phonemeId, isOpen, onClose, onRecordingComplete }: RecordingModalProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [waveformData, setWaveformData] = useState<number[]>(new Array(40).fill(0));
  const [status, setStatus] = useState<'idle' | 'recording' | 'recorded'>('idle');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const phonemeQuery = trpc.phoneme.getById.useQuery({ id: phonemeId });
  const createRecordingMutation = trpc.recording.create.useMutation();

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  // Reset when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      cleanup();
      setAudioBlob(null);
      setRecordingTime(0);
      setWaveformData(new Array(40).fill(0));
      setStatus('idle');
    }
  }, [isOpen]);

  const cleanup = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (audioElementRef.current) { audioElementRef.current.pause(); }
    setIsRecording(false);
    setIsPlaying(false);
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
      audioContext.createMediaStreamSource(stream).connect(analyser);

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setStatus('recorded');
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      setAudioBlob(null);
      setStatus('recording');

      const updateWaveform = () => {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const bars = [];
        const step = Math.floor(data.length / 40);
        for (let i = 0; i < 40; i++) bars.push(data[i * step] || 0);
        setWaveformData(bars);
        animationFrameRef.current = requestAnimationFrame(updateWaveform);
      };
      updateWaveform();

      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((t) => {
          if (t >= MAX_RECORDING_TIME - 1) { stopRecording(); return MAX_RECORDING_TIME; }
          return t + 1;
        });
      }, 1000);
    } catch (error) {
      toast.error('Microphone access failed');
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

  const deleteRecording = () => {
    setAudioBlob(null);
    setWaveformData(new Array(40).fill(0));
    setRecordingTime(0);
    setStatus('idle');
    if (audioElementRef.current) { audioElementRef.current.pause(); setIsPlaying(false); }
  };

  const saveRecording = async () => {
    if (!audioBlob) return;
    try {
      const wavBlob = await convertRecordedBlobToWav(audioBlob);
      const formData = new FormData();
      formData.append('file', wavBlob, `phoneme-${phonemeId}-${Date.now()}.wav`);
      const uploadResponse = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!uploadResponse.ok) throw new Error('Upload failed');
      const { fileKey } = await uploadResponse.json();

      await createRecordingMutation.mutateAsync({
        phonemeId,
        fileKey,
        duration: recordingTime,
        sampleRate: 48000,
      });

      toast.success('Recording saved!');
      onRecordingComplete();
    } catch (error) {
      toast.error('Failed to save recording');
      console.error(error);
    }
  };

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const phoneme = phonemeQuery.data;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 overflow-hidden rounded-2xl border-0 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white">
          <DialogTitle className="text-base font-bold text-gray-900">Record Audio</DialogTitle>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {phoneme && (
          <div className="px-5 py-4 space-y-5 bg-white">
            {/* Phoneme Info */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-4 mb-3">
                <div>
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">ID</div>
                  <div className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{phoneme.phonemeId}</div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Target Phoneme</div>
                  <div className="text-xl font-bold text-gray-800">{phoneme.targetPhoneme}</div>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Script (Sentence to record)</div>
                <div className="text-lg text-gray-900 font-medium">{phoneme.script}</div>
              </div>
            </div>

            {/* Recording Area */}
            <div className="flex flex-col items-center">
              {/* Mic Button */}
              <button
                onClick={isRecording ? stopRecording : audioBlob ? playRecording : startRecording}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
                  isRecording
                    ? 'bg-red-500 hover:bg-red-600 shadow-red-200 animate-pulse'
                    : audioBlob
                    ? 'bg-blue-500 hover:bg-blue-600 shadow-blue-200'
                    : 'bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-indigo-200'
                }`}
              >
                {isRecording ? <Square className="w-6 h-6 text-white" /> :
                 audioBlob ? <Play className="w-6 h-6 text-white ml-0.5" /> :
                 <Mic className="w-7 h-7 text-white" />}
              </button>

              {/* Timer */}
              <div className="mt-3 text-center">
                <span className="text-xl font-mono font-bold text-gray-800">{formatTime(recordingTime)}</span>
                <span className="text-gray-400"> / {formatTime(MAX_RECORDING_TIME)}</span>
              </div>
              <span className="text-xs text-gray-500 mt-1">
                {isRecording ? 'Listening...' : audioBlob ? 'Recording complete' : 'Click to start recording'}
              </span>
            </div>

            {/* Waveform */}
            <div className="flex items-end justify-center gap-[2px] h-10 bg-gray-50 rounded-lg px-3 py-2">
              {waveformData.map((val, i) => (
                <div
                  key={i}
                  className={`w-[3px] rounded-full transition-all duration-75 ${
                    isRecording ? 'bg-indigo-500' : val > 0 ? 'bg-gray-400' : 'bg-gray-200'
                  }`}
                  style={{ height: `${Math.max(3, (val / 255) * 32)}px` }}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={deleteRecording}
                disabled={!audioBlob}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>

              <div className="flex-1" />

              <button
                onClick={onClose}
                className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={saveRecording}
                disabled={!audioBlob || createRecordingMutation.isPending}
                className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 rounded-lg shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {createRecordingMutation.isPending ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
                ) : (
                  <><Save className="w-4 h-4" /> Save & Next</>
                )}
              </button>
            </div>

            {/* Tip */}
            <p className="text-[11px] text-center text-gray-400 flex items-center justify-center gap-1">
              <span className="text-gray-500">🔒</span> Please speak clearly and naturally.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
