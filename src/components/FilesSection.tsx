
import { useState } from 'react';
import { Files, Folder, Image, FileText, Music, Video, Download, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface FileItem {
  id: string;
  name: string;
  type: 'folder' | 'image' | 'document' | 'audio' | 'video';
  size?: string;
  modified: string;
}

const FilesSection = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [files] = useState<FileItem[]>([
    { id: '1', name: 'Documents', type: 'folder', modified: '2 days ago' },
    { id: '2', name: 'Photos', type: 'folder', modified: '1 day ago' },
    { id: '3', name: 'Downloads', type: 'folder', modified: '3 hours ago' },
    { id: '4', name: 'vacation.jpg', type: 'image', size: '2.4 MB', modified: '2 hours ago' },
    { id: '5', name: 'report.pdf', type: 'document', size: '1.1 MB', modified: '1 day ago' },
    { id: '6', name: 'music.mp3', type: 'audio', size: '4.2 MB', modified: '3 days ago' },
    { id: '7', name: 'video.mp4', type: 'video', size: '15.8 MB', modified: '1 week ago' },
  ]);

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'folder':
        return <Folder className="w-5 h-5 text-blue-500" />;
      case 'image':
        return <Image className="w-5 h-5 text-green-500" />;
      case 'document':
        return <FileText className="w-5 h-5 text-red-500" />;
      case 'audio':
        return <Music className="w-5 h-5 text-purple-500" />;
      case 'video':
        return <Video className="w-5 h-5 text-orange-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-96">
      <div className="p-4 border-b bg-gradient-to-r from-yellow-50 to-orange-50">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <Files className="w-5 h-5 text-yellow-600" />
          File Manager
        </h2>
        <p className="text-sm text-gray-600 mt-1">Access and manage your files</p>
      </div>

      <div className="p-4">
        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Files List */}
        <ScrollArea className="h-48">
          <div className="space-y-2">
            {filteredFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer group"
              >
                {getFileIcon(file.type)}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {file.size && `${file.size} • `}{file.modified}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Quick Actions */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" className="text-xs">
            <Folder className="w-4 h-4 mr-2" />
            New Folder
          </Button>
          <Button variant="outline" size="sm" className="text-xs">
            <Download className="w-4 h-4 mr-2" />
            Upload File
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FilesSection;
