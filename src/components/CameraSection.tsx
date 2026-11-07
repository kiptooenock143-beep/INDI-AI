
import { useState } from 'react';
import { Camera, Image, Video, Flashlight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const CameraSection = () => {
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [frontCamera, setFrontCamera] = useState(false);

  const captureOptions = [
    { id: 'photo', icon: Camera, label: 'Photo' },
    { id: 'video', icon: Video, label: 'Video' },
  ];

  return (
    <div className="h-96">
      <div className="p-4 border-b bg-gradient-to-r from-green-50 to-blue-50">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <Camera className="w-5 h-5 text-green-600" />
          Camera Access
        </h2>
        <p className="text-sm text-gray-600 mt-1">Capture photos and videos</p>
      </div>

      <div className="p-4 space-y-4">
        {/* Camera Preview Placeholder */}
        <Card className="bg-gray-900 border-2 border-dashed border-gray-300">
          <CardContent className="p-8">
            <div className="text-center">
              <Camera className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-400 text-sm">Camera preview would appear here</p>
              <p className="text-xs text-gray-500 mt-2">
                Note: Camera access requires browser permissions
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Camera Controls */}
        <div className="flex justify-center gap-4">
          {captureOptions.map((option) => (
            <Button
              key={option.id}
              variant={cameraMode === option.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCameraMode(option.id as 'photo' | 'video')}
              className="flex items-center gap-2"
            >
              <option.icon className="w-4 h-4" />
              {option.label}
            </Button>
          ))}
        </div>

        {/* Additional Controls */}
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFlashEnabled(!flashEnabled)}
            className={flashEnabled ? 'bg-yellow-100 border-yellow-300' : ''}
          >
            <Flashlight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFrontCamera(!frontCamera)}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        {/* Capture Button */}
        <div className="flex justify-center">
          <Button
            size="lg"
            className="w-16 h-16 rounded-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
            onClick={() => {
              console.log(`Capturing ${cameraMode}...`);
            }}
          >
            <Camera className="w-6 h-6" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CameraSection;
