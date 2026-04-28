function interleaveChannels(channelData: Float32Array[]): Float32Array {
  if (channelData.length === 1) return channelData[0];

  const left = channelData[0];
  const right = channelData[1] ?? channelData[0];
  const result = new Float32Array(left.length * 2);

  let index = 0;
  for (let i = 0; i < left.length; i++) {
    result[index++] = left[i];
    result[index++] = right[i];
  }

  return result;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
}

function audioBufferToWav(audioBuffer: AudioBuffer): ArrayBuffer {
  const numberOfChannels = Math.min(audioBuffer.numberOfChannels, 2);
  const channelData: Float32Array[] = [];

  for (let i = 0; i < numberOfChannels; i++) {
    channelData.push(audioBuffer.getChannelData(i));
  }

  const interleaved = interleaveChannels(channelData);
  const bytesPerSample = 2;
  const blockAlign = numberOfChannels * bytesPerSample;
  const byteRate = audioBuffer.sampleRate * blockAlign;
  const dataSize = interleaved.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  floatTo16BitPCM(view, 44, interleaved);
  return buffer;
}

export async function convertRecordedBlobToWav(blob: Blob): Promise<Blob> {
  const sourceBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext();

  try {
    const decoded = await audioContext.decodeAudioData(sourceBuffer.slice(0));
    const wavBuffer = audioBufferToWav(decoded);
    return new Blob([wavBuffer], { type: "audio/wav" });
  } finally {
    await audioContext.close();
  }
}
