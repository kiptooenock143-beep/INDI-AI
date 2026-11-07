
import { useState } from 'react';
import { Search, Upload, Image, Scan, Eye, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AnalysisResult {
  id: string;
  type: string;
  confidence: number;
  description: string;
}

const ImageAnalysisSection = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);

  const analyzeImage = () => {
    setIsAnalyzing(true);
    
    // Simulate analysis
    setTimeout(() => {
      setAnalysisResults([
        { id: '1', type: 'Object', confidence: 95, description: 'Smartphone device detected' },
        { id: '2', type: 'Text', confidence: 88, description: 'Screen content readable' },
        { id: '3', type: 'Color', confidence: 92, description: 'Dominant colors: Blue, Purple' },
        { id: '4', type: 'Scene', confidence: 85, description: 'Indoor environment' },
      ]);
      setIsAnalyzing(false);
    }, 2000);
  };

  return (
    <div className="h-96">
      <div className="p-4 border-b bg-gradient-to-r from-purple-50 to-indigo-50">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <Search className="w-5 h-5 text-purple-600" />
          Image Analysis
        </h2>
        <p className="text-sm text-gray-600 mt-1">AI-powered image recognition</p>
      </div>

      <div className="p-4 space-y-4">
        {/* Upload Area */}
        <Card className="border-2 border-dashed border-gray-300 hover:border-purple-400 transition-colors cursor-pointer">
          <CardContent className="p-6 text-center">
            {selectedImage ? (
              <div className="space-y-3">
                <div className="w-16 h-16 bg-purple-100 rounded-lg flex items-center justify-center mx-auto">
                  <Image className="w-8 h-8 text-purple-600" />
                </div>
                <p className="text-sm text-gray-600">Image ready for analysis</p>
              </div>
            ) : (
              <div className="space-y-3">
                <Upload className="w-16 h-16 text-gray-400 mx-auto" />
                <div>
                  <p className="text-sm text-gray-600">Upload an image to analyze</p>
                  <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF up to 10MB</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Analysis Controls */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedImage('demo')}
            className="flex-1"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={analyzeImage}
            disabled={!selectedImage || isAnalyzing}
            className="flex-1"
          >
            {isAnalyzing ? (
              <Zap className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Scan className="w-4 h-4 mr-2" />
            )}
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </Button>
        </div>

        {/* Results */}
        {analysisResults.length > 0 && (
          <ScrollArea className="h-32">
            <div className="space-y-2">
              <h3 className="font-medium text-gray-800 text-sm flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Analysis Results
              </h3>
              {analysisResults.map((result) => (
                <Card key={result.id} className="bg-gray-50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs flex items-center justify-between">
                      <span className="text-purple-600">{result.type}</span>
                      <span className="text-gray-500">{result.confidence}%</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-gray-600">{result.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Analysis Features */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" className="text-xs">
            <Scan className="w-3 h-3 mr-1" />
            OCR Text
          </Button>
          <Button variant="outline" size="sm" className="text-xs">
            <Eye className="w-3 h-3 mr-1" />
            Objects
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ImageAnalysisSection;
