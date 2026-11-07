
import { useState } from 'react';
import { Mic, MicOff, Volume2, Play, Pause, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const VoiceSection = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [volume, setVolume] = useState(75);

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    if (!isRecording) {
      console.log('Starting voice recording...');
    } else {
      console.log('Stopping voice recording...');
    }
  };

  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
    console.log(isPlaying ? 'Pausing playback...' : 'Starting playback...');
  };

  return (
    <div className="h-96">
      <div className="p-4 border-b bg-gradient-to-r from-red-50 to-pink-50">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <Mic className="w-5 h-5 text-red-600" />
          Voice Assistant
        </h2>
        <p className="text-sm text-gray-600 mt-1">Voice commands and recording</p>
      </div>

      <div className="p-4 space-y-6">
        {/* Recording Interface */}
        <Card className="bg-gradient-to-br from-red-50 to-pink-50 border-red-200">
          <CardContent className="p-6 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
                isRecording 
                  ? 'bg-red-500 shadow-lg shadow-red-500/50 animate-pulse' 
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}>
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={toggleRecording}
                  className="w-full h-full rounded-full"
                >
                  {isRecording ? (
                    <MicOff className="w-8 h-8 text-white" />
                  ) : (
                    <Mic className="w-8 h-8 text-gray-600" />
                  )}
                </Button>
              </div>
              
              <div className="text-center">
                <p className="font-medium text-gray-800">
                  {isRecording ? 'Recording...' : 'Tap to start recording'}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Duration: {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Playback Controls */}
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={togglePlayback}
              className="flex items-center gap-2"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {isPlaying ? 'Pause' : 'Play'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsPlaying(false);
                setRecordingDuration(0);
              }}
            >
              <Square className="w-4 h-4" />
            </Button>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-3">
            <Volume2 className="w-4 h-4 text-gray-500" />
            <Progress value={volume} className="flex-1" />
            <span className="text-sm text-gray-500 w-10">{volume}%</span>
          </div>
        </div>

        {/* Voice Commands */}
        <div className="space-y-2">
          <h3 className="font-medium text-gray-800 text-sm">Quick Commands:</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              'Open camera',
              'Show files',
              'Share content',
              'Take photo',
              'Start recording',
              'Find apps'
            ].map((command, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                className="text-xs justify-start"
                onClick={() => console.log(`Voice command: ${command}`)}
              >
                "{command}"
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceSection;
